export const MENU_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Kafa!n and Co — Order online</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #f4f1ea; color: #2c2420; }
  header { background: #2c2420; color: #f4f1ea; padding: 20px 24px; text-align: center; }
  header h1 { margin: 0; font-size: 20px; }
  .wrap { max-width: 480px; margin: 0 auto; padding: 16px; }
  .item { background: #fff; border: 1px solid #e5ded2; border-radius: 10px; padding: 14px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .item .name { font-weight: 600; font-size: 14px; }
  .item .price { color: #8a6d3b; font-size: 13px; margin-top: 2px; }
  .item button { padding: 8px 14px; border-radius: 8px; border: 1px solid #2c2420; background: #fff; cursor: pointer; }
  .bar { position: sticky; bottom: 0; background: #fff; border-top: 1px solid #e5ded2; padding: 14px 16px; margin-top: 12px; border-radius: 10px 10px 0 0; }
  .bar .row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px; }
  input, button.primary { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #d8cfc0; font-size: 14px; margin-top: 8px; }
  button.primary { background: #2c2420; color: #f4f1ea; border: none; cursor: pointer; }
  .msg { font-size: 13px; margin-top: 8px; padding: 8px; border-radius: 6px; }
  .msg.ok { background: #e6f1e6; color: #2f6f2f; }
  .msg.err { background: #fbe6e6; color: #a33; }
</style>
</head>
<body>
<header><h1>Kafa!n and Co</h1></header>
<div class="wrap">
  <div id="items"></div>
  <div class="bar">
    <div class="row"><span>Items in cart</span><span id="count">0</span></div>
    <div class="row"><span>Total</span><span id="total">$0.00</span></div>
    <input type="email" id="email" placeholder="Email for order + loyalty points" />
    <button class="primary" id="order" disabled>Place order</button>
    <div id="msg"></div>
  </div>
</div>
<script>
let products = [];
let cart = {};

async function loadProducts() {
  const res = await fetch('/api/products');
  products = await res.json();
  render();
}

function render() {
  const el = document.getElementById('items');
  el.innerHTML = products.map(p => \`
    <div class="item">
      <div>
        <div class="name">\${p.name}</div>
        <div class="price">$\${p.price.toFixed(2)}</div>
      </div>
      <button data-id="\${p.id}">Add</button>
    </div>
  \`).join('');
  el.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      cart[id] = (cart[id] || 0) + 1;
      updateBar();
    });
  });
}

function updateBar() {
  let count = 0, total = 0;
  for (const id in cart) {
    const p = products.find(pr => pr.id === Number(id));
    count += cart[id];
    total += p.price * cart[id];
  }
  document.getElementById('count').textContent = count;
  document.getElementById('total').textContent = '$' + total.toFixed(2);
  document.getElementById('order').disabled = count === 0;
}

document.getElementById('order').addEventListener('click', async () => {
  const btn = document.getElementById('order');
  const msg = document.getElementById('msg');
  btn.disabled = true;
  msg.textContent = '';
  msg.className = 'msg';
  const items = Object.entries(cart).map(([product_id, quantity]) => ({ product_id: Number(product_id), quantity }));
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items,
        channel: 'online',
        payment_method: 'card',
        customer_email: document.getElementById('email').value || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Order failed');
    msg.textContent = 'Order #' + data.order_id + ' placed — $' + data.total.toFixed(2);
    msg.className = 'msg ok';
    cart = {};
    updateBar();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg err';
    btn.disabled = false;
  }
});

loadProducts();
</script>
</body>
</html>`;
