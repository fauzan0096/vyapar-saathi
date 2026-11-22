'use strict';

/* =========================================================
   Vyapar Saathi v2 — core: helpers, data, basic calculations.
   All data stays in the phone's browser (localStorage).
   ========================================================= */

var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var STORE_KEY = 'vyapar-saathi-v1';

/* ---------------- small helpers ---------------- */

function uid() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}
function pad2(n) { return String(n).padStart(2, '0'); }
function isoOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function todayISO() { return isoOf(new Date()); }
function parseISO(s) {
  if (!s) { return null; }
  var p = String(s).split('-');
  if (p.length !== 3) { return null; }
  var y = Number(p[0]), m = Number(p[1]), d = Number(p[2]);
  if (!y || !m || !d) { return null; }
  return new Date(y, m - 1, d);
}
function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function addDays(iso, days) {
  var d = parseISO(iso) || new Date();
  d.setDate(d.getDate() + Math.round(num(days)));
  return isoOf(d);
}
function daysBetween(a, b) {
  var da = parseISO(a), db = parseISO(b);
  if (!da || !db) { return 0; }
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}
function money(n) { return '₹' + Math.round(num(n)).toLocaleString('en-IN'); }
function rs(n) {
  return '₹' + num(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmt(n, d) {
  var digits = (d === undefined) ? 1 : d;
  return num(n).toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function dmy(iso) {
  var d = parseISO(iso);
  if (!d) { return '—'; }
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2);
}
function monLabel(ym) {
  var p = String(ym).split('-');
  var m = Number(p[1]);
  return (MONTHS[m - 1] || '?') + ' ' + String(p[0] || '').slice(2);
}
function daysAgoText(n) {
  if (n <= 0) { return 'today'; }
  if (n === 1) { return 'yesterday'; }
  return n + ' days ago';
}
function uniq(arr) {
  var out = [];
  arr.forEach(function (x) { if (out.indexOf(x) < 0) { out.push(x); } });
  return out;
}
function sum(arr) {
  var s = 0;
  arr.forEach(function (x) { s += num(x); });
  return s;
}
function avg(arr) { return arr.length ? sum(arr) / arr.length : 0; }
function median(arr) {
  if (!arr.length) { return 0; }
  var b = arr.slice().sort(function (x, y) { return x - y; });
  var m = Math.floor(b.length / 2);
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
}
function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

/* ---------------- form helpers ---------------- */

function field(label, name, value, type, ph) {
  var t = type || 'text';
  var extra = (t === 'number') ? ' inputmode="decimal" step="any"' : '';
  return '<label class="fld"><span>' + esc(label) + '</span>' +
    '<input type="' + t + '" name="' + name + '" value="' + esc(value === 0 ? '0' : (value || '')) + '"' +
    ' placeholder="' + esc(ph || '') + '"' + extra + '></label>';
}
function selectField(label, name, options, value) {
  var opts = options.map(function (o) {
    return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? ' selected' : '') + '>' +
      esc(o[1]) + '</option>';
  }).join('');
  return '<label class="fld"><span>' + esc(label) + '</span><select name="' + name + '">' + opts + '</select></label>';
}
function fval(form, name) {
  var el = form.elements[name];
  return el ? String(el.value || '').trim() : '';
}
function fnum(form, name) {
  var el = form.elements[name];
  return el ? num(el.value) : 0;
}

/* ---------------- state ---------------- */

var tab = 'aaj';
var ui = {
  custId: null, editCustomer: null, open: {},
  quoteCust: '', quoteQty: '', claim: null, stmtDays: 90,
  msgs: []
};
var S = null;

function blankState() {
  return {
    v: 2,
    demo: false,
    settings: {
      business: '', person: '', item: '', unit: 'kg',
      monthlySales: 0, monthlyPurchase: 0, monthlyExpenses: 0,
      creditGiven: 60, creditReceived: 0, stockDays: 10, cashMonths: 3,
      costOfFunds: 12, earlyDiscount: 2, earlyDays: 15,
      minMargin: 3, targetMargin: 6, overhead: 0, perDelivery: 0,
      deliveryDays: 3, costOverride: 0, riskB: 0.3, riskC: 1
    },
    quotes: [],
    customers: [],
    orders: [],
    claims: [],
    products: [],
    snooze: {},
    tones: {},
    rfq: { qty: '', days: 3, note: '' },
    lock: { months: 3, qty: '', ref: '', band: 3 },
    epd: { amount: 200000, disc: 2, daysSaved: 45 },
    tre: { amount: 500000, rate: 11, days: 60 },
    rvc: { diff: 0.5, days: 30 }
  };
}

function normalize(raw) {
  var base = blankState();
  var src = (raw && typeof raw === 'object') ? raw : {};
  var s = base;
  s.demo = !!src.demo;
  s.settings = Object.assign(base.settings, src.settings || {});
  s.rfq = Object.assign(base.rfq, src.rfq || {});
  s.lock = Object.assign(base.lock, src.lock || {});
  s.epd = Object.assign(base.epd, src.epd || {});
  s.tre = Object.assign(base.tre, src.tre || {});
  s.rvc = Object.assign(base.rvc, src.rvc || {});
  s.tones = (src.tones && typeof src.tones === 'object') ? src.tones : {};
  s.snooze = (src.snooze && typeof src.snooze === 'object') ? src.snooze : {};

  function objs(a) {
    return Array.isArray(a) ? a.filter(function (x) { return x && typeof x === 'object'; }) : [];
  }

  s.quotes = objs(src.quotes).map(function (q) {
    return {
      id: q.id || uid(), date: q.date || todayISO(), supplier: q.supplier || '', item: q.item || '',
      rate: num(q.rate), freight: num(q.freight), rejection: num(q.rejection), moq: q.moq || '',
      deliveryDays: num(q.deliveryDays), payDays: num(q.payDays)
    };
  });
  s.customers = objs(src.customers).map(function (c) {
    return {
      id: c.id || uid(), name: c.name || 'Buyer', phone: c.phone || '',
      creditDays: num(c.creditDays), creditLimit: num(c.creditLimit),
      bills: objs(c.bills).map(function (b) {
        return { id: b.id || uid(), date: b.date || todayISO(), amount: num(b.amount), note: b.note || '', paidOn: b.paidOn || '' };
      })
    };
  });
  s.orders = objs(src.orders).filter(function (o) { return o.customerId; }).map(function (o) {
    return {
      id: o.id || uid(), customerId: o.customerId, date: o.date || todayISO(), product: o.product || '',
      qty: num(o.qty), rate: num(o.rate), promised: o.promised || '', delivered: o.delivered || '',
      rejected: num(o.rejected), replaced: !!o.replaced, note: o.note || ''
    };
  });
  s.products = objs(src.products).map(function (p) {
    return {
      id: p.id || uid(), name: p.name || 'Product',
      bom: (Array.isArray(p.bom) ? p.bom : []).filter(function (b) { return b && b.material; }).map(function (b) {
        return { material: String(b.material), qty: num(b.qty) };
      }),
      conv: num(p.conv), yieldPct: num(p.yieldPct) > 0 ? num(p.yieldPct) : 100,
      capacity: num(p.capacity), cost: num(p.cost)
    };
  });
  s.claims = objs(src.claims).filter(function (c) { return c.customerId; }).map(function (c) {
    return {
      id: c.id || uid(), customerId: c.customerId, date: c.date || todayISO(),
      claimed: num(c.claimed), theirDays: num(c.theirDays), ours: num(c.ours),
      outcome: c.outcome || '', note: c.note || ''
    };
  });
  return s;
}

function load() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (raw) { return normalize(JSON.parse(raw)); }
  } catch (e) { /* start with a blank state */ }
  return blankState();
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(S));
  } catch (e) {
    toast('Could not save data');
  }
}

