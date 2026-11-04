// Browser and merchant share this exact wallet transaction shape.
export function paymentTransaction(quote) {
  return { from: quote.payer, to: quote.payee, value: quote.value, data: quote.id };
}

export async function approvePayment(wallet, quote) {
  const chainId = await wallet.request({ method: 'eth_chainId' });
  if (BigInt(chainId) !== BigInt(quote.chainId)) throw new Error('Switch your wallet to the quoted network.');
  return wallet.request({ method: 'eth_sendTransaction', params: [paymentTransaction(quote)] });
}
