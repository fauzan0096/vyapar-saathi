'use strict';

/* =========================================================
   Vyapar Saathi v2 — events, sample data, startup
   ========================================================= */

function toast(msg) {
  var el = document.getElementById('toast');
  if (!el) { return; }
  el.textContent = msg;
  el.hidden = false;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(function () {
    el.classList.remove('show');
    el.hidden = true;
  }, 2200);
}

function copyText(text) {
  if (!text) { toast('Nothing to copy'); return; }
  var ok = function () { toast('Copied'); };
  var fallback = function () {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      ok();
    } catch (e) {
      toast('Could not copy - please select the text and copy it manually');
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(ok).catch(fallback);
  } else {
    fallback();
  }
}

function render(toTop) {
  var tabs = document.querySelectorAll('#tabs .tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === tab);
  }
  var views = { port: viewPort, aaj: viewAaj, cust: viewCust, quote: viewQuote, rate: viewRate, market: viewMarket, paisa: viewPaisa, money: viewMoney, setup: viewSetup };
  ui.msgs = [];
  var fn = views[tab] || viewAaj;
  document.getElementById('view').innerHTML = fn();
  var sub = document.getElementById('brandSub');
  if (sub) { sub.textContent = S.settings.business ? S.settings.business : 'Rates · Cash · Customers'; }
  if (toTop) { window.scrollTo(0, 0); }
}

function setTab(name) {
  tab = name;
  ui.editCustomer = null;
  if (name !== 'cust') { ui.custId = null; }
  render(true);
}

function findOrder(id) {
  return S.orders.filter(function (o) { return o.id === id; })[0] || null;
}

