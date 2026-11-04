import { approvePayment } from './payment.mjs';

const connect = document.querySelector('#connect');
const details = document.querySelector('#details');
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
  status.textContent = result.state === 'paid'
    ? 'Payment confirmed.'
    : 'Payment submitted. Check again after it is mined.';
  verify.disabled = result.state === 'paid';
}

connect.onclick = async () => {
  connect.disabled = true;
  pay.disabled = true;
  status.textContent = '';
  try {
    if (!window.ethereum) throw new Error('Open this checkout in a browser with an Ethereum wallet.');
    const [payer] = await window.ethereum.request({ method: 'eth_requestAccounts' });
    quote = await post('/quote', { payer });
    details.textContent = `Price: ${eth(quote.value)} ETH. Estimated network fee: ${eth(quote.estimatedFee)} ETH. Network: ${quote.chainId}. Recipient: ${quote.payee}.`;
    pay.disabled = false;
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
    verify.disabled = false;
    await checkPayment();
  } catch (error) {
    status.textContent = error.message;
    if (!transactionHash) {
      pay.disabled = false;
      connect.disabled = false;
    }
  }
};

verify.onclick = async () => {
  verify.disabled = true;
  try { await checkPayment(); } catch (error) {
    status.textContent = error.message;
    verify.disabled = false;
  }
};
