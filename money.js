'use strict';

/* =========================================================
   Money tab — cash flow, stock, cheque diary, backup, help.
   Iska data alag rehta hai: localStorage 'vyapar-money-v1'.
   Baaki app ka data (S) wahi hai jo core.js me hai.
   ========================================================= */

var MKEY = 'vyapar-money-v1';
var SNAPKEY = 'vyapar-snap-v1';
var MDATA = { cheques: [], stock: [], market: { source: '', last: '', err: '', rates: {} } };

function mLoad() {
  try {
    var r = localStorage.getItem(MKEY);
    if (!r) { return; }
    var o = JSON.parse(r);
    MDATA.cheques = Array.isArray(o.cheques) ? o.cheques : [];
    MDATA.stock = Array.isArray(o.stock) ? o.stock : [];
    MDATA.market = Object.assign({ source: '', last: '', err: '', rates: {} }, o.market || {});
  } catch (e) { /* khaali se shuru */ }
}
function mSave() {
  try { localStorage.setItem(MKEY, JSON.stringify(M)); } catch (e) { /* ignore */ }
}
function mUid() { return 'm' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3); }

/* ---------------- cash flow ---------------- */

function mMonths(n) {
  var out = [];
  var d = new Date();
  for (var i = n - 1; i >= 0; i--) {
    var x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(x.getFullYear() + '-' + pad2(x.getMonth() + 1));
  }
  return out;
}
function mSalesByMonth() {
  var res = {};
  S.orders.forEach(function (o) {
    var k = String(o.date || '').slice(0, 7);
    if (!k) { return; }
    res[k] = (res[k] || 0) + num(o.qty) * num(o.rate);
  });
  return res;
}
function mBillsByMonth() {
  var res = {};
  S.customers.forEach(function (c) {
    c.bills.forEach(function (b) {
      var k = String(b.date || '').slice(0, 7);
      if (!k) { return; }
      res[k] = (res[k] || 0) + num(b.amount);
    });
  });
  return res;
}
function mPaidByMonth() {
  var res = {};
  S.customers.forEach(function (c) {
    c.bills.forEach(function (b) {
      if (!b.paidOn) { return; }
      var k = String(b.paidOn).slice(0, 7);
      res[k] = (res[k] || 0) + num(b.amount);
    });
  });
  return res;
}
function mBars(monthsArr, data, red) {
  var max = 0;
  monthsArr.forEach(function (k) { if ((data[k] || 0) > max) { max = data[k] || 0; } });
  return monthsArr.map(function (k) {
    var v = data[k] || 0;
    var w = max > 0 ? Math.max(3, Math.round(v / max * 100)) : 3;
    return '<div class="bar"><span>' + monLabel(k) + '</span>' +
      '<div class="bar-track"><div class="bar-fill' + (red ? ' red' : '') + '" style="width:' + w + '%"></div></div>' +
      '<b>' + money(v) + '</b></div>';
  }).join('');
}

function cashFlowCard() {
  var ms = mMonths(6);
  var sales = mSalesByMonth();
  var billed = mBillsByMonth();
  var paid = mPaidByMonth();
  var p = paymentStats();
  var w = wcCalc();
  return '<section class="card">' +
    '<div class="card-head"><h2>Cash \u2014 last 6 months</h2><span class="hint">aaya vs jaana</span></div>' +
    '<div class="kpis">' +
      '<div class="kpi"><span class="kpi-l">Aaj tak baaki</span><b class="kpi-v">' + money(p.outstanding) + '</b>' +
        '<span class="kpi-s">' + p.unpaidCount + ' bill</span></div>' +
      '<div class="kpi"><span class="kpi-l">Overdue</span><b class="kpi-v' + (p.overdue ? ' bad' : '') + '">' + money(p.overdue) + '</b>' +
        '<span class="kpi-s">' + (p.oldest ? p.oldest + ' din sabse purana' : 'koi nahi') + '</span></div>' +
      '<div class="kpi"><span class="kpi-l">Working capital</span><b class="kpi-v">' + money(w.total) + '</b>' +
        '<span class="kpi-s">cash cycle ke saath</span></div>' +
      '<div class="kpi"><span class="kpi-l">Asli collection</span><b class="kpi-v">' +
        (p.avgPaidDays ? Math.round(p.avgPaidDays) + ' din' : '\u2014') + '</b><span class="kpi-s">terms ' +
        num(S.settings.creditGiven) + ' din</span></div>' +
    '</div>' +
    '<div class="hist"><div class="hist-head">Bikri (orders)</div>' + mBars(ms, sales) + '</div>' +
    '<div class="hist"><div class="hist-head">Bill banaye</div>' + mBars(ms, billed) + '</div>' +
    '<div class="hist"><div class="hist-head">Paisa aaya (paid)</div>' + mBars(ms, paid) + '</div>' +
    '<p class="muted small" style="margin:10px 0 0">Jis mahine "paisa aaya" ka bar chhota hai, us mahine aapka paisa ' +
    'customer ke paas hai \u2014 wahi mahina sabse zyada udhaar lene padta hai.</p></section>';
}

/* ---------------- stock ---------------- */

function mStockRows() {
  if (!MDATA.stock.length) {
    return '<p class="muted" style="margin:0">Koi item nahi. Neeche se apna maal daalein \u2014 kitna hai aur kitna bachne par order karna hai.</p>';
  }
  return MDATA.stock.map(function (x) {
    var qty = num(x.qty), reorder = num(x.reorder);
    var low = reorder > 0 && qty <= reorder;
    var pct = reorder > 0 ? Math.min(100, Math.round(qty / (reorder * 2) * 100)) : (qty > 0 ? 50 : 3);
    return '<div class="bar"><span>' + esc(x.name) + '</span>' +
      '<div class="bar-track"><div class="bar-fill' + (low ? ' red' : '') + '" style="width:' + pct + '%"></div></div>' +
      '<b>' + fmt(qty, 2) + ' ' + esc(x.unit || '') + '</b></div>' +
      '<div class="small muted" style="margin:-2px 0 10px 66px">' +
        (low ? '<span class="tag bad">order karein</span>' : '<span class="tag good">theek</span>') +
        ' reorder ' + fmt(reorder, 2) + ' ' + esc(x.unit || '') +
        ' <button class="link" type="button" data-mact="m-stock-set" data-mid="' + esc(x.id) + '">qty badlein</button>' +
        '<button class="link del" type="button" data-mact="m-stock-del" data-mid="' + esc(x.id) + '">\u00D7</button>' +
      '</div>';
  }).join('');
}

function stockCard() {
  return '<section class="card">' +
    '<div class="card-head"><h2>Stock</h2><span class="hint">' + MDATA.stock.length + ' item</span></div>' +
    mStockRows() +
    '<form data-mform="m-stock" class="grid2" style="margin-top:10px">' +
      '<label class="fld"><span>Item</span><input type="text" name="name" placeholder="jaise: DSTDP"></label>' +
      '<label class="fld"><span>Abhi kitna hai</span><input type="number" name="qty" inputmode="decimal" step="any" placeholder="0"></label>' +
      '<label class="fld"><span>Reorder par (isse kam = order)</span><input type="number" name="reorder" inputmode="decimal" step="any" placeholder="0"></label>' +
      '<label class="fld"><span>Unit</span><input type="text" name="unit" placeholder="kg"></label>' +
      '<div class="row-end"><button class="btn" type="submit">Add / update</button></div>' +
    '</form></section>';
}

/* ---------------- cheque diary ---------------- */

function mCheques() {
  return MDATA.cheques.slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
}
function chequeCard() {
  var list = mCheques();
  var t = todayISO();
  var pend = 0, late = 0, bounce = 0;
  list.forEach(function (c) {
    if (c.status === 'bounced') { bounce += 1; }
    if (c.status === 'pending') {
      pend += num(c.amount);
      if (c.date < t) { late += num(c.amount); }
    }
  });
  var rows = list.map(function (c) {
    var st;
    if (c.status === 'cleared') { st = '<span class="tag good">cleared</span>'; }
    else if (c.status === 'bounced') { st = '<span class="tag bad">bounced</span>'; }
    else if (c.date < t) { st = '<span class="tag bad">late ' + Math.max(0, daysBetween(c.date, t)) + ' din</span>'; }
    else { st = '<span class="tag">' + Math.max(0, daysBetween(t, c.date)) + ' din baaki</span>'; }
    return '<tr><td>' + dmy(c.date) + '<div class="small muted">' + esc(c.party) + '</div></td>' +
      '<td class="num">' + money(c.amount) + (c.note ? '<div class="small muted">' + esc(c.note) + '</div>' : '') + '</td>' +
      '<td>' + st + '</td>' +
      '<td class="actions">' +
        (c.status === 'pending'
          ? '<button class="link" type="button" data-mact="m-chq-set" data-mid="' + esc(c.id) + '" data-v="cleared">Cleared</button>' +
            '<button class="link del" type="button" data-mact="m-chq-set" data-mid="' + esc(c.id) + '" data-v="bounced">Bounce</button>'
          : '<button class="link" type="button" data-mact="m-chq-set" data-mid="' + esc(c.id) + '" data-v="pending">Undo</button>') +
        '<button class="link del" type="button" data-mact="m-chq-del" data-mid="' + esc(c.id) + '">\u00D7</button>' +
      '</td></tr>';
  }).join('');

  return '<section class="card">' +
    '<div class="card-head"><h2>Cheque diary</h2><span class="hint">' + MDATA.cheques.length + ' cheque</span></div>' +
    '<div class="mini">' +
      '<div><span>Pending</span><b>' + money(pend) + '</b><i>aane wale</i></div>' +
      '<div><span>Date nikal gayi</span><b class="' + (late ? 'bad' : '') + '">' + money(late) + '</b><i>check karein</i></div>' +
      '<div><span>Bounce</span><b class="' + (bounce ? 'bad' : '') + '">' + bounce + '</b><i>isse hi limit tay karein</i></div>' +
    '</div>' +
    (rows
      ? '<div class="table-wrap"><table><thead><tr><th>Date / party</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<p class="muted small">Abhi koi cheque nahi.</p>') +
    '<form data-mform="m-cheque" class="grid2" style="margin-top:10px">' +
      '<label class="fld"><span>Party</span><input type="text" name="party" placeholder="customer ka naam"></label>' +
      '<label class="fld"><span>Amount \u20B9</span><input type="number" name="amount" inputmode="decimal" step="any" placeholder="0"></label>' +
      '<label class="fld"><span>Cheque date</span><input type="date" name="date" value="' + todayISO() + '"></label>' +
      '<label class="fld"><span>Note (bank / number)</span><input type="text" name="note" placeholder="optional"></label>' +
      '<div class="row-end"><button class="btn" type="submit">Add cheque</button></div>' +
    '</form></section>';
}

