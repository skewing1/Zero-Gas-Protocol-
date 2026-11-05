export function paymentTransaction(quote) {
  return { chainId: '0x' + BigInt(quote.chainId).toString(16), from: quote.payer, to: quote.payee, value: quote.value, data: '0x', nonce: quote.nonce };
}

export function parseTransferAmount(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/.test(value)) {
    throw new Error('Enter an ETH amount with up to 18 decimal places.');
  }
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
  if (amount <= 0n || amount >= 2n ** 256n) throw new Error('Amount is outside the supported range.');
  return amount;
}

const baseSepolia = {
  chainId: '0x14a34',
  chainName: 'Base Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://sepolia.base.org'],
  blockExplorerUrls: ['https://sepolia.basescan.org'],
};

async function useQuotedNetwork(wallet, chainId) {
  const currentChain = () => wallet.request({ method: 'eth_chainId' }).then(BigInt);
  if (await currentChain() === BigInt(chainId)) return;
  if (chainId !== 84532) throw new Error('Switch your wallet to the quoted network.');
  const switchNetwork = () => wallet.request({
    method: 'wallet_switchEthereumChain', params: [{ chainId: baseSepolia.chainId }],
  });
  try {
    await switchNetwork();
  } catch (error) {
    if (error.code !== 4902) throw error;
    await wallet.request({ method: 'wallet_addEthereumChain', params: [baseSepolia] });
    if (await currentChain() !== BigInt(chainId)) await switchNetwork();
  }
  if (await currentChain() !== BigInt(chainId)) throw new Error('Wallet is still on the wrong network.');
}

export async function approvePayment(wallet, quote) {
  if (![31337, 84532].includes(quote.chainId)) throw new Error('Unsupported checkout network.');
  if (quote.canPay === false) throw new Error('Insufficient ETH on the quoted network.');
  await useQuotedNetwork(wallet, quote.chainId);
  const [account] = await wallet.request({ method: 'eth_accounts' });
  if (typeof account !== 'string' || account.toLowerCase() !== quote.payer.toLowerCase()) {
    throw new Error('Wallet account changed. Review the transfer again.');
  }
  const nonce = await wallet.request({ method: 'eth_getTransactionCount', params: [quote.payer, 'pending'] });
  if (BigInt(nonce) !== BigInt(quote.nonce)) throw new Error('Wallet nonce changed. Review the transfer again.');
  return wallet.request({ method: 'eth_sendTransaction', params: [paymentTransaction(quote)] });
}
