'use strict';

/* =========================================================
   Vyapar Saathi — rate sheet, payment reminder, working
   capital, deal ki taiyari aur report.
   Sab kuch phone me (localStorage) rehta hai: koi server
   nahi, koi internet nahi. Ye app bazaar ka live rate
   nahi laati — aapke daale rate ka record rakhti hai
   aur unse faisla batati hai.
   ========================================================= */

var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var STORE_KEY = 'vyapar-saathi-v1';

/* ---------------- chhote helpers ---------------- */

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
function money(n) {
  return '\u20B9' + Math.round(num(n)).toLocaleString('en-IN');
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
  if (!d) { return '\u2014'; }
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2);
}
function monLabel(ym) {
  var p = String(ym).split('-');
  var m = Number(p[1]);
  return (MONTHS[m - 1] || '?') + ' ' + String(p[0] || '').slice(2);
}
function daysAgoText(n) {
  if (n <= 0) { return 'aaj'; }
  if (n === 1) { return 'kal'; }
  return n + ' din pehle';
}
function uniq(arr) {
  var out = [];
  arr.forEach(function (x) { if (out.indexOf(x) < 0) { out.push(x); } });
  return out;
}

/* ---------------- form helpers ---------------- */

function field(label, name, value, type, ph) {
  var t = type || 'text';
  var extra = (t === 'number') ? ' inputmode="decimal" step="any"' : '';
  return '<label class="fld"><span>' + esc(label) + '</span>' +
    '<input type="' + t + '" name="' + name + '" value="' + esc(value === 0 ? '0' : (value || '')) + '"' +
    ' placeholder="' + esc(ph || '') + '"' + extra + '></label>';
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

var tab = 'home';
var ui = { editCustomer: null, open: {}, locked: false };
var S = null;

function blankState() {
  return {
    v: 1,
    demo: false,
    settings: {
      business: '', person: '', item: '', unit: 'kg',
      monthlySales: 0, monthlyPurchase: 0, monthlyExpenses: 0,
      creditGiven: 60, creditReceived: 0, stockDays: 10, cashMonths: 3,
      costOfFunds: 12, earlyDiscount: 2, earlyDays: 15
    },
    quotes: [],
    customers: [],
    tones: {},
    rfq: { qty: '', days: 3, note: '' },
    deal: { qty: '', target: '', walkaway: '', batna: '', margin: '', months: 3, batches: 4 },
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
  s.deal = Object.assign(base.deal, src.deal || {});
  s.epd = Object.assign(base.epd, src.epd || {});
  s.tre = Object.assign(base.tre, src.tre || {});
  s.rvc = Object.assign(base.rvc, src.rvc || {});
  s.tones = (src.tones && typeof src.tones === 'object') ? src.tones : {};

  if (Array.isArray(src.quotes)) {
    s.quotes = src.quotes.filter(function (q) { return q && typeof q === 'object'; }).map(function (q) {
      return {
        id: q.id || uid(),
        date: q.date || todayISO(),
        supplier: q.supplier || '',
        item: q.item || '',
        rate: num(q.rate),
        freight: num(q.freight),
        rejection: num(q.rejection),
        moq: q.moq || '',
        deliveryDays: num(q.deliveryDays),
        payDays: num(q.payDays)
      };
    });
  }
  if (Array.isArray(src.customers)) {
    s.customers = src.customers.filter(function (c) { return c && typeof c === 'object'; }).map(function (c) {
      return {
        id: c.id || uid(),
        name: c.name || 'Customer',
        phone: c.phone || '',
        creditDays: num(c.creditDays),
        creditLimit: num(c.creditLimit),
        bills: Array.isArray(c.bills) ? c.bills.filter(function (b) {
          return b && typeof b === 'object';
        }).map(function (b) {
          return {
            id: b.id || uid(),
            date: b.date || todayISO(),
            amount: num(b.amount),
            note: b.note || '',
            paidOn: b.paidOn || ''
          };
        }) : []
      };
    });
  }
  return s;
}

function load() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (raw) { return normalize(JSON.parse(raw)); }
  } catch (e) { /* khaali state se shuru */ }
  return blankState();
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(S));
  } catch (e) {
    toast('Data save nahi hua');
  }
}

/* ---------------- app lock (PIN) ----------------
   Ye screen lock hai: phone par app sirf PIN wale kholein.
   Ye phone ki lock screen ya encryption ki jagah nahi hai. */

var PIN_KEY = 'vyapar-saathi-pin-v1';

function pinHash(p) {
  var h = 5381;
  for (var i = 0; i < p.length; i++) {
    h = ((h << 5) + h) + p.charCodeAt(i);
    h = h & 0x7fffffff;
  }
  return 'k' + h.toString(36) + '-' + p.length;
}
function pinIsSet() {
  try { return !!localStorage.getItem(PIN_KEY); } catch (e) { return false; }
}
function pinSave(p) {
  try { localStorage.setItem(PIN_KEY, pinHash(p)); } catch (e) { toast('PIN save nahi hua'); }
}
function pinClear() {
  try { localStorage.removeItem(PIN_KEY); } catch (e) {}
}
function pinCheck(p) {
  try { return localStorage.getItem(PIN_KEY) === pinHash(p); } catch (e) { return false; }
}

/* ---------------- hisaab ---------------- */

function custDue(c) {
  return c.bills.filter(function (b) {
    return !b.paidOn && num(b.amount) > 0;
  }).map(function (b) {
    var due = addDays(b.date, c.creditDays);
    return {
      id: b.id,
      date: b.date,
      amount: num(b.amount),
      due: due,
      overdueDays: Math.max(0, daysBetween(due, todayISO()))
    };
  }).sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); });
}