/* ---------------- backup ---------------- */

function mAutoSnap() {
  try {
    var t = todayISO();
    var arr = [];
    var raw = localStorage.getItem(SNAPKEY);
    if (raw) { arr = JSON.parse(raw); }
    if (!Array.isArray(arr)) { arr = []; }
    if (arr.length && arr[0].date === t) { return; }
    arr.unshift({
      date: t,
      S: localStorage.getItem('vyapar-saathi-v1') || '',
      M: localStorage.getItem(MKEY) || ''
    });
    localStorage.setItem(SNAPKEY, JSON.stringify(arr.slice(0, 3)));
  } catch (e) { /* ignore */ }
}
function mLastSnap() {
  try {
    var arr = JSON.parse(localStorage.getItem(SNAPKEY) || '[]');
    return Array.isArray(arr) && arr.length ? arr[0] : null;
  } catch (e) { return null; }
}
function backupJson() {
  return JSON.stringify({
    app: 'vyapar-saathi',
    v: 2,
    date: todayISO(),
    data: localStorage.getItem('vyapar-saathi-v1') || '',
    money: localStorage.getItem(MKEY) || ''
  });
}

function backupCard() {
  var last = mLastSnap();
  return '<section class="card">' +
    '<div class="card-head"><h2>Backup</h2><span class="hint">' +
      (last ? 'last auto: ' + dmy(last.date) : 'abhi tak nahi') + '</span></div>' +
    '<p class="muted small" style="margin:0 0 8px">Data sirf is phone me hai. Mahine me ek baar backup copy karke ' +
    'apne aap ko WhatsApp par bhej dein. App roz khud ek snapshot rakhta hai (aakhri 3 din).</p>' +
    '<div class="btnrow">' +
      '<button class="btn" type="button" data-mact="m-backup-copy">Copy backup</button>' +
      '<button class="btn alt" type="button" data-mact="m-backup-file">Download file</button>' +
      '<button class="btn alt" type="button" data-mact="m-restore-snap">Last snapshot restore</button>' +
    '</div>' +
    '<form data-mform="m-restore" style="margin-top:12px">' +
      '<label class="fld"><span>Backup ka text paste karke restore karein</span>' +
      '<textarea name="json" placeholder="Yahan backup paste karein"></textarea></label>' +
      '<div class="row-end" style="margin-top:8px"><button class="btn" type="submit">Restore</button></div>' +
    '</form></section>';
}

/* ---------------- help ---------------- */

function helpCard() {
  var steps = [
    ['1. Setup', 'Business, unit, mahine ki bikri-kharid, credit din, paisa ka rate (12%), minimum aur target margin bharein. Ye 8 number poore app ka base hain.'],
    ['2. Rates', 'Jo rate mile \u2014 supplier, rate, freight, rejection %, credit din \u2014 ek line me daalein. "True" column asli lagat batata hai. Purana data Excel se Setup > Import se aa jaata hai.'],
    ['3. Customers', 'Customer, uske orders aur bills (bill date + paid date) daalein. Isi se reminder, grade, churn aur paisa ka return nikalta hai.'],
    ['4. Quote', 'Customer aur quantity chunein \u2014 floor, ask aur rate ladder ban jaayega. Ladder ka message seedha bhej dein: jitne din me payment, utna rate.'],
    ['5. Today', 'Roz subah 3-5 kaam. Har kaam par ready message \u2014 copy ya WhatsApp. Snooze se hata dein.'],
    ['6. Money (ye tab)', 'Cash flow, stock ka reorder alert, cheque diary aur backup \u2014 sab ek jagah.']
  ];
  return '<section class="card">' +
    '<div class="card-head"><h2>Kaise use karein</h2><span class="hint">6 step \u00B7 build v3</span></div>' +
    steps.map(function (s) {
      return '<div class="obj"><b class="small">' + esc(s[0]) + '</b><p>' + esc(s[1]) + '</p></div>';
    }).join('') +
    '<p class="muted small" style="margin:10px 0 0">Roz 2 minute: Today kholein aur jo kaam dikhe wo kar dein. ' +
    'Mahine ki 1 tareekh: Setup \u2192 Backup copy.</p>' +
    '<div class="btnrow"><a class="btn" href="guide.html">Poora guide kholein (Excel import ke saath)</a></div></section>';
}

/* ---------------- Excel: file import + export ---------------- */

var mLastImport = '';

