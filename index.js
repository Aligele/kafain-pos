import { POS_HTML } from "./pos.html.js";
import { MENU_HTML } from "./menu.html.js";
import { ADMIN_HTML } from "./admin.html.js";
import { LANDING_HTML } from "./landing.html.js";

const TAX_RATE = 0.0;
const LOYALTY_RATE = 0.10;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
function html(body) {
  return new Response(body, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

function requireAdmin(request, env) {
  if (!env.ADMIN_KEY) {
    return json({ error: "Admin key not configured. Add an ADMIN_KEY secret in Settings → Variables and Secrets." }, 500);
  }
  const key = request.headers.get("x-admin-key");
  if (key !== env.ADMIN_KEY) return json({ error: "Unauthorized" }, 401);
  return null;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

async function handleGetProducts(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, sku, name, category, price, stock_grams, grams_per_unit FROM products WHERE active = 1 ORDER BY category, name"
  ).all();
  return json(results);
}

async function handleGetEmployees(env) {
  const { results } = await env.DB.prepare("SELECT id, name, role FROM employees WHERE active = 1 ORDER BY name").all();
  return json(results);
}

async function handleAddEmployee(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const { name, role } = await request.json();
  if (!name) return json({ error: "name is required" }, 400);
  await env.DB.prepare("INSERT INTO employees (name, role) VALUES (?, ?)").bind(name, role || "waiter").run();
  return json({ ok: true }, 201);
}

async function handleCreateOrder(request, env) {
  const body = await request.json();
  const { items, channel, payment_method, employee_id, customer_email } = body;
  if (!Array.isArray(items) || items.length === 0) return json({ error: "Order must include at least one item." }, 400);
  if (!channel || !["counter", "online"].includes(channel)) return json({ error: "channel must be 'counter' or 'online'." }, 400);

  const productIds = items.map((i) => i.product_id);
  const placeholders = productIds.map(() => "?").join(",");
  const { results: products } = await env.DB.prepare(
    `SELECT id, name, price, stock_grams, grams_per_unit FROM products WHERE id IN (${placeholders})`
  ).bind(...productIds).all();
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  let subtotal = 0;
  for (const item of items) {
    const p = productMap[item.product_id];
    if (!p) return json({ error: `Unknown product_id ${item.product_id}` }, 400);
    if (!item.quantity || item.quantity <= 0) return json({ error: "Each item needs a positive quantity." }, 400);
    const neededGrams = (p.grams_per_unit || 0) * item.quantity;
    if (neededGrams > p.stock_grams) return json({ error: `Not enough stock for ${p.name}.` }, 409);
    subtotal += p.price * item.quantity;
  }

  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  let customerId = null;
  if (customer_email) {
    const existing = await env.DB.prepare("SELECT id, loyalty_points FROM customers WHERE email = ?")
      .bind(customer_email).first();
    if (existing) {
      customerId = existing.id;
      const newPoints = existing.loyalty_points + subtotal * LOYALTY_RATE;
      await env.DB.prepare("UPDATE customers SET loyalty_points = ? WHERE id = ?").bind(newPoints, customerId).run();
    } else {
      const inserted = await env.DB.prepare("INSERT INTO customers (email, loyalty_points) VALUES (?, ?) RETURNING id")
        .bind(customer_email, subtotal * LOYALTY_RATE).first();
      customerId = inserted.id;
    }
  }

  const dayCount = await env.DB.prepare(
    "SELECT COUNT(*) as n FROM orders WHERE date(created_at) = date('now')"
  ).first();
  const dailyNumber = (dayCount.n || 0) + 1;

  let employeeName = null;
  if (employee_id) {
    const emp = await env.DB.prepare("SELECT name FROM employees WHERE id = ?").bind(employee_id).first();
    employeeName = emp ? emp.name : null;
  }

  const orderResult = await env.DB.prepare(
    `INSERT INTO orders (customer_id, channel, payment_method, employee_id, subtotal, tax, total, daily_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, created_at`
  ).bind(customerId, channel, payment_method || "unspecified", employee_id || null, subtotal, tax, total, dailyNumber).first();

  const orderId = orderResult.id;
  const statements = [];
  const receiptItems = [];
  for (const item of items) {
    const p = productMap[item.product_id];
    statements.push(env.DB.prepare(
      "INSERT INTO order_items (order_id, product_id, quantity, unit_price, notes) VALUES (?, ?, ?, ?, ?)"
    ).bind(orderId, item.product_id, item.quantity, p.price, item.notes || null));
    const neededGrams = (p.grams_per_unit || 0) * item.quantity;
    statements.push(env.DB.prepare("UPDATE products SET stock_grams = stock_grams - ? WHERE id = ?").bind(neededGrams, p.id));
    receiptItems.push({ name: p.name, quantity: item.quantity, unit_price: p.price, line_total: p.price * item.quantity });
  }
  await env.DB.batch(statements);

  return json({
    order_id: orderId,
    daily_number: dailyNumber,
    subtotal, tax, total,
    customer_id: customerId,
    employee_name: employeeName,
    created_at: orderResult.created_at,
    items: receiptItems,
  }, 201);
}

async function handleGetMyOrders(env, url) {
  const employeeId = url.searchParams.get("employee_id");
  const date = url.searchParams.get("date") || todayDate();
  if (!employeeId) return json({ error: "employee_id is required" }, 400);
  const { results } = await env.DB.prepare(
    `SELECT o.id, o.daily_number, o.subtotal, o.tax, o.total, o.payment_method, o.created_at
     FROM orders o WHERE o.employee_id = ? AND date(o.created_at) = ? ORDER BY o.created_at DESC`
  ).bind(employeeId, date).all();
  return json(results);
}

async function handleAdminSummary(request, env, url) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const date = url.searchParams.get("date") || todayDate();

  const totals = await env.DB.prepare(
    `SELECT COUNT(*) as orders_count, COALESCE(SUM(subtotal),0) as subtotal,
            COALESCE(SUM(tax),0) as tax, COALESCE(SUM(total),0) as total
     FROM orders WHERE date(created_at) = ? AND status = 'completed'`
  ).bind(date).first();

  const { results: byEmployee } = await env.DB.prepare(
    `SELECT COALESCE(e.name, 'Unassigned') as employee_name, COUNT(*) as orders_count, COALESCE(SUM(o.total),0) as total
     FROM orders o LEFT JOIN employees e ON e.id = o.employee_id
     WHERE date(o.created_at) = ? AND o.status = 'completed' GROUP BY employee_name ORDER BY total DESC`
  ).bind(date).all();

  const { results: byChannel } = await env.DB.prepare(
    `SELECT channel, COUNT(*) as orders_count, COALESCE(SUM(total),0) as total
     FROM orders WHERE date(created_at) = ? AND status = 'completed' GROUP BY channel`
  ).bind(date).all();

  const closed = await env.DB.prepare("SELECT * FROM day_closes WHERE business_date = ?").bind(date).first();
  return json({ date, ...totals, by_employee: byEmployee, by_channel: byChannel, closed: closed || null });
}

async function handleAdminOrders(request, env, url) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const date = url.searchParams.get("date") || todayDate();
  const { results } = await env.DB.prepare(
    `SELECT o.id, o.daily_number, o.total, o.payment_method, o.channel, o.created_at, COALESCE(e.name,'Unassigned') as employee_name
     FROM orders o LEFT JOIN employees e ON e.id = o.employee_id
     WHERE date(o.created_at) = ? ORDER BY o.created_at DESC`
  ).bind(date).all();
  return json(results);
}