function paymentStats() {
  var out = {
    outstanding: 0, overdue: 0, oldest: 0, unpaidCount: 0,
    paidCount: 0, avgPaidDays: 0
  };
  var paidDaysSum = 0;
  S.customers.forEach(function (c) {
    c.bills.forEach(function (b) {
      if (b.paidOn) {
        out.paidCount += 1;
        paidDaysSum += Math.max(0, daysBetween(b.date, b.paidOn));
      } else if (num(b.amount) > 0) {
        out.unpaidCount += 1;
        out.outstanding += num(b.amount);
        var due = addDays(b.date, c.creditDays);
        var late = daysBetween(due, todayISO());
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

function effQuote(q) {
  var s = S.settings;
  var landed = num(q.rate) + num(q.freight);
  var afterRej = landed * (1 + num(q.rejection) / 100);
  var credit = afterRej * num(s.costOfFunds) / 100 * num(q.payDays) / 365;
  return { landed: landed, afterRejection: afterRej, credit: credit, effective: afterRej + credit };
}

function grossMarginPct() {
  var s = S.settings;
  if (num(s.monthlySales) <= 0) { return 0; }
  return (num(s.monthlySales) - num(s.monthlyPurchase)) / num(s.monthlySales) * 100;
}

function customerRank() {
  var gm = grossMarginPct();
  var list = S.customers.map(function (c) {
    var paid = c.bills.filter(function (b) { return b.paidOn; });
    var sum = 0;
    paid.forEach(function (b) { sum += Math.max(0, daysBetween(b.date, b.paidOn)); });
    var days = paid.length ? Math.round(sum / paid.length) : Math.round(num(c.creditDays));
    if (!days || days < 1) { days = Math.max(1, Math.round(num(c.creditDays) || 30)); }
    var out = custDue(c).reduce(function (x, b) { return x + num(b.amount); }, 0);
    return {
      c: c, days: days, out: out,
      roc: gm * 365 / days,
      term: Math.round(num(c.creditDays))
    };
  });
  return list.sort(function (a, b) { return b.roc - a.roc; });
}

function quoteStats() {
  var t = todayISO();
  var qs = S.quotes.slice().sort(function (a, b) {
    return String(a.date).localeCompare(String(b.date));
  });
  if (!qs.length) {
    return {
      count: 0, staleDays: 0, spread: 0, avg: 0, best: null, worst: null,
      latest: null, months: [], poolN: 0,
      bestEff: null, bestEffV: 0, worstEff: null, worstEffV: 0
    };
  }
  var last30 = qs.filter(function (q) {
    var d = daysBetween(q.date, t);
    return d >= 0 && d <= 30 && num(q.rate) > 0;
  });
  var pool = last30.length ? last30 : qs.filter(function (q) { return num(q.rate) > 0; });
  if (!pool.length) { pool = qs; }
  var best = pool[0], worst = pool[0], sum = 0;
  pool.forEach(function (q) {
    sum += num(q.rate);
    if (num(q.rate) < num(best.rate)) { best = q; }
    if (num(q.rate) > num(worst.rate)) { worst = q; }
  });
  var avg = sum / pool.length;
  var latest = qs[qs.length - 1];
  var byMonth = {};
  qs.forEach(function (q) {
    var k = String(q.date).slice(0, 7);
    if (!byMonth[k]) { byMonth[k] = []; }
    byMonth[k].push(num(q.rate));
  });
  var months = Object.keys(byMonth).sort().map(function (k) {
    var arr = byMonth[k];
    return {
      key: k,
      avg: arr.reduce(function (a, b) { return a + b; }, 0) / arr.length,
      n: arr.length
    };
  });
  var effs = pool.map(function (q) { return { q: q, v: effQuote(q).effective }; });
  var bestEff = effs[0], worstEff = effs[0];
  effs.forEach(function (x) {
    if (x.v < bestEff.v) { bestEff = x; }
    if (x.v > worstEff.v) { worstEff = x; }
  });
  return {
    count: qs.length,
    bestEff: bestEff.q,
    bestEffV: bestEff.v,
    worstEff: worstEff.q,
    worstEffV: worstEff.v,
    staleDays: Math.max(0, daysBetween(latest.date, t)),
    spread: num(best.rate) > 0 ? (num(worst.rate) - num(best.rate)) / num(best.rate) * 100 : 0,
    avg: avg,
    best: best,
    worst: worst,
    latest: latest,
    months: months,
    poolN: pool.length
  };
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

/* ---------------- messages ---------------- */

function rfqMessage() {
  var unit = S.settings.unit || 'unit';
  var item = S.settings.item || 'maal';
  var biz = S.settings.business || '______';
  var qty = S.rfq.qty || '____';
  var pay = num(S.settings.creditReceived) > 0
    ? num(S.settings.creditReceived) + ' din credit'
    : 'turant / cash';
  var lines = [];
  lines.push('Namaste ji,');
  lines.push('');
  lines.push(item + ' ka rate bhej dein:');
  lines.push('1. Quantity: ' + qty + ' ' + unit);
  lines.push('2. Delivery: ' + (num(S.rfq.days) || 3) + ' din me');
  lines.push('3. Payment: ' + pay + ' (ya aap apni terms bata dein)');
  lines.push('4. Rate ke saath GST, freight aur packing clear likhein');
  if (S.rfq.note) { lines.push('5. Note: ' + S.rfq.note); }
  lines.push('');
  lines.push('Aaj shaam tak rate aur availability bata dein, order confirm karna hai.');
  lines.push('Isi quality ka sample bhi bhej dein to behtar.');
  lines.push('');
  lines.push('Dhanyavaad,');
  lines.push(biz);
  return lines.join('\n');
}

function reminderMessage(c, tone) {
  var due = custDue(c);
  var biz = S.settings.business || '______';
  if (!due.length) {
    return 'Namaste ' + c.name + ' ji,\n\nAapka koi payment pending nahi hai. ' +
      'Samay par payment ke liye dhanyavaad.\n\n' + biz;
  }
  var lines = due.map(function (b, i) {
    return (i + 1) + '. ' + dmy(b.date) + ' ka bill ' + money(b.amount) +
      ' \u2014 due ' + dmy(b.due) +
      (b.overdueDays > 0 ? ' (' + b.overdueDays + ' din ho gaye)' : '');
  });
  var total = due.reduce(function (s, b) { return s + num(b.amount); }, 0);
  var over = due.filter(function (b) { return b.overdueDays > 0; });
  var overAmt = over.reduce(function (s, b) { return s + num(b.amount); }, 0);
  var maxLate = over.reduce(function (m, b) { return Math.max(m, b.overdueDays); }, 0);

  if (tone === 'soft') {
    return 'Namaste ' + c.name + ' ji,\n\n' +
      'Umeed hai sab theek hai. Aapke account ka hisaab:\n\n' +
      lines.join('\n') + '\n\nTotal pending: ' + money(total) + '\n\n' +
      'Payment ki koi date bata dein taake main account update kar lu. ' +
      'Koi dikkat ho to bata dein, hum saath milkar dekh lenge.\n\n' +
      'Dhanyavaad,\n' + biz;
  }
  if (tone === 'firm') {
    var head = over.length
      ? 'Aapke account me ' + money(total) + ' pending hai, jisme ' + money(overAmt) +
        ' due date ke baad ka hai (' + maxLate + ' din tak).'
      : 'Aapke account me ' + money(total) + ' pending hai.';
    var ask = over.length
      ? 'Kripya 3 din ke andar payment clear karein, ya nayi date likhit me confirm karein. ' +
        'Uske baad agla order credit par nahi, advance par hoga.'
      : 'Kripya payment ki date confirm kar dein taake agla order time par dispatch ho sake.';
    return c.name + ' ji,\n\n' + head + '\n\n' + lines.join('\n') + '\n\n' + ask +
      '\n\nDhanyavaad,\n' + biz;
  }
  return 'Namaste ' + c.name + ' ji,\n\n' +
    dmy(todayISO()) + ' tak ka hisaab:\n\n' + lines.join('\n') + '\n\n' +
    'Total pending: ' + money(total) + '\n\n' +
    'Kripya payment ki date confirm kar dein. Aapke agle order ke liye hum maal reserve kar rahe hain, ' +
    'payment aate hi dispatch kar denge.\n\nDhanyavaad,\n' + biz;
}

function dealSummary() {
  var d = S.deal;
  var unit = S.settings.unit || 'unit';
  var months = num(d.months) || 3;
  var target = num(d.target);
  var margin = num(d.margin);
  var index = target - margin;
  var batches = num(d.batches) || 4;
  var biz = S.settings.business || '______';
  var lines = [];
  lines.push('RATE AUR SUPPLY AGREEMENT (draft)');
  lines.push('Parties: ' + biz + ' aur ____________');
  lines.push('Item: ' + (S.settings.item || '______') + ' (' + unit + ')');
  lines.push('Quantity: ' + (d.qty || '______') + ' ' + unit + ' per mahina, ' + months + ' mahine');
  lines.push('Rate: Bazaar index rate + ' + money(margin) + ' per ' + unit +
    '. Aaj ka index ' + money(index) + ', is liye aaj ka rate ' + money(target) + ' per ' + unit +
    ' (GST aur freight alag).');
  lines.push('Rate review: har mahine 1 tareekh ko index ke hisaab se, dono taraf saaf.');
  lines.push('Index ki definition: pichhle mahine ke 3 sabse acche quotes ka average. \u00B13% band ke andar rate nahi badlega.');
  lines.push('Rate validity: 15 din. Quantity tolerance: \u00B15%.');
  lines.push('Rejection: 7 din ke andar test report ke saath likhit claim, uske baad maal accepted.');
  lines.push('Late payment par 1.5% per mahina byaaj. Payment date invoice date se gini jaayegi.');
  lines.push('Delivery: mahine me ' + batches + ' baar, schedule pehle se tay \u2014 ' +
    (d.qty ? Math.round(num(d.qty) / batches) : '____') + ' ' + unit + ' per delivery.');
  lines.push('Payment: ' + num(S.settings.creditGiven) + ' din. Isse pehle payment par ' +
    num(S.settings.earlyDiscount) + '% discount.');
  lines.push('Quality: har batch ke saath test report, sample approval ke baad hi dispatch, ' +
    'rejected maal ki 7 din me free replacement.');
  lines.push('Supply: ' + biz + ' apne paas ' + (num(S.settings.stockDays) || 10) +
    ' din ka buffer stock rakhega taake aapki line na ruke.');
  lines.push('Commitment: ' + months + ' mahine ka order; beech me band karne ke liye 15 din ka notice.');
  return lines.join('\n');
}

function objections() {
  var d = S.deal;
  var unit = S.settings.unit || 'unit';
  var target = num(d.target);
  var qty = d.qty ? (d.qty + ' ' + unit) : 'pura mahine ka order';
  var bulk = Math.max(num(d.walkaway) * 0.995, target * 0.99);
  var early = num(S.settings.earlyDiscount);
  var earlyDays = num(S.settings.earlyDays);
  var saved = num(S.settings.creditGiven) - earlyDays;
  var ann = saved > 0 ? early * 365 / saved : 0;
  var list = [];

  list.push({
    q: '"Aapka rate mehnga hai, doosre se sasta mil raha hai."',
    a: 'Sir, rate ke saath delivery aur quality bhi dekhiye. Meri rate sheet me pichhle mahine ke ' +
      '3 suppliers ke rate hain, main aapko dikha sakta hu. Agar aap ' + qty + ' ek saath lenge to rate ' +
      money(bulk) + ' per ' + unit + ' tak ho sakta hai, kyunki mera setup cost bant jaata hai. ' +
      'Quality aur delivery ki guarantee isi rate me hai.'
  });
  list.push({
    q: '"Payment 90 din baad hi hoga."',
    a: 'Hamari standard terms ' + num(S.settings.creditGiven) + ' din hai, aur usme poori supply guarantee milti hai. ' +
      'Agar aap ' + earlyDays + ' din me payment karein to ' + early + '% kam rate \u2014 ye aapke liye ' +
      fmt(ann) + '% saalana bachat hai, jo kisi loan se sasta padta hai. 90 din chahiye to rate me wo cost judega, ' +
      'tabhi main dono taraf insaaf kar paunga.'
  });
  list.push({
    q: '"Quality ka bharosa kaise?"',
    a: 'Har batch ke saath test report, pehle sample approval, aur rejected maal ki 7 din me free replacement. ' +
      'Aapke paas ' + (num(S.settings.stockDays) || 10) + ' din ka buffer stock hum rakhte hain, isliye aapki line ' +
      'kabhi nahi rukegi. Ye teeno baatein likhit agreement me aayengi.'
  });
  list.push({
    q: '"Abhi stock hai, baad me dekhenge."',
    a: 'Koi baat nahi sir. Rate formula mahine ke index se juda hai, isliye aaj lock karne me aapka nuksan nahi hota. ' +
      'Main ' + qty + ' aapke naam reserve rakh deta hu, dispatch aapke schedule par hoga. Rate badha to aapko purana rate, ' +
      'ghata to naya rate \u2014 dono taraf saaf.'
  });
  list.push({
    q: '"Pehle doosre suppliers se rate compare karna hai."',
    a: 'Bilkul karein, yehi sahi tareeka hai. Bas teen cheez compare karein: final rate (freight aur GST ke baad), ' +
      'delivery days, aur payment terms. Main apni rate sheet aur pichhle 3 mahine ka record de deta hu taake ' +
      'comparison aasan ho. Jo sirf rate par sasta hai par delivery late deta hai, usme aapka nuksan zyada hoga.'
  });
  return list;
}

function reportText() {
  var g = gapsSorted();
  var p = paymentStats();
  var w = wcCalc();
  var s = S.settings;
  var lines = [];
  lines.push('VYAPAR REPORT \u2014 ' + dmy(todayISO()));
  lines.push('Business: ' + (s.business || '-') + ' | Item: ' + (s.item || '-'));
  lines.push('Bikri/mahina: ' + money(s.monthlySales) + ' | Kharid: ' + money(s.monthlyPurchase) +
    ' | Kharcha: ' + money(s.monthlyExpenses));
  lines.push('Customer ko credit: ' + num(s.creditGiven) + ' din | Supplier se: ' + num(s.creditReceived) + ' din');
  lines.push('');
  lines.push('PAISA');
  lines.push('Customer se lena hai (receivables): ' + money(w.recv));
  lines.push('Stock me: ' + money(w.inv));
  lines.push('Supplier ko dena hai (payables): ' + money(w.pay));
  lines.push('Working capital chahiye: ' + money(w.total) + ' (' + num(s.cashMonths || 3) + ' mahine buffer ke saath)');
  lines.push('');
  lines.push('PAYMENT');
  lines.push('Total baaki: ' + money(p.outstanding) + ' | Overdue: ' + money(p.overdue) +
    ' | Sabse purana: ' + p.oldest + ' din');
  lines.push('');
  lines.push('KYA SUDHARNA HAI');
  if (!g.length) {
    lines.push('Filhaal koi badi kami nahi dikh rahi.');
  }
  g.forEach(function (x, i) {
    lines.push((i + 1) + '. [' + x.level.toUpperCase() + '] ' + x.title);
    lines.push('   Kyun: ' + x.why);
    lines.push('   Karein: ' + x.action);
  });
  return lines.join('\n');
}

function waLink(phone, text) {
  var d = String(phone || '').replace(/\D/g, '');
  if (d.length < 10) { return ''; }
  var n = (d.length === 10) ? ('91' + d) : d;
  return 'https://wa.me/' + n + '?text=' + encodeURIComponent(text);
}

function payloadFor(kind, id) {
  if (kind === 'rfq') { return rfqMessage(); }
  if (kind === 'deal') { return dealSummary(); }
  if (kind === 'report') { return reportText(); }
  if (kind === 'backup') { return JSON.stringify(S, null, 2); }
  if (kind === 'reminder') {
    var c = S.customers.filter(function (x) { return x.id === id; })[0];
    if (!c) { return ''; }
    return reminderMessage(c, S.tones[c.id] || 'normal');
  }
  return '';
}

/* ---------------- report: kami kahan hai ---------------- */

function gaps() {
  var out = [];
  var t = todayISO();
  var st = quoteStats();
  var p = paymentStats();
  var s = S.settings;

  if (!S.quotes.length) {
    out.push({
      level: 'high',
      title: 'Supplier rate ka koi record nahi',
      why: 'Bina record ke har order ka rate andaze se tay hota hai, aur bargaining me aap kamzor rehte hain.',
      action: 'Rate tab me aaj 2-3 suppliers ke rate daalein.'
    });
  } else if (st.staleDays > 15) {
    out.push({
      level: 'high',
      title: 'Rate ' + st.staleDays + ' din purana hai',
      why: 'Rate hafte-hafte badalta hai; purane rate par order dene se margin chup-chaap kam ho jaata hai.',
      action: 'Rate tab ka message copy karke 2-3 parties ko bhejein, aaye rate wahan daal dein.'
    });
  }

  if (st.count >= 3 && st.spread >= 4) {
    out.push({
      level: 'mid',
      title: 'Suppliers ke rate me ' + fmt(st.spread) + '% ka fark',
      why: 'Sasta ' + money(st.best.rate) + ' (' + st.best.supplier + '), mehnga ' +
        money(st.worst.rate) + ' (' + st.worst.supplier + ').',
      action: 'Saste rate par mehnge supplier se match karwayein, ya order saste wale ko dein aur rate lock karwayein.'
    });
  }

  if (st.count && st.best && st.bestEff && st.best.id !== st.bestEff.id) {
    out.push({
      level: 'mid',
      title: 'Sabse kam rate wala supplier asli me sasta nahi',
      why: money(st.best.rate) + ' wale ka asli kharch ' + money(effQuote(st.best).effective) +
        ' hai, jabki ' + st.bestEff.supplier + ' ka ' + money(st.bestEffV) +
        ' (freight, rejection aur credit ke baad).',
      action: 'Rate sheet ke "Asli" column par faisla karein: rate + freight + rejection % + credit ka byaaj.'
    });
  }

  var cccNow = num(s.stockDays) + num(s.creditGiven) - num(s.creditReceived);
  if (cccNow >= 60) {
    out.push({
      level: 'mid',
      title: 'Cash conversion cycle ' + Math.round(cccNow) + ' din',
      why: 'Stock ' + num(s.stockDays) + ' din + customer credit ' + num(s.creditGiven) + ' din \u2212 supplier credit ' +
        num(s.creditReceived) + ' din. Itne din tak aapka paisa aapke paas nahi hota.',
      action: 'Target: ' + (Math.round(cccNow) - 10) + ' din. Stock ya credit days me se 10 din kamane ka plan banayein \u2014 Capital tab me paisa ka hisaab hai.'
    });
  }

  if (st.months.length >= 2) {
    var minM = st.months.reduce(function (a, b) { return b.avg < a.avg ? b : a; }, st.months[0]);
    var maxM = st.months.reduce(function (a, b) { return b.avg > a.avg ? b : a; }, st.months[0]);
    var gapPct = minM.avg > 0 ? (maxM.avg - minM.avg) / minM.avg * 100 : 0;
    if (gapPct >= 3) {
      out.push({
        level: 'mid',
        title: 'Rate ka mausam: ' + monLabel(minM.key) + ' sabse sasta',
        why: monLabel(minM.key) + ' ka average ' + money(minM.avg) + ', ' + monLabel(maxM.key) + ' ka ' +
          money(maxM.avg) + ' \u2014 ' + fmt(gapPct) + '% ka fark.',
        action: 'Purchase plan mahine ke hisaab se banayein: saste mahine me buffer, mehnge me sirf zaroorat ka.'
      });
    }
  }

  if (p.outstanding > 0 && p.overdue > 0) {
    var share = p.overdue / p.outstanding * 100;
    out.push({
      level: share >= 15 ? 'high' : 'mid',
      title: 'Overdue ' + money(p.overdue) + ' (' + fmt(share) + '% of baaki)',
      why: 'Sabse purana bill ' + p.oldest + ' din late hai. Late payment ka pura bojh aapke working capital par aata hai.',
      action: 'Payment tab se reminder bhejein; jo baar-baar late kare uska credit limit kam karein.'
    });
  } else if (S.customers.length && p.outstanding > 0) {
    out.push({
      level: 'ok',
      title: 'Payment abhi time par aa raha hai',
      why: 'Filhaal koi bill due date ke baad nahi hai. Aage bhi likhit terms par chalte rahein.',
      action: 'Jaldi payment par ' + num(s.earlyDiscount) + '% discount ka offer dete rahein.'
    });
  }

  if (!S.customers.length) {
    out.push({
      level: 'mid',
      title: 'Customer ka hisaab record nahi',
      why: 'Kaun kitna dena hai aur kitne din late karta hai \u2014 record na hone se credit control nahi hota.',
      action: 'Payment tab me customer aur bill daalein; reminder khud ban jaayega.'
    });
  }

  var given = num(s.creditGiven), got = num(s.creditReceived);
  if (given > got) {
    out.push({
      level: 'high',
      title: 'Credit ka gap: ' + given + ' din vs ' + got + ' din',
      why: 'Aap customer ko ' + given + ' din dete hain par supplier se ' + got +
        ' din lete hain. Yehi ' + (given - got) + ' din ka gap aapka working capital khaata hai.',
      action: 'Supplier se 15-30 din credit maangein. MSME hain to TReDS aur 45-din niyam dekhein \u2014 Capital tab me hisaab hai.'
    });
  }

  var recentSuppliers = uniq(S.quotes.filter(function (q) {
    return daysBetween(q.date, t) <= 60;
  }).map(function (q) { return q.supplier; })).filter(Boolean);
  if (recentSuppliers.length === 1) {
    out.push({
      level: 'mid',
      title: 'Sirf ek supplier par nirbhar',
      why: 'Ek supplier ka rate ya supply rukna matlab aapka order rukna; customer ko guarantee dena mushkil.',
      action: 'Ek aur supplier approve karein (sample + rate), taake alternative haath me rahe.'
    });
  }

  if (st.best && num(s.stockDays) < num(st.best.deliveryDays)) {
    out.push({
      level: 'mid',
      title: 'Stock kam: ' + num(s.stockDays) + ' din',
      why: 'Sabse sasta supplier ' + num(st.best.deliveryDays) + ' din me delivery deta hai. Itna buffer nahi hai to delivery late hogi.',
      action: 'Stock ' + (num(st.best.deliveryDays) + 7) + ' din ka rakhein \u2014 supply guarantee hi sabse badi dukaan hai.'
    });
  }

  if (num(s.monthlySales) > 0 && num(s.monthlyPurchase) > 0) {
    var gm = (num(s.monthlySales) - num(s.monthlyPurchase)) / num(s.monthlySales) * 100;
    if (gm < 8) {
      out.push({
        level: 'high',
        title: 'Gross margin sirf ' + fmt(gm) + '%',
        why: 'Itne kam margin me ' + given + ' din ka credit aur rate ka utar-chadhav sambhalna mushkil hota hai.',
        action: 'Deal tab se rate formula tay karein aur 1-2% margin nikaalein; Capital tab me credit ki asli lagat dekhein.'
      });
    }
  }

  if (S.customers.length >= 2) {
    var topC = null, totalDue = 0;
    S.customers.forEach(function (c) {
      var o = custDue(c).reduce(function (x, b) { return x + num(b.amount); }, 0);
      totalDue += o;
      if (!topC || o > topC.o) { topC = { c: c, o: o }; }
    });
    if (topC && totalDue > 0 && topC.o / totalDue > 0.5) {
      out.push({
        level: 'mid',
        title: 'Ek customer par zyada nirbhar',
        why: topC.c.name + ' ke paas aapke total ' + money(totalDue) + ' me se ' + money(topC.o) +
          ' (' + fmt(topC.o / totalDue * 100) + '%) baaki hai.',
        action: 'Naye customer judte rahein; ek customer ka rukna cash flow na tode.'
      });
    }
  }

  var saved = given - num(s.earlyDays);
  if (num(s.earlyDiscount) > 0 && saved > 0) {
    var ann = num(s.earlyDiscount) * 365 / saved;
    var loan = num(s.costOfFunds);
    out.push({
      level: ann > loan ? 'mid' : 'ok',
      title: 'Early payment discount: ' + fmt(ann) + '% saalana',
      why: num(s.earlyDiscount) + '% discount ' + saved + ' din pehle payment par. Aapka loan ' + fmt(loan) + '% saalana hai.',
      action: ann > loan
        ? 'Ye discount aapke liye loan se mehnga hai \u2014 sirf un customers ko dein jo discount ke bina late karte hain; warna TReDS/OD sasta hai.'
        : 'Customer ko offer dein: ' + given + ' din normal, ya ' + saved + ' din me ' + num(s.earlyDiscount) + '% kam. Aapko paisa sasta pad raha hai.'
    });
  }

  return out;
}

function gapsSorted() {
  var rank = { high: 0, mid: 1, ok: 2 };
  return gaps().sort(function (a, b) { return rank[a.level] - rank[b.level]; });
}

/* ---------------- chhote UI tukde ---------------- */

function gapCard(g) {
  return '<div class="alert ' + g.level + '"><b>' + esc(g.title) + '</b>' +
    '<p>' + esc(g.why) + '</p>' +
    '<p class="act">Karein: ' + esc(g.action) + '</p></div>';
}

function demoBanner() {
  return '<div class="demo"><div><b>Sample data chal raha hai</b>' +
    '<div class="small muted">Numbers misaal ke liye hain. Apna data daalne se pehle sample hata dein.</div></div>' +
    '<button class="btn tiny alt" type="button" data-action="demo-clear">Sample hatao</button></div>';
}

function setupFormHTML() {
  var s = S.settings;
  return '<form data-form="settings" class="grid2">' +
    field('Business ka naam', 'business', s.business, 'text', 'jaise: Sharma Traders') +
    field('Aapka naam', 'person', s.person, 'text', 'jaise: Rakesh') +
    field('Maal / item', 'item', s.item, 'text', 'jaise: cotton yarn') +
    field('Unit', 'unit', s.unit, 'text', 'kg / piece / bag') +
    field('Mahine ki bikri \u20B9', 'monthlySales', s.monthlySales, 'number', '0') +
    field('Mahine ki kharid \u20B9', 'monthlyPurchase', s.monthlyPurchase, 'number', '0') +
    field('Mahine ka kharcha \u20B9 (salary, rent, bijli)', 'monthlyExpenses', s.monthlyExpenses, 'number', '0') +
    field('Customer ko credit (din)', 'creditGiven', s.creditGiven, 'number', '60') +
    field('Supplier se credit (din)', 'creditReceived', s.creditReceived, 'number', '0') +
    field('Stock kitne din ka', 'stockDays', s.stockDays, 'number', '10') +
    field('Loan / OD ka rate (% saalana)', 'costOfFunds', s.costOfFunds, 'number', '12') +
    field('Buffer kitne mahine ka', 'cashMonths', s.cashMonths, 'number', '3') +
    field('Early payment discount (%)', 'earlyDiscount', s.earlyDiscount, 'number', '2') +
    field('Early payment kitne din me', 'earlyDays', s.earlyDays, 'number', '15') +
    '<div class="row-end"><button class="btn" type="submit">Save karein</button></div>' +
    '</form>';
}

function viewLock() {
  return '<section class="card lock">' +
    '<div class="lock-badge">Vyapar Saathi</div>' +
    '<p class="muted small" style="margin:0">Ye app sirf apne malik ke liye hai. PIN daal kar kholein.</p>' +
    '<form data-form="unlock">' +
      '<label class="fld"><span>PIN</span>' +
      '<input type="password" name="pin" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="****"></label>' +
      '<div class="btnrow"><button class="btn" type="submit">Kholein</button></div>' +
    '</form>' +
    '<p class="muted small" style="margin:14px 0 0">PIN isi phone me save hota hai. ' +
      'Bhoolne par data wapas nahi aayega \u2014 isliye mahine me ek baar backup copy bana kar rakh lein.</p>' +
    '<div class="btnrow" style="justify-content:center">' +
      '<button class="link del" type="button" data-action="pin-forgot">PIN bhool gaye?</button>' +
    '</div>' +
  '</section>';
}

function effNote(st) {
  if (!st.bestEff) { return ''; }
  var unit = S.settings.unit || 'unit';
  var lines = [];
  lines.push('Asli lagat = rate + freight, + rejection %, + ' + fmt(num(S.settings.costOfFunds)) + '% credit ka byaaj.');
  lines.push('Sabse kam rate: ' + money(st.best.rate) + ' (' + st.best.supplier + ', ' + num(st.best.payDays) +
    ' din) \u2192 asli ' + money(effQuote(st.best).effective) + ' per ' + unit + '.');
  lines.push('Sabse kam asli lagat: ' + money(st.bestEffV) + ' (' + st.bestEff.supplier + ', ' +
    num(st.bestEff.payDays) + ' din credit).');
  if (st.best && st.bestEff && st.best.id !== st.bestEff.id) {
    lines.push('Dhyan dein: jo rate sheet me sabse sasta dikh raha hai, asli me wo nahi hai. ' +
      'Freight, rejection aur credit ka byaaj jodne par faisla badal jaata hai.');
  }
  return '<div class="msg">' + esc(lines.join('\n')) + '</div>';
}

function rocCard() {
  var rank = customerRank();
  if (!rank.length) { return ''; }
  var gm = grossMarginPct();
  var rows = rank.slice(0, 8).map(function (r) {
    var cls = (r.term > 0 && r.days > r.term) ? ' bad' : '';
    return '<tr><td>' + esc(r.c.name) + '</td>' +
      '<td class="num">' + money(r.out) + '</td>' +
      '<td class="num' + cls + '">' + r.days + ' din</td>' +
      '<td class="num">' + fmt(r.roc, 0) + '%</td></tr>';
  }).join('');
  return '<section class="card">' +
    '<div class="card-head"><h2>Paisa ka return \u2014 customer wise</h2><span class="hint">margin ' + fmt(gm) + '% par</span></div>' +
    '<p class="muted small" style="margin:0 0 8px">Formula: margin % \u00D7 365 \u00F7 asli collection din. ' +
    'Turnover nahi, paise ka return dekhein \u2014 6% margin 60 din par saalana 36% banta hai, ' +
    '9% margin 15 din par 219%. Isi se tay hota hai kise credit milega aur kise discount.</p>' +
    '<div class="table-wrap"><table><thead><tr><th>Customer</th><th class="num">Baaki</th>' +
      '<th class="num">Asli din</th><th class="num">Return</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p class="muted small" style="margin:8px 0 0">Jo customer apni terms se zyada din le raha hai (laal), uska return gir chuka hai \u2014 ' +
      'uske saath rate ya limit dobara tay karein.</p>' +
    '</section>';
}

function rvcText() {
  var p = num(S.settings.monthlyPurchase);
  var cost = num(S.settings.costOfFunds);
  var diff = num(S.rvc.diff);
  var days = num(S.rvc.days);
  var rateBenefit = p * diff / 100 * 12;
  var creditBenefit = p * cost / 100 * days / 30;
  var lines = [];
  lines.push('Mahine ki kharid: ' + money(p) + ' \u00B7 paise ka rate: ' + fmt(cost) + '% saalana');
  lines.push(diff + '% sasta rate = ' + money(rateBenefit) + ' saalana bachat');
  lines.push(days + ' din supplier credit = ' + money(creditBenefit) + ' saalana bachat');
  lines.push(creditBenefit >= rateBenefit
    ? 'Faisla: pehle ' + days + ' din credit nikaalein, phir rate par baat karein \u2014 credit ka paisa yahan ' +
      fmt(rateBenefit > 0 ? creditBenefit / rateBenefit : 0) + ' guna hai.'
    : 'Faisla: credit kam mil raha hai, to rate par zor dein \u2014 par credit ki demand ek baar zaroor rakhein.');
  return lines.join('\n');
}

function clauseList() {
  return [
    { t: 'Rate validity 15 din', d: '15 din baad naya index. Isse purane rate par maal maangne ka jhagda khatam.' },
    { t: 'Index ki definition likhit me', d: '\u201CPichhle mahine ke 3 sabse acche quotes ka average, 1 tareekh ko\u201D \u2014 warna baad me dono apne number bolenge.' },
    { t: '\u00B13% band (collar)', d: 'Index is band ke andar ho to rate nahi badlega. Chhoti harkat par meeting nahi hoti.' },
    { t: 'Quantity tolerance \u00B15%', d: 'Schedule se 3 din pehle confirmation. Kam-zyada par dispute na ho.' },
    { t: 'Lifting / stocking charge', d: 'Schedule par maal na uthaye to 7 din baad 0.5% per mahina godown charge.' },
    { t: 'Rejection window 7 din', d: 'Test report ke saath likhit claim 7 din me; uske baad maal accepted. Bina is line ke purana stock wapas aata hai.' },
    { t: 'Payment date = invoice date + N din', d: 'Delivery date se nahi \u2014 warna customer delivery hi late karwa kar credit badha lega.' },
    { t: 'Late payment par 1.5% per mahina', d: 'Likhne se hi kaam karta hai; baat karne se nahi.' },
    { t: 'Freight, packing, GST alag', d: 'Rate me included likhne par har order par chup-chaap 1-2% nikal jaata hai.' },
    { t: 'Rate revision sirf likhit me', d: 'Ek baar, dono ke signature ke saath \u2014 phone par tay rate ka koi saboot nahi hota.' }
  ];
}

/* ---------------- views ---------------- */

function viewHome() {
  var p = paymentStats();
  var st = quoteStats();
  var w = wcCalc();
  var s = S.settings;
  var gm = num(s.monthlySales) > 0
    ? (num(s.monthlySales) - num(s.monthlyPurchase)) / num(s.monthlySales) * 100
    : 0;
  var g = gapsSorted();
  var alerts = g.slice(0, 3).map(gapCard).join('');
  var bizOpen = (ui.open.biz !== undefined) ? ui.open.biz : !s.business;

  return '' +
    (S.demo ? demoBanner() : '') +
    '<details class="card" data-cust="biz"' + (bizOpen ? ' open' : '') + '>' +
      '<summary class="sum"><h2>Mera business</h2><span class="hint">' +
        (s.business ? esc(s.business) : 'ek baar bharein') + '</span></summary>' +
      '<div class="cust-body">' + setupFormHTML() + '</div>' +
    '</details>' +
    '<section class="kpis">' +
      '<div class="kpi"><span class="kpi-l">Mahine ki bikri</span><b class="kpi-v">' + money(s.monthlySales) +
        '</b><span class="kpi-s">Gross margin ' + fmt(gm) + '%</span></div>' +
      '<div class="kpi"><span class="kpi-l">Bazaar me phansa paisa</span><b class="kpi-v">' + money(p.outstanding) +
        '</b><span class="kpi-s">' + (p.overdue > 0 ? money(p.overdue) + ' overdue' : 'sab time par') + '</span></div>' +
      '<div class="kpi"><span class="kpi-l">Working capital chahiye</span><b class="kpi-v">' + money(w.total) +
        '</b><span class="kpi-s">' + num(s.cashMonths || 3) + ' mahine buffer ke saath</span></div>' +
      '<div class="kpi"><span class="kpi-l">Sabse sasta rate</span><b class="kpi-v">' +
        (st.best ? money(st.best.rate) : '\u2014') + '</b><span class="kpi-s">' +
        (st.best ? esc(st.best.supplier) + ' \u00B7 ' + dmy(st.best.date) : 'rate daalein') + '</span></div>' +
    '</section>' +
    '<section class="card">' +
      '<div class="card-head"><h2>Dhyan dein</h2><span class="hint">' + g.length + ' baat</span></div>' +
      (alerts || '<p class="ok">Abhi sab theek lag raha hai. Naye rate aur bills daalte rahein.</p>') +
      '<div class="btnrow"><button class="btn alt" type="button" data-action="tab" data-tab="report">Poori report dekhein</button></div>' +
    '</section>' +
    '<section class="card">' +
      '<div class="card-head"><h2>Aaj ka kaam</h2></div>' +
      '<div class="btnrow">' +
        '<button class="btn" type="button" data-action="tab" data-tab="rate">2 supplier se rate</button>' +
        '<button class="btn alt" type="button" data-action="tab" data-tab="pay">Payment reminder</button>' +
        '<button class="btn alt" type="button" data-action="tab" data-tab="deal">Deal ki taiyari</button>' +
      '</div>' +
      '<div class="steps">' +
        '<div class="step"><b>1</b><span><strong>Setup:</strong> Home ke "Mera business" me chaar number bhar dein \u2014 ' +
          'mahine ki bikri, kharid, kharcha aur credit din. Baaki sab isi se ban jaata hai.</span></div>' +
        '<div class="step"><b>2</b><span><strong>Rate:</strong> jo rate mile, ek line me daal dein (freight aur rejection % ke saath). ' +
          '"Asli" column batata hai kaun sach me sasta hai.</span></div>' +
        '<div class="step"><b>3</b><span><strong>Payment:</strong> customer aur uske bill daalein \u2014 reminder, aging aur ' +
          'paise ka return khud ban jaata hai.</span></div>' +
        '<div class="step"><b>4</b><span><strong>Mahine me ek baar Report:</strong> "kya sudharna hai" wali list hi aapka agenda hai.</span></div>' +
      '</div>' +
    '</section>' +
    (pinIsSet() ? '' : '<section class="card">' +
      '<div class="card-head"><h2>App lock</h2><span class="hint">abhi nahi laga</span></div>' +
      '<p class="muted small" style="margin:0">Ye app aapke phone par sirf aapke use ke liye hai. ' +
        '4-6 ank ka PIN laga dein taake koi aur na khole \u2014 Report tab se, 20 second ka kaam.</p>' +
      '<div class="btnrow"><button class="btn" type="button" data-action="tab" data-tab="report">Report tab kholein</button></div>' +
    '</section>');
}

function rateSignal(st) {
  if (!st.count) {
    return {
      level: 'warn',
      title: 'Pehla rate daalein',
      text: 'Aaj 2-3 suppliers se rate le kar yahan daalein. Isi record se comparison, trend aur bargaining ka number banega.'
    };
  }
  if (st.staleDays > 15) {
    return {
      level: 'warn',
      title: 'Rate purana hai (' + st.staleDays + ' din)',
      text: 'Is bazaar me rate badalta rehta hai. Naya rate lein \u2014 purane rate par order dene se margin kam ho sakta hai.'
    };
  }
  if (st.avg <= 0) {
    return { level: 'ok', title: 'Rate record ban raha hai', text: 'Rate daalte rahein, trend saaf hota jayega.' };
  }
  var diff = (num(st.latest.rate) - st.avg) / st.avg * 100;
  if (diff <= -1.5) {
    return {
      level: 'good',
      title: 'Rate average se ' + fmt(Math.abs(diff)) + '% kam',
      text: 'Aakhri rate ' + money(st.latest.rate) + ' hai, jabki average ' + money(st.avg) +
        '. Size lena abhi theek hai \u2014 2 suppliers se confirm kar lein.'
    };
  }
  if (diff >= 1.5) {
    return {
      level: 'bad',
      title: 'Rate average se ' + fmt(diff) + '% zyada',
      text: 'Rate chadh raha lagta hai. Aaj hi order ya rate lock karwayein; 2-3 din ka intezaar mehnga pad sakta hai.'
    };
  }
  return {
    level: 'ok',
    title: 'Rate stable hai',
    text: 'Aakhri rate average ke aas paas hai. Aaram se 2-3 quotes compare karein aur bade order par discount maangein.'
  };
}

function monthHistory(months) {
  if (!months || months.length < 2) {
    return '<p class="muted small" style="margin-top:10px">2-3 mahine ka record hone par yahan dikhega ki rate kis mahine sasta rehta hai.</p>';
  }
  var min = months.reduce(function (a, b) { return b.avg < a.avg ? b : a; }, months[0]);
  var max = months.reduce(function (a, b) { return b.avg > a.avg ? b : a; }, months[0]);
  var bars = months.map(function (m) {
    var w = max.avg > 0 ? Math.max(4, Math.round(m.avg / max.avg * 100)) : 4;
    return '<div class="bar"><span>' + monLabel(m.key) + '</span>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + w + '%"></div></div>' +
      '<b>' + money(m.avg) + '</b></div>';
  }).join('');
  return '<div class="hist"><div class="hist-head">Mahine ka average rate</div>' + bars +
    '<p class="small" style="margin:6px 0 0">Sabse sasta: <b>' + monLabel(min.key) + '</b> (' + money(min.avg) +
    ') \u2014 khareedne ka accha mahina.</p></div>';
}

function viewRate() {
  var st = quoteStats();
  var sig = rateSignal(st);
  var rows = S.quotes.slice().sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date));
  }).slice(0, 25).map(function (q) {
    var e = effQuote(q);
    return '<tr>' +
      '<td>' + dmy(q.date) + '</td>' +
      '<td>' + esc(q.supplier) + '</td>' +
      '<td class="num">' + money(q.rate) + '</td>' +
      '<td class="num">' + money(e.effective) + '</td>' +
      '<td>' + (q.moq ? esc(q.moq) : '\u2014') + '</td>' +
      '<td>' + (num(q.deliveryDays) ? num(q.deliveryDays) + ' din' : '\u2014') + '</td>' +
      '<td>' + (num(q.payDays) ? num(q.payDays) + ' din' : '\u2014') + '</td>' +
      '<td class="actions"><button class="link del" type="button" data-action="del-quote" data-id="' +
        esc(q.id) + '">\u00D7</button></td>' +
      '</tr>';
  }).join('');

  return '' +
    (S.demo ? demoBanner() : '') +
    '<section class="card">' +
      '<div class="card-head"><h2>Rate signal</h2><span class="hint">' + S.quotes.length + ' rate record</span></div>' +
      '<div class="signal ' + sig.level + '"><b>' + esc(sig.title) + '</b><p>' + esc(sig.text) + '</p></div>' +
      '<div class="mini">' +
        '<div><span>Sabse sasta (' + (st.poolN || 0) + ' rate me)</span><b>' +
          (st.best ? money(st.best.rate) : '\u2014') + '</b><i>' + (st.best ? esc(st.best.supplier) : '') + '</i></div>' +
        '<div><span>Average</span><b>' + (st.count ? money(st.avg) : '\u2014') + '</b><i>fark ' + fmt(st.spread) + '%</i></div>' +
        '<div><span>Aakhri rate</span><b>' + (st.latest ? money(st.latest.rate) : '\u2014') + '</b><i>' +
          (st.latest ? daysAgoText(st.staleDays) : '') + '</i></div>' +
      '</div>' +
      effNote(st) +
      monthHistory(st.months) +
    '</section>' +
    '<section class="card">' +
      '<div class="card-head"><h2>Message: ek hi baar me 2-3 parties se rate</h2></div>' +
      '<form data-form="rfq" class="grid2">' +
        field('Kitna chahiye', 'qty', S.rfq.qty, 'text', 'jaise: 2000') +
        field('Delivery kitne din me', 'days', S.rfq.days, 'number', '3') +
        field('Koi khaas baat (optional)', 'note', S.rfq.note, 'text', 'jaise: GST bill + transport') +
        '<div class="row-end"><button class="btn" type="submit">Message banayein</button></div>' +
      '</form>' +
      '<div class="msg">' + esc(rfqMessage()) + '</div>' +
      '<div class="btnrow"><button class="btn alt" type="button" data-action="copy" data-kind="rfq">Message copy karein</button></div>' +
      '<p class="muted small" style="margin:10px 0 0">Ek hi message teen parties ko bhejein. Jo rate aaye use neeche daal dein \u2014 ' +
        'comparison aur trend khud ban jaayega.</p>' +
    '</section>' +
    '<section class="card">' +
      '<div class="card-head"><h2>Naya rate daalein</h2></div>' +
      '<form data-form="quote" class="grid2">' +
        field('Date', 'date', todayISO(), 'date') +
        field('Supplier', 'supplier', '', 'text', 'jaise: Gupta Mills') +
        field('Item', 'item', S.settings.item, 'text') +
        field('Rate (\u20B9 per ' + (S.settings.unit || 'unit') + ')', 'rate', '', 'number', '0') +
        field('MOQ', 'moq', '', 'text', 'jaise: 500 kg') +
        field('Delivery (din)', 'deliveryDays', '', 'number', '0') +
        field('Payment terms (din)', 'payDays', '', 'number', '0') +
        field('Freight (\u20B9 per ' + (S.settings.unit || 'unit') + ')', 'freight', '', 'number', '0') +
        field('Rejection / wastage (%)', 'rejection', '', 'number', '0') +
        '<div class="row-end"><button class="btn" type="submit">Rate add karein</button></div>' +
      '</form>' +
    '</section>' +
    '<section class="card">' +
      '<div class="card-head"><h2>Rate sheet</h2><span class="hint">aakhri 25</span></div>' +
      (rows
        ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Supplier</th><th class="num">Rate</th>' +
          '<th class="num">Asli</th><th>MOQ</th><th>Delivery</th><th>Payment</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<p class="muted">Abhi koi rate nahi. Upar se ek rate daal kar dekhein.</p>') +
      '<p class="muted small" style="margin:10px 0 0">Note: ye app bazaar ka live rate nahi laati \u2014 ' +
        'aapke daale rate ka record rakhti hai aur unse faisla batati hai.</p>' +
    '</section>';
}

function toneBtn(id, tone, label, current) {
  return '<button class="tone' + (current === tone ? ' active' : '') + '" type="button" ' +
    'data-action="tone" data-id="' + esc(id) + '" data-tone="' + tone + '">' + label + '</button>';
}

function editCustForm(c) {
  return '<form data-form="cust-edit" class="grid2">' +
    '<input type="hidden" name="id" value="' + esc(c.id) + '">' +
    field('Naam', 'name', c.name, 'text') +
    field('Phone (WhatsApp)', 'phone', c.phone, 'tel') +
    field('Credit days', 'creditDays', c.creditDays, 'number', '60') +
    field('Credit limit \u20B9', 'creditLimit', c.creditLimit, 'number', '0') +
    '<div class="row-end">' +
      '<button class="btn" type="submit">Save</button>' +
      '<button class="btn alt" type="button" data-action="cancel-edit">Cancel</button>' +
    '</div></form>';
}

function custCard(c) {
  var due = custDue(c);
  var outAmt = due.reduce(function (s, b) { return s + num(b.amount); }, 0);
  var overAmt = due.reduce(function (s, b) { return s + (b.overdueDays > 0 ? num(b.amount) : 0); }, 0);
  var limit = num(c.creditLimit);
  var util = limit > 0 ? Math.min(100, outAmt / limit * 100) : 0;
  var tone = S.tones[c.id] || 'normal';
  var editing = (ui.editCustomer === c.id);

  var rows = c.bills.slice().sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date));
  }).map(function (b) {
    var dueIso = addDays(b.date, c.creditDays);
    var late = b.paidOn ? 0 : daysBetween(dueIso, todayISO());
    var status;
    if (b.paidOn) {
      status = '<span class="tag good">paid ' + dmy(b.paidOn) + '</span>';
    } else if (late > 0) {
      status = '<span class="tag bad">' + late + ' din late</span>';
    } else {
      status = '<span class="tag">' + Math.max(0, -late) + ' din baaki</span>';
    }
    return '<tr>' +
      '<td>' + dmy(b.date) + '<div class="small muted">due ' + dmy(dueIso) + '</div></td>' +
      '<td class="num">' + money(b.amount) +
        (b.note ? '<div class="small muted">' + esc(b.note) + '</div>' : '') + '</td>' +
      '<td>' + status + '</td>' +
      '<td class="actions">' +
        (b.paidOn ? '' : '<button class="link" type="button" data-action="mark-paid" data-id="' + esc(c.id) +
          '" data-bill="' + esc(b.id) + '">Paid</button>') +
        '<button class="link del" type="button" data-action="del-bill" data-id="' + esc(c.id) +
          '" data-bill="' + esc(b.id) + '">\u00D7</button>' +
      '</td></tr>';
  }).join('');

  var msg = reminderMessage(c, tone);
  var wa = waLink(c.phone, msg);

  return '<details class="card cust" data-cust="' + esc(c.id) + '"' +
    (ui.open[c.id] ? ' open' : '') + '>' +
    '<summary>' +
      '<div class="sum-l"><h2>' + esc(c.name) + '</h2>' +
        '<div class="small muted">' + (num(c.creditDays) ? num(c.creditDays) + ' din credit' : 'credit days set nahi') +
        (c.phone ? ' \u00B7 ' + esc(c.phone) : '') + '</div></div>' +
      '<div class="sum-r"><b class="' + (outAmt ? '' : 'ok') + '">' + money(outAmt) + '</b>' +
        '<div class="small ' + (overAmt ? 'bad' : 'muted') + '">' +
        (overAmt ? money(overAmt) + ' overdue' : 'time par') + '</div></div>' +
    '</summary>' +
    '<div class="cust-body">' +
      (limit > 0
        ? '<div class="limit"><div class="limit-top"><span class="small muted">Credit limit ' + money(limit) +
          '</span><span class="small muted">' + fmt(util, 0) + '% use</span></div>' +
          '<div class="bar-track"><div class="bar-fill' + (util > 90 ? ' red' : '') +
          '" style="width:' + Math.round(util) + '%"></div></div></div>'
        : '') +
      (editing
        ? editCustForm(c)
        : '<div class="btnrow"><button class="btn tiny alt" type="button" data-action="edit-customer" data-id="' +
          esc(c.id) + '">Details badlein</button>' +
          '<button class="btn tiny danger" type="button" data-action="del-customer" data-id="' +
          esc(c.id) + '">Customer hataayein</button></div>') +
      '<form data-form="bill" class="billform">' +
        '<input type="hidden" name="customerId" value="' + esc(c.id) + '">' +
        '<div class="billrow">' +
          '<label class="fld"><span>Bill date</span><input type="date" name="date" value="' + todayISO() + '"></label>' +
          '<label class="fld"><span>Amount \u20B9</span><input type="number" name="amount" inputmode="decimal" step="any" placeholder="0"></label>' +
          '<label class="fld"><span>Bill no. / note</span><input type="text" name="note" placeholder="optional"></label>' +
          '<button class="btn" type="submit">Bill add</button>' +
        '</div>' +
      '</form>' +
      (rows
        ? '<div class="table-wrap"><table><thead><tr><th>Bill</th><th class="num">Amount</th>' +
          '<th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<p class="muted small">Abhi koi bill nahi. Upar se bill daalein.</p>') +
      '<div class="tonebar">' +
        toneBtn(c.id, 'soft', 'Naram', tone) +
        toneBtn(c.id, 'normal', 'Normal', tone) +
        toneBtn(c.id, 'firm', 'Sakht', tone) +
      '</div>' +
      '<div class="msg">' + esc(msg) + '</div>' +
      '<div class="btnrow">' +
        '<button class="btn" type="button" data-action="copy" data-kind="reminder" data-id="' +
          esc(c.id) + '">Reminder copy karein</button>' +
        (wa ? '<a class="btn alt" href="' + esc(wa) + '" target="_blank" rel="noopener">WhatsApp par bhejein</a>' : '') +
      '</div>' +
    '</div>' +
  '</details>';
}