function mCsvCell(v) {
  var s = String(v === null || v === undefined ? '' : v);
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function mCsv(rows) {
  return '\ufeff' + rows.map(function (r) { return r.map(mCsvCell).join(','); }).join('\r\n');
}
function mDownload(name, text, mime) {
  try {
    var blob = new Blob([text], { type: mime || 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast('File ban gayi: ' + name);
  } catch (e) {
    toast('Download nahi hua');
  }
}
function mExportCsv(kind) {
  var rows = [];
  if (kind === 'rates') {
    rows.push(['Date', 'Supplier', 'Item', 'Rate', 'Freight', 'Rejection %', 'Credit days', 'MOQ']);
    S.quotes.forEach(function (q) {
      rows.push([q.date, q.supplier, q.item, q.rate, q.freight, q.rejection, q.payDays, q.moq]);
    });
  } else {
    rows.push(['Date', 'Party', 'Product', 'Qty', 'Rate', 'Amount', 'Paid date', 'Invoice']);
    S.orders.forEach(function (o) {
      var c = findCust(o.customerId);
      rows.push([o.date, c ? c.name : '', o.product || '', o.qty, o.rate,
        num(o.qty) * num(o.rate), o.delivered || '', '']);
    });
    S.customers.forEach(function (c) {
      c.bills.forEach(function (b) {
        rows.push([b.date, c.name, '', '', '', b.amount, b.paidOn || '', b.note || '']);
      });
    });
  }
  mDownload('vyapar-' + kind + '-' + todayISO() + '.csv', mCsv(rows));
}
function mDoImport(text, kind) {
  var r = (kind === 'rates') ? importRates(text) : importSales(text);
  if (!r || r.error) {
    mLastImport = 'File padhi nahi gayi: ' + (r && r.error ? r.error : 'rows samajh nahi aayin');
    render(true);
    return;
  }
  save();
  if (kind === 'rates') {
    mLastImport = 'Import ho gaya: ' + r.quotes + ' rate record' +
      (r.dup ? ', ' + r.dup + ' duplicate chhode' : '') +
      (r.skipped ? ', ' + r.skipped + ' row samajh nahi aayin' : '');
  } else {
    mLastImport = 'Import ho gaya: ' + r.orders + ' order, ' + r.bills + ' bill, ' + r.newCust + ' naya customer' +
      (r.dup ? ', ' + r.dup + ' duplicate chhode' : '') +
      (r.skipped ? ', ' + r.skipped + ' row samajh nahi aayin' : '') +
      (r.unmatched && r.unmatched.length ? '. Ye naam match nahi hue: ' + r.unmatched.join(', ') : '');
  }
  render(true);
}

function dataCard() {
  return '<section class="card">' +
    '<div class="card-head"><h2>Excel \u2014 data laayein / le jaayein</h2><span class="hint">Excel / CSV</span></div>' +
    '<p class="muted small" style="margin:0 0 10px">Excel me file ko <b>Save As \u2192 CSV</b> karein, phir yahan se chun lein. ' +
    'Pehli line header honi chahiye (Date, Party, Qty, Rate, Bill amount, Paid date). Column ka order kuch bhi ho, ' +
    'app naam se pehchan leta hai.</p>' +
    '<label class="fld"><span>1. Kaisa data hai?</span>' +
      '<select data-mrole="kind"><option value="sales">Sales \u2014 orders, bills, paid date (ek mahine ki file)</option>' +
      '<option value="rates">Purchase \u2014 supplier rate sheet</option></select></label>' +
    '<label class="fld" style="margin-top:8px"><span>2. Excel ya CSV file chunein</span>' +
      '<input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" data-mrole="file"></label>' +
    (mLastImport ? '<div class="msg">' + esc(mLastImport) + '</div>' : '') +
    '<p class="muted small" style="margin:10px 0 0">Excel (.xlsx / .xls) seedha padh li jaati hai \u2014 pehli sheet. ' +
    'CSV bhi chalegi. Ya Excel se rows copy karke Setup \u2192 Import me paste kar dein.</p>' +
    '<div class="card-head" style="margin-top:16px"><h2>Phone ka data Excel me</h2></div>' +
    '<p class="muted small" style="margin:0 0 8px">Neeche se CSV download karein \u2014 Excel/Google Sheets me seedha khul jaayegi ' +
    '(Hindi aur \u20B9 theek dikhega).</p>' +
    '<div class="btnrow">' +
      '<button class="btn" type="button" data-mact="m-exp-sales">Orders + bills (CSV)</button>' +
      '<button class="btn alt" type="button" data-mact="m-exp-rates">Rate sheet (CSV)</button>' +
    '</div></section>';
}

document.addEventListener('change', function (e) {
  var inp = e.target.closest('[data-mrole="file"]');
  if (!inp) { return; }
  var file = inp.files && inp.files[0];
  if (!file) { return; }
  var sel = document.querySelector('[data-mrole="kind"]');
  var kind = sel ? sel.value : 'sales';

  if (/\.xlsx?$/i.test(file.name)) {
    if (!window.XLSX) {
      mLastImport = 'The Excel reader did not load. Refresh the page, or save the file as CSV and pick that.';
      render(true);
      return;
    }
    var xr = new FileReader();
    xr.onload = function () {
      try {
        var wb = XLSX.read(new Uint8Array(xr.result), { type: 'array' });
        var sheet = wb.Sheets[wb.SheetNames[0]];
        mDoImport(XLSX.utils.sheet_to_csv(sheet), kind);
      } catch (err) {
        mLastImport = 'Could not read the Excel file: ' + ((err && err.message) ? err.message : 'format not recognised');
        render(true);
      }
    };
    xr.onerror = function () { mLastImport = 'Could not read the file'; render(true); };
    xr.readAsArrayBuffer(file);
    return;
  }

  var fr = new FileReader();
  fr.onload = function () { mDoImport(String(fr.result || ''), kind); };
  fr.onerror = function () { mLastImport = 'Could not read the file'; render(true); };
  fr.readAsText(file, 'utf-8');
});

/* ---------------- Portfolio: har hissa ek circle ---------------- */

function ringSvg(pct, tone) {
  var r = 34, c = 2 * Math.PI * r;
  var p = Math.max(0, Math.min(100, num(pct)));
  var dash = c * p / 100;
  var col = tone === 'bad' ? '#b91c1c' : (tone === 'warn' ? '#a16207' : '#1c7a4c');
  return '<svg viewBox="0 0 80 80" class="pring-svg">' +
    '<circle cx="40" cy="40" r="' + r + '" fill="none" stroke="#e8ece8" stroke-width="9"></circle>' +
    '<circle cx="40" cy="40" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="9" ' +
    'stroke-linecap="round" stroke-dasharray="' + dash.toFixed(1) + ' ' + (c - dash).toFixed(1) +
    '" transform="rotate(-90 40 40)"></circle></svg>';
}

function portCard(o) {
  return '<button class="pcard" type="button" data-mtab="' + o.tab + '">' +
    '<div class="pring">' + ringSvg(o.pct, o.tone) + '<span class="pval">' + esc(o.big) + '</span></div>' +
    '<div class="pname">' + esc(o.name) + '</div>' +
    '<div class="psub">' + esc(o.sub) + '</div></button>';
}

function viewPort() {
  var s = S.settings;
  var p = paymentStats();
  var gm = grossMarginPct();
  var ccc = num(s.stockDays) + num(s.creditGiven) - num(s.creditReceived);
  var thisMonth = mMonths(1)[0];
  var salesM = mSalesByMonth()[thisMonth] || 0;
  var paidM = mPaidByMonth()[thisMonth] || 0;
  var billedM = mBillsByMonth()[thisMonth] || 0;
  var cashPct = billedM > 0 ? Math.min(100, paidM / billedM * 100) : 0;
  var overPct = p.outstanding > 0 ? p.overdue / p.outstanding * 100 : 0;

  var lowStock = 0, okStock = 0;
  MDATA.stock.forEach(function (x) {
    if (num(x.reorder) > 0 && num(x.qty) <= num(x.reorder)) { lowStock += 1; } else { okStock += 1; }
  });
  var stockTot = lowStock + okStock;

  var grades = { A: 0, B: 0, C: 0, N: 0 };
  S.customers.forEach(function (c) { grades[custStanding(c).grade] += 1; });
  var gradeTot = S.customers.length;
  var aPct = gradeTot ? grades.A / gradeTot * 100 : 0;

  var pendChq = 0;
  MDATA.cheques.forEach(function (c) { if (c.status === 'pending') { pendChq += num(c.amount); } });

  return '' + (S.demo ? demoBanner() : '') +
    ((!S.customers.length && !S.quotes.length)
      ? '<section class="card"><div class="card-head"><h2>Shuruaat kaise karein</h2><span class="hint">3 step</span></div>' +
        '<div class="steps">' +
          '<div class="step"><b>1</b><span><strong>Setup</strong> \u2014 8 number bharein: bikri, kharid, kharcha, ' +
            'credit din, paise ka rate (12%), margin.</span></div>' +
          '<div class="step"><b>2</b><span><strong>Rates</strong> \u2014 2-3 supplier ke rate daalein, ya purani Excel file ' +
            'Money tab se import kar lein.</span></div>' +
          '<div class="step"><b>3</b><span><strong>Customers</strong> \u2014 2 customer aur unke bill daalein. ' +
            'Uske baad ye circle apne aap bhar jaayenge.</span></div>' +
        '</div>' +
        '<div class="btnrow"><button class="btn" type="button" data-mtab="setup">Setup kholein</button>' +
        '<button class="btn alt" type="button" data-mtab="money">Excel import</button></div></section>'
      : '') +
    '<section class="card">' +
      '<div class="card-head"><h2>Portfolio</h2><span class="hint">' + dmy(todayISO()) + '</span></div>' +
      '<p class="muted small" style="margin:0 0 10px">Har circle ek hissa. Circle dabaayein to wahi tab khul jaayega \u2014 ' +
      'wahin se number badal lein.</p>' +
      '<div class="port">' +
        portCard({ tab: 'paisa', pct: cashPct, tone: cashPct >= 80 ? 'ok' : (cashPct >= 50 ? 'warn' : 'bad'),
          big: Math.round(cashPct) + '%', name: 'Is mahine paisa aaya', sub: money(paidM) + ' / ' + money(billedM) }) +
        portCard({ tab: 'cust', pct: 100 - overPct, tone: overPct <= 15 ? 'ok' : (overPct <= 30 ? 'warn' : 'bad'),
          big: Math.round(overPct) + '%', name: 'Overdue hissa', sub: money(p.overdue) + ' / ' + money(p.outstanding) }) +
        portCard({ tab: 'money', pct: stockTot ? okStock / stockTot * 100 : 0,
          tone: (stockTot && lowStock) ? 'warn' : 'ok',
          big: stockTot ? Math.round(okStock / stockTot * 100) + '%' : '\u2014',
          name: 'Stock theek', sub: stockTot ? (okStock + ' theek, ' + lowStock + ' order') : 'Stock add karein' }) +
        portCard({ tab: 'cust', pct: aPct, tone: aPct >= 60 ? 'ok' : (aPct >= 30 ? 'warn' : 'bad'),
          big: grades.A + '/' + gradeTot, name: 'A-grade customers', sub: grades.B + ' B, ' + grades.C + ' C' }) +
        portCard({ tab: 'quote', pct: Math.min(100, gm / 20 * 100), tone: gm >= 8 ? 'ok' : 'bad',
          big: fmt(gm, 0) + '%', name: 'Gross margin', sub: '20% = poora circle' }) +
        portCard({ tab: 'paisa', pct: Math.max(0, 100 - Math.min(100, ccc / 90 * 100)),
          tone: ccc <= 45 ? 'ok' : (ccc <= 75 ? 'warn' : 'bad'),
          big: Math.round(ccc) + ' din', name: 'Cash cycle', sub: '75 din se kam rakhein' }) +
      '</div>' +
      '<div class="mini" style="margin-top:12px">' +
        '<div><span>Mahine ki bikri</span><b>' + money(salesM) + '</b><i>orders se</i></div>' +
        '<div><span>Cheque pending</span><b>' + money(pendChq) + '</b><i>aane wale</i></div>' +
        '<div><span>Working capital</span><b>' + money(wcCalc().total) + '</b><i>chahiye</i></div>' +
      '</div>' +
      '<div class="btnrow">' +
        '<button class="btn alt" type="button" data-mtab="setup">Setup badlein</button>' +
        '<button class="btn alt" type="button" data-mtab="aaj">Aaj ka kaam</button>' +
        '<a class="btn alt" href="guide.html">Guide</a>' +
      '</div>' +
    '</section>';
}

document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-mtab]');
  if (!b) { return; }
  setTab(b.getAttribute('data-mtab'));
});

/* ---------------- Market: aaj ka rate ---------------- */