/* ---------------- payment calculations ---------------- */

function custDue(c) {
  var t = todayISO();
  return c.bills.filter(function (b) {
    return !b.paidOn && num(b.amount) > 0;
  }).map(function (b) {
    var due = addDays(b.date, c.creditDays);
    return {
      id: b.id, date: b.date, amount: num(b.amount), due: due,
      age: Math.max(0, daysBetween(b.date, t)),
      overdueDays: Math.max(0, daysBetween(due, t))
    };
  }).sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); });
}

function paymentStats() {
  var out = { outstanding: 0, overdue: 0, oldest: 0, unpaidCount: 0, paidCount: 0, avgPaidDays: 0 };
  var paidDaysSum = 0;
  S.customers.forEach(function (c) {
    c.bills.forEach(function (b) {
      if (b.paidOn) {
        out.paidCount += 1;
        paidDaysSum += Math.max(0, daysBetween(b.date, b.paidOn));
      } else if (num(b.amount) > 0) {
        out.unpaidCount += 1;
        out.outstanding += num(b.amount);
        var late = daysBetween(addDays(b.date, c.creditDays), todayISO());
        if (late > 0) {
          out.overdue += num(b.amount);
          if (late > out.oldest) { out.oldest = late; }
        }
      }
    });
  });
  out.avgPaidDays = out.paidCount ? paidDaysSum / out.paidCount : 0;
  return out;
}