function viewPay() {
  var p = paymentStats();
  var e = S.epd;
  var discAmt = num(e.amount) * num(e.disc) / 100;
  var daysSaved = num(e.daysSaved);
  var annual = daysSaved > 0 ? num(e.disc) * 365 / daysSaved : 0;
  var borrow = num(e.amount) * num(S.settings.costOfFunds) / 100 * daysSaved / 365;
  var cheaper = discAmt > borrow;

  var cards = S.customers.map(custCard).join('');

  return '' +
    (S.demo ? demoBanner() : '') +
    '<section class="kpis">' +
      '<div class="kpi"><span class="kpi-l">Total baaki</span><b class="kpi-v">' + money(p.outstanding) +
        '</b><span class="kpi-s">' + p.unpaidCount + ' bill</span></div>' +
      '<div class="kpi"><span class="kpi-l">Overdue</span><b class="kpi-v' + (p.overdue ? ' bad' : '') + '">' +
        money(p.overdue) + '</b><span class="kpi-s">' + (p.oldest ? p.oldest + ' din sabse purana' : 'koi nahi') + '</span></div>' +
      '<div class="kpi"><span class="kpi-l">Asli collection</span><b class="kpi-v">' +
        (p.avgPaidDays ? Math.round(p.avgPaidDays) + ' din' : '\u2014') + '</b><span class="kpi-s">terms ' +
        num(S.settings.creditGiven) + ' din</span></div>' +
      '<div class="kpi"><span class="kpi-l">Customer</span><b class="kpi-v">' + S.customers.length +
        '</b><span class="kpi-s">' + (S.customers.length ? 'reminder ready' : 'pehla customer daalein') + '</span></div>' +
    '</section>' +
    rocCard() +
    '<section class="card">' +
      '<div class="card-head"><h2>Early payment discount ka hisaab</h2></div>' +
      '<form data-form="epd" class="grid2">' +
        field('Bill amount \u20B9', 'amount', e.amount, 'number', '0') +
        field('Discount (%)', 'disc', e.disc, 'number', '2') +
        field('Kitne din pehle payment', 'daysSaved', e.daysSaved, 'number', '45') +
        '<div class="row-end"><button class="btn" type="submit">Hisaab dekhein</button></div>' +
      '</form>' +
      '<div class="msg">' +
        'Discount: ' + money(discAmt) + ' (' + money(e.amount) + ' par ' + fmt(e.disc) + '%)\n' +
        'Saalana barabar: ' + fmt(annual) + '%\n' +
        'Itne din ke liye bank se udhaar lene ki lagat: ' + money(borrow) + '\n\n' +
        (cheaper
          ? 'Matlab: customer ko discount dena aapke liye sasta hai \u2014 paisa jaldi aata hai aur loan nahi lena padta.'
          : 'Matlab: discount dena aapke loan se mehnga padta hai. Sirf us customer ko dein jo bina discount payment hi na karta ho; warna TReDS/OD sasta hai.') +
      '</div>' +
      '<p class="muted small" style="margin:8px 0 0">Customer ke liye bhi ye laabh hai: ' + fmt(annual) +
        '% saalana bachat, jo aksar uske loan se kam padti hai \u2014 isliye offer chal jaata hai.</p>' +
    '</section>' +
    '<section class="card">' +
      '<div class="card-head"><h2>Naya customer</h2></div>' +
      '<form data-form="customer" class="grid2">' +
        field('Naam', 'name', '', 'text', 'jaise: Verma Garments') +
        field('Phone (WhatsApp)', 'phone', '', 'tel', '10 digit') +
        field('Credit days', 'creditDays', S.settings.creditGiven, 'number', '60') +
        field('Credit limit \u20B9', 'creditLimit', '', 'number', '0') +
        '<div class="row-end"><button class="btn" type="submit">Customer add karein</button></div>' +
      '</form>' +
    '</section>' +
    (cards || '<section class="card"><p class="muted">Abhi koi customer nahi. Upar se add karein \u2014 bill daalte hi ' +
      'reminder aur aging khud ban jaayega.</p></section>');
}