function mktItems() {
  var names = [];
  S.products.forEach(function (p) { if (p.name && names.indexOf(p.name) < 0) { names.push(p.name); } });
  materialNames().forEach(function (n) { if (names.indexOf(n) < 0) { names.push(n); } });
  var r = MDATA.market.rates || {};
  Object.keys(r).forEach(function (k) { if (r[k].item && names.indexOf(r[k].item) < 0) { names.push(r[k].item); } });
  return names;
}

function mktFetch(force) {
  var mk = MDATA.market;
  if (!mk.source) { return; }
  if (!force && mk.last === todayISO()) { return; }
  mk.last = todayISO();
  mk.err = '';
  mSave();
  fetch(mk.source, { cache: 'no-store' }).then(function (r) {
    if (!r.ok) { throw new Error('HTTP ' + r.status); }
    return r.text();
  }).then(function (txt) {
    var rows = xlRows(txt);
    if (rows.length < 2) { throw new Error('file me data nahi mila'); }
    var map = xlMap(rows[0], ['item', 'rate', 'date']);
    if (map.item === undefined || map.rate === undefined) {
      throw new Error('header me Item aur Rate chahiye');
    }
    var n = 0;
    for (var i = 1; i < rows.length; i++) {
      var nm = rows[i][map.item];
      var rt = num(String(rows[i][map.rate] || '').replace(/[^0-9.]/g, ''));
      if (!nm || !rt) { continue; }
      var k = normName(nm);
      var old = mk.rates[k];
      mk.rates[k] = {
        item: String(nm).trim(),
        rate: rt,
        prev: old ? old.rate : 0,
        date: (map.date !== undefined && rows[i][map.date]) ? String(rows[i][map.date]).trim() : todayISO()
      };
      n += 1;
    }
    mk.err = n ? '' : 'koi row samajh nahi aayi';
    mSave();
    render(true);
  }).catch(function (err) {
    mk.err = 'Rate nahi aaye: ' + ((err && err.message) ? err.message : 'source check karein');
    mSave();
    render(true);
  });
}

function marketCard() {
  var mk = MDATA.market;
  var items = mktItems();
  var rows = items.map(function (name) {
    var m = mk.rates[normName(name)] || null;
    var best = materialBest(name);
    var your = best ? best.v : 0;
    var diffTxt = '\u2014', cls = '';
    if (m && m.rate > 0 && your > 0) {
      var d = (your - m.rate) / m.rate * 100;
      diffTxt = (d > 0 ? '+' : '') + fmt(d) + '%';
      cls = d > 1 ? 'bad' : (d < -1 ? 'ok' : '');
    }
    var chg = '';
    if (m && m.prev > 0 && m.rate > 0) {
      var c = (m.rate - m.prev) / m.prev * 100;
      chg = (c > 0 ? ' \u2191 ' : (c < 0 ? ' \u2193 ' : ' ')) + fmt(Math.abs(c)) + '%';
    }
    return '<tr><td>' + esc(name) + '</td>' +
      '<td class="num">' + (m ? rs(m.rate) + '<div class="small muted">' + esc(chg ? chg.trim() : '') +
        (m.date ? ' ' + dmy(m.date) : '') + '</div>' : '<span class="muted">\u2014</span>') + '</td>' +
      '<td class="num">' + (your ? rs(your) : '\u2014') + '</td>' +
      '<td class="num ' + cls + '">' + diffTxt + '</td></tr>';
  }).join('');

  return '<section class="card">' +
    '<div class="card-head"><h2>Market \u2014 aaj ka rate</h2><span class="hint">' +
      (mk.last ? 'last check ' + dmy(mk.last) : 'source set karein') + '</span></div>' +
    '<p class="muted small" style="margin:0 0 10px">Ye tab aapki rate sheet (Google Sheet / kisi bhi CSV link) se roz rate khud le aata hai. ' +
    'Ek hi sheet me <b>Item</b> aur <b>Rate</b> ke do column kaafi hain (Date optional).</p>' +
    '<form data-mform="m-mkt-src" class="grid2">' +
      '<label class="fld" style="grid-column:1 / -1"><span>Rate sheet ka link (CSV)</span>' +
      '<input type="url" name="source" value="' + esc(mk.source || '') + '" placeholder="https://docs.google.com/.../pub?output=csv"></label>' +
      '<div class="row-end"><button class="btn" type="submit">Save karein</button></div>' +
    '</form>' +
    '<div class="btnrow">' +
      '<button class="btn alt" type="button" data-mact="m-mkt-now">Abhi refresh karein</button>' +
      '<button class="btn alt" type="button" data-mact="m-mkt-clear">Manual rate se kaam karein</button>' +
    '</div>' +
    (mk.err ? '<div class="msg">' + esc(mk.err) + '</div>' : '') +
    (rows ? '<div class="table-wrap"><table><thead><tr><th>Item</th><th class="num">Market</th>' +
      '<th class="num">Aapka asli rate</th><th class="num">Fark</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<p class="muted small">Rates aane par yahan item-wise market rate aur aapke supplier ke rate se fark dikhega.</p>') +
    '<form data-mform="m-mkt-manual" class="grid2" style="margin-top:12px">' +
      '<label class="fld"><span>Item</span><input type="text" name="item" list="mkt-list" placeholder="jaise: DSTDP"></label>' +
      '<label class="fld"><span>Aaj ka rate \u20B9</span><input type="number" name="rate" inputmode="decimal" step="any" placeholder="0"></label>' +
      '<label class="fld"><span>Date</span><input type="date" name="date" value="' + todayISO() + '"></label>' +
      '<div class="row-end"><button class="btn" type="submit">Rate daalein</button></div>' +
    '</form>' +
    '<datalist id="mkt-list">' + items.map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('') + '</datalist>' +
    '<p class="muted small" style="margin:10px 0 0">Sheet ka link <b>published CSV</b> hona chahiye (Google Sheet: File \u2192 Share \u2192 ' +
    'Publish to web \u2192 CSV). Sheet roz subah update ho jaaye to app khud uthaa leti hai; internet na ho to manual rate kaam karega.</p>' +
    '</section>';
}

function viewMarket() {
  mktFetch(false);
  return '' + (S.demo ? demoBanner() : '') + marketCard();
}

/* ---------------- main view ---------------- */

function viewMoney() {
  if (typeof mAutoSnap === 'function') { mAutoSnap(); }
  return '' + (S.demo ? demoBanner() : '') +
    dataCard() + cashFlowCard() + helpCard() + stockCard() + chequeCard() + backupCard();
}

/* ---------------- events (sirf is tab ke) ---------------- */

document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-mact]');
  if (!b) { return; }
  var a = b.getAttribute('data-mact');
  var id = b.getAttribute('data-mid');

  if (a === 'm-stock-set') {
    var it = MDATA.stock.filter(function (x) { return x.id === id; })[0];
    if (!it) { return; }
    var v = prompt('New stock (' + (it.unit || 'unit') + ')?', String(it.qty));
    if (v === null) { return; }
    it.qty = num(v);
    mSave(); render(true); toast('Stock updated');
    return;
  }
  if (a === 'm-stock-del') {
    if (!confirm('Delete this item?')) { return; }
    MDATA.stock = MDATA.stock.filter(function (x) { return x.id !== id; });
    mSave(); render(true); toast('Item deleted');
    return;
  }
  if (a === 'm-chq-set') {
    var v2 = b.getAttribute('data-v');
    MDATA.cheques.forEach(function (c) { if (c.id === id) { c.status = v2; } });
    mSave(); render(true); toast('Cheque updated');
    return;
  }
  if (a === 'm-chq-del') {
    if (!confirm('Delete this cheque?')) { return; }
    MDATA.cheques = MDATA.cheques.filter(function (c) { return c.id !== id; });
    mSave(); render(true); toast('Cheque deleted');
    return;
  }
  if (a === 'm-mkt-now') { mktFetch(true); return; }
  if (a === 'm-mkt-clear') {
    MDATA.market.source = '';
    MDATA.market.last = '';
    MDATA.market.err = '';
    mSave(); render(true); toast('Source removed \u2014 manual rates only');
    return;
  }
  if (a === 'm-exp-sales') { mExportCsv('sales'); return; }
  if (a === 'm-exp-rates') { mExportCsv('rates'); return; }
  if (a === 'm-backup-copy') {
    copyText(backupJson());
    return;
  }
  if (a === 'm-backup-file') {
    try {
      var blob = new Blob([backupJson()], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'vyapar-backup-' + todayISO() + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      toast('Backup file created');
    } catch (err) {
      toast('Download failed \u2014 use Copy backup');
    }
    return;
  }
  if (a === 'm-restore-snap') {
    var last = mLastSnap();
    if (!last) { toast('No snapshot found'); return; }
    if (!confirm('Restore the snapshot of ' + dmy(last.date) + '? Current data will be replaced.')) { return; }
    try {
      if (last.S) { localStorage.setItem('vyapar-saathi-v1', last.S); }
      if (last.M) { localStorage.setItem(MKEY, last.M); }
      location.reload();
    } catch (err) { toast('Restore failed'); }
    return;
  }
});