/* Buyer's real payment habit: grade A/B/C/N */
function custStanding(c) {
  var s = S.settings;
  var t = todayISO();
  var terms = Math.round(num(c.creditDays)) || Math.round(num(s.creditGiven)) || 30;
  var paid = c.bills.filter(function (b) { return b.paidOn; });
  var paidDays = paid.map(function (b) { return Math.max(0, daysBetween(b.date, b.paidOn)); });
  var avgPaid = avg(paidDays);
  var open = c.bills.filter(function (b) { return !b.paidOn && num(b.amount) > 0; });
  var oldestAge = 0;
  open.forEach(function (b) { oldestAge = Math.max(oldestAge, daysBetween(b.date, t)); });
  var days = paid.length >= 2 ? avgPaid : terms;
  if (oldestAge > days) { days = oldestAge; }
  days = Math.max(1, Math.round(days));
  var lateBy = days - terms;
  var grade;
  if (!paid.length && !open.length) { grade = 'N'; }
  else if (lateBy <= 0) { grade = 'A'; }
  else if (lateBy <= 15) { grade = 'B'; }
  else { grade = 'C'; }
  var risk = (grade === 'A') ? 0 : (grade === 'C' ? num(s.riskC) : num(s.riskB));
  return {
    terms: terms, days: days, avgPaid: avgPaid, paidCount: paid.length,
    oldestAge: oldestAge, grade: grade, risk: risk, lateBy: lateBy
  };
}

function gradeLabel(g) {
  return { A: 'A - pays on time', B: 'B - a little late', C: 'C - often late', N: 'New - no history yet' }[g] || g;
}

/* ---------------- supplier rate calculations ---------------- */

/* True cost per usable unit: rate + freight, after rejection, minus the benefit of the supplier's credit.
   (v1 added the credit instead of subtracting it - fixed.) */
function effQuote(q) {
  var s = S.settings;
  var landed = num(q.rate) + num(q.freight);
  var rej = clamp(num(q.rejection), 0, 90) / 100;
  var afterRej = landed / (1 - rej);
  var creditBenefit = afterRej * num(s.costOfFunds) / 100 * num(q.payDays) / 365;
  return {
    landed: landed, afterRejection: afterRej, credit: creditBenefit,
    effective: afterRej - creditBenefit
  };
}

function grossMarginPct() {
  var s = S.settings;
  if (num(s.monthlySales) <= 0) { return 0; }
  return (num(s.monthlySales) - num(s.monthlyPurchase)) / num(s.monthlySales) * 100;
}

