import { quoteUsdc, parseUsdc, celoUsdc } from './celo-usdc.mjs';
import { readOnlyRpc } from './rpc.mjs';
const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
try {
  const chainId = Number(option('chain') ?? 11142220);
  const config = celoUsdc[chainId];
  if (!config || !option('from') || !option('to') || !option('amount')) throw new Error('Usage: node network/low-fee/quote-usdc.mjs --chain=11142220 --from=0x... --to=0x... --amount=1 --max-fee=0.01');
  const quote = await quoteUsdc(readOnlyRpc(process.env.CELO_RPC_URL ?? config.rpc), {
    chainId, sender: option('from'), recipient: option('to'), amount: parseUsdc(option('amount')), maxFee: parseUsdc(option('max-fee') ?? '0.01'), verifyZeroNative: process.argv.includes('--verify-zero-native'),
  });
  console.log(JSON.stringify(quote, null, 2));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
