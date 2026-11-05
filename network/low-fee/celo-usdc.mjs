import { encodeFunctionData, parseAbi, decodeFunctionResult, getAddress } from '../../node/node_modules/viem/_esm/index.js';
import { serializeTransaction } from '../../node/node_modules/viem/_esm/celo/serializers.js';

// Source: Circle USDC contract list and Celo fee currency contracts, checked 2026-11-05.
// These functions prepare quotes; they never sign or send transactions.
export const celoUsdc = Object.freeze({
  42220: Object.freeze({ token: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', adapter: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B', rpc: 'https://forno.celo.org' }),
  11142220: Object.freeze({ token: '0x01C5C0122039549AD1493B8220cABEdD739BC44E', adapter: '0xbf1441Ea57f43f35f713431001f35742c88071c7', rpc: 'https://forno.celo-sepolia.celo-testnet.org' }),
});
const abi = parseAbi([
  'function adaptedToken() view returns (address)', 'function getAdaptedToken() view returns (address)',
  'function decimals() view returns (uint8)', 'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
  'function getL1Fee(bytes) view returns (uint256)', 'function getOperatorFee(uint256) view returns (uint256)',
]);
const oracle = '0x420000000000000000000000000000000000000F';
const hex = n => '0x' + n.toString(16);
const scale = 10n ** 12n; // fee math: 18 decimals; USDC: 6 decimals
export const feeToMicroUsdc = normalized => (normalized + scale - 1n) / scale;

export function parseUsdc(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(value)) throw new Error('Use a USDC amount with up to six decimal places');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  if (amount <= 0n || amount >= 2n ** 256n) throw new Error('Invalid USDC amount');
  return amount;
}

export async function quoteUsdc(rpc, { chainId, sender, recipient, amount, maxFee, verifyZeroNative = false }) {
  const config = celoUsdc[chainId];
  if (!config) throw new Error('Only verified Celo configurations are supported');
  sender = getAddress(sender); recipient = getAddress(recipient);
  if (BigInt(sender) === 0n || BigInt(recipient) === 0n || sender === recipient) throw new Error('Invalid transfer participants');
  if (typeof amount !== 'bigint' || amount <= 0n || amount >= 2n ** 256n || typeof maxFee !== 'bigint' || maxFee <= 0n) throw new Error('Specify positive token amount and fee cap');
  if (BigInt(await rpc('eth_chainId')) !== BigInt(chainId)) throw new Error('RPC chain mismatch');
  const block = await rpc('eth_getBlockByNumber', 'latest', false);
  if (!block?.hash) throw new Error('No block snapshot');
  const call = async (to, name, args = []) => decodeFunctionResult({ abi, functionName: name, data: await rpc('eth_call', { to, data: encodeFunctionData({ abi, functionName: name, args }) }, block.number) });
  const code = await Promise.all([config.token, config.adapter, oracle].map(a => rpc('eth_getCode', a, block.number)));
  if (code.some(c => !c || c === '0x')) throw new Error('Missing token, adapter or oracle code');
  let underlying;
  try { underlying = await call(config.adapter, 'adaptedToken'); }
  catch { underlying = await call(config.adapter, 'getAdaptedToken'); }
  if (getAddress(underlying) !== getAddress(config.token) || Number(await call(config.token, 'decimals')) !== 6) throw new Error('Fee adapter does not match Circle USDC');
  const [balance, nativeBalance, nonce, price, priority] = await Promise.all([
    call(config.token, 'balanceOf', [sender]), rpc('eth_getBalance', sender, block.number),
    rpc('eth_getTransactionCount', sender, 'pending'), rpc('eth_gasPrice', config.adapter),
    rpc('eth_maxPriorityFeePerGas', config.adapter),
  ]);
  const request = { from: sender, to: config.token, value: '0x0', data: encodeFunctionData({ abi, functionName: 'transfer', args: [recipient, amount] }), feeCurrency: config.adapter, type: '0x7b' };
  // Use real balances: no simulation funding is injected into this quote.
  const estimate = BigInt(await rpc('eth_estimateGas', request, block.number));
  const zeroNativeSimulation = verifyZeroNative ? BigInt(await rpc('eth_estimateGas', request, block.number, { [sender]: { balance: '0x0' } })) : undefined;
  const gas = (estimate * 120n + 99n) / 100n;
  const maxPriorityFeePerGas = BigInt(priority);
  const maxFeePerGas = 2n * BigInt(price) + maxPriorityFeePerGas;
  const feeReserve = feeToMicroUsdc(gas * maxFeePerGas);
  if (feeReserve > maxFee) throw new Error('Network fee reserve exceeds your USDC cap');
  if (balance < amount + feeReserve) throw new Error('Insufficient USDC for amount plus maximum gas reserve');
  if (BigInt(nonce) > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Nonce cannot be safely serialized');
  const unsigned = serializeTransaction({ chainId, nonce: Number(BigInt(nonce)), to: config.token, value: 0n, data: request.data, feeCurrency: config.adapter, type: 'cip64', gas, maxFeePerGas, maxPriorityFeePerGas });
  // Celo currently configures these charges to zero. Verify, rather than assume.
  const [dataFee, operator] = await Promise.all([call(oracle, 'getL1Fee', [unsigned + 'ff'.repeat(65)]), call(oracle, 'getOperatorFee', [gas])]);
  if (dataFee !== 0n || operator !== 0n) throw new Error('Additional network fees detected: fee cap model must be updated');
  const pinned = await rpc('eth_getBlockByNumber', block.number, false);
  if (pinned?.hash !== block.hash) throw new Error('Quote snapshot reorged');
  return {
    evidenceType: 'RPC simulation, not a transaction receipt',
    ...(zeroNativeSimulation === undefined ? {} : { zeroNativeSimulationGas: zeroNativeSimulation.toString() }),
    chainId, sender, recipient, asset: config.token, feeCurrency: config.adapter,
    amount: amount.toString(), estimatedGas: estimate.toString(), gasLimit: gas.toString(),
    estimatedFeeMicroUsdc: feeToMicroUsdc(estimate * BigInt(price)).toString(),
    maxFeeReserveMicroUsdc: feeReserve.toString(), userFeeCapMicroUsdc: maxFee.toString(),
    senderUsdc: balance.toString(), senderNative: BigInt(nativeBalance).toString(),
    block: { number: block.number, hash: block.hash, timestamp: block.timestamp },
    walletRequirement: 'CIP-64 capable signer; a generic wallet may discard feeCurrency',
    mode: chainId === 42220 ? 'read-only-mainnet-quote' : 'unsigned-testnet-transfer',
    // Mainnet execution artifacts are deliberately not emitted by development tooling.
    ...(chainId !== 42220 ? { unsignedTransaction: { ...request, chainId: hex(BigInt(chainId)), nonce, gas: hex(gas), maxFeePerGas: hex(maxFeePerGas), maxPriorityFeePerGas: hex(maxPriorityFeePerGas) }, serializedUnsigned: unsigned } : {}),
  };
}
