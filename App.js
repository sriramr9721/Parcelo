/* Parcelo: demo shop. Data lives in browser localStorage (no backend). */
const $ = s => document.querySelector(s);
const KEY = "parcelo_v1";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = n => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const sha = async t => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))]
  .map(b => b.toString(16).padStart(2, "0")).join("");

/* ---------- data layer ---------- */
const seedProducts = [
  ["Ceramic Pour-Over","Home",799,12,"Slow-morning coffee dripper.","☕","#f1d9c4"],
  ["Everyday Headphones","Tech",2499,8,"Comfortable sound for work and travel.","🎧","#cfe0ee"],
  ["Canvas Carryall","Accessories",1199,15,"Sturdy bag with room for more.","👜","#e6d3e0"],
  ["Desk Companion Lamp","Home",1499,6,"Warm light for your corner.","💡","#fbeeb0"],
  ["Steel Water Bottle","Lifestyle",649,20,"Reusable and ready to go.","🍶","#f7d4dc"],
  ["Wireless Speaker","Tech",1999,0,"Compact, room-filling sound.","🔊","#d8dcf0"],
  ["Soft Knit Throw","Home",1299,10,"A soft layer for slow evenings.","🧶","#f3d9cf"],
  ["Minimal Watch","Accessories",2999,5,"A clean everyday style.","⌚","#cde4de"],
].map((a, i) => ({ id: i + 1, name: a[0], cat: a[1], price: a[2], stock: a[3], active: true, desc: a[4], emoji: a[5], tone: a[6] }));

const seed = () => ({ users: [], categories: ["Home","Tech","Lifestyle","Accessories"], products: seedProducts,
  carts: {}, addresses: {}, orders: [], pid: 9, oid: 1001 });
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { return seed(); } };
let db = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(db));

/* ---------- state helpers ---------- */
let me = null, view = "shop", mode = "login", toastT;
const f = { q: "", cat: "", sort: "featured" };
const user = () => db.users.find(u => u.email === me);
const isAdmin = () => !!user()?.admin;
const cart = () => (me ? (db.carts[me] ??= []) : []);
const prod = id => db.products.find(p => p.id == id);
const toast = m => { const t = $("#toast"); t.textContent = m; t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600); };
const needLogin = () => { if (me) return false; toast("Sign in to continue."); openAuth("login"); return true; };

/* ---------- renderers ---------- */
function shopHTML() {
  let l = db.products.filter(p => p.active && (!f.cat || p.cat === f.cat) && (p.name + p.desc).toLowerCase().includes(f.q));
  if (f.sort === "low") l.sort((a, b) => a.price - b.price);
  if (f.sort === "high") l.sort((a, b) => b.price - a.price);
  if (f.sort === "name") l.sort((a, b) => a.name.localeCompare(b.name));
  return `<h1>Shop</h1><p class="sub">${l.length} products</p>` + (l.map(p => `
    <article class="row"><div class="tile" style="--t:${p.tone || "#ddd"}">${p.emoji || "📦"}</div>
      <div><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p><small>${esc(p.cat)}</small></div>
      <b>${money(p.price)}</b><span class="stk ${p.stock < 6 ? "low" : ""}">${p.stock ? p.stock + " in stock" : "Sold out"}</span>
      <button data-act="add" data-id="${p.id}" ${p.stock ? "" : "disabled"}>Add</button></article>`).join("")
    || `<p class="empty">No products match. Clear the search or pick another category.</p>`);
}

function cartHTML() {
  const items = cart();
  if (!items.length) return `<h2>Your cart</h2><p class="empty">Nothing here yet. Add a product to begin.</p>`;
  const total = items.reduce((s, i) => s + prod(i.id).price * i.qty, 0);
  return `<h2>Your cart</h2>` + items.map(i => { const p = prod(i.id); return `
    <div class="line"><b>${esc(p.name)}</b><b>${money(p.price * i.qty)}</b>
      <div class="qty"><button data-act="qty" data-id="${p.id}" data-d="-1" aria-label="Decrease">-</button>${i.qty}
      <button data-act="qty" data-id="${p.id}" data-d="1" aria-label="Increase">+</button></div>
      <button class="link" data-act="rm" data-id="${p.id}">Remove</button></div>`; }).join("") +
    `<p class="total">Total ${money(total)}</p><button class="primary" data-act="checkout">Checkout</button>`;
}

const STEPS = ["CONFIRMED", "SHIPPED", "DELIVERED"];
function ordersHTML() {
  const l = db.orders.filter(o => o.email === me).sort((a, b) => b.id - a.id);   // own orders only (FR10)
  return `<h1>My orders</h1><p class="sub">Track each order from payment to delivery.</p>` + (l.map(o => {
    const at = STEPS.indexOf(o.status), bad = o.status === "CANCELLED";
    return `<div class="card"><b>Order #${o.id}</b> <span class="tag ${bad ? "bad" : ""}">${o.status}</span>
      <span class="tag">Payment: ${o.pay}</span><p>${o.items.map(i => `${esc(i.name)} x${i.qty} @ ${money(i.price)}`).join("<br>")}</p>
      <p>Total <b>${money(o.total)}</b><br>Ship to: ${esc(o.addr.name)}, ${esc(o.addr.street)}, ${esc(o.addr.city)} ${esc(o.addr.post)}</p>
      ${bad ? "" : `<ol class="track">${STEPS.map((s, i) => `<li class="${i <= at ? "done" : ""}">${s[0] + s.slice(1).toLowerCase()}</li>`).join("")}</ol>`}
      ${["PLACED", "CONFIRMED"].includes(o.status) ? `<button class="danger" data-act="cancel" data-id="${o.id}">Cancel order</button>` : ""}</div>`;
  }).join("") || `<p class="empty">No orders yet. Visit the shop to place one.</p>`);
}

