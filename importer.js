'use strict';

/* =========================================================
   Vyapar Saathi v2 — importing data from Excel / CSV
   Copy rows from Excel and paste them here (separated by tab or comma).
   The first line must be a header; the column order can be anything.
   ========================================================= */

var XL_HEAD = {
  date: ['date', 'dt', 'tarikh', 'invoice date', 'bill date', 'order date', 'date of invoice', 'inv date'],
  party: ['party', 'customer', 'client', 'party name', 'customer name', 'name'],
  supplier: ['supplier', 'vendor', 'party', 'supplier name', 'vendor name'],
  item: ['material', 'raw material', 'item', 'product', 'description', 'goods', 'item name'],
  product: ['product', 'item', 'material', 'description', 'goods', 'product name'],
  qty: ['qty', 'quantity', 'kg', 'weight', 'qty kg', 'quantity kg', 'qty in kg'],
  rate: ['rate', 'price', 'rate kg', 'rate per kg', 'unit price', 'rate per unit', 'basic rate'],
  amount: ['amount', 'value', 'total', 'bill amount', 'invoice amount', 'taxable value', 'net amount'],
  paid: ['paid on', 'paid date', 'received on', 'received date', 'payment date', 'payment received', 'date of payment', 'paid', 'received'],
  delivered: ['delivered', 'delivery date', 'dispatch', 'dispatch date', 'delivered on'],
  invoice: ['invoice no', 'invoice number', 'inv no', 'bill no', 'invoice', 'inv', 'bill'],
  freight: ['freight', 'transport', 'freight kg'],
  paydays: ['credit days', 'payment days', 'pay days', 'credit', 'terms', 'payment terms'],
  rejection: ['rejection', 'rej', 'wastage', 'rejection %', 'rej %']
};

function xlNorm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9% ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function xlParseLine(line, delim) {
  var out = [], cur = '', q = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line.charAt(i);
    if (q) {
      if (ch === '"') {
        if (line.charAt(i + 1) === '"') { cur += '"'; i += 1; } else { q = false; }
      } else { cur += ch; }
    } else if (ch === '"') { q = true; }
    else if (ch === delim) { out.push(cur); cur = ''; }
    else { cur += ch; }
  }
  out.push(cur);
  return out.map(function (x) { return x.trim(); });
}

function xlRows(text) {
  var lines = String(text || '').replace(/\r/g, '').split('\n').filter(function (l) { return l.trim(); });
  if (!lines.length) { return []; }
  var first = lines[0];
  var delim = first.indexOf('\t') >= 0 ? '\t' : ((first.indexOf(';') >= 0 && first.indexOf(',') < 0) ? ';' : ',');
  return lines.map(function (l) { return xlParseLine(l, delim); });
}

/* from the header line: which field is in which column */
function xlMap(cells, wanted) {
  var map = {};
  var used = {};
  wanted.forEach(function (field) {
    var syns = XL_HEAD[field] || [];
    for (var pass = 0; pass < 2 && map[field] === undefined; pass++) {
      for (var i = 0; i < cells.length; i++) {
        if (used[i]) { continue; }
        var c = xlNorm(cells[i]);
        if (!c) { continue; }
        var hit = syns.some(function (sy) { return pass === 0 ? c === sy : (c.indexOf(sy + ' ') === 0 || c.indexOf(' ' + sy) >= 0); });
        if (hit) { map[field] = i; used[i] = true; break; }
      }
    }
  });
  return map;
}

function xlNum(v) {
  var n = Number(String(v === undefined ? '' : v).replace(/[₹,\s]/g, '').replace(/^rs\.?/i, ''));
  return isFinite(n) ? n : 0;
}

