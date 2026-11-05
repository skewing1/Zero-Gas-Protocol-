import { approvePayment, parseTransferAmount } from './payment.mjs';

const connect = document.querySelector('#connect');
const details = document.querySelector('#details');
const fees = document.querySelector('#fees');
const receiptLink = document.querySelector('#receipt');
const pay = document.querySelector('#pay');
const verify = document.querySelector('#verify');
const status = document.querySelector('#status');
const recipient = document.querySelector('#recipient');
const amount = document.querySelector('#amount');
let quote;
let transactionHash;
let submittedQuote;

function invalidateQuote() {
  quote = undefined;
  pay.disabled = true;
  details.textContent = '';
  fees.textContent = '';
}
recipient.oninput = amount.oninput = invalidateQuote;
window.ethereum?.on?.('accountsChanged', invalidateQuote);
window.ethereum?.on?.('chainChanged', invalidateQuote);

async function post(path, payload) {
  const response = await fetch(path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

function eth(quantity) {
  const digits = BigInt(quantity).toString().padStart(19, '0');
  return (digits.slice(0, -18) + '.' + digits.slice(-18)).replace(/\.?0+$/, '');
}

async function checkPayment() {
  const result = await post('/verify', { id: submittedQuote.id, transactionHash });
  if (result.state !== 'paid') return false;
  status.textContent = result.networkFee === undefined
    ? 'Transfer mined.'
    : `Transfer mined. Network fee: ${eth(result.networkFee)} ETH.`;
  verify.disabled = true;
  return true;
}

connect.onclick = async () => {
  connect.disabled = true;
  pay.disabled = true;
  status.textContent = '';
  try {
    if (!window.ethereum) throw new Error('Open this transfer page in a browser with an Ethereum wallet.');
    const request = { payee: recipient.value.trim(), amount: amount.value.trim() };
    parseTransferAmount(request.amount);
    const [payer] = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const reviewed = await post('/quote', { payer, ...request });
    if (recipient.value.trim() !== request.payee || amount.value.trim() !== request.amount) throw new Error('Transfer changed. Review it again.');
    quote = reviewed;
    const testnet = quote.chainId === 84532;
    const network = testnet ? 'Base Sepolia (testnet)' : 'Local Anvil';
    details.textContent = `${network}. Amount: ${eth(quote.value)} ETH. Recipient: ${quote.payee}.`;
    fees.textContent = `Estimated network fee: ${eth(quote.estimatedFee)} ETH. Estimated total: ${eth(BigInt(quote.value) + BigInt(quote.estimatedFee))} ETH.`;
    if (testnet) fees.textContent += ' Includes execution, L1 data, and operator fees.';
    pay.disabled = !quote.canPay;
    if (!quote.canPay) status.textContent = `This wallet needs more ${testnet ? 'test ETH on Base Sepolia' : 'local ETH'}. Review the transfer again after funding.`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    connect.disabled = false;
  }
};

pay.onclick = async () => {
  pay.disabled = true;
  connect.disabled = true;
  try {
    const approvedQuote = quote;
    if (!approvedQuote) throw new Error('Review the transfer first.');
    transactionHash = undefined;
    receiptLink.hidden = true;
    recipient.disabled = amount.disabled = true;
    transactionHash = await approvePayment(window.ethereum, approvedQuote);
    submittedQuote = approvedQuote;
    if (approvedQuote.chainId === 84532) {
      receiptLink.href = 'https://sepolia.basescan.org/tx/' + encodeURIComponent(transactionHash);
      receiptLink.hidden = false;
    }
    status.textContent = 'Transfer submitted. Waiting for it to be mined…';
    for (let attempt = 0; attempt < 10; attempt++) {
      if (await checkPayment()) return;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    status.textContent = 'Transfer is still pending. Use Check transfer to refresh its status.';
    verify.disabled = false;
  } catch (error) {
    status.textContent = error.message;
    if (transactionHash) {
      verify.disabled = false;
    } else {
      pay.disabled = !quote;
      connect.disabled = false;
    }
  } finally {
    recipient.disabled = amount.disabled = false;
    connect.disabled = false;
  }
};

verify.onclick = async () => {
  verify.disabled = true;
  try {
    if (!await checkPayment()) {
      status.textContent = 'Transfer is still pending.';
      verify.disabled = false;
    }
  } catch (error) {
    status.textContent = error.message;
    verify.disabled = false;
  }
};