function onViewClick(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) { return; }
  var a = btn.getAttribute('data-action');
  var id = btn.getAttribute('data-id');
  var billId = btn.getAttribute('data-bill');

  if (a === 'open-cust') { tab = 'cust'; ui.custId = id; ui.editCustomer = null; render(true); return; }
  if (a === 'back-cust') { ui.custId = null; ui.editCustomer = null; render(true); return; }
  if (a === 'go-quote') { tab = 'quote'; ui.quoteCust = id; ui.quoteQty = ''; ui.claim = null; render(true); return; }

  if (a === 'copy') { copyText(ui.msgs[Number(btn.getAttribute('data-idx'))]); return; }
  if (a === 'copy-report') { copyText(reportText()); return; }
  if (a === 'copy-backup') { copyText(JSON.stringify(S, null, 2)); return; }

  if (a === 'snooze') {
    S.snooze[btn.getAttribute('data-key')] = addDays(todayISO(), num(btn.getAttribute('data-days')) || 1);
    save(); render(); toast('Okay, hidden for a few days');
    return;
  }

  if (a === 'del-quote') {
    if (!confirm('Delete this rate record?')) { return; }
    S.quotes = S.quotes.filter(function (q) { return q.id !== id; });
    save(); render(); toast('Rate deleted');
    return;
  }

  if (a === 'mark-paid') {
    S.customers.forEach(function (c) {
      if (c.id !== id) { return; }
      c.bills.forEach(function (b) { if (b.id === billId) { b.paidOn = todayISO(); } });
    });
    save(); render(); toast('Bill marked as paid');
    return;
  }

  if (a === 'del-bill') {
    if (!confirm('Delete this bill?')) { return; }
    S.customers.forEach(function (c) {
      if (c.id !== id) { return; }
      c.bills = c.bills.filter(function (b) { return b.id !== billId; });
    });
    save(); render(); toast('Bill deleted');
    return;
  }

  if (a === 'del-customer') {
    var c = findCust(id);
    if (!c) { return; }
    if (!confirm('Delete ' + c.name + ' along with ' + c.bills.length + ' bill(s) and all orders?')) { return; }
    S.customers = S.customers.filter(function (x) { return x.id !== id; });
    S.orders = S.orders.filter(function (o) { return o.customerId !== id; });
    S.claims = S.claims.filter(function (x) { return x.customerId !== id; });
    delete S.tones[id];
    ui.custId = null;
    save(); render(true); toast('Customer deleted');
    return;
  }

  if (a === 'edit-customer') { ui.editCustomer = id; render(); return; }
  if (a === 'cancel-edit') { ui.editCustomer = null; render(); return; }

  if (a === 'tone') {
    S.tones[id] = btn.getAttribute('data-tone') || 'normal';
    save(); render();
    return;
  }

  if (a === 'order-delivered') {
    var o1 = findOrder(id);
    if (o1) { o1.delivered = todayISO(); save(); render(); toast('Marked as delivered'); }
    return;
  }
  if (a === 'order-reject') {
    var o2 = findOrder(id);
    if (!o2) { return; }
    var r = prompt('How much material was rejected (' + unitOf() + ')?', '');
    if (r === null) { return; }
    o2.rejected = Math.max(0, num(r));
    save(); render(); toast('Rejection recorded');
    return;
  }
  if (a === 'order-replaced') {
    var o3 = findOrder(id);
    if (o3) { o3.replaced = true; save(); render(); toast('Replacement recorded'); }
    return;
  }
  if (a === 'del-order') {
    if (!confirm('Delete this order? (Its bill must be deleted separately.)')) { return; }
    S.orders = S.orders.filter(function (o) { return o.id !== id; });
    save(); render(); toast('Order deleted');
    return;
  }

  if (a === 'stmt-days') { ui.stmtDays = num(btn.getAttribute('data-days')) || 90; render(); return; }

  if (a === 'claim-log') {
    var cl = ui.claim;
    var cc = cl ? findCust(cl.cid) : null;
    if (!cc) { return; }
    var an = claimAnalysis(cc, ui.quoteQty, cl.claimed, cl.theirDays, ui.quotePid);
    if (!an) { return; }
    S.claims.push({
      id: uid(), customerId: cc.id, date: todayISO(), claimed: num(cl.claimed),
      theirDays: an.hasTheir ? an.td : 0, ours: an.q.ask, outcome: '', note: ''
    });
    ui.claim = null;
    save(); render(); toast('Claim recorded - add the outcome later');
    return;
  }
  if (a === 'claim-outcome') {
    S.claims.forEach(function (x) { if (x.id === id) { x.outcome = btn.getAttribute('data-out'); } });
    save(); render(); toast('Outcome recorded');
    return;
  }
  if (a === 'del-claim') {
    S.claims = S.claims.filter(function (x) { return x.id !== id; });
    save(); render();
    return;
  }

  if (a === 'del-product') {
    if (!confirm('Delete this product?')) { return; }
    S.products = S.products.filter(function (x) { return x.id !== id; });
    save(); render(); toast('Product deleted');
    return;
  }
  if (a === 'preset-products') {
    var P = [['DSTDP', 20000], ['DLTDP', 10000], ['TNPP', 50000], ['TPP', 50000], ['DSP', 50000], ['TSP', 50000],
      ['DTDTDP', 10000], ['EGDS', 100000], ['BKC-50%', 150000], ['BKC-80%', 150000], ['CMEA', 20000], ['CAPB', 5000],
      ['SLES', 50000], ['EGMS', 100000], ['Methyl ester', 10000]];
    P.forEach(function (x) {
      S.products.push({ id: uid(), name: x[0], bom: [], conv: 0, yieldPct: 100, capacity: x[1], cost: 0 });
    });
    save(); render(); toast('15 products added - now fill in the recipes');
    return;
  }

  if (a === 'demo') {
    if (!confirm('Load sample data? Your current data will be replaced.')) { return; }
    S = demoState();
    ui.custId = null;
    save(); tab = 'aaj'; render(true); toast('Sample data loaded');
    return;
  }
  if (a === 'demo-clear') {
    if (!confirm('Remove the sample data and start blank?')) { return; }
    S = blankState(); ui.custId = null;
    save(); render(true); toast('Sample data removed');
    return;
  }
  if (a === 'reset') {
    if (!confirm('All data will be erased. Please copy a backup first. Continue?')) { return; }
    S = blankState(); ui.custId = null;
    save(); render(true); toast('All data cleared');
    return;
  }
  if (a === 'export') {
    try {
      var blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'vyapar-saathi-backup-' + todayISO() + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      toast('Backup file created');
    } catch (err) {
      toast('Download failed - please use Copy backup instead');
    }
    return;
  }
}