function viewCap() {
  var s = S.settings;
  var w = wcCalc();
  var cost = num(s.costOfFunds);
  var ccc = num(s.stockDays) + num(s.creditGiven) - num(s.creditReceived);
  var dailySales = num(s.monthlySales) / 30;
  var daysList = [15, 30, 45, 60, 90];
  var creditRows = daysList.map(function (d) {
    var perLakh = 100000 * cost / 100 * d / 365;
    var perTenLakh = 1000000 * cost / 100 * d / 365;
    return '<tr><td>' + d + ' din</td><td class="num">' + money(perLakh) + '</td>' +
      '<td class="num">' + money(perTenLakh) + '</td></tr>';
  }).join('');

  var t = S.tre;
  var bAmt = num(t.amount), bRate = num(t.rate), bDays = num(t.days);
  var bCost = bAmt * bRate / 100 * bDays / 365;
  var perLakhBill = 100000 * bRate / 100 * bDays / 365;

  return '' +
    (S.demo ? demoBanner() : '') +
    '<section class="card">' +
      '<div class="card-head"><h2>Working capital ka hisaab</h2></div>' +
      '<form data-form="settings" class="grid2">' +
        field('Mahine ki bikri \u20B9', 'monthlySales', s.monthlySales, 'number', '0') +
        field('Mahine ki kharid \u20B9', 'monthlyPurchase', s.monthlyPurchase, 'number', '0') +
        field('Mahine ka kharcha \u20B9', 'monthlyExpenses', s.monthlyExpenses, 'number', '0') +
        field('Customer ko credit (din)', 'creditGiven', s.creditGiven, 'number', '60') +
        field('Supplier se credit (din)', 'creditReceived', s.creditReceived, 'number', '0') +
        field('Stock kitne din ka', 'stockDays', s.stockDays, 'number', '10') +
        field('Loan / OD ka rate (% saalana)', 'costOfFunds', s.costOfFunds, 'number', '12') +
        field('Buffer kitne mahine ka', 'cashMonths', s.cashMonths, 'number', '3') +
        '<div class="row-end"><button class="btn" type="submit">Hisaab update karein</button></div>' +
      '</form>' +
      '<div class="table-wrap"><table><thead><tr><th>Kahaan paisa phansa hai</th><th class="num">Amount</th></tr></thead><tbody>' +
        '<tr><td>Customer se lena hai<br><span class="small muted">(' + num(s.monthlySales) + ' \u00F7 30) \u00D7 ' +
          num(s.creditGiven) + ' din</span></td><td class="num">' + money(w.recv) + '</td></tr>' +
        '<tr><td>Stock me pada maal<br><span class="small muted">' + num(s.stockDays) + ' din ka stock</span></td>' +
          '<td class="num">' + money(w.inv) + '</td></tr>' +
        '<tr><td>Supplier ka credit (kam)<br><span class="small muted">' + num(s.creditReceived) + ' din</span></td>' +
          '<td class="num">\u2212 ' + money(w.pay) + '</td></tr>' +
        '<tr><td><b>Net phansa paisa</b></td><td class="num"><b>' + money(w.net) + '</b></td></tr>' +
        '<tr><td>' + num(s.cashMonths || 3) + ' mahine ka kharcha (buffer)</td><td class="num">' + money(w.buffer) + '</td></tr>' +
        '<tr><td><b>Total cash chahiye</b></td><td class="num"><b>' + money(w.total) + '</b></td></tr>' +
      '</tbody></table></div>' +
      '<p class="muted small" style="margin:10px 0 0">' + num(s.creditGiven) + ' din credit dene par ' +
        money(w.recv) + ' aapka customer ke paas hota hai. Isi liye 3 mahine ka working capital pehle se taiyar rakhein.</p>' +
    '</section>' +
    '<section class="card">' +
      '<div class="card-head"><h2>Cash conversion cycle</h2><span class="hint">' + Math.round(ccc) + ' din</span></div>' +
      '<div class="mini">' +
        '<div><span>Stock</span><b>' + num(s.stockDays) + ' din</b><i>jod</i></div>' +
        '<div><span>Customer credit</span><b>' + num(s.creditGiven) + ' din</b><i>jod</i></div>' +
        '<div><span>Supplier credit</span><b>' + num(s.creditReceived) + ' din</b><i>ghatao</i></div>' +
      '</div>' +
      '<p class="small" style="margin:10px 0 0"><b>Cycle: ' + Math.round(ccc) + ' din.</b> Ek din ka matlab ' +
        money(dailySales) + '. Cycle 10 din kam karein to ' + money(dailySales * 10) +
        ' paisa free hota hai \u2014 yaani ' + money(dailySales * 10 * cost / 100) + ' saalana byaaj bachta hai.</p>' +
      '<p class="muted small" style="margin:6px 0 0">Ye ek number poore business ki working capital batata hai. ' +
        'Har saal 10 din kam karna ek realistic target hai \u2014 stock se ya credit terms se.</p>' +
    '</section>' +
    '<section class="card">' +
      '<div class="card-head"><h2>Rate ya credit \u2014 kaun bada faayda</h2></div>' +
      '<form data-form="rvc" class="grid2">' +
        field('Rate ka fark (%)', 'diff', S.rvc.diff, 'number', '0.5') +
        field('Supplier se credit (din)', 'days', S.rvc.days, 'number', '30') +
        '<div class="row-end"><button class="btn" type="submit">Compare karein</button></div>' +
      '</form>' +
      '<div class="msg">' + esc(rvcText()) + '</div>' +
    '</section>' +
    '<section class="card">' +
      '<div class="card-head"><h2>Credit dene ki asli keemat</h2><span class="hint">' + fmt(cost) + '% saalana</span></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Credit period</th><th class="num">\u20B91 lakh</th>' +
        '<th class="num">\u20B910 lakh</th></tr></thead><tbody>' + creditRows + '</tbody></table></div>' +
      '<p class="muted small" style="margin:10px 0 0">Har bill jo ' + num(s.creditGiven) + ' din baad aata hai, ' +
        'usse itna byaaj barabar ka nuksan hota hai. Isi liye early-payment discount aur credit limit dono zaroori hain.</p>' +
    '</section>' +
    '<section class="card">' +
      '<div class="card-head"><h2>Bill discounting / TReDS</h2></div>' +
      '<p class="muted small" style="margin:0 0 10px">Customer ko ' + num(s.creditGiven) +
        ' din ka credit milta rahe, aur aapko paisa turant \u2014 bill discounting se. TReDS platforms: RXIL, M1xchange, Invoicemart. ' +
        'MSME (Udyam) hain to ye aasan hota hai; registration MSME portal se karein.</p>' +
      '<form data-form="tre" class="grid2">' +
        field('Bill amount \u20B9', 'amount', t.amount, 'number', '0') +
        field('Discounting rate (% saalana)', 'rate', t.rate, 'number', '11') +
        field('Bill kitne din baad due hai', 'days', t.days, 'number', '60') +
        '<div class="row-end"><button class="btn" type="submit">Lagat dekhein</button></div>' +
      '</form>' +
      '<div class="msg">' +
        'Bill: ' + money(bAmt) + ', due ' + bDays + ' din baad\n' +
        'Discounting ki lagat: ' + money(bCost) + ' (' + money(perLakhBill) + ' per \u20B91 lakh)\n' +
        'Turant haath me: ' + money(bAmt - bCost) + '\n\n' +
        'Fayda: customer ki 60 din ki credit nahi tooti, aur aapka paisa 3 mahine ke liye nahi phansta.' +
      '</div>' +
      '<p class="muted small" style="margin:10px 0 0">Ek aur niyam: MSME ko 45 din ke andar payment na karne par customer ke liye ' +
        'tax deduction (43B(h)) ka fayda late payment tak ruk jaata hai. Apne CA se confirm karke customer se baat me use karein.</p>' +
    '</section>';
}

