export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Kafa!n and Co — Admin</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #f4f1ea; color: #2c2420; }
  header { background: #2c2420; color: #f4f1ea; padding: 16px 24px; }
  header h1 { margin: 0; font-size: 18px; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 16px; }
  .gate { max-width: 340px; margin: 60px auto; background: #fff; border: 1px solid #e5ded2; border-radius: 10px; padding: 20px; text-align: center; }
  input, button, select { width: 100%; padding: 10px; margin-top: 8px; border-radius: 8px; border: 1px solid #d8cfc0; font-size: 14px; }
  button { background: #2c2420; color: #f4f1ea; border: none; cursor: pointer; }
  button.small { width: auto; padding: 6px 10px; font-size: 12px; margin: 0 4px 0 0; }
  button.secondary { background: #fff; color: #2c2420; border: 1px solid #d8cfc0; }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 16px 0; }
  .card { background: #fff; border: 1px solid #e5ded2; border-radius: 10px; padding: 12px; }
  .card .label { font-size: 12px; color: #8a7f6f; }
  .card .value { font-size: 20px; font-weight: 700; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; border-radius: 10px; overflow: hidden; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #f0ece2; }
  th { background: #efe9dc; }
  .section { margin-top: 20px; }
  .section h3 { font-size: 14px; margin-bottom: 8px; }
  .msg { font-size: 13px; margin-top: 8px; padding: 8px; border-radius: 6px; }
  .msg.ok { background: #e6f1e6; color: #2f6f2f; }
  .msg.err { background: #fbe6e6; color: #a33; }
  .row2 { display: flex; gap: 8px; }
  .row2 input { flex: 1; }
  .inactive { opacity: 0.5; }
  .tabs { display: flex; gap: 8px; margin: 16px 0; }
  .tabs button { width: auto; padding: 8px 14px; background: #fff; color: #2c2420; border: 1px solid #d8cfc0; }
  .tabs button.active { background: #2c2420; color: #f4f1ea; }
  .tabpage { display: none; }
  .tabpage.active { display: block; }
</style>
</head>
<body>
<div id="gateScreen" class="gate">
  <h2 style="margin-top:0;font-size:16px;">Manager login</h2>
  <input type="text" id="managerName" placeholder="Your name" />
  <input type="password" id="adminKey" placeholder="Passcode" />
  <button id="enterBtn">Log in</button>
  <div id="gateMsg" class="msg"></div>
</div>

<div id="dashboard" style="display:none;">
  <header><h1>Kafa!n and Co — Manager dashboard</h1><div id="greeting" style="font-size:12px;opacity:0.8;margin-top:4px;"></div></header>
  <div class="wrap">

    <div class="tabs">
      <button data-tab="sales" class="active">Sales</button>
      <button data-tab="menu">Menu items</button>
      <button data-tab="staff">Staff</button>
    </div>

    <div id="tab-sales" class="tabpage active">
      <input type="date" id="dateInput" />
      <div class="cards" id="cards"></div>
      <div class="section"><h3>Sales by waiter</h3><table id="byEmployee"></table></div>
      <div class="section"><h3>Sales by channel</h3><table id="byChannel"></table></div>
      <div class="section"><h3>Orders</h3><table id="orders"></table></div>
      <div class="section">
        <button id="closeDayBtn">Close day</button>
        <div id="closeMsg" class="msg"></div>
      </div>
    </div>

    <div id="tab-menu" class="tabpage">
      <div class="section">
        <h3>Current menu</h3>
        <table id="productsTable"></table>
      </div>
      <div class="section">
        <h3>Add new item</h3>
        <input type="text" id="p_name" placeholder="Name (e.g. Mocha)" />
        <div class="row2">
          <input type="text" id="p_sku" placeholder="SKU (e.g. MOC-01)" />
          <input type="text" id="p_category" placeholder="Category (hot_cup, bag, pastry...)" />
        </div>
        <div class="row2">
          <input type="number" step="0.01" id="p_price" placeholder="Sell price ($)" />
          <input type="number" step="0.01" id="p_cost" placeholder="Cost ($)" />
        </div>
        <div class="row2">
          <input type="number" id="p_stock" placeholder="Starting stock (grams, or units)" />
          <input type="number" id="p_gpu" placeholder="Grams used per sale (0 if not tracked)" />
        </div>
        <button id="addProductBtn">Add item</button>
        <div id="productMsg" class="msg"></div>
      </div>
    </div>

    <div id="tab-staff" class="tabpage">
      <div class="section">
        <h3>Add waiter / employee</h3>
        <input type="text" id="newEmpName" placeholder="Name" />
        <button id="addEmpBtn">Add employee</button>
        <div id="empMsg" class="msg"></div>
      </div>
    </div>

  </div>
</div>

<script>
let adminKey = sessionStorage.getItem('kafain_admin_key') || '';

function fmt(n) { return '$' + Number(n).toFixed(2); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey, ...(opts.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

document.querySelectorAll('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tabpage').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'menu') loadProducts();
  });
});

document.getElementById('enterBtn').addEventListener('click', async () => {
  adminKey = document.getElementById('adminKey').value;
  const name = document.getElementById('managerName').value.trim() || 'Manager';
  const gateMsg = document.getElementById('gateMsg');
  if (!adminKey) {
    gateMsg.textContent = 'Enter the passcode first.';
    gateMsg.className = 'msg err';
    return;
  }
  try {
    await api('/api/admin/summary?date=' + todayStr());
    sessionStorage.setItem('kafain_admin_key', adminKey);
    sessionStorage.setItem('kafain_manager_name', name);
    enterDashboard();
  } catch (err) {
    gateMsg.textContent = 'Incorrect passcode.';
    gateMsg.className = 'msg err';
  }
});

function enterDashboard() {
  document.getElementById('gateScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('dateInput').value = todayStr();
  const name = sessionStorage.getItem('kafain_manager_name') || 'Manager';
  document.getElementById('greeting').textContent = 'Logged in as ' + name + ' · Log out';
  document.getElementById('greeting').style.cursor = 'pointer';
  document.getElementById('greeting').onclick = () => {
    sessionStorage.removeItem('kafain_admin_key');
    sessionStorage.removeItem('kafain_manager_name');
    location.reload();
  };
  loadSales();
}

async function loadSales() {
  const date = document.getElementById('dateInput').value || todayStr();
  const summary = await api('/api/admin/summary?date=' + date);

  document.getElementById('cards').innerHTML = \`
    <div class="card"><div class="label">Orders</div><div class="value">\${summary.orders_count}</div></div>
    <div class="card"><div class="label">Total sales</div><div class="value">\${fmt(summary.total)}</div></div>
    <div class="card"><div class="label">Status</div><div class="value" style="font-size:14px;">\${summary.closed ? 'Closed' : 'Open'}</div></div>
  \`;

  document.getElementById('byEmployee').innerHTML = '<tr><th>Waiter</th><th>Orders</th><th>Total</th></tr>' +
    summary.by_employee.map(r => \`<tr><td>\${r.employee_name}</td><td>\${r.orders_count}</td><td>\${fmt(r.total)}</td></tr>\`).join('');

  document.getElementById('byChannel').innerHTML = '<tr><th>Channel</th><th>Orders</th><th>Total</th></tr>' +
    summary.by_channel.map(r => \`<tr><td>\${r.channel}</td><td>\${r.orders_count}</td><td>\${fmt(r.total)}</td></tr>\`).join('');

  const orders = await api('/api/admin/orders?date=' + date);
  document.getElementById('orders').innerHTML = '<tr><th>#</th><th>Waiter</th><th>Channel</th><th>Payment</th><th>Total</th><th>Time</th></tr>' +
    orders.map(o => \`<tr><td>\${o.id}</td><td>\${o.employee_name}</td><td>\${o.channel}</td><td>\${o.payment_method}</td><td>\${fmt(o.total)}</td><td>\${new Date(o.created_at).toLocaleTimeString()}</td></tr>\`).join('');

  const closeBtn = document.getElementById('closeDayBtn');
  closeBtn.disabled = !!summary.closed;
  closeBtn.textContent = summary.closed ? 'Day already closed' : 'Close day';
}

document.getElementById('dateInput').addEventListener('change', loadSales);

document.getElementById('closeDayBtn').addEventListener('click', async () => {
  const msg = document.getElementById('closeMsg');
  const date = document.getElementById('dateInput').value || todayStr();
  try {
    const result = await api('/api/admin/close-day', { method: 'POST', body: JSON.stringify({ business_date: date }) });
    msg.textContent = 'Closed ' + date + ' — ' + result.orders_count + ' orders, ' + fmt(result.total) + ' total.';
    msg.className = 'msg ok';
    loadSales();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg err';
  }
});

document.getElementById('addEmpBtn').addEventListener('click', async () => {
  const msg = document.getElementById('empMsg');
  const name = document.getElementById('newEmpName').value.trim();
  if (!name) { msg.textContent = 'Enter a name first.'; msg.className = 'msg err'; return; }
  try {
    await api('/api/admin/employees', { method: 'POST', body: JSON.stringify({ name }) });
    msg.textContent = name + ' added.';
    msg.className = 'msg ok';
    document.getElementById('newEmpName').value = '';
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg err';
  }
});

async function loadProducts() {
  const products = await api('/api/admin/products');
  const el = document.getElementById('productsTable');
  el.innerHTML = '<tr><th>Name</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr>' +
    products.map(p => \`
      <tr class="\${p.active ? '' : 'inactive'}">
        <td>\${p.name}</td>
        <td>\${fmt(p.price)}</td>
        <td>\${p.grams_per_unit ? Math.floor(p.stock_grams / p.grams_per_unit) + ' units' : p.stock_grams}</td>
        <td>\${p.active ? 'Active' : 'Off menu'}</td>
        <td>
          <button class="small secondary" onclick="restock(\${p.id})">Restock</button>
          <button class="small secondary" onclick="toggleActive(\${p.id}, \${p.active ? 0 : 1})">\${p.active ? 'Take off menu' : 'Put back on menu'}</button>
        </td>
      </tr>
    \`).join('');
}

window.restock = async function(id) {
  const grams = prompt('Add how many grams (or units) of stock?');
  if (!grams) return;
  await api('/api/admin/products/update', { method: 'POST', body: JSON.stringify({ id, add_stock_grams: Number(grams) }) });
  loadProducts();
};

window.toggleActive = async function(id, active) {
  await api('/api/admin/products/update', { method: 'POST', body: JSON.stringify({ id, active }) });
  loadProducts();
};

document.getElementById('addProductBtn').addEventListener('click', async () => {
  const msg = document.getElementById('productMsg');
  const body = {
    name: document.getElementById('p_name').value.trim(),
    sku: document.getElementById('p_sku').value.trim(),
    category: document.getElementById('p_category').value.trim(),
    price: Number(document.getElementById('p_price').value),
    cost: Number(document.getElementById('p_cost').value),
    stock_grams: Number(document.getElementById('p_stock').value) || 0,
    grams_per_unit: Number(document.getElementById('p_gpu').value) || 0,
  };
  if (!body.name || !body.sku || !body.category || !body.price || !body.cost) {
    msg.textContent = 'Fill in name, SKU, category, price, and cost.';
    msg.className = 'msg err';
    return;
  }
  try {
    await api('/api/admin/products', { method: 'POST', body: JSON.stringify(body) });
    msg.textContent = body.name + ' added to the menu.';
    msg.className = 'msg ok';
    ['p_name','p_sku','p_category','p_price','p_cost','p_stock','p_gpu'].forEach(id => document.getElementById(id).value = '');
    loadProducts();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg err';
  }
});

if (adminKey) {
  api('/api/admin/summary?date=' + todayStr()).then(enterDashboard).catch(() => {
    sessionStorage.removeItem('kafain_admin_key');
  });
}
</script>
</body>
</html>`;
