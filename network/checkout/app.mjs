import { approvePayment } from './payment.mjs';

const connect = document.querySelector('#connect');
const details = document.querySelector('#details');
const fees = document.querySelector('#fees');
const receiptLink = document.querySelector('#receipt');
const pay = document.querySelector('#pay');
const verify = document.querySelector('#verify');
const status = document.querySelector('#status');
let quote;
let transactionHash;

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
  const result = await post('/verify', { id: quote.id, transactionHash });
  if (result.state !== 'paid') return false;
  status.textContent = result.networkFee === undefined
    ? 'Payment mined.'
    : `Payment mined. Network fee: ${eth(result.networkFee)} ETH.`;
  verify.disabled = true;
  return true;
}

connect.onclick = async () => {
  connect.disabled = true;
  pay.disabled = true;
  status.textContent = '';
  try {
    if (!window.ethereum) throw new Error('Open this checkout in a browser with an Ethereum wallet.');
    const [payer] = await window.ethereum.request({ method: 'eth_requestAccounts' });
    quote = await post('/quote', { payer });
    const testnet = quote.chainId === 84532;
    const network = testnet ? 'Base Sepolia (testnet)' : 'Local Anvil';
    details.textContent = `${network}. Price: ${eth(quote.value)} ETH. Recipient: ${quote.payee}.`;
    fees.textContent = `Estimated network fee: ${eth(quote.estimatedFee)} ETH. Estimated total: ${eth(BigInt(quote.value) + BigInt(quote.estimatedFee))} ETH.`;
    if (testnet) fees.textContent += ' Includes execution, L1 data, and operator fees.';
    pay.disabled = !quote.canPay;
    if (!quote.canPay) status.textContent = `This wallet needs more ${testnet ? 'test ETH on Base Sepolia' : 'local ETH'}. Get a new price after funding.`;
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
    transactionHash = await approvePayment(window.ethereum, quote);
    if (quote.chainId === 84532) {
      receiptLink.href = 'https://sepolia.basescan.org/tx/' + encodeURIComponent(transactionHash);
      receiptLink.hidden = false;
    }
    status.textContent = 'Payment submitted. Waiting for it to be mined…';
    for (let attempt = 0; attempt < 10; attempt++) {
      if (await checkPayment()) return;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    status.textContent = 'Payment is still pending. Use Check payment to refresh its status.';
    verify.disabled = false;
  } catch (error) {
    status.textContent = error.message;
    if (transactionHash) {
      verify.disabled = false;
    } else {
      pay.disabled = false;
      connect.disabled = false;
    }
  }
};

verify.onclick = async () => {
  verify.disabled = true;
  try {
    if (!await checkPayment()) {
      status.textContent = 'Payment is still pending.';
      verify.disabled = false;
    }
  } catch (error) {
    status.textContent = error.message;
    verify.disabled = false;
  }
};