function viewDeal() {
  var d = S.deal;
  var unit = S.settings.unit || 'unit';
  var target = num(d.target);
  var floor = num(d.walkaway);
  var batna = num(d.batna);
  var margin = num(d.margin);
  var index = target - margin;
  var room = target > 0 ? (target - floor) / target * 100 : 0;
  var batnaNote;
  if (!floor || !batna) {
    batnaNote = 'Walk-away aur BATNA bharein \u2014 isse pata chalega ki customer ke saath rehna faayda hai ya doosre par jaana.';
  } else if (batna >= floor) {
    batnaNote = 'Doosre customer (BATNA) se ' + money(batna) + ' mil raha hai, jo aapke walk-away ' + money(floor) +
      ' se behtar hai. Isliye is customer ke saath rate ' + money(Math.max(batna, floor + 1)) + ' ke neeche mat jaayein.';
  } else {
    batnaNote = 'BATNA ' + money(batna) + ' hai, jo walk-away ' + money(floor) + ' se kam hai. Matlab yahan ' +
      money(floor) + ' tak rehna bhi theek hai.';
  }

  return '' +
    (S.demo ? demoBanner() : '') +
    '<section class="card">' +
      '<div class="card-head"><h2>Deal ki taiyari</h2></div>' +
      '<p class="muted small" style="margin:0 0 10px">Har order par bargain karne se bachne ke liye mahine ka rate formula ' +
        'aur blanket order. Numbers bharein, draft neeche ban jaayega.</p>' +
      '<form data-form="deal" class="grid2">' +
        field('Mahine ki quantity (' + unit + ')', 'qty', d.qty, 'text', 'jaise: 2000') +
        field('Kitne mahine ka contract', 'months', d.months, 'number', '3') +
        field('Target rate (\u20B9 per ' + unit + ')', 'target', d.target, 'number', '0') +
        field('Walk-away / minimum (\u20B9 per ' + unit + ')', 'walkaway', d.walkaway, 'number', '0') +
        field('BATNA: doosre customer se best rate', 'batna', d.batna, 'number', '0') +
        field('Fixed margin (\u20B9 per ' + unit + ')', 'margin', d.margin, 'number', '0') +
        field('Mahine me kitni delivery (batches)', 'batches', d.batches, 'number', '4') +
        '<div class="row-end"><button class="btn" type="submit">Draft banayein</button></div>' +
      '</form>' +
    '</section>' +
    '<section class="card">' +
      '<div class="card-head"><h2>Rate formula</h2></div>' +
      '<div class="formula">Rate = Bazaar index + ' + money(margin) + ' per ' + unit + '</div>' +
      '<p class="muted small" style="margin:10px 0 0">Index aapke rate sheet ka aaj ka rate hai. ' +
        (target > 0 ? 'Aaj ka index ' + money(index) + ' maan kar target ' + money(target) + ' banta hai.' : '') +
        ' Customer ko lagta hai rate market ke saath chal raha hai, aur aapka margin har order par bachta hai.</p>' +
    '</section>' +
    '<section class="card">' +
      '<div class="card-head"><h2>Agreement me ye clauses daalein</h2><span class="hint">yahi margin bachate hain</span></div>' +
      '<p class="muted small" style="margin:0 0 4px">Bargain se zyada paisa in lines me bachta hai \u2014 ' +
        'rate ka jhagda band, purana stock wapas nahi, payment date saaf.</p>' +
      clauseList().map(function (x, i) {
        return '<div class="obj"><b class="small">' + (i + 1) + '. ' + esc(x.t) + '</b><p>' + esc(x.d) + '</p></div>';
      }).join('') +
    '</section>' +
    '<section class="card">' +
      '<div class="card-head"><h2>Aapki private taiyari</h2><span class="hint">customer ko na dikhayein</span></div>' +
      '<div class="mini">' +
        '<div><span>Target rate</span><b>' + money(target) + '</b><i>yahi maangein</i></div>' +
        '<div><span>Neeche ki hadd</span><b>' + money(floor) + '</b><i>' + fmt(room) + '% ki gunjaish</i></div>' +
        '<div><span>BATNA</span><b>' + money(batna) + '</b><i>doosra customer</i></div>' +
      '</div>' +
      '<p class="muted small" style="margin:10px 0 0">' + batnaNote + '</p>' +
    '</section>' +
    '<section class="card">' +
      '<div class="card-head"><h2>Customer ko bhejne wala draft</h2></div>' +
      '<div class="msg">' + esc(dealSummary()) + '</div>' +
      '<div class="btnrow"><button class="btn alt" type="button" data-action="copy" data-kind="deal">Draft copy karein</button></div>' +
    '</section>' +
    '<section class="card">' +
      '<div class="card-head"><h2>Bargain ke jawab</h2><span class="hint">tap karke kholein</span></div>' +
      objections().map(function (o) {
        return '<details class="obj"><summary>' + esc(o.q) + '</summary><p>' + esc(o.a) + '</p></details>';
      }).join('') +
      '<p class="muted small" style="margin:12px 0 0">Faisla: rate par nahi, teen cheezon par baat karein \u2014 final rate ' +
        '(freight + GST ke baad), delivery, aur payment terms. Jo inme se ek bhi nahi de raha, wo sirf sasta lag raha hai.</p>' +
    '</section>';
}

