import { encodeFunctionData, parseAbi, serializeTransaction } from '../../node/node_modules/viem/_esm/index.js';

const oracle = '0x420000000000000000000000000000000000000F';
const abi = parseAbi([
  'function getL1FeeUpperBound(uint256 unsignedTxSize) view returns (uint256)',
  'function getOperatorFee(uint256 gasUsed) view returns (uint256)',
]);

export async function operatorFee(rpc, gas, block) {
  const data = encodeFunctionData({ abi, functionName: 'getOperatorFee', args: [gas] });
  return BigInt(await rpc('eth_call', { to: oracle, data }, block));
}

export async function estimateBaseFees(rpc, tx, gas, price, block, chainId) {
  const nonce = Number(BigInt(await rpc('eth_getTransactionCount', tx.from, block)));
  const unsigned = serializeTransaction({
    type: 'eip1559', chainId, nonce, gas, to: tx.to, value: BigInt(tx.value), data: tx.data,
    maxFeePerGas: price, maxPriorityFeePerGas: price,
  });
  const data = encodeFunctionData({
    abi, functionName: 'getL1FeeUpperBound', args: [BigInt((unsigned.length - 2) / 2)],
  });
  const [dataFee, operator] = await Promise.all([
    rpc('eth_call', { to: oracle, data }, block).then(BigInt),
    operatorFee(rpc, gas, block),
  ]);
  return { execution: gas * price, data: dataFee, operator };
}
