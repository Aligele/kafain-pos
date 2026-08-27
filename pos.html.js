export const POS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Kafa!n and Co — POS</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #f4f1ea; color: #2c2420; }
  header { background: #2c2420; color: #f4f1ea; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
  header h1 { margin: 0; font-size: 18px; font-weight: 600; }
  header .whoami { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  header select { padding: 6px 10px; border-radius: 6px; border: none; }
  .wrap { display: flex; gap: 16px; padding: 16px; max-width: 1100px; margin: 0 auto; flex-wrap: wrap; }
  .products { flex: 2; min-width: 280px; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; align-content: start; }
  .card { background: #fff; border-radius: 10px; padding: 14px; cursor: pointer; border: 1px solid #e5ded2; transition: box-shadow .15s; }
  .card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .card .name { font-weight: 600; font-size: 14px; }
  .card .price { color: #8a6d3b; font-size: 13px; margin-top: 4px; }
  .card .stock { color: #999; font-size: 11px; margin-top: 4px; }
  .cart { flex: 1; background: #fff; border-radius: 10px; padding: 16px; border: 1px solid #e5ded2; min-width: 260px; height: fit-content; }
  .cart h2 { font-size: 15px; margin: 0 0 12px; }
  .line { display: flex; justify-content: space-between; font-size: 13px; padding: 6px 0; border-bottom: 1px solid #f0ece2; }
  .totals { margin-top: 12px; font-size: 14px; }
  .totals .row { display: flex; justify-content: space-between; margin-top: 4px; }
  .totals .grand { font-weight: 700; font-size: 16px; margin-top: 8px; }
  select, button { width: 100%; padding: 10px; margin-top: 8px; border-radius: 8px; border: 1px solid #d8cfc0; font-size: 14px; }
  button.primary { background: #2c2420; color: #f4f1ea; border: none; cursor: pointer; }
  button.primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .msg { font-size: 13px; margin-top: 8px; padding: 8px; border-radius: 6px; }
  .msg.ok { background: #e6f1e6; color: #2f6f2f; }
  .msg.err { background: #fbe6e6; color: #a33; }
  .mytickets { max-width: 1100px; margin: 0 auto; padding: 0 16px 24px; }
  .mytickets h3 { font-size: 14px; }
  .ticket { background: #fff; border: 1px solid #e5ded2; border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
</style>
</head>
<body>
<header>
  <h1>Kafa!n and Co — Counter POS</h1>
  <div class="whoami">
    <span>Serving as</span>
    <select id="employee"></select>
  </div>
</header>
<div class="wrap">
  <div class="products" id="products"></div>
  <div class="cart">
    <h2>Current order</h2>
    <div id="lines"></div>
    <div class="totals">
      <div class="row"><span>Subtotal</span><span id="subtotal">$0.00</span></div>
      <div class="row grand"><span>Total</span><span id="total">$0.00</span></div>
    </div>
    <select id="payment">
      <option value="card">Card</option>
      <option value="cash">Cash</option>
    </select>
    <button class="primary" id="checkout" disabled>Charge</button>
    <div id="msg"></div>
  </div>
</div>
<div class="mytickets">
  <h3>My tickets today</h3>
  <div id="myTickets"></div>
</div>
<script>
let products = [];
let employees = [];
let cart = [];

async function loadEmployees() {
  const res = await fetch('/api/employees');
  employees = await res.json();
  const sel = document.getElementById('employee');
  sel.innerHTML = employees.map(e => \`<option value="\${e.id}">\${e.name}</option>\`).join('');
  const saved = localStorage.getItem('kafain_employee_id');
  if (saved && employees.some(e => String(e.id) === saved)) sel.value = saved;
  sel.addEventListener('change', () => {
    localStorage.setItem('kafain_employee_id', sel.value);
    loadMyTickets();
  });
  if (sel.value) localStorage.setItem('kafain_employee_id', sel.value);
  loadMyTickets();
}

async function loadProducts() {
  const res = await fetch('/api/products');
  products = await res.json();
  renderProducts();
}

function renderProducts() {
  const el = document.getElementById('products');
  el.innerHTML = products.map(p => \`
    <div class="card" data-id="\${p.id}">
      <div class="name">\${p.name}</div>
      <div class="price">$\${p.price.toFixed(2)}</div>
      <div class="stock">\${p.grams_per_unit ? Math.floor(p.stock_grams / p.grams_per_unit) + ' in stock' : ''}</div>
    </div>
  \`).join('');
  el.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => addToCart(Number(card.dataset.id)));
  });
}

function addToCart(productId) {
  const existing = cart.find(i => i.product_id === productId);
  if (existing) existing.quantity += 1;
  else cart.push({ product_id: productId, quantity: 1 });
  renderCart();
}

function renderCart() {
  const linesEl = document.getElementById('lines');
  let subtotal = 0;
  linesEl.innerHTML = cart.map(item => {
    const p = products.find(pr => pr.id === item.product_id);
    const lineTotal = p.price * item.quantity;
    subtotal += lineTotal;
    return \`<div class="line"><span>\${item.quantity}x \${p.name}</span><span>$\${lineTotal.toFixed(2)}</span></div>\`;
  }).join('');
  document.getElementById('subtotal').textContent = '$' + subtotal.toFixed(2);
  document.getElementById('total').textContent = '$' + subtotal.toFixed(2);
  document.getElementById('checkout').disabled = cart.length === 0;
}

async function loadMyTickets() {
  const employeeId = document.getElementById('employee').value;
  const el = document.getElementById('myTickets');
  if (!employeeId) { el.innerHTML = ''; return; }
  const res = await fetch('/api/my-orders?employee_id=' + employeeId);
  const orders = await res.json();
  if (!Array.isArray(orders) || orders.length === 0) {
    el.innerHTML = '<div style="font-size:13px;color:#999;">No tickets yet today.</div>';
    return;
  }
  el.innerHTML = orders.map(o => \`
    <div class="ticket">
      <span>#\${o.id} · \${o.payment_method} · \${new Date(o.created_at).toLocaleTimeString()}</span>
      <span>$\${o.total.toFixed(2)}</span>
    </div>
  \`).join('');
}

document.getElementById('checkout').addEventListener('click', async () => {
  const btn = document.getElementById('checkout');
  const msg = document.getElementById('msg');
  btn.disabled = true;
  msg.textContent = '';
  msg.className = 'msg';
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cart,
        channel: 'counter',
        payment_method: document.getElementById('payment').value,
        employee_id: Number(document.getElementById('employee').value) || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Order failed');
    msg.textContent = 'Order #' + data.order_id + ' charged — $' + data.total.toFixed(2);
    msg.className = 'msg ok';
    cart = [];
    renderCart();
    loadProducts();
    loadMyTickets();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg err';
    btn.disabled = false;
  }
});

loadEmployees();
loadProducts();
</script>
</body>
</html>`;