function roadmapItems() {
  return [
    { t: 'Har order se pehle 2-3 rate', d: 'Rate tab ka ek message 3 parties ko. 10 minute ka kaam, mahine ke hazaaron bachaata hai.' },
    { t: 'Blanket order / monthly agreement', d: 'Deal tab ka draft. Customer ko pakka maal aur rate, aapko pakka order aur plan.' },
    { t: 'Early payment offer (2% / 15 din)', d: 'Payment tab ka message. Paisa jaldi, customer ko bhi bachat.' },
    { t: 'Customer wise credit limit + likhit terms', d: 'PO ya agreement par credit days likhein; har customer ka limit fix karein.' },
    { t: 'Quality file', d: 'Har batch ka test report aur sample approval. Supply guarantee ka sabse bada saboot.' },
    { t: 'Buffer stock', d: 'Sabse sasta supplier ke delivery days + 7 din ka stock rakhein.' },
    { t: 'TReDS / bill discounting', d: 'RXIL, M1xchange ya Invoicemart par MSME Udyam ke saath register karein.' },
    { t: 'MSME 45-din niyam', d: 'CA se confirm karein; customer se credit ki baat karte waqt ye kaam aata hai.' },
    { t: 'Mahine ka review', d: 'Har mahine 1 tareekh: rate trend, overdue, margin aur top customer \u2014 Report tab se.' },
    { t: 'Customer grading', d: 'A = time par payment, B = thoda late, C = baar-baar late. Rate aur limit grade se banayein.' }
  ];
}