document.addEventListener('submit', function (e) {
  var f = e.target.closest('form[data-mform]');
  if (!f) { return; }
  e.preventDefault();
  var kind = f.getAttribute('data-mform');

  if (kind === 'm-mkt-src') {
    MDATA.market.source = fval(f, 'source');
    MDATA.market.last = '';
    MDATA.market.err = '';
    mSave();
    mktFetch(true);
    toast('Source saved');
    return;
  }

  if (kind === 'm-mkt-manual') {
    var mi = fval(f, 'item');
    var mr = fnum(f, 'rate');
    if (!mi || mr <= 0) { toast('Enter item and rate'); return; }
    var mk = MDATA.market;
    var kk = normName(mi);
    var prev = mk.rates[kk] ? mk.rates[kk].rate : 0;
    mk.rates[kk] = { item: mi, rate: mr, prev: prev, date: fval(f, 'date') || todayISO() };
    mSave(); render(true); toast('Market rate saved');
    return;
  }

  if (kind === 'm-stock') {
    var name = fval(f, 'name');
    if (!name) { toast('Enter an item name'); return; }
    var qty = fnum(f, 'qty');
    var reorder = fnum(f, 'reorder');
    var unit = fval(f, 'unit') || (S.settings.unit || '');
    var found = null;
    MDATA.stock.forEach(function (x) { if (String(x.name).toLowerCase() === name.toLowerCase()) { found = x; } });
    if (found) {
      found.qty = qty; found.reorder = reorder; found.unit = unit;
    } else {
      MDATA.stock.push({ id: mUid(), name: name, qty: qty, reorder: reorder, unit: unit });
    }
    mSave(); render(true); toast('Stock saved');
    return;
  }

  if (kind === 'm-cheque') {
    var party = fval(f, 'party');
    var amount = fnum(f, 'amount');
    if (!party || amount <= 0) { toast('Enter party and amount'); return; }
    MDATA.cheques.push({
      id: mUid(), party: party, amount: amount,
      date: fval(f, 'date') || todayISO(), note: fval(f, 'note'), status: 'pending'
    });
    mSave(); render(true); toast('Cheque added');
    return;
  }

  if (kind === 'm-restore') {
    var raw = fval(f, 'json');
    if (!raw) { toast('Paste a backup first'); return; }
    try {
      var o = JSON.parse(raw);
      if (!o || !o.data) { toast('This backup does not look right'); return; }
      localStorage.setItem('vyapar-saathi-v1', o.data);
      if (o.money) { localStorage.setItem(MKEY, o.money); }
      location.reload();
    } catch (err) { toast('Backup is not valid'); }
    return;
  }
});

mLoad();


/* =========================================================
   ENGLISH UI
   These declarations replace the Hinglish versions above
   (in JavaScript the last function declaration wins).
   ========================================================= */

function cashFlowCard() {
  var ms = mMonths(6);
  var sales = mSalesByMonth();
  var billed = mBillsByMonth();
  var paid = mPaidByMonth();
  var p = paymentStats();
  var w = wcCalc();
  return '<section class="card">' +
    '<div class="card-head"><h2>Cash \u2014 last 6 months</h2><span class="hint">in vs out</span></div>' +
    '<div class="kpis">' +
      '<div class="kpi"><span class="kpi-l">Outstanding</span><b class="kpi-v">' + money(p.outstanding) + '</b>' +
        '<span class="kpi-s">' + p.unpaidCount + ' bills</span></div>' +
      '<div class="kpi"><span class="kpi-l">Overdue</span><b class="kpi-v' + (p.overdue ? ' bad' : '') + '">' + money(p.overdue) + '</b>' +
        '<span class="kpi-s">' + (p.oldest ? p.oldest + ' days oldest' : 'none') + '</span></div>' +
      '<div class="kpi"><span class="kpi-l">Working capital</span><b class="kpi-v">' + money(w.total) + '</b>' +
        '<span class="kpi-s">with cash cycle</span></div>' +
      '<div class="kpi"><span class="kpi-l">Actual collection</span><b class="kpi-v">' +
        (p.avgPaidDays ? Math.round(p.avgPaidDays) + ' days' : '\u2014') + '</b><span class="kpi-s">terms ' +
        num(S.settings.creditGiven) + ' days</span></div>' +
    '</div>' +
    '<div class="hist"><div class="hist-head">Sales (orders)</div>' + mBars(ms, sales) + '</div>' +
    '<div class="hist"><div class="hist-head">Bills raised</div>' + mBars(ms, billed) + '</div>' +
    '<div class="hist"><div class="hist-head">Cash received</div>' + mBars(ms, paid) + '</div>' +
    '<p class="muted small" style="margin:10px 0 0">In a month where the cash-received bar is shorter, your money is sitting with customers \u2014 ' +
    'that is the month you end up borrowing.</p></section>';
}

function stockCard() {
  var rows = MDATA.stock.length ? MDATA.stock.map(function (x) {
    var qty = num(x.qty), reorder = num(x.reorder);
    var low = reorder > 0 && qty <= reorder;
    var pct = reorder > 0 ? Math.min(100, Math.round(qty / (reorder * 2) * 100)) : (qty > 0 ? 50 : 3);
    return '<div class="bar"><span>' + esc(x.name) + '</span>' +
      '<div class="bar-track"><div class="bar-fill' + (low ? ' red' : '') + '" style="width:' + pct + '%"></div></div>' +
      '<b>' + fmt(qty, 2) + ' ' + esc(x.unit || '') + '</b></div>' +
      '<div class="small muted" style="margin:-2px 0 10px 66px">' +
        (low ? '<span class="tag bad">order now</span>' : '<span class="tag good">OK</span>') +
        ' reorder at ' + fmt(reorder, 2) + ' ' + esc(x.unit || '') +
        ' <button class="link" type="button" data-mact="m-stock-set" data-mid="' + esc(x.id) + '">edit qty</button>' +
        '<button class="link del" type="button" data-mact="m-stock-del" data-mid="' + esc(x.id) + '">\u00D7</button>' +
      '</div>';
  }).join('') : '<p class="muted" style="margin:0">No items yet. Add what you hold and the level at which you reorder.</p>';

  return '<section class="card">' +
    '<div class="card-head"><h2>Stock</h2><span class="hint">' + MDATA.stock.length + ' items</span></div>' +
    rows +
    '<form data-mform="m-stock" class="grid2" style="margin-top:10px">' +
      '<label class="fld"><span>Item</span><input type="text" name="name" placeholder="e.g. DSTDP"></label>' +
      '<label class="fld"><span>Quantity now</span><input type="number" name="qty" inputmode="decimal" step="any" placeholder="0"></label>' +
      '<label class="fld"><span>Reorder level (below this, order)</span><input type="number" name="reorder" inputmode="decimal" step="any" placeholder="0"></label>' +
      '<label class="fld"><span>Unit</span><input type="text" name="unit" placeholder="kg"></label>' +
      '<div class="row-end"><button class="btn" type="submit">Add / update</button></div>' +
    '</form></section>';
}

function chequeCard() {
  var list = MDATA.cheques.slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  var t = todayISO();
  var pend = 0, late = 0, bounce = 0;
  list.forEach(function (c) {
    if (c.status === 'bounced') { bounce += 1; }
    if (c.status === 'pending') {
      pend += num(c.amount);
      if (c.date < t) { late += num(c.amount); }
    }
  });
  var rows = list.map(function (c) {
    var st;
    if (c.status === 'cleared') { st = '<span class="tag good">cleared</span>'; }
    else if (c.status === 'bounced') { st = '<span class="tag bad">bounced</span>'; }
    else if (c.date < t) { st = '<span class="tag bad">late ' + Math.max(0, daysBetween(c.date, t)) + ' days</span>'; }
    else { st = '<span class="tag">' + Math.max(0, daysBetween(t, c.date)) + ' days left</span>'; }
    return '<tr><td>' + dmy(c.date) + '<div class="small muted">' + esc(c.party) + '</div></td>' +
      '<td class="num">' + money(c.amount) + (c.note ? '<div class="small muted">' + esc(c.note) + '</div>' : '') + '</td>' +
      '<td>' + st + '</td>' +
      '<td class="actions">' +
        (c.status === 'pending'
          ? '<button class="link" type="button" data-mact="m-chq-set" data-mid="' + esc(c.id) + '" data-v="cleared">Cleared</button>' +
            '<button class="link del" type="button" data-mact="m-chq-set" data-mid="' + esc(c.id) + '" data-v="bounced">Bounce</button>'
          : '<button class="link" type="button" data-mact="m-chq-set" data-mid="' + esc(c.id) + '" data-v="pending">Undo</button>') +
        '<button class="link del" type="button" data-mact="m-chq-del" data-mid="' + esc(c.id) + '">\u00D7</button>' +
      '</td></tr>';
  }).join('');

  return '<section class="card">' +
    '<div class="card-head"><h2>Cheque diary</h2><span class="hint">' + MDATA.cheques.length + ' cheques</span></div>' +
    '<div class="mini">' +
      '<div><span>Pending</span><b>' + money(pend) + '</b><i>upcoming</i></div>' +
      '<div><span>Date passed</span><b class="' + (late ? 'bad' : '') + '">' + money(late) + '</b><i>check now</i></div>' +
      '<div><span>Bounced</span><b class="' + (bounce ? 'bad' : '') + '">' + bounce + '</b><i>sets the limit</i></div>' +
    '</div>' +
    (rows
      ? '<div class="table-wrap"><table><thead><tr><th>Date / party</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<p class="muted small">No cheques yet.</p>') +
    '<form data-mform="m-cheque" class="grid2" style="margin-top:10px">' +
      '<label class="fld"><span>Party</span><input type="text" name="party" placeholder="customer name"></label>' +
      '<label class="fld"><span>Amount \u20B9</span><input type="number" name="amount" inputmode="decimal" step="any" placeholder="0"></label>' +
      '<label class="fld"><span>Cheque date</span><input type="date" name="date" value="' + todayISO() + '"></label>' +
      '<label class="fld"><span>Note (bank / number)</span><input type="text" name="note" placeholder="optional"></label>' +
      '<div class="row-end"><button class="btn" type="submit">Add cheque</button></div>' +
    '</form></section>';
}