function quoteStats(mat) {
  var t = todayISO();
  var qs = S.quotes.filter(function (q) { return !mat || normName(q.item) === normName(mat); })
    .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  if (!qs.length) {
    return {
      count: 0, staleDays: 0, spread: 0, avg: 0, best: null, worst: null, latest: null,
      months: [], poolN: 0, bestEff: null, bestEffV: 0, worstEff: null, worstEffV: 0
    };
  }
  var last30 = qs.filter(function (q) {
    var d = daysBetween(q.date, t);
    return d >= 0 && d <= 30 && num(q.rate) > 0;
  });
  var pool = last30.length ? last30 : qs.filter(function (q) { return num(q.rate) > 0; });
  if (!pool.length) { pool = qs; }
  var best = pool[0], worst = pool[0], total = 0;
  pool.forEach(function (q) {
    total += num(q.rate);
    if (num(q.rate) < num(best.rate)) { best = q; }
    if (num(q.rate) > num(worst.rate)) { worst = q; }
  });
  var latest = qs[qs.length - 1];
  var byMonth = {};
  qs.forEach(function (q) {
    var k = String(q.date).slice(0, 7);
    if (!byMonth[k]) { byMonth[k] = []; }
    byMonth[k].push(num(q.rate));
  });
  var months = Object.keys(byMonth).sort().map(function (k) {
    return { key: k, avg: avg(byMonth[k]), n: byMonth[k].length };
  });
  var effs = pool.map(function (q) { return { q: q, v: effQuote(q).effective }; });
  var bestEff = effs[0], worstEff = effs[0];
  effs.forEach(function (x) {
    if (x.v < bestEff.v) { bestEff = x; }
    if (x.v > worstEff.v) { worstEff = x; }
  });
  return {
    count: qs.length,
    bestEff: bestEff.q, bestEffV: bestEff.v, worstEff: worstEff.q, worstEffV: worstEff.v,
    staleDays: Math.max(0, daysBetween(latest.date, t)),
    spread: num(best.rate) > 0 ? (num(worst.rate) - num(best.rate)) / num(best.rate) * 100 : 0,
    avg: total / pool.length, best: best, worst: worst, latest: latest,
    months: months, poolN: pool.length
  };
}

/* ---------------- products, recipe (BOM) and cost ---------------- */

function normName(s) { return String(s || '').trim().toLowerCase(); }

function findProduct(id) {
  return S.products.filter(function (p) { return p.id === id; })[0] || null;
}
function productName(id) {
  var p = id ? findProduct(id) : null;
  return p ? p.name : '';
}
/* if no product is given (or it is invalid), the first product; '' if there are no products (single-item mode) */
function pidOr(pid) {
  if (pid && findProduct(pid)) { return pid; }
  return S.products.length ? S.products[0].id : '';
}

/* All distinct materials/items in the quotes */
function materialNames() {
  var seen = {}, out = [];
  S.quotes.forEach(function (q) {
    var k = normName(q.item);
    if (!k || seen[k]) { return; }
    seen[k] = true;
    out.push(String(q.item).trim());
  });
  return out;
}

/* Lowest true rate of a material (from the last 30 days of quotes; if none, the 3 newest) */
function materialBest(name) {
  var key = normName(name);
  var t = todayISO();
  var qs = S.quotes.filter(function (q) { return normName(q.item) === key && num(q.rate) > 0; });
  if (!qs.length) { return null; }
  var recent = qs.filter(function (q) { var d = daysBetween(q.date, t); return d >= 0 && d <= 30; });
  var pool = recent.length ? recent : qs.slice().sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date));
  }).slice(0, 3);
  var best = null;
  pool.forEach(function (q) {
    var e = effQuote(q).effective;
    if (!best || e < best.v) { best = { v: e, q: q }; }
  });
  var latest = '';
  qs.forEach(function (q) { if (String(q.date) > latest) { latest = q.date; } });
  best.stale = Math.max(0, daysBetween(latest, t));
  return best;
}