function viewReport() {
  var g = gapsSorted();
  var high = g.filter(function (x) { return x.level === 'high'; }).length;
  var p = paymentStats();

  return '' +
    (S.demo ? demoBanner() : '') +
    '<section class="card">' +
      '<div class="card-head"><h2>Report</h2><span class="hint">' + dmy(todayISO()) + '</span></div>' +
      '<p class="muted small" style="margin:0 0 10px">Ye report aapke daale numbers se banti hai \u2014 ' +
        high + ' badi baat, ' + (g.length - high) + ' chhoti.</p>' +
      (g.length ? g.map(gapCard).join('') : '<p class="ok">Abhi koi badi kami nahi dikh rahi. Data daalte rahein.</p>') +
      '<div class="btnrow">' +
        '<button class="btn" type="button" data-action="copy" data-kind="report">Report copy karein</button>' +
      '</div>' +
    '</section>' +
    '<section class="card">' +
      '<div class="card-head"><h2>Business me kya add karein</h2></div>' +
      roadmapItems().map(function (r, i) {
        return '<div class="obj"><b class="small">' + (i + 1) + '. ' + esc(r.t) + '</b>' +
          '<p>' + esc(r.d) + '</p></div>';
      }).join('') +
    '</section>' +
    '<section class="card">' +
      '<div class="card-head"><h2>App lock (PIN)</h2><span class="hint">' + (pinIsSet() ? 'laga hua hai' : 'nahi laga') + '</span></div>' +
      '<p class="muted small" style="margin:0 0 10px">Phone par ye app sirf aap kholein \u2014 4 se 6 ank ka PIN. ' +
        'Ye screen lock hai; phone ki lock screen ki jagah nahi.</p>' +
      '<form data-form="pin-set" class="grid2">' +
        field('Naya PIN (4-6 ank)', 'pin', '', 'password', '****') +
        '<div class="row-end">' +
          '<button class="btn" type="submit">PIN lagayein</button>' +
          (pinIsSet() ? '<button class="btn danger" type="button" data-action="pin-remove">PIN hataayein</button>' : '') +
        '</div>' +
      '</form>' +
    '</section>' +
    '<section class="card">' +
      '<div class="card-head"><h2>Backup / data</h2></div>' +
      '<p class="muted small" style="margin:0 0 10px">Data sirf is phone ke browser me rehta hai. Mahine me ek baar ' +
        'backup copy karke apne aap ko WhatsApp par bhej lein.</p>' +
      '<div class="btnrow">' +
        '<button class="btn" type="button" data-action="copy" data-kind="backup">Backup copy karein</button>' +
        '<button class="btn alt" type="button" data-action="export">File download</button>' +
        '<button class="btn alt" type="button" data-action="demo">Sample data</button>' +
        '<button class="btn danger" type="button" data-action="reset">Sab khaali karein</button>' +
      '</div>' +
      '<form data-form="import" style="margin-top:12px">' +
        '<label class="fld"><span>Backup paste karke restore karein</span>' +
        '<textarea name="json" placeholder="Yahan backup ka text paste karein"></textarea></label>' +
        '<div class="row-end" style="margin-top:8px"><button class="btn" type="submit">Restore</button></div>' +
      '</form>' +
      '<p class="muted small" style="margin:10px 0 0">Total baaki: ' + money(p.outstanding) +
        ' \u00B7 Bill: ' + p.unpaidCount + ' \u00B7 Customer: ' + S.customers.length +
        ' \u00B7 Rate record: ' + S.quotes.length + '</p>' +
    '</section>';
}

/* ---------------- events ---------------- */

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
  if (!text) { toast('Copy karne ke liye kuch nahi'); return; }
  var ok = function () { toast('Copy ho gaya'); };
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
      toast('Copy nahi hua \u2014 select karke copy karein');
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(ok).catch(fallback);
  } else {
    fallback();
  }
}

function setTab(name) {
  tab = name;
  ui.editCustomer = null;
  render();
}

function render() {
  var nav = document.getElementById('tabs');
  if (ui.locked) {
    if (nav) { nav.style.display = 'none'; }
    document.getElementById('view').innerHTML = viewLock();
    var subLock = document.getElementById('brandSub');
    if (subLock) { subLock.textContent = 'PIN se khulega'; }
    window.scrollTo(0, 0);
    return;
  }
  if (nav) { nav.style.display = ''; }
  var tabs = document.querySelectorAll('#tabs .tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === tab);
  }
  var views = {
    home: viewHome, rate: viewRate, pay: viewPay,
    cap: viewCap, deal: viewDeal, report: viewReport
  };
  var fn = views[tab] || viewHome;
  document.getElementById('view').innerHTML = fn();
  var sub = document.getElementById('brandSub');
  if (sub) {
    sub.textContent = S.settings.business
      ? S.settings.business
      : 'Rate \u00B7 Payment \u00B7 Deal';
  }
  window.scrollTo(0, 0);
}