function backupCard() {
  var last = mLastSnap();
  return '<section class="card">' +
    '<div class="card-head"><h2>Backup</h2><span class="hint">' +
      (last ? 'last auto: ' + dmy(last.date) : 'not yet') + '</span></div>' +
    '<p class="muted small" style="margin:0 0 8px">Your data lives only on this phone. Copy a backup once a month and send it to yourself on WhatsApp. ' +
    'The app also keeps a daily snapshot of the last 3 days.</p>' +
    '<div class="btnrow">' +
      '<button class="btn" type="button" data-mact="m-backup-copy">Copy backup</button>' +
      '<button class="btn alt" type="button" data-mact="m-backup-file">Download file</button>' +
      '<button class="btn alt" type="button" data-mact="m-restore-snap">Restore last snapshot</button>' +
    '</div>' +
    '<form data-mform="m-restore" style="margin-top:12px">' +
      '<label class="fld"><span>Paste a backup to restore</span>' +
      '<textarea name="json" placeholder="Paste the backup text here"></textarea></label>' +
      '<div class="row-end" style="margin-top:8px"><button class="btn" type="submit">Restore</button></div>' +
    '</form></section>';
}

function helpCard() {
  var steps = [
    ['1. Setup', 'Enter eight numbers: monthly sales, purchases, expenses, credit days you give, credit days you get, your funding rate (12%), minimum margin and target margin.'],
    ['2. Rates', 'For every quote add supplier, rate, freight, rejection % and credit days. The "True" column is your real cost. Old data can be imported from Excel.'],
    ['3. Customers', 'Add each customer with orders (date, qty, rate) and bills (bill date, amount, paid date). This drives reminders, grades and return on money.'],
    ['4. Quote', 'Pick a customer and quantity: floor, ask and the rate ladder appear. Send the ladder: the rate follows the days they take to pay.'],
    ['5. Today', 'Three to five jobs every morning, each with a ready message. Snooze what can wait.'],
    ['6. Money', 'Cash flow, stock reorder alerts, cheque diary, Excel import/export and backup \u2014 all in one place.']
  ];
  return '<section class="card">' +
    '<div class="card-head"><h2>How to use</h2><span class="hint">6 steps \u00B7 build v4</span></div>' +
    steps.map(function (s) {
      return '<div class="obj"><b class="small">' + esc(s[0]) + '</b><p>' + esc(s[1]) + '</p></div>';
    }).join('') +
    '<p class="muted small" style="margin:10px 0 0">Two minutes a day: open Today and clear what it shows. ' +
    'First of every month: Backup copy.</p>' +
    '<div class="btnrow"><a class="btn" href="guide.html">Open the full guide</a></div></section>';
}

function dataCard() {
  return '<section class="card">' +
    '<div class="card-head"><h2>Excel \u2014 import / export</h2><span class="hint">Excel / CSV</span></div>' +
    '<p class="muted small" style="margin:0 0 10px">Choose the type of data, then pick the file. The first line must be a header ' +
    '(Date, Party, Qty, Rate, Bill amount, Paid date). Column order does not matter \u2014 the app matches names.</p>' +
    '<label class="fld"><span>1. What data is it?</span>' +
      '<select data-mrole="kind"><option value="sales">Sales \u2014 orders, bills, paid date</option>' +
      '<option value="rates">Purchase \u2014 supplier rate sheet</option></select></label>' +
    '<label class="fld" style="margin-top:8px"><span>2. Choose an Excel or CSV file</span>' +
      '<input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" data-mrole="file"></label>' +
    (mLastImport ? '<div class="msg">' + esc(mLastImport) + '</div>' : '') +
    '<p class="muted small" style="margin:10px 0 0">.xlsx and .xls are read directly (first sheet). CSV works too. ' +
    'You can also copy rows from Excel and paste them in Setup \u2192 Import.</p>' +
    '<div class="card-head" style="margin-top:16px"><h2>Send app data to Excel</h2></div>' +
    '<p class="muted small" style="margin:0 0 8px">Download a CSV \u2014 it opens straight in Excel or Google Sheets.</p>' +
    '<div class="btnrow">' +
      '<button class="btn" type="button" data-mact="m-exp-sales">Orders + bills (CSV)</button>' +
      '<button class="btn alt" type="button" data-mact="m-exp-rates">Rate sheet (CSV)</button>' +
    '</div></section>';
}

function marketCard() {
  var mk = MDATA.market;
  var items = mktItems();
  var rows = items.map(function (name) {
    var m = mk.rates[normName(name)] || null;
    var best = materialBest(name);
    var your = best ? best.v : 0;
    var diffTxt = '\u2014', cls = '';
    if (m && m.rate > 0 && your > 0) {
      var d = (your - m.rate) / m.rate * 100;
      diffTxt = (d > 0 ? '+' : '') + fmt(d) + '%';
      cls = d > 1 ? 'bad' : (d < -1 ? 'ok' : '');
    }
    var chg = '';
    if (m && m.prev > 0 && m.rate > 0) {
      var c = (m.rate - m.prev) / m.prev * 100;
      chg = (c > 0 ? '\u2191 ' : (c < 0 ? '\u2193 ' : '')) + fmt(Math.abs(c)) + '%';
    }
    return '<tr><td>' + esc(name) + '</td>' +
      '<td class="num">' + (m ? rs(m.rate) + '<div class="small muted">' + esc(chg) +
        (m.date ? ' ' + dmy(m.date) : '') + '</div>' : '<span class="muted">\u2014</span>') + '</td>' +
      '<td class="num">' + (your ? rs(your) : '\u2014') + '</td>' +
      '<td class="num ' + cls + '">' + diffTxt + '</td></tr>';
  }).join('');

  return '<section class="card">' +
    '<div class="card-head"><h2>Market \u2014 today\'s rate</h2><span class="hint">' +
      (mk.last ? 'checked ' + dmy(mk.last) : 'set a source') + '</span></div>' +
    '<p class="muted small" style="margin:0 0 10px">This tab pulls your rate sheet (a published Google Sheet or any CSV link) once a day. ' +
    'Two columns are enough: <b>Item</b> and <b>Rate</b> (Date optional).</p>' +
    '<form data-mform="m-mkt-src" class="grid2">' +
      '<label class="fld" style="grid-column:1 / -1"><span>Rate sheet link (CSV)</span>' +
      '<input type="url" name="source" value="' + esc(mk.source || '') + '" placeholder="https://docs.google.com/.../pub?output=csv"></label>' +
      '<div class="row-end"><button class="btn" type="submit">Save</button></div>' +
    '</form>' +
    '<div class="btnrow">' +
      '<button class="btn alt" type="button" data-mact="m-mkt-now">Refresh now</button>' +
      '<button class="btn alt" type="button" data-mact="m-mkt-clear">Use manual rates only</button>' +
    '</div>' +
    (mk.err ? '<div class="msg">' + esc(mk.err) + '</div>' : '') +
    (rows ? '<div class="table-wrap"><table><thead><tr><th>Item</th><th class="num">Market</th>' +
      '<th class="num">Your true cost</th><th class="num">Difference</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<p class="muted small">Once rates arrive, each item shows the market rate and how far your supplier is from it.</p>') +
    '<form data-mform="m-mkt-manual" class="grid2" style="margin-top:12px">' +
      '<label class="fld"><span>Item</span><input type="text" name="item" list="mkt-list" placeholder="e.g. DSTDP"></label>' +
      '<label class="fld"><span>Today\'s rate \u20B9</span><input type="number" name="rate" inputmode="decimal" step="any" placeholder="0"></label>' +
      '<label class="fld"><span>Date</span><input type="date" name="date" value="' + todayISO() + '"></label>' +
      '<div class="row-end"><button class="btn" type="submit">Save rate</button></div>' +
    '</form>' +
    '<datalist id="mkt-list">' + items.map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('') + '</datalist>' +
    '<p class="muted small" style="margin:10px 0 0">The link must be a <b>published CSV</b> (Google Sheet: File \u2192 Share \u2192 Publish to web \u2192 CSV). ' +
    'If it is updated every morning the app picks it up by itself; with no internet, type the rate manually.</p>' +
    '</section>';
}

