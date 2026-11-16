/** EIP-2028 intrinsic calldata gas; not an L2 data-fee or complete transaction model. */
export function calldataGas(input) {
  if (typeof input !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(input)) {
    throw new TypeError('Expected even-length 0x-prefixed hexadecimal calldata');
  }
  let zeroBytes = 0n;
  let nonzeroBytes = 0n;
  for (let i = 2; i < input.length; i += 2) {
    if (input.slice(i, i + 2) === '00') zeroBytes++;
    else nonzeroBytes++;
  }
  return { zeroBytes, nonzeroBytes, gas: zeroBytes * 4n + nonzeroBytes * 16n };
}

/** A lower bound for legacy EOA transaction intrinsic gas, not an EIP-7702 quote. */
export function basicTransactionIntrinsicGas(input, { contractCreation = false } = {}) {
  const bytes = calldataGas(input);
  return bytes.gas + 21_000n + (contractCreation ? 32_000n : 0n);
}

/** Fail closed on missing price; only compares execution-chain gas, not all-in costs. */
export function pricedCalldataWei(input, gasPriceWei) {
  if (typeof gasPriceWei !== 'bigint' || gasPriceWei < 0n) {
    throw new TypeError('gasPriceWei must be a nonnegative bigint');
  }
  return calldataGas(input).gas * gasPriceWei;
}