function onViewClick(e) {
  var det = e.target.closest('details[data-cust]');
  if (det) {
    var sum = e.target.closest('summary');
    if (sum && det.contains(sum)) {
      ui.open[det.getAttribute('data-cust')] = !det.hasAttribute('open');
    }
  }

  var btn = e.target.closest('[data-action]');
  if (!btn) { return; }
  var a = btn.getAttribute('data-action');
  var id = btn.getAttribute('data-id');
  var billId = btn.getAttribute('data-bill');

  if (a === 'tab') { setTab(btn.getAttribute('data-tab')); return; }

  if (a === 'copy') {
    copyText(payloadFor(btn.getAttribute('data-kind'), id));
    return;
  }

  if (a === 'del-quote') {
    if (!confirm('Ye rate record hata dein?')) { return; }
    S.quotes = S.quotes.filter(function (q) { return q.id !== id; });
    save(); render(); toast('Rate hata diya');
    return;
  }

  if (a === 'mark-paid') {
    ui.open[id] = true;
    S.customers.forEach(function (c) {
      if (c.id !== id) { return; }
      c.bills.forEach(function (b) {
        if (b.id === billId) { b.paidOn = todayISO(); }
      });
    });
    save(); render(); toast('Bill paid mark ho gaya');
    return;
  }

  if (a === 'del-bill') {
    if (!confirm('Ye bill hata dein?')) { return; }
    ui.open[id] = true;
    S.customers.forEach(function (c) {
      if (c.id !== id) { return; }
      c.bills = c.bills.filter(function (b) { return b.id !== billId; });
    });
    save(); render(); toast('Bill hata diya');
    return;
  }

  if (a === 'del-customer') {
    var c = S.customers.filter(function (x) { return x.id === id; })[0];
    if (!c) { return; }
    if (!confirm(c.name + ' aur uske ' + c.bills.length + ' bill hata dein?')) { return; }
    S.customers = S.customers.filter(function (x) { return x.id !== id; });
    delete S.tones[id];
    save(); render(); toast('Customer hata diya');
    return;
  }

  if (a === 'edit-customer') {
    ui.editCustomer = id;
    ui.open[id] = true;
    render();
    return;
  }

  if (a === 'cancel-edit') {
    ui.editCustomer = null;
    render();
    return;
  }

  if (a === 'tone') {
    ui.open[id] = true;
    S.tones[id] = btn.getAttribute('data-tone') || 'normal';
    save(); render();
    return;
  }

  if (a === 'pin-remove') {
    if (!confirm('PIN hata dein? Phir ye app koi bhi khol sakta hai.')) { return; }
    pinClear();
    save(); render(); toast('PIN hat gaya');
    return;
  }

  if (a === 'pin-forgot') {
    if (!confirm('PIN hata kar app ko khaali karna hai? Ismein saara data mit jaayega.')) { return; }
    if (!confirm('Pakka? Backup ho to pehle restore kar lein \u2014 data wapas nahi aayega.')) { return; }
    pinClear();
    S = blankState();
    save();
    ui.locked = false;
    render();
    toast('PIN hata diya \u2014 app khaali hai');
    return;
  }

  if (a === 'demo') {
    if (!confirm('Sample data load karein? Maujooda data hat jaayega.')) { return; }
    S = demoState();
    save(); render(); toast('Sample data load ho gaya');
    return;
  }

  if (a === 'demo-clear') {
    if (!confirm('Sample data hata kar khaali shuru karein?')) { return; }
    S = blankState();
    save(); render(); toast('Sample hata diya');
    return;
  }

  if (a === 'reset') {
    if (!confirm('Sab data khaali ho jaayega. Pehle backup copy kar lein. Aage badhein?')) { return; }
    S = blankState();
    save(); render(); toast('Sab khaali kar diya');
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
      toast('Backup file ban gayi');
    } catch (err) {
      toast('Download nahi hua \u2014 Copy backup use karein');
    }
    return;
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
    ['business', 'person', 'item', 'unit'].forEach(function (k) {
      if (form.elements[k]) { st[k] = fval(form, k); }
    });
    ['monthlySales', 'monthlyPurchase', 'monthlyExpenses', 'creditGiven', 'creditReceived',
      'stockDays', 'cashMonths', 'costOfFunds', 'earlyDiscount', 'earlyDays'].forEach(function (k) {
      if (form.elements[k]) { st[k] = fnum(form, k); }
    });
    ui.open.biz = true;
    save(); render(); toast('Save ho gaya');
    return;
  }

  if (kind === 'quote') {
    var supplier = fval(form, 'supplier');
    var rate = fnum(form, 'rate');
    if (!supplier || rate <= 0) { toast('Supplier ka naam aur rate bharein'); return; }
    S.quotes.push({
      id: uid(),
      date: fval(form, 'date') || t,
      supplier: supplier,
      item: fval(form, 'item') || S.settings.item,
      rate: rate,
      freight: fnum(form, 'freight'),
      rejection: fnum(form, 'rejection'),
      moq: fval(form, 'moq'),
      deliveryDays: fnum(form, 'deliveryDays'),
      payDays: fnum(form, 'payDays')
    });
    save(); render(); toast('Rate add ho gaya');
    return;
  }

  if (kind === 'rfq') {
    S.rfq = { qty: fval(form, 'qty'), days: fnum(form, 'days') || 3, note: fval(form, 'note') };
    save(); render(); toast('Message taiyar hai');
    return;
  }

  if (kind === 'customer') {
    var name = fval(form, 'name');
    if (!name) { toast('Customer ka naam bharein'); return; }
    S.customers.push({
      id: uid(),
      name: name,
      phone: fval(form, 'phone'),
      creditDays: fnum(form, 'creditDays'),
      creditLimit: fnum(form, 'creditLimit'),
      bills: []
    });
    save(); render(); toast('Customer add ho gaya');
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
    ui.open[cid] = true;
    ui.editCustomer = null;
    save(); render(); toast('Details save ho gayi');
    return;
  }

  if (kind === 'bill') {
    var custId = fval(form, 'customerId');
    var target = S.customers.filter(function (c) { return c.id === custId; })[0];
    if (!target) { toast('Customer nahi mila'); return; }
    var amount = fnum(form, 'amount');
    if (amount <= 0) { toast('Bill ka amount bharein'); return; }
    target.bills.push({
      id: uid(),
      date: fval(form, 'date') || t,
      amount: amount,
      note: fval(form, 'note'),
      paidOn: ''
    });
    ui.open[custId] = true;
    save(); render(); toast('Bill add ho gaya');
    return;
  }

  if (kind === 'epd') {
    S.epd = { amount: fnum(form, 'amount'), disc: fnum(form, 'disc'), daysSaved: fnum(form, 'daysSaved') };
    save(); render(); toast('Hisaab taiyar');
    return;
  }

  if (kind === 'tre') {
    S.tre = { amount: fnum(form, 'amount'), rate: fnum(form, 'rate'), days: fnum(form, 'days') };
    save(); render(); toast('Lagat taiyar');
    return;
  }

  if (kind === 'deal') {
    S.deal = {
      qty: fval(form, 'qty'),
      months: fnum(form, 'months'),
      target: fval(form, 'target'),
      walkaway: fval(form, 'walkaway'),
      batna: fval(form, 'batna'),
      margin: fval(form, 'margin'),
      batches: fnum(form, 'batches')
    };
    save(); render(); toast('Draft taiyar');
    return;
  }

  if (kind === 'unlock') {
    var pinTry = fval(form, 'pin');
    if (pinCheck(pinTry)) {
      ui.locked = false;
      render();
    } else {
      toast('PIN galat hai');
      if (form.elements['pin']) {
        form.elements['pin'].value = '';
        form.elements['pin'].focus();
      }
    }
    return;
  }

  if (kind === 'pin-set') {
    var newPin = fval(form, 'pin');
    if (!/^[0-9]{4,6}$/.test(newPin)) { toast('4 se 6 ank ka PIN daalein'); return; }
    pinSave(newPin);
    ui.locked = false;
    save(); render(); toast('PIN lag gaya');
    return;
  }

  if (kind === 'rvc') {
    S.rvc = { diff: fnum(form, 'diff'), days: fnum(form, 'days') };
    save(); render(); toast('Compare taiyar');
    return;
  }

  if (kind === 'import') {
    var raw = fval(form, 'json');
    if (!raw) { toast('Backup ka text paste karein'); return; }
    try {
      S = normalize(JSON.parse(raw));
      save(); render(); toast('Data restore ho gaya');
    } catch (err) {
      toast('Backup galat lag raha hai');
    }
    return;
  }
}

/* ---------------- demo data ---------------- */

function demoState() {
  var s = blankState();
  s.demo = true;
  s.settings = Object.assign(s.settings, {
    business: 'Sharma Traders (sample)',
    person: 'Rakesh Sharma',
    item: 'Cotton yarn',
    unit: 'kg',
    monthlySales: 2500000,
    monthlyPurchase: 2000000,
    monthlyExpenses: 120000,
    creditGiven: 60,
    creditReceived: 15,
    stockDays: 8,
    cashMonths: 3,
    costOfFunds: 12,
    earlyDiscount: 2,
    earlyDays: 15
  });

  var t = todayISO();
  function q(days, supplier, rate, moq, del, pay) {
    s.quotes.push({
      id: uid(), date: addDays(t, -days), supplier: supplier, item: 'Cotton yarn',
      rate: rate, moq: moq, deliveryDays: del, payDays: pay
    });
  }
  q(2, 'Gupta Mills', 285, '500 kg', 3, 15);
  q(2, 'Anand Textiles', 292, '300 kg', 2, 7);
  q(6, 'Shri Balaji Yarn', 279, '1000 kg', 5, 30);
  q(12, 'Gupta Mills', 288, '500 kg', 3, 15);
  q(25, 'Gupta Mills', 291, '500 kg', 3, 15);
  q(34, 'Anand Textiles', 272, '300 kg', 2, 7);
  q(48, 'Shri Balaji Yarn', 281, '1000 kg', 5, 30);
  q(55, 'Gupta Mills', 268, '1000 kg', 4, 15);

  s.quotes[0].freight = 2;
  s.quotes[0].rejection = 0.5;
  s.quotes[2].freight = 3;
  s.quotes[2].rejection = 3;
  s.quotes[3].freight = 2;
  s.quotes[3].rejection = 0.5;

  s.customers.push({
    id: uid(), name: 'Verma Garments', phone: '9876543210', creditDays: 60, creditLimit: 600000,
    bills: [
      { id: uid(), date: addDays(t, -70), amount: 240000, note: 'INV-118', paidOn: '' },
      { id: uid(), date: addDays(t, -20), amount: 180000, note: 'INV-131', paidOn: '' },
      { id: uid(), date: addDays(t, -110), amount: 150000, note: 'INV-102', paidOn: addDays(t, -55) }
    ]
  });
  s.customers.push({
    id: uid(), name: 'New Look Fabrics', phone: '9812345678', creditDays: 45, creditLimit: 300000,
    bills: [
      { id: uid(), date: addDays(t, -10), amount: 120000, note: 'INV-129', paidOn: '' }
    ]
  });
  s.customers.push({
    id: uid(), name: 'Kapoor Sarees', phone: '', creditDays: 30, creditLimit: 200000,
    bills: [
      { id: uid(), date: addDays(t, -45), amount: 90000, note: 'INV-121', paidOn: '' }
    ]
  });

  s.rfq = { qty: '2000', days: 3, note: 'GST bill + transport' };
  s.deal = { qty: '2000', target: '285', walkaway: '278', batna: '282', margin: '12', months: 3, batches: 4 };
  s.epd = { amount: 240000, disc: 2, daysSaved: 45 };
  s.tre = { amount: 500000, rate: 11, days: 60 };
  return s;
}

/* ---------------- shuru ---------------- */

S = load();
save();
ui.locked = pinIsSet();
render();

document.getElementById('tabs').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-tab]');
  if (!b) { return; }
  setTab(b.getAttribute('data-tab'));
});
document.getElementById('view').addEventListener('click', onViewClick);
document.getElementById('view').addEventListener('submit', onViewSubmit);

/* home screen se chalane ke liye offline shell */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(function () { /* ignore */ });
}

/* 3 minute se zyada app background me rahi to PIN dobara maangein */
var hiddenAt = 0;
document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    hiddenAt = Date.now();
    return;
  }
  if (pinIsSet() && hiddenAt && (Date.now() - hiddenAt) > 180000) {
    ui.locked = true;
    ui.editCustomer = null;
    render();
  }
  hiddenAt = 0;
});