function viewPort() {
  var s = S.settings;
  var p = paymentStats();
  var gm = grossMarginPct();
  var ccc = num(s.stockDays) + num(s.creditGiven) - num(s.creditReceived);
  var thisMonth = mMonths(1)[0];
  var salesM = mSalesByMonth()[thisMonth] || 0;
  var paidM = mPaidByMonth()[thisMonth] || 0;
  var billedM = mBillsByMonth()[thisMonth] || 0;
  var cashPct = billedM > 0 ? Math.min(100, paidM / billedM * 100) : 0;
  var overPct = p.outstanding > 0 ? p.overdue / p.outstanding * 100 : 0;

  var lowStock = 0, okStock = 0;
  MDATA.stock.forEach(function (x) {
    if (num(x.reorder) > 0 && num(x.qty) <= num(x.reorder)) { lowStock += 1; } else { okStock += 1; }
  });
  var stockTot = lowStock + okStock;

  var grades = { A: 0, B: 0, C: 0, N: 0 };
  S.customers.forEach(function (c) { grades[custStanding(c).grade] += 1; });
  var gradeTot = S.customers.length;
  var aPct = gradeTot ? grades.A / gradeTot * 100 : 0;

  var pendChq = 0;
  MDATA.cheques.forEach(function (c) { if (c.status === 'pending') { pendChq += num(c.amount); } });

  var empty = !S.customers.length && !S.quotes.length;

  return '' + (S.demo ? demoBanner() : '') + introCard() +
    (empty
      ? '<section class="card"><div class="card-head"><h2>Start here</h2><span class="hint">3 steps</span></div>' +
        '<div class="steps">' +
          '<div class="step"><b>1</b><span><strong>Setup</strong> \u2014 eight numbers: sales, purchases, expenses, credit days, funding rate, margin.</span></div>' +
          '<div class="step"><b>2</b><span><strong>Rates</strong> \u2014 two or three supplier rates, or import your old Excel from the Money tab.</span></div>' +
          '<div class="step"><b>3</b><span><strong>Customers</strong> \u2014 two customers with their bills. The circles then fill by themselves.</span></div>' +
        '</div>' +
        '<div class="btnrow"><button class="btn" type="button" data-mtab="setup">Open Setup</button>' +
        '<button class="btn alt" type="button" data-mtab="money">Excel import</button></div></section>'
      : '') +
    '<section class="card">' +
      '<div class="card-head"><h2>Portfolio</h2><span class="hint">' + dmy(todayISO()) + '</span></div>' +
      '<p class="muted small" style="margin:0 0 10px">Each circle is one part of the business. Tap a circle to open its tab and edit the numbers.</p>' +
      '<div class="port">' +
        portCard({ tab: 'paisa', pct: cashPct, tone: cashPct >= 80 ? 'ok' : (cashPct >= 50 ? 'warn' : 'bad'),
          big: Math.round(cashPct) + '%', name: 'Cash received', sub: money(paidM) + ' / ' + money(billedM) }) +
        portCard({ tab: 'cust', pct: 100 - overPct, tone: overPct <= 15 ? 'ok' : (overPct <= 30 ? 'warn' : 'bad'),
          big: Math.round(overPct) + '%', name: 'Overdue share', sub: money(p.overdue) + ' / ' + money(p.outstanding) }) +
        portCard({ tab: 'money', pct: stockTot ? okStock / stockTot * 100 : 0,
          tone: (stockTot && lowStock) ? 'warn' : 'ok',
          big: stockTot ? Math.round(okStock / stockTot * 100) + '%' : '\u2014',
          name: 'Stock OK', sub: stockTot ? (okStock + ' OK, ' + lowStock + ' to order') : 'Add stock items' }) +
        portCard({ tab: 'cust', pct: aPct, tone: aPct >= 60 ? 'ok' : (aPct >= 30 ? 'warn' : 'bad'),
          big: grades.A + '/' + gradeTot, name: 'A-grade customers', sub: grades.B + ' B, ' + grades.C + ' C' }) +
        portCard({ tab: 'quote', pct: Math.min(100, gm / 20 * 100), tone: gm >= 8 ? 'ok' : 'bad',
          big: fmt(gm, 0) + '%', name: 'Gross margin', sub: '20% fills the ring' }) +
        portCard({ tab: 'paisa', pct: Math.max(0, 100 - Math.min(100, ccc / 90 * 100)),
          tone: ccc <= 45 ? 'ok' : (ccc <= 75 ? 'warn' : 'bad'),
          big: Math.round(ccc) + ' days', name: 'Cash cycle', sub: 'keep under 75 days' }) +
      '</div>' +
      '<div class="mini" style="margin-top:12px">' +
        '<div><span>Sales this month</span><b>' + money(salesM) + '</b><i>from orders</i></div>' +
        '<div><span>Cheques pending</span><b>' + money(pendChq) + '</b><i>upcoming</i></div>' +
        '<div><span>Working capital</span><b>' + money(wcCalc().total) + '</b><i>needed</i></div>' +
      '</div>' +
      '<div class="btnrow">' +
        '<button class="btn alt" type="button" data-mtab="setup">Edit setup</button>' +
        '<button class="btn alt" type="button" data-mtab="aaj">Today\'s work</button>' +
        '<a class="btn alt" href="guide.html">Guide</a>' +
      '</div>' +
    '</section>';
}

function mDoImport(text, kind) {
  var r = (kind === 'rates') ? importRates(text) : importSales(text);
  if (!r || r.error) {
    mLastImport = 'Could not read the file: ' + (r && r.error ? r.error : 'rows were not understood');
    render(true);
    return;
  }
  save();
  if (kind === 'rates') {
    mLastImport = 'Imported ' + r.quotes + ' rate records' +
      (r.dup ? ', ' + r.dup + ' duplicates skipped' : '') +
      (r.skipped ? ', ' + r.skipped + ' rows not understood' : '');
  } else {
    mLastImport = 'Imported ' + r.orders + ' orders, ' + r.bills + ' bills, ' + r.newCust + ' new customers' +
      (r.dup ? ', ' + r.dup + ' duplicates skipped' : '') +
      (r.skipped ? ', ' + r.skipped + ' rows not understood' : '') +
      (r.unmatched && r.unmatched.length ? '. Names not matched: ' + r.unmatched.join(', ') : '');
  }
  render(true);
}


function mktFetch(force) {
  var mk = MDATA.market;
  if (!mk.source) { return; }
  if (!force && mk.last === todayISO()) { return; }
  mk.last = todayISO();
  mk.err = '';
  mSave();
  fetch(mk.source, { cache: 'no-store' }).then(function (r) {
    if (!r.ok) { throw new Error('HTTP ' + r.status); }
    return r.text();
  }).then(function (txt) {
    var rows = xlRows(txt);
    if (rows.length < 2) { throw new Error('no data in the file'); }
    var map = xlMap(rows[0], ['item', 'rate', 'date']);
    if (map.item === undefined || map.rate === undefined) { throw new Error('header needs Item and Rate'); }
    var n = 0;
    for (var i = 1; i < rows.length; i++) {
      var nm = rows[i][map.item];
      var rt = num(String(rows[i][map.rate] || '').replace(/[^0-9.]/g, ''));
      if (!nm || !rt) { continue; }
      var k = normName(nm);
      var old = mk.rates[k];
      mk.rates[k] = {
        item: String(nm).trim(), rate: rt, prev: old ? old.rate : 0,
        date: (map.date !== undefined && rows[i][map.date]) ? String(rows[i][map.date]).trim() : todayISO()
      };
      n += 1;
    }
    mk.err = n ? '' : 'no rows were understood';
    mSave();
    render(true);
  }).catch(function (err) {
    mk.err = 'Rates could not be fetched: ' + ((err && err.message) ? err.message : 'check the link');
    mSave();
    render(true);
  });
}


/* =========================================================
   Sample data + one-page intro
   ========================================================= */

function introCard() {
  return '<details class="card">' +
    '<summary><h2>What this app is</h2><span class="hint">1 minute read</span></summary>' +
    '<div class="cust-body">' +
    '<p class="small" style="margin:0 0 8px"><b>A rate, cash and customer register with a brain.</b> ' +
    'You enter supplier rates, orders and bills. The app turns them into a floor price for every customer, a rate ladder, ' +
    'a recovery list, and the true cost of each supplier.</p>' +
    '<p class="small" style="margin:0 0 8px"><b>What it does not do:</b> it does not invent market rates, it cannot send WhatsApp ' +
    'messages by itself, and it knows nothing you have not entered.</p>' +
    '<p class="small" style="margin:0 0 8px"><b>Your data stays on this phone.</b> Take a backup from the Money tab once a month.</p>' +
    '<p class="small" style="margin:0"><b>First week:</b> 10 minutes in Setup, two or three supplier rates, two customers with bills. ' +
    'After that, two minutes a day.</p>' +
    '<div class="btnrow">' +
      '<button class="btn" type="button" data-mact="m-sample">Load sample data</button>' +
      '<button class="btn alt" type="button" data-mact="m-sample-clear">Clear all data</button>' +
      '<a class="btn alt" href="guide.html">Full guide</a>' +
    '</div></div></details>';
}