function adminHTML() {
  if (!isAdmin()) return `<p class="empty">Administrator access required.</p>`;
  const opts = db.categories.map(c => `<option>${esc(c)}</option>`).join("");
  return `<h1>Admin</h1>
  <div class="card"><h2>Categories</h2><form id="catForm" class="grid2"><input name="name" placeholder="New category" required><button>Add category</button></form></div>
  <div class="card"><h2>Add product</h2><form id="prodForm" class="grid2">
    <input name="name" placeholder="Name" required><input name="desc" placeholder="Description" required>
    <select name="cat">${opts}</select><input name="price" type="number" step="0.01" min="0.01" placeholder="Price" required>
    <input name="stock" type="number" min="0" placeholder="Stock" required><button>Add product</button></form></div>
  <div class="card"><h2>Inventory</h2>${db.products.map(p => `<div class="arow"><span>${esc(p.name)} ${p.active ? "" : "(hidden)"}</span>
    <input type="number" min="0.01" step="0.01" value="${p.price}" data-price="${p.id}" aria-label="Price">
    <input type="number" min="0" value="${p.stock}" data-stock="${p.id}" aria-label="Stock">
    <button data-act="toggle" data-id="${p.id}">${p.active ? "Hide" : "Show"}</button></div>`).join("")}</div>
  <div class="card"><h2>Order status</h2>${db.orders.map(o => `<div class="arow"><span>#${o.id} ${esc(o.email)}</span><span>${money(o.total)}</span>
    <select data-status="${o.id}">${["PLACED","CONFIRMED","SHIPPED","DELIVERED","CANCELLED"].map(s => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}</select></div>`).join("") || `<p class="empty">No orders.</p>`}</div>`;
}

function render() {
  $("#who").textContent = me ? user().name : "Guest";
  $("#authBtn").textContent = me ? "Sign out" : "Sign in";
  $("#navOrders").hidden = !me; $("#navAdmin").hidden = !isAdmin();
  document.querySelectorAll("[data-view]").forEach(b => b.classList.toggle("on", b.dataset.view === view));
  $("#catSel").innerHTML = `<option value="">All</option>` + db.categories.map(c => `<option>${esc(c)}</option>`).join("");
  $("#catSel").value = f.cat;
  $("#main").innerHTML = view === "orders" ? ordersHTML() : view === "admin" ? adminHTML() : shopHTML();
  $("#cart").innerHTML = cartHTML();
}

/* ---------- business logic ---------- */
function openAuth(m) {
  mode = m; const reg = m === "register";
  $("#authTitle").textContent = reg ? "Create account" : "Sign in";
  $("#nameRow").hidden = !reg; $("#uName").required = reg;
  $("#swap").textContent = reg ? "Have an account? Sign in" : "New here? Create an account";
  $("#authDlg").showModal();
}

function addToCart(id) {
  if (needLogin()) return;
  const p = prod(id), line = cart().find(i => i.id == id);
  if ((line?.qty || 0) + 1 > p.stock) return toast("Only " + p.stock + " in stock.");
  line ? line.qty++ : cart().push({ id: p.id, qty: 1 });
  save(); render(); toast("Added to cart.");
}

function changeQty(id, d) {
  const line = cart().find(i => i.id == id), p = prod(id);
  if (d > 0 && line.qty + d > p.stock) return toast("No more stock available.");
  line.qty += d;
  if (line.qty <= 0) db.carts[me] = cart().filter(i => i.id != id);
  save(); render();
}

function startCheckout() {
  if (needLogin() || !cart().length) return;
  const saved = db.addresses[me] || [];
  $("#addrSel").innerHTML = `<option value="">New address</option>` + saved.map((a, i) => `<option value="${i}">${esc(a.name)}, ${esc(a.street)}</option>`).join("");
  ["aName", "aStreet", "aCity", "aPost"].forEach(i => $("#" + i).value = "");
  $("#payTotal").textContent = "Total " + money(cart().reduce((s, i) => s + prod(i.id).price * i.qty, 0));
  $("#payDlg").showModal();
}

function placeOrder() {
  const addr = { name: $("#aName").value.trim(), street: $("#aStreet").value.trim(), city: $("#aCity").value.trim(), post: $("#aPost").value.trim() };
  if (Object.values(addr).some(v => !v)) return toast("Complete the delivery address.");
  for (const i of cart()) if (prod(i.id).stock < i.qty) return toast(prod(i.id).name + " no longer has enough stock.");
  const saved = (db.addresses[me] ??= []);
  if (!saved.some(a => JSON.stringify(a) === JSON.stringify(addr))) saved.push(addr);
  const items = cart().map(i => { const p = prod(i.id); return { pid: p.id, name: p.name, price: p.price, qty: i.qty }; }); // snapshot (FR6)
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const ok = $("#payRes").value === "success";
  const order = { id: db.oid++, email: me, items, total, addr, at: Date.now(), status: ok ? "CONFIRMED" : "CANCELLED", pay: ok ? "SUCCESS" : "FAILED" };
  if (ok) { items.forEach(i => prod(i.pid).stock -= i.qty); db.carts[me] = []; }   // FR8; on failure stock/cart untouched (FR9)
  db.orders.push(order); save(); $("#payDlg").close();
  toast(ok ? "Order #" + order.id + " confirmed." : "Payment failed. Order cancelled, cart kept.");
  render();
}

function cancelOrder(id) {
  const o = db.orders.find(x => x.id == id);
  if (!o || (o.email !== me && !isAdmin())) return toast("Access denied.");
  if (!["PLACED", "CONFIRMED"].includes(o.status)) return toast("This order can no longer be cancelled.");
  if (o.pay === "SUCCESS") { o.items.forEach(i => { const p = prod(i.pid); if (p) p.stock += i.qty; }); o.pay = "REFUNDED"; }
  o.status = "CANCELLED"; save(); render(); toast("Order cancelled. Stock restored.");
}

/* ---------- events ---------- */
document.addEventListener("click", e => {
  if (e.target.matches("[data-close]")) return e.target.closest("dialog").close();
  const v = e.target.dataset.view; if (v) { view = v; return render(); }
  const { act, id, d } = e.target.dataset;
  if (act === "add") addToCart(id);
  if (act === "qty") changeQty(id, +d);
  if (act === "rm") { db.carts[me] = cart().filter(i => i.id != id); save(); render(); }
  if (act === "checkout") startCheckout();
  if (act === "cancel") cancelOrder(id);
  if (act === "toggle") { const p = prod(id); p.active = !p.active; save(); render(); }
});

$("#q").addEventListener("input", e => { f.q = e.target.value.trim().toLowerCase(); view = "shop"; render(); });
$("#catSel").onchange = e => { f.cat = e.target.value; view = "shop"; render(); };
$("#sortSel").onchange = e => { f.sort = e.target.value; view = "shop"; render(); };
$("#swap").onclick = () => { $("#authDlg").close(); openAuth(mode === "login" ? "register" : "login"); };
$("#authBtn").onclick = () => { if (me) { me = null; view = "shop"; render(); toast("Signed out."); } else openAuth("login"); };
$("#addrSel").onchange = e => {
  const a = (db.addresses[me] || [])[e.target.value]; if (!a) return;
  $("#aName").value = a.name; $("#aStreet").value = a.street; $("#aCity").value = a.city; $("#aPost").value = a.post;
};
$("#payForm").onsubmit = e => { e.preventDefault(); placeOrder(); };

$("#authForm").onsubmit = async e => {
  e.preventDefault();
  const email = $("#uMail").value.trim().toLowerCase(), hash = await sha($("#uPass").value);
  if (mode === "register") {
    if (db.users.some(u => u.email === email)) return toast("That email is already registered.");
    db.users.push({ name: $("#uName").value.trim(), email, hash, admin: false }); save();
  }
  const u = db.users.find(x => x.email === email && x.hash === hash);
  if (!u) return toast("Email or password is incorrect.");
  me = email; $("#authDlg").close(); $("#authForm").reset(); render(); toast("Welcome, " + u.name + ".");
};

document.addEventListener("submit", e => {
  if (e.target.id === "catForm") {
    e.preventDefault(); const n = new FormData(e.target).get("name").trim();
    if (db.categories.some(c => c.toLowerCase() === n.toLowerCase())) return toast("Category already exists.");
    db.categories.push(n); save(); render(); toast("Category added.");
  }
  if (e.target.id === "prodForm") {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    db.products.push({ id: db.pid++, name: d.name, desc: d.desc, cat: d.cat, price: +d.price, stock: +d.stock, active: true, emoji: "📦", tone: "#e2e6ee" });
    save(); render(); toast("Product added.");
  }
});

document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.stock) { prod(t.dataset.stock).stock = Math.max(0, parseInt(t.value) || 0); save(); toast("Inventory updated."); }
  if (t.dataset.price) { prod(t.dataset.price).price = Math.max(0.01, +t.value || 0.01); save(); toast("Price updated."); }
  if (t.dataset.status) {
    const o = db.orders.find(x => x.id == t.dataset.status);
    if (t.value === "CANCELLED") cancelOrder(o.id); else { o.status = t.value; save(); toast("Order status updated."); }
    render();
  }
});

/* ---------- start ---------- */
(async () => {
  if (!db.users.some(u => u.admin)) {
    db.users.push({ name: "Admin", email: "admin@parcelo.demo", hash: await sha("admin123"), admin: true }); save();
  }
  render();
})();