/* Product cost = (raw material cost ÷ yield) + conversion */
function costOf(p) {
  var parts = [], missing = [], stale = 0, raw = 0;
  p.bom.forEach(function (b) {
    var m = materialBest(b.material);
    if (!m) { missing.push(b.material); return; }
    var amt = num(b.qty) * m.v;
    raw += amt;
    stale = Math.max(stale, m.stale);
    parts.push({ material: b.material, qty: num(b.qty), price: m.v, supplier: m.q.supplier, amount: amt });
  });
  if (missing.length) {
    return { v: 0, src: 'bom', q: null, stale: stale, parts: parts, missing: missing, product: p };
  }
  var y = num(p.yieldPct) > 0 ? num(p.yieldPct) / 100 : 1;
  return {
    v: raw / y + num(p.conv), src: 'bom', q: null, stale: stale, parts: parts, missing: [],
    raw: raw / y, rawBeforeYield: raw, yieldPct: y * 100, conv: num(p.conv), product: p
  };
}

/* Today's cost, used to work out the selling rate */
function costNow(pidIn) {
  var s = S.settings;
  var p = pidIn ? findProduct(pidIn) : null;
  if (p) {
    if (p.bom.length) { return costOf(p); }
    if (num(p.cost) > 0) { return { v: num(p.cost), src: 'manual', q: null, stale: 0, product: p }; }
    return { v: 0, src: 'none', q: null, stale: 0, product: p, needBom: true };
  }
  if (num(s.costOverride) > 0) {
    return { v: num(s.costOverride), src: 'manual', q: null, stale: 0 };
  }
  var st = quoteStats();
  if (!st.count || !st.bestEff) { return { v: 0, src: 'none', q: null, stale: 0 }; }
  return { v: st.bestEffV, src: 'quote', q: st.bestEff, stale: st.staleDays };
}

function trendOfQuotes(qs) {
  var t = todayISO();
  var recent = [], older = [];
  qs.forEach(function (q) {
    if (num(q.rate) <= 0) { return; }
    var d = daysBetween(q.date, t);
    var e = effQuote(q).effective;
    if (d >= 0 && d <= 14) { recent.push(e); }
    else if (d > 14 && d <= 120) { older.push(e); }
  });
  if (!recent.length || older.length < 2) { return null; }
  var r = avg(recent), o = avg(older);
  return { recentAvg: r, base: o, pct: (r - o) / o * 100, nOlder: older.length };
}

/* Average of recent rates (14 days) vs earlier (15-120 days) - to catch dips/rises.
   For a product, each raw material's trend is combined, weighted by its cost share. */
function costTrend(pidIn) {
  var p = pidIn ? findProduct(pidIn) : null;
  if (p) {
    if (!p.bom.length) { return null; }
    var cost = costOf(p);
    var wsum = 0, wpct = 0;
    cost.parts.forEach(function (part) {
      var tr = trendOfQuotes(S.quotes.filter(function (q) { return normName(q.item) === normName(part.material); }));
      if (!tr) { return; }
      wsum += part.amount;
      wpct += part.amount * tr.pct;
    });
    if (!wsum) { return null; }
    return { pct: wpct / wsum };
  }
  return trendOfQuotes(S.quotes);
}

function wcCalc() {
  var s = S.settings;
  var dailySales = num(s.monthlySales) / 30;
  var dailyPurchase = num(s.monthlyPurchase) / 30;
  var recv = dailySales * num(s.creditGiven);
  var inv = dailyPurchase * num(s.stockDays);
  var pay = dailyPurchase * num(s.creditReceived);
  var net = Math.max(0, recv + inv - pay);
  var buffer = num(s.monthlyExpenses) * num(s.cashMonths || 3);
  return { recv: recv, inv: inv, pay: pay, net: net, buffer: buffer, total: Math.max(0, net + buffer) };
}

function customerRank() {
  var gm = grossMarginPct();
  var list = S.customers.map(function (c) {
    var st = custStanding(c);
    var out = custDue(c).reduce(function (x, b) { return x + num(b.amount); }, 0);
    return { c: c, days: st.days, out: out, roc: gm * 365 / st.days, term: st.terms };
  });
  return list.sort(function (a, b) { return b.roc - a.roc; });
}