function loadSample() {
  var t = todayISO();
  function d(n) { return addDays(t, -n); }
  function q(days, supplier, rate, freight, rej, pay) {
    S.quotes.push({
      id: uid(), date: d(days), supplier: supplier, item: 'DSTDP',
      rate: rate, freight: freight, rejection: rej, moq: '500 kg', deliveryDays: 3, payDays: pay
    });
  }
  S.settings.business = 'Sample Chemicals';
  S.settings.item = 'DSTDP';
  S.settings.unit = 'kg';
  S.settings.monthlySales = 2600000;
  S.settings.monthlyPurchase = 2200000;
  S.settings.monthlyExpenses = 140000;
  S.settings.creditGiven = 60;
  S.settings.creditReceived = 15;
  S.settings.stockDays = 10;
  S.settings.costOfFunds = 12;
  S.settings.minMargin = 3;
  S.settings.targetMargin = 6;
  S.settings.costOverride = 0;

  S.quotes = [];
  q(2, 'Gupta Chemicals', 285, 2, 0.5, 15);
  q(2, 'Anand Traders', 292, 0, 0, 7);
  q(6, 'Balaji Chem', 279, 3, 3, 30);
  q(12, 'Gupta Chemicals', 288, 2, 0.5, 15);
  q(25, 'Gupta Chemicals', 291, 2, 0.5, 15);
  q(40, 'Anand Traders', 296, 0, 0, 7);

  var c1 = { id: uid(), name: 'Verma Polymers', phone: '9876543210', creditDays: 60, creditLimit: 600000, bills: [] };
  var c2 = { id: uid(), name: 'Sharma Rubber', phone: '9812345678', creditDays: 45, creditLimit: 400000, bills: [] };
  var c3 = { id: uid(), name: 'Kapoor Traders', phone: '', creditDays: 30, creditLimit: 250000, bills: [] };
  S.customers = [c1, c2, c3];

  c1.bills.push({ id: uid(), date: d(70), amount: 240000, note: 'INV-118', paidOn: '' });
  c1.bills.push({ id: uid(), date: d(20), amount: 180000, note: 'INV-131', paidOn: '' });
  c1.bills.push({ id: uid(), date: d(110), amount: 150000, note: 'INV-102', paidOn: d(55) });
  c2.bills.push({ id: uid(), date: d(12), amount: 160000, note: 'INV-128', paidOn: '' });
  c2.bills.push({ id: uid(), date: d(95), amount: 120000, note: 'INV-099', paidOn: d(62) });
  c3.bills.push({ id: uid(), date: d(48), amount: 90000, note: 'INV-121', paidOn: '' });

  S.orders = [];
  function order(c, days, qty, rate, pid, promised, delivered, rejected) {
    S.orders.push({
      id: uid(), customerId: c.id, date: d(days), product: pid || '', qty: qty, rate: rate,
      promised: promised ? d(promised) : '', delivered: delivered ? d(delivered) : '',
      rejected: rejected || 0, replaced: false, note: ''
    });
  }
  order(c1, 95, 800, 281, '', 92, 91, 0);
  order(c1, 62, 900, 284, '', 59, 60, 6);
  order(c1, 30, 1000, 286, '', 27, 26, 0);
  order(c1, 8, 1200, 289, '', 5, 0, 0);
  order(c2, 55, 500, 285, '', 52, 52, 0);
  order(c2, 25, 600, 288, '', 22, 21, 0);
  order(c3, 50, 300, 292, '', 47, 47, 0);
  order(c3, 20, 350, 295, '', 17, 17, 0);

  S.claims = [{
    id: uid(), customerId: c1.id, date: d(12), claimed: 276, theirDays: 30, ours: 289, outcome: 'ordered', note: ''
  }];

  MDATA.stock = [
    { id: mUid(), name: 'DSTDP', qty: 1200, reorder: 1500, unit: 'kg' },
    { id: mUid(), name: 'Zinc Oxide', qty: 850, reorder: 400, unit: 'kg' }
  ];
  MDATA.cheques = [
    { id: mUid(), party: 'Verma Polymers', amount: 240000, date: addDays(t, 5), note: 'HDFC 4421', status: 'pending' },
    { id: mUid(), party: 'Sharma Rubber', amount: 120000, date: addDays(t, -3), note: 'SBI 7782', status: 'pending' },
    { id: mUid(), party: 'Kapoor Traders', amount: 90000, date: d(35), note: 'cleared', status: 'cleared' }
  ];
  MDATA.market = MDATA.market || { source: '', last: '', err: '', rates: {} };
  MDATA.market.rates = {
    dstdp: { item: 'DSTDP', rate: 283, prev: 288, date: todayISO() }
  };

  save();
  mSave();
  render(true);
  toast('Sample data loaded');
}

document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-mact="m-sample"], [data-mact="m-sample-clear"]');
  if (!b) { return; }
  if (b.getAttribute('data-mact') === 'm-sample') {
    if (!confirm('Load sample data? Your current data will be replaced.')) { return; }
    loadSample();
    return;
  }
  if (!confirm('Clear all data and start empty? Take a backup first.')) { return; }
  S = blankState();
  MDATA.stock = [];
  MDATA.cheques = [];
  save();
  mSave();
  render(true);
  toast('All data cleared');
});


/* =========================================================
   Compact: tab notes, more menu, statement, rejection log
   ========================================================= */

function tabNote(tab) {
  var notes = {
    port: 'Six circles: cash in, overdue, stock, customer grade, margin, cash cycle. A red circle is the job for this week.',
    aaj: 'Today\u2019s jobs only \u2014 late delivery, overdue payment, customer at risk, reorder due, rate movement. Each has a ready message.',
    cust: 'Every customer with money outstanding. Open one to see orders, bills, grade, statement and rejection history.',
    quote: 'Floor price, ask price and the rate ladder for one customer and quantity. Use this before quoting any order.',
    money: 'Excel import/export, cash flow, stock, cheque diary, customer statement, rejection log, and backup.',
    setup: 'The eight numbers the whole app runs on, plus products, sample data and backup.'
  };
  var n = notes[tab];
  if (!n) { return ''; }
  return '<details class="card"><summary><span class="hint">What is in this tab</span></summary>' +
    '<div class="cust-body"><p class="small" style="margin:0">' + esc(n) + '</p></div></details>';
}

function moreCard() {
  var items = [
    ['rate', 'Rates', 'Supplier rate sheet and true cost'],
    ['market', 'Market', 'Today\u2019s rate from your sheet'],
    ['paisa', 'Cash', 'Working capital and cost of credit']
  ];
  return '<section class="card">' +
    '<div class="card-head"><h2>More</h2><span class="hint">same data, other views</span></div>' +
    '<div class="btnrow">' + items.map(function (x) {
      return '<button class="btn alt" type="button" data-mtab="' + x[0] + '">' + esc(x[1]) + '</button>';
    }).join('') + '</div>' +
    '<p class="muted small" style="margin:10px 0 0">' + items.map(function (x) { return '<b>' + x[1] + ':</b> ' + x[2]; }).join(' \u00B7 ') + '</p>' +
    '</section>';
}

function statementCard() {
  var opts = S.customers.map(function (c) {
    return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
  }).join('');
  return '<section class="card">' +
    '<div class="card-head"><h2>Customer statement</h2><span class="hint">print or save as PDF</span></div>' +
    '<p class="muted small" style="margin:0 0 8px">Open a customer\u2019s statement (bills, due dates, ageing, delivery and rejection record), ' +
    'then use <b>Print</b> \u2192 <b>Save as PDF</b> \u2192 send it on WhatsApp.</p>' +
    (opts
      ? '<label class="fld"><span>Customer</span><select data-mrole="stmtcust">' + opts + '</select></label>' +
        '<div class="btnrow"><button class="btn" type="button" data-mact="m-stmt">Open statement</button></div>'
      : '<p class="muted small">Add a customer first.</p>') +
    '</section>';
}

function rejectCard() {
  var t = todayISO();
  var rows = S.orders.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 8);
  var totalQ = 0, totalR = 0;
  S.orders.forEach(function (o) {
    if (daysBetween(o.date, t) <= 90) { totalQ += num(o.qty); totalR += num(o.rejected); }
  });
  var rejPct = totalQ > 0 ? totalR / totalQ * 100 : 0;
  var list = rows.map(function (o) {
    var c = findCust(o.customerId);
    return '<tr><td>' + dmy(o.date) + '<div class="small muted">' + esc(c ? c.name : '') + '</div></td>' +
      '<td class="num">' + fmt(o.qty, 0) + '</td>' +
      '<td class="num">' + (num(o.rejected) ? '<b class="bad">' + fmt(o.rejected, 0) + '</b>' : '\u2014') + '</td>' +
      '<td class="actions"><button class="link" type="button" data-mact="m-rej" data-mid="' + esc(o.id) + '">Reject qty</button></td></tr>';
  }).join('');
  return '<section class="card">' +
    '<div class="card-head"><h2>Rejection log</h2><span class="hint">last 90 days: ' + fmt(rejPct) + '%</span></div>' +
    '<p class="muted small" style="margin:0 0 8px">Mark the rejected quantity on any order. 2% rejection on a 6% margin eats a third of the profit \u2014 ' +
    'this is the number to show the customer.</p>' +
    (list ? '<div class="table-wrap"><table><thead><tr><th>Order</th><th class="num">Qty</th><th class="num">Rejected</th><th></th></tr></thead><tbody>' + list + '</tbody></table></div>'
      : '<p class="muted small">No orders yet.</p>') +
    '</section>';
}

document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-mact="m-stmt"], [data-mact="m-rej"]');
  if (!b) { return; }
  if (b.getAttribute('data-mact') === 'm-stmt') {
    var sel = document.querySelector('[data-mrole="stmtcust"]');
    if (!sel || !sel.value) { toast('Add a customer first'); return; }
    location.href = 'statement.html?id=' + encodeURIComponent(sel.value);
    return;
  }
  var id = b.getAttribute('data-mid');
  var o = S.orders.filter(function (x) { return x.id === id; })[0];
  if (!o) { return; }
  var v = prompt('Rejected quantity (' + unitOf() + ')?', String(num(o.rejected)));
  if (v === null) { return; }
  o.rejected = Math.max(0, num(v));
  save();
  render(true);
  toast('Rejection saved');
});

/* put the three new cards inside the Money view */
function viewMoney() {
  mAutoSnap();
  return '' + (S.demo ? demoBanner() : '') +
    statementCard() + dataCard() + cashFlowCard() + rejectCard() + moreCard() +
    helpCard() + stockCard() + chequeCard() + backupCard();
}
