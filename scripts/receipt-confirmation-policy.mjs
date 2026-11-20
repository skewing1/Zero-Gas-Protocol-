// Read-only receipt confirmation policy. All quantities are exact integers.
const DEC = /^(0|[1-9][0-9]*)$/;
export function enforceReceiptConfirmations({receiptBlockNumber, headBlockNumber, minimumConfirmations}) {
  for (const [key, value] of Object.entries({receiptBlockNumber, headBlockNumber, minimumConfirmations})) {
    if (typeof value !== 'string' || !DEC.test(value)) throw new Error(key + ': canonical nonnegative decimal string required');
  }
  const height = BigInt(receiptBlockNumber), head = BigInt(headBlockNumber), required = BigInt(minimumConfirmations);
  if (required < 1n) throw new Error('minimumConfirmations must be at least 1');
  if (head < height) throw new Error('receipt block ahead of chain head');
  const observed = head - height + 1n;
  if (observed < required) throw new Error('insufficient receipt confirmations');
  return Object.freeze({observedConfirmations: observed.toString(), minimumConfirmations: required.toString()});
}