function onViewChange(e) {
  var el = e.target;
  if (el && el.getAttribute && el.getAttribute('data-live') && el.name === 'cid') {
    ui.quoteCust = el.value;
    ui.quoteQty = '';
    ui.quotePid = '';
    ui.claim = null;
    render();
  }
}

function onViewSubmit(e) {
  var form = e.target.closest('form[data-form]');
  if (!form) { return; }
  e.preventDefault();
  var kind = form.getAttribute('data-form');
  var t = todayISO();

  if (kind === 'settings') {
    var st = S.settings;
    ['business', 'person', 'item', 'unit'].forEach(function (k) { if (form.elements[k]) { st[k] = fval(form, k); } });
    ['monthlySales', 'monthlyPurchase', 'monthlyExpenses', 'creditGiven', 'creditReceived', 'stockDays', 'cashMonths',
      'costOfFunds', 'earlyDiscount', 'earlyDays', 'minMargin', 'targetMargin', 'overhead', 'perDelivery',
      'deliveryDays', 'costOverride', 'riskB', 'riskC'].forEach(function (k) { if (form.elements[k]) { st[k] = fnum(form, k); } });
    if (num(st.minMargin) > num(st.targetMargin)) { st.minMargin = st.targetMargin; }
    save(); render(); toast('Saved');
    return;
  }

  if (kind === 'quote') {
    var supplier = fval(form, 'supplier');
    var rate = fnum(form, 'rate');
    if (!supplier || rate <= 0) { toast('Please enter the supplier name and rate'); return; }
    S.quotes.push({
      id: uid(), date: fval(form, 'date') || t, supplier: supplier, item: fval(form, 'item') || S.settings.item || '',
      rate: rate, freight: fnum(form, 'freight'), rejection: fnum(form, 'rejection'), moq: fval(form, 'moq'),
      deliveryDays: fnum(form, 'deliveryDays'), payDays: fnum(form, 'payDays')
    });
    save(); render(); toast('Rate added');
    return;
  }

  if (kind === 'rfq') {
    S.rfq = { material: fval(form, 'material'), qty: fval(form, 'qty'), days: fnum(form, 'days') || 3, note: fval(form, 'note') };
    save(); render(); toast('Message is ready');
    return;
  }

  if (kind === 'customer') {
    var name = fval(form, 'name');
    if (!name) { toast('Please enter the customer name'); return; }
    var nc = { id: uid(), name: name, phone: fval(form, 'phone'), creditDays: fnum(form, 'creditDays'), creditLimit: fnum(form, 'creditLimit'), bills: [] };
    S.customers.push(nc);
    ui.custId = nc.id;
    save(); render(true); toast('Customer added - now add an order');
    return;
  }

  if (kind === 'cust-edit') {
    var cid = fval(form, 'id');
    S.customers.forEach(function (c) {
      if (c.id !== cid) { return; }
      c.name = fval(form, 'name') || c.name;
      c.phone = fval(form, 'phone');
      c.creditDays = fnum(form, 'creditDays');
      c.creditLimit = fnum(form, 'creditLimit');
    });
    ui.editCustomer = null;
    save(); render(); toast('Details saved');
    return;
  }

  if (kind === 'bill') {
    var custId = fval(form, 'customerId');
    var target = findCust(custId);
    if (!target) { toast('Customer not found'); return; }
    var amount = fnum(form, 'amount');
    if (amount <= 0) { toast('Please enter the bill amount'); return; }
    target.bills.push({ id: uid(), date: fval(form, 'date') || t, amount: amount, note: fval(form, 'note'), paidOn: '' });
    save(); render(); toast('Bill added');
    return;
  }

  if (kind === 'order') {
    var oc = findCust(fval(form, 'customerId'));
    if (!oc) { toast('Customer not found'); return; }
    var qty = fnum(form, 'qty');
    var orate = fnum(form, 'rate');
    if (qty <= 0 || orate <= 0) { toast('Please enter the quantity and rate'); return; }
    var odate = fval(form, 'date') || t;
    var rejected = fnum(form, 'rejected');
    S.orders.push({
      id: uid(), customerId: oc.id, date: odate, product: fval(form, 'product'), qty: qty, rate: orate,
      promised: fval(form, 'promised'), delivered: fval(form, 'delivered'),
      rejected: rejected, replaced: false, note: ''
    });
    var mk = form.elements.mkbill;
    if (mk && mk.checked) {
      oc.bills.push({ id: uid(), date: odate, amount: Math.round(qty * orate), note: 'Order ' + dmy(odate), paidOn: '' });
    }
    save(); render(); toast('Order added');
    return;
  }

  if (kind === 'quote-pick') {
    ui.quoteCust = fval(form, 'cid') || ui.quoteCust;
    ui.quoteQty = fval(form, 'qty');
    ui.quotePid = fval(form, 'pid') || '';
    render();
    return;
  }

  if (kind === 'claim') {
    ui.claim = { cid: fval(form, 'cid'), claimed: fval(form, 'claimed'), theirDays: fval(form, 'theirDays') };
    if (num(ui.claim.claimed) <= 0) { toast('Please enter their rate'); ui.claim = null; }
    render();
    return;
  }

  if (kind === 'lock') {
    S.lock = { months: fnum(form, 'months') || 3, qty: fval(form, 'qty'), ref: fval(form, 'ref'), band: fnum(form, 'band') || 3 };
    save(); render(); toast('Draft is ready');
    return;
  }

  if (kind === 'epd') { S.epd = { amount: fnum(form, 'amount'), disc: fnum(form, 'disc'), daysSaved: fnum(form, 'daysSaved') }; save(); render(); toast('Calculation is ready'); return; }
  if (kind === 'tre') { S.tre = { amount: fnum(form, 'amount'), rate: fnum(form, 'rate'), days: fnum(form, 'days') }; save(); render(); toast('Cost is ready'); return; }
  if (kind === 'rvc') { S.rvc = { diff: fnum(form, 'diff'), days: fnum(form, 'days') }; save(); render(); toast('Comparison is ready'); return; }

  if (kind === 'product') {
    var pname = fval(form, 'name');
    if (!pname) { toast('Please enter the product name'); return; }
    var bom = [];
    String(form.elements.bom.value || '').split('\n').forEach(function (line) {
      var m = line.split('=');
      if (m.length < 2) { return; }
      var q = Number(String(m[m.length - 1]).replace(/[^0-9.]/g, ''));
      var nm = m.slice(0, m.length - 1).join('=').trim();
      if (nm && q > 0) { bom.push({ material: nm, qty: q }); }
    });
    var pid = fval(form, 'id');
    var rec = { name: pname, bom: bom, conv: fnum(form, 'conv'), yieldPct: fnum(form, 'yieldPct') || 100,
      capacity: fnum(form, 'capacity'), cost: fnum(form, 'cost') };
    var hit = S.products.filter(function (x) { return x.id === pid; })[0];
    if (hit) { Object.keys(rec).forEach(function (k) { hit[k] = rec[k]; }); }
    else { rec.id = uid(); S.products.push(rec); }
    save(); render(); toast('Product saved');
    return;
  }

  if (kind === 'xl-sales' || kind === 'xl-rates') {
    var txt = form.elements.text.value;
    if (!String(txt).trim()) { toast('Please paste rows from Excel first'); return; }
    var r = kind === 'xl-sales' ? importSales(txt) : importRates(txt);
    if (r.error) { toast(r.error); return; }
    save(); render();
    toast(kind === 'xl-sales'
      ? r.orders + ' order(s), ' + r.bills + ' bill(s), ' + r.newCust + ' new customer(s)' + (r.dup ? ', ' + r.dup + ' already existed' : '') + (r.skipped ? ', ' + r.skipped + ' row(s) skipped' : '') +
        (r.unmatched.length ? '. Products not found: ' + r.unmatched.join(', ') : '')
      : r.quotes + ' rate(s) added' + (r.dup ? ', ' + r.dup + ' already existed' : '') + (r.skipped ? ', ' + r.skipped + ' row(s) skipped' : ''));
    return;
  }

  if (kind === 'import') {
    var raw = fval(form, 'json');
    if (!raw) { toast('Please paste the backup text'); return; }
    try {
      S = normalize(JSON.parse(raw));
      save(); render(); toast('Data restored');
    } catch (err) {
      toast('The backup text looks invalid');
    }
    return;
  }
}