function xlDate(v) {
  v = String(v === undefined ? '' : v).trim();
  if (!v) { return ''; }
  var m, y, mo, d;
  function ok(yy, mm, dd) {
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yy < 2000 || yy > 2100) { return ''; }
    return yy + '-' + pad2(mm) + '-' + pad2(dd);
  }
  if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { return ok(Number(m[1]), Number(m[2]), Number(m[3])); }
  if ((m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))) {
    y = Number(m[3]); if (y < 100) { y += 2000; }
    return ok(y, Number(m[2]), Number(m[1]));
  }
  if ((m = v.match(/^(\d{1,2})[ \-]([A-Za-z]{3,9})[ \-,]*(\d{2,4})/))) {
    mo = MONTHS.map(function (x) { return x.toLowerCase(); }).indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    y = Number(m[3]); if (y < 100) { y += 2000; }
    return mo ? ok(y, mo, Number(m[1])) : '';
  }
  if (/^\d{5}$/.test(v)) {
    var dt = new Date(Date.UTC(1899, 11, 30) + Number(v) * 86400000);
    return ok(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  return '';
}

function xlTemplate(kind) {
  if (kind === 'rates') { return ['Date', 'Supplier', 'Material', 'Rate', 'Freight', 'Credit days', 'Rejection %'].join('\t'); }
  return ['Date', 'Party', 'Product', 'Qty', 'Rate', 'Invoice', 'Paid date', 'Delivered date'].join('\t');
}

/* ---------- sales: orders + bills ---------- */

function importSales(text) {
  var rows = xlRows(text);
  if (rows.length < 2) { return { error: 'Please include a header line and at least one data row.' }; }
  var map = xlMap(rows[0], ['date', 'party', 'product', 'qty', 'rate', 'amount', 'paid', 'delivered', 'invoice']);
  if (map.date === undefined || map.party === undefined || (map.qty === undefined && map.amount === undefined)) {
    return { error: 'The header must include Date, Party and Qty (or Amount). Found: ' + rows[0].join(' | ') };
  }
  var res = { orders: 0, bills: 0, newCust: 0, skipped: 0, dup: 0, unmatched: [] };
  var t = todayISO();
  function cell(r, f) { return map[f] === undefined ? '' : (r[map[f]] === undefined ? '' : r[map[f]]); }

  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var party = String(cell(r, 'party')).trim();
    var date = xlDate(cell(r, 'date'));
    var qty = xlNum(cell(r, 'qty'));
    var rate = xlNum(cell(r, 'rate'));
    var amount = xlNum(cell(r, 'amount'));
    if (!party || !date) { res.skipped += 1; continue; }
    if (!rate && amount && qty) { rate = amount / qty; }
    if (!amount && qty && rate) { amount = qty * rate; }
    if (!(amount > 0)) { res.skipped += 1; continue; }

    var cust = S.customers.filter(function (c) { return normName(c.name) === normName(party); })[0];
    if (!cust) {
      cust = { id: uid(), name: party, phone: '', creditDays: num(S.settings.creditGiven) || 30, creditLimit: 0, bills: [] };
      S.customers.push(cust);
      res.newCust += 1;
    }
    var pname = String(cell(r, 'product')).trim();
    var pid = '';
    if (pname) {
      var pr = S.products.filter(function (p) { return normName(p.name) === normName(pname); })[0];
      if (pr) { pid = pr.id; }
      else if (S.products.length && res.unmatched.indexOf(pname) < 0) { res.unmatched.push(pname); }
    }
    var delivered = xlDate(cell(r, 'delivered'));
    if (!delivered && daysBetween(date, t) >= 7) { delivered = date; }

    if (qty > 0 && rate > 0) {
      var dupO = S.orders.some(function (o) {
        return o.customerId === cust.id && o.date === date && Math.abs(o.qty - qty) < 0.001 && Math.abs(o.rate - rate) < 0.001;
      });
      if (dupO) { res.dup += 1; }
      else {
        S.orders.push({
          id: uid(), customerId: cust.id, date: date, product: pid, qty: qty, rate: rate,
          promised: '', delivered: delivered, rejected: 0, replaced: false, note: ''
        });
        res.orders += 1;
      }
    }
    var inv = String(cell(r, 'invoice')).trim();
    var dupB = cust.bills.some(function (b) { return b.date === date && Math.abs(b.amount - amount) < 0.5; });
    if (!dupB) {
      cust.bills.push({ id: uid(), date: date, amount: Math.round(amount), note: inv || 'Excel', paidOn: xlDate(cell(r, 'paid')) });
      res.bills += 1;
    }
  }
  return res;
}

/* ---------- raw material supplier rates ---------- */

function importRates(text) {
  var rows = xlRows(text);
  if (rows.length < 2) { return { error: 'Please include a header line and at least one data row.' }; }
  var map = xlMap(rows[0], ['date', 'supplier', 'item', 'rate', 'freight', 'paydays', 'rejection']);
  if (map.supplier === undefined || map.rate === undefined) {
    return { error: 'The header must include Supplier and Rate. Found: ' + rows[0].join(' | ') };
  }
  var res = { quotes: 0, skipped: 0, dup: 0 };
  function cell(r, f) { return map[f] === undefined ? '' : (r[map[f]] === undefined ? '' : r[map[f]]); }
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var supplier = String(cell(r, 'supplier')).trim();
    var rate = xlNum(cell(r, 'rate'));
    if (!supplier || rate <= 0) { res.skipped += 1; continue; }
    var date = xlDate(cell(r, 'date')) || todayISO();
    var item = String(cell(r, 'item')).trim() || S.settings.item || '';
    var dup = S.quotes.some(function (q) {
      return q.date === date && normName(q.supplier) === normName(supplier) && normName(q.item) === normName(item) && Math.abs(q.rate - rate) < 0.001;
    });
    if (dup) { res.dup += 1; continue; }
    S.quotes.push({
      id: uid(), date: date, supplier: supplier, item: item, rate: rate, freight: xlNum(cell(r, 'freight')),
      rejection: xlNum(cell(r, 'rejection')), moq: '', deliveryDays: 0, payDays: xlNum(cell(r, 'paydays'))
    });
    res.quotes += 1;
  }
  return res;
}