async function handleCloseDay(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const date = body.business_date || todayDate();
  const closedBy = body.closed_by || "admin";

  const existing = await env.DB.prepare("SELECT * FROM day_closes WHERE business_date = ?").bind(date).first();
  if (existing) return json({ error: `${date} is already closed.`, close: existing }, 409);

  const totals = await env.DB.prepare(
    `SELECT COUNT(*) as orders_count, COALESCE(SUM(subtotal),0) as subtotal,
            COALESCE(SUM(tax),0) as tax, COALESCE(SUM(total),0) as total
     FROM orders WHERE date(created_at) = ? AND status = 'completed'`
  ).bind(date).first();

  const result = await env.DB.prepare(
    `INSERT INTO day_closes (business_date, orders_count, subtotal, tax, total, closed_by)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
  ).bind(date, totals.orders_count, totals.subtotal, totals.tax, totals.total, closedBy).first();

  return json(result, 201);
}

async function handleAdminCloses(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const { results } = await env.DB.prepare("SELECT * FROM day_closes ORDER BY business_date DESC LIMIT 30").all();
  return json(results);
}

// ---- Product management (manager: add items, change price, restock, enable/disable) ----

async function handleAdminListProducts(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const { results } = await env.DB.prepare(
    "SELECT id, sku, name, category, price, cost, stock_grams, grams_per_unit, active FROM products ORDER BY category, name"
  ).all();
  return json(results);
}

async function handleAdminAddProduct(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const { sku, name, category, price, cost, stock_grams, grams_per_unit } = await request.json();
  if (!sku || !name || !category || price == null || cost == null) {
    return json({ error: "sku, name, category, price, and cost are required." }, 400);
  }
  await env.DB.prepare(
    `INSERT INTO products (sku, name, category, price, cost, stock_grams, grams_per_unit) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(sku, name, category, price, cost, stock_grams || 0, grams_per_unit || 0).run();
  return json({ ok: true }, 201);
}

async function handleAdminUpdateProduct(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const { id, price, active, add_stock_grams } = await request.json();
  if (!id) return json({ error: "id is required" }, 400);

  if (price != null) await env.DB.prepare("UPDATE products SET price = ? WHERE id = ?").bind(price, id).run();
  if (active != null) await env.DB.prepare("UPDATE products SET active = ? WHERE id = ?").bind(active ? 1 : 0, id).run();
  if (add_stock_grams) await env.DB.prepare("UPDATE products SET stock_grams = stock_grams + ? WHERE id = ?").bind(add_stock_grams, id).run();

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,x-admin-key",
        },
      });
    }

    try {
      if (pathname === "/" && request.method === "GET") return html(LANDING_HTML);
      if (pathname === "/pos" && request.method === "GET") return html(POS_HTML);
      if (pathname === "/menu" && request.method === "GET") return html(MENU_HTML);
      if (pathname === "/admin" && request.method === "GET") return html(ADMIN_HTML);

      if (pathname === "/api/products" && request.method === "GET") return await handleGetProducts(env);
      if (pathname === "/api/employees" && request.method === "GET") return await handleGetEmployees(env);
      if (pathname === "/api/my-orders" && request.method === "GET") return await handleGetMyOrders(env, url);
      if (pathname === "/api/orders" && request.method === "POST") return await handleCreateOrder(request, env);

      if (pathname === "/api/admin/employees" && request.method === "POST") return await handleAddEmployee(request, env);
      if (pathname === "/api/admin/summary" && request.method === "GET") return await handleAdminSummary(request, env, url);
      if (pathname === "/api/admin/orders" && request.method === "GET") return await handleAdminOrders(request, env, url);
      if (pathname === "/api/admin/close-day" && request.method === "POST") return await handleCloseDay(request, env);
      if (pathname === "/api/admin/closes" && request.method === "GET") return await handleAdminCloses(request, env);

      if (pathname === "/api/admin/products" && request.method === "GET") return await handleAdminListProducts(request, env);
      if (pathname === "/api/admin/products" && request.method === "POST") return await handleAdminAddProduct(request, env);
      if (pathname === "/api/admin/products/update" && request.method === "POST") return await handleAdminUpdateProduct(request, env);

      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: err.message || "Server error" }, 500);
    }
  },
};