/* ---------------- sample data ---------------- */

function demoState() {
  var s = blankState();
  s.demo = true;
  s.settings = Object.assign(s.settings, {
    business: 'Sample Chemicals (example)', person: '', item: 'DSTDP', unit: 'kg',
    monthlySales: 2000000, monthlyPurchase: 1500000, monthlyExpenses: 150000,
    creditGiven: 30, creditReceived: 15, stockDays: 10, cashMonths: 3, costOfFunds: 12,
    earlyDiscount: 0, earlyDays: 0, minMargin: 3, targetMargin: 6, overhead: 2, perDelivery: 4000, deliveryDays: 3
  });
  var t = todayISO();

  function q(days, supplier, item, rate, moq, del, pay, freight, rej) {
    s.quotes.push({
      id: uid(), date: addDays(t, -days), supplier: supplier, item: item, rate: rate, moq: moq,
      deliveryDays: del, payDays: pay, freight: freight || 0, rejection: rej || 0
    });
  }
  /* sample rates - you will enter your real rates in the Rates tab */
  var SA = 'Stearyl alcohol', TD = 'Thiodipropionic acid (TDPA)';
  q(3, 'Godrej', SA, 154, '1 MT', 4, 30, 2, 0.3);
  q(4, 'VVF', SA, 157, '1 MT', 5, 15, 2, 0.3);
  q(25, 'Godrej', SA, 165, '1 MT', 4, 30, 2, 0.3);
  q(40, 'VVF', SA, 167, '1 MT', 5, 15, 2, 0.3);
  q(60, 'Godrej', SA, 166, '1 MT', 4, 30, 2, 0.3);
  q(85, 'VVF', SA, 164, '1 MT', 5, 15, 2, 0.3);
  q(3, 'Moksha Chemicals', TD, 214, '500 kg', 5, 21, 3, 0.5);
  q(5, 'Khona Drugs', TD, 219, '500 kg', 4, 15, 3, 0.5);
  q(28, 'Moksha Chemicals', TD, 228, '500 kg', 5, 21, 3, 0.5);
  q(45, 'Khona Drugs', TD, 231, '500 kg', 4, 15, 3, 0.5);
  q(65, 'Moksha Chemicals', TD, 229, '500 kg', 5, 21, 3, 0.5);
  q(90, 'Khona Drugs', TD, 230, '500 kg', 4, 15, 3, 0.5);

  var dstdp = { id: uid(), name: 'DSTDP', conv: 14, yieldPct: 96, capacity: 20000, cost: 0,
    bom: [{ material: SA, qty: 0.8 }, { material: TD, qty: 0.26 }] };
  var dltdp = { id: uid(), name: 'DLTDP', conv: 0, yieldPct: 100, capacity: 10000, cost: 0, bom: [] };
  s.products = [dstdp, dltdp];

  var n = 100;
  function cust(name, phone, terms, limit) {
    var c = { id: uid(), name: name, phone: phone, creditDays: terms, creditLimit: limit, bills: [] };
    s.customers.push(c);
    return c;
  }
  function series(c, list) {
    list.forEach(function (x) {
      var date = addDays(t, x.d);
      var promised = addDays(date, 3);
      var delivered = x.pending ? '' : addDays(promised, x.delay || 0);
      s.orders.push({
        id: uid(), customerId: c.id, date: date, product: dstdp.id, qty: x.qty, rate: x.rate, promised: promised, delivered: delivered,
        rejected: x.rej || 0, replaced: !!x.replaced, note: ''
      });
      n += 1;
      c.bills.push({
        id: uid(), date: date, amount: Math.round(x.qty * x.rate), note: 'INV-' + n,
        paidOn: (x.paid !== undefined && x.paid !== null) ? addDays(date, x.paid) : ''
      });
    });
  }
  function claim(c, d, claimed, td, outcome) {
    s.claims.push({ id: uid(), customerId: c.id, date: addDays(t, d), claimed: claimed, theirDays: td, ours: 0, outcome: outcome, note: '' });
  }

  var hg = cust('Highgrade Pvt. Ltd. (sample)', '9876543210', 30, 2500000);
  var hgList = [];
  for (var i = 0; i < 9; i++) {
    hgList.push({ d: -135 + i * 15, qty: 4000, rate: 227 - (i % 3), paid: i < 8 ? 36 + (i % 3) * 2 : null, delay: i === 4 ? 2 : 0 });
  }
  series(hg, hgList);
  claim(hg, -70, 216, 30, 'ordered');
  claim(hg, -40, 214, 30, 'ordered');

  var apex = cust('Apex Polymers (sample)', '9812345678', 30, 800000);
  series(apex, [
    { d: -150, qty: 2500, rate: 231, paid: 33 },
    { d: -128, qty: 2500, rate: 230, paid: 40 },
    { d: -105, qty: 2000, rate: 229, paid: 48 },
    { d: -82, qty: 1500, rate: 228, paid: 55 },
    { d: -60, qty: 1000, rate: 226 }
  ]);
  claim(apex, -75, 210, 30, 'lost');
  claim(apex, -55, 208, 30, 'lost');
  claim(apex, -30, 209, 30, 'lost');

  var shakti = cust('Shakti Masterbatch (sample)', '9898989898', 30, 400000);
  series(shakti, [
    { d: -120, qty: 500, rate: 233, paid: 29 },
    { d: -90, qty: 500, rate: 233, paid: 30 },
    { d: -60, qty: 500, rate: 233, paid: 28 },
    { d: -30, qty: 500, rate: 232, paid: 31 },
    { d: -8, qty: 500, rate: 232, pending: true }
  ]);

  s.rfq = { material: SA, qty: '5000', days: 4, note: 'GST bill + transport' };
  s.lock = { months: 3, qty: '', ref: 'Published raw-material / association rate', band: 3 };
  s.epd = { amount: 1000000, disc: 1, daysSaved: 30 };
  s.tre = { amount: 1000000, rate: 11, days: 45 };
  return s;
}

/* ---------------- startup ---------------- */

S = load();
save();
render(true);

document.getElementById('tabs').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-tab]');
  if (!b) { return; }
  setTab(b.getAttribute('data-tab'));
});
document.getElementById('view').addEventListener('click', onViewClick);
document.getElementById('view').addEventListener('submit', onViewSubmit);
document.getElementById('view').addEventListener('change', onViewChange);

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () { /* the app still works if the offline cache cannot be created */ });
  });
}
