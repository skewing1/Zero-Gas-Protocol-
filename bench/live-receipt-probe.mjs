// Read-only receipt probe. Never sends transactions. Node >= 20.
export async function probeReceipt(rpc, txHash, expectedChainId) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw Error('Invalid transaction hash');
  const chain = await rpc('eth_chainId', []);
  if (BigInt(chain) !== BigInt(expectedChainId)) throw Error('Unexpected chain');
  const tx = await rpc('eth_getTransactionByHash', [txHash]);
  const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
  if (!tx || !receipt) throw Error('Unmined or missing transaction');
  if (tx.hash?.toLowerCase() !== txHash.toLowerCase() || receipt.transactionHash?.toLowerCase() !== txHash.toLowerCase()) throw Error('Transaction hash mismatch');
  if (receipt.status !== '0x1') throw Error('Transaction did not succeed');
  if (!/^0x[0-9a-fA-F]{64}$/.test(receipt.blockHash ?? '')) throw Error('Invalid block hash');
  const block = await rpc('eth_getBlockByHash', [receipt.blockHash, false]);
  if (!block || block.hash?.toLowerCase() !== receipt.blockHash.toLowerCase() || !block.transactions?.some(x => x.toLowerCase() === txHash.toLowerCase())) throw Error('Receipt not in block');
  if (BigInt(receipt.blockNumber) !== BigInt(block.number) || BigInt(tx.blockNumber) !== BigInt(block.number)) throw Error('Block number mismatch');
  if (tx.blockHash?.toLowerCase() !== receipt.blockHash.toLowerCase()) throw Error('Transaction block hash mismatch');
  if (tx.transactionIndex == null || receipt.transactionIndex == null) throw Error('Missing transaction index');
  const index = BigInt(receipt.transactionIndex);
  if (index < 0n || index >= BigInt(block.transactions.length) ||
      block.transactions[Number(index)]?.toLowerCase() !== txHash.toLowerCase() ||
      BigInt(tx.transactionIndex) !== index) throw Error('Transaction index mismatch');
  const gasUsed = BigInt(receipt.gasUsed), gasPrice = BigInt(receipt.effectiveGasPrice);
  if (gasUsed <= 0n || gasPrice <= 0n) throw Error('Missing gas evidence');
  const executionWei = gasUsed * gasPrice;
  const l1FeeWei = receipt.l1Fee == null ? null : BigInt(receipt.l1Fee);
  const after = await rpc('eth_getTransactionReceipt', [txHash]);
  if (!after || after.transactionHash?.toLowerCase() !== receipt.transactionHash.toLowerCase() || after.blockHash?.toLowerCase() !== receipt.blockHash.toLowerCase() || after.blockNumber !== receipt.blockNumber || after.transactionIndex !== receipt.transactionIndex || after.status !== receipt.status || after.gasUsed !== receipt.gasUsed || after.effectiveGasPrice !== receipt.effectiveGasPrice || after.l1Fee !== receipt.l1Fee) throw Error('Receipt changed during observation');
  const finalBlock = await rpc('eth_getBlockByHash', [receipt.blockHash, false]);
  if (!finalBlock || finalBlock.hash?.toLowerCase() !== receipt.blockHash.toLowerCase() || finalBlock.number !== block.number || !Array.isArray(finalBlock.transactions) || finalBlock.transactions.length !== block.transactions.length || finalBlock.transactions[Number(index)]?.toLowerCase() !== txHash.toLowerCase() || finalBlock.transactions.some((hash, i) => hash.toLowerCase() !== block.transactions[i]?.toLowerCase())) throw Error('Block changed during observation');
  if (BigInt(await rpc('eth_chainId', [])) !== BigInt(expectedChainId)) throw Error('Chain changed during observation');
  return { chainId: String(expectedChainId), txHash: txHash.toLowerCase(), blockHash: receipt.blockHash.toLowerCase(), gasUsed: gasUsed.toString(), effectiveGasPriceWei: gasPrice.toString(), executionWei: executionWei.toString(), l1FeeWei: l1FeeWei?.toString() ?? null, knownTotalWei: (executionWei + (l1FeeWei ?? 0n)).toString(), networkFeeEvidenceComplete: String(expectedChainId) === '1' || (String(expectedChainId) === '8453' && l1FeeWei !== null), costComplete: false, note: 'Does not include relayer, settlement, authorization, deployment, or cross-chain costs; Arbitrum L1 gas is embedded in gasUsed and must not be double counted.' };
}
export async function httpRpc(url, method, params) {
  const res = await fetch(url, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({jsonrpc:'2.0',id:1,method,params}), signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw Error('RPC HTTP ' + res.status);
  const data = await res.json();
  if (data.error) throw Error('RPC ' + JSON.stringify(data.error));
  return data.result;
}
if (process.argv[1]?.endsWith('/live-receipt-probe.mjs') && process.argv[2] === '--run') {
  const [url, txHash, chainId] = process.argv.slice(3);
  if (!url || !txHash || !chainId) { console.error('Usage: node live-receipt-probe.mjs --run RPC_URL TX_HASH CHAIN_ID'); process.exitCode = 2; }
  else probeReceipt((m,p)=>httpRpc(url,m,p),txHash,chainId).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
