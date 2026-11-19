// Fail-closed temporal binding for receipt and recipient-balance evidence.
// This is a consistency check, NOT independent RPC verification or finality proof.
import assert from 'node:assert/strict';
import {compareEvidencedPayments} from './compare-evidenced-payments.mjs';

const dec=(x,label)=>{assert(typeof x==='string' && /^(0|[1-9][0-9]*)$/.test(x),label+' must be canonical decimal');return BigInt(x);};
const hash=(x,label)=>{assert(typeof x==='string' && /^0x[0-9a-fA-F]{64}$/.test(x),label+' must be 32-byte hex');return x.toLowerCase();};
function checkSide(capture,window,label) {
  assert(window && typeof window==='object',label+' window missing');
  const before=dec(window.beforeBlockNumber,label+' beforeBlockNumber');
  const after=dec(window.afterBlockNumber,label+' afterBlockNumber');
  assert(before<after,label+' snapshot window must advance');
  const beforeHash=hash(window.beforeBlockHash,label+' beforeBlockHash');
  const afterHash=hash(window.afterBlockHash,label+' afterBlockHash');
  assert(beforeHash!==afterHash,label+' snapshot block hashes must differ');
  assert(Array.isArray(capture?.receipts)&&capture.receipts.length>0,label+' receipts missing');
  const seen=new Set();
  const observedBlocks=new Map();
  for(const receipt of capture.receipts){
    const n=dec(receipt.blockNumber,label+' receipt blockNumber');
    assert(n>before && n<=after,label+' receipt outside snapshot window');
    const blockHash=hash(receipt.blockHash,label+' receipt blockHash');
    const txHash=hash(receipt.transactionHash,label+' transactionHash');
    const blockKey=n.toString();
    const priorHash=observedBlocks.get(blockKey);
    assert(priorHash===undefined || priorHash===blockHash,label+' conflicting block hashes at same height');
    observedBlocks.set(blockKey,blockHash);
    assert(!seen.has(txHash),label+' duplicate receipt');
    seen.add(txHash);
    if(n===after)assert(blockHash===afterHash,label+' after-block hash disagrees with receipt');
    assert(blockHash!==beforeHash,label+' receipt belongs to before-snapshot block');
  }
  return {beforeBlockNumber:before.toString(),afterBlockNumber:after.toString(),receiptCount:seen.size};
}
export function compareWindowBoundPayments(args){
  const baselineWindow=checkSide(args.baselineCapture,args.baselineWindow,'baseline');
  const candidateWindow=checkSide(args.candidateCapture,args.candidateWindow,'candidate');
  const comparison=compareEvidencedPayments(args);
  return {...comparison,windowConsistencyChecked:true,baselineWindow,candidateWindow,
    claimableSavings:false,verifiedByTool:false,
    missingEvidence:[...comparison.missingEvidence,'Snapshot window metadata must be tied to independently verified block-hash-pinned RPC balances and finalized receipts'],
    caveat:'Receipt block positions are consistent with supplied snapshot windows; neither windows nor receipts are independently authenticated.'};
}
