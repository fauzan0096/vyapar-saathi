'use strict';

/* =========================================================
   Vyapar Saathi v2 — screens
   ========================================================= */

function regMsg(text) {
  ui.msgs.push(text);
  return ui.msgs.length - 1;
}

function sendButtons(phone, text, label) {
  var i = regMsg(text);
  return '<a class="btn" href="' + esc(waLink(phone, text)) + '" target="_blank" rel="noopener">' + esc(label || 'WhatsApp par bhejein') + '</a>' +
    '<button class="btn alt" type="button" data-action="copy" data-idx="' + i + '">Copy</button>';
}

function msgBox(text) { return '<div class="msg">' + esc(text) + '</div>'; }

function demoBanner() {
  return '<div class="demo"><div><b>Sample data chal raha hai</b>' +
    '<div class="small muted">Numbers misaal ke liye hain. Apna data daalne se pehle sample hata dein.</div></div>' +
    '<button class="btn tiny alt" type="button" data-action="demo-clear">Sample hatao</button></div>';
}

function gapCard(g) {
  return '<div class="alert ' + g.level + '"><b>' + esc(g.title) + '</b><p>' + esc(g.why) + '</p>' +
    '<p class="act">Karein: ' + esc(g.action) + '</p></div>';
}

function gradeChip(g) {
  var cls = g === 'A' ? 'good' : (g === 'C' ? 'bad' : (g === 'B' ? 'warn' : ''));
  return '<span class="tag ' + cls + '">' + esc(gradeLabel(g)) + '</span>';
}

function findCust(id) {
  return S.customers.filter(function (c) { return c.id === id; })[0] || null;
}

function costLine(cn) {
  if (cn.src === 'none') { return 'Is product ki recipe (BOM) ya lagat abhi nahi likhi — Setup > Products me bharein.'; }
  if (cn.src === 'bom' && cn.missing && cn.missing.length) {
    return 'Lagat adhoori: in raw material ka rate nahi mila — ' + cn.missing.join(', ') + '. Rate tab me daalein.';
  }
  if (!cn.v) { return 'Lagat abhi nahi pata — Rate tab me supplier rate daalein ya Setup me lagat likhein.'; }
  if (cn.src === 'manual') { return 'Lagat ' + rs(cn.v) + ' per ' + unitOf() + ' (aapne Setup me khud likhi).'; }
  if (cn.src === 'bom') {
    return 'Lagat ' + rs(cn.v) + ' per ' + unitOf() + ' = raw material ' + rs(cn.rawBeforeYield) +
      (cn.yieldPct < 100 ? ' ÷ yield ' + fmt(cn.yieldPct, 1) + '% = ' + rs(cn.raw) : '') +
      ' + conversion ' + rs(cn.conv) + '.';
  }
  var q = cn.q;
  return 'Lagat ' + rs(cn.v) + ' per ' + unitOf() + ' — ' + q.supplier + ' ke rate se (freight, rejection aur credit ke baad).' +
    (cn.stale > 15 ? ' Dhyan: rate ' + cn.stale + ' din purana hai.' : '');
}

function productSelect(name, selected, label) {
  if (!S.products.length) { return ''; }
  return '<label class="fld"><span>' + esc(label || 'Product') + '</span><select name="' + name + '">' +
    '<option value="">— chunein —</option>' +
    S.products.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === selected ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('') + '</select></label>';
}

function bomTable(cn) {
  if (!cn || cn.src !== 'bom' || !cn.parts) { return ''; }
  var rows = cn.parts.map(function (x) {
    return '<tr><td>' + esc(x.material) + '</td><td class="num">' + fmt(x.qty, 3) + ' kg</td>' +
      '<td class="num">' + (x.price ? rs(x.price) : '—') + '</td><td class="num">' + (x.amount ? rs(x.amount) : '—') + '</td>' +
      '<td class="small muted">' + esc(x.supplier || '') + '</td></tr>';
  }).join('');
  return '<table class="tbl"><thead><tr><th>Raw material</th><th>Per kg</th><th>Asli rate</th><th>₹ / kg</th><th>Supplier</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

/* ---------------- Aaj ---------------- */

var JOB_LABEL = {
  delay: 'Delivery', churn: 'Customer jaa sakta hai', remind: 'Payment',
  reorder: 'Order ka time', rate: 'Rate badla', lock: 'Rate lock'
};

function jobCard(j) {
  var c = findCust(j.cid);
  var phone = c ? c.phone : '';
  var tagCls = (j.kind === 'churn' || j.kind === 'delay') ? 'bad' : ((j.kind === 'remind') ? 'warn' : 'good');
  return '<div class="job ' + j.kind + '">' +
    '<div class="job-top"><span class="tag ' + tagCls + '">' + esc(JOB_LABEL[j.kind]) + '</span>' +
      '<b>' + esc(j.name) + '</b></div>' +
    '<div class="job-title">' + esc(j.title) + '</div>' +
    '<p class="small muted" style="margin:3px 0 0">' + esc(j.why) + '</p>' +
    '<details class="obj"><summary>Message dekhein</summary>' + msgBox(j.msg) + '</details>' +
    '<div class="btnrow">' + sendButtons(phone, j.msg, j.call ? 'WhatsApp par puchhein' : 'WhatsApp par bhejein') +
      '<button class="btn alt" type="button" data-action="snooze" data-key="' + esc(j.key) + '" data-days="' + j.snoozeDays + '">Ho gaya</button>' +
      '<button class="btn alt" type="button" data-action="open-cust" data-id="' + esc(j.cid) + '">Customer</button>' +
    '</div></div>';
}

function viewAaj() {
  var p = paymentStats();
  var cc = concentration();
  var list = jobs();
  var risky = S.customers.map(function (c) { return churnRisk(c); }).filter(function (r) { return r.level; });
  var atRisk = sum(risky.map(function (r) { return r.valueAtRisk; }));

  var start = '';
  if (!S.customers.length) {
    start = '<section class="card"><div class="card-head"><h2>Shuru kaise karein</h2></div>' +
      '<ol class="steps small">' +
      '<li><b>Setup</b> me business ka naam, item aur paise ki lagat bharein.</li>' +
      '<li><b>Rate</b> me 2-3 suppliers ke rate daalein — isi se bechne ka floor nikalta hai.</li>' +
      '<li><b>Customer</b> me customer, uske order aur bill daalein.</li>' +
      '<li>Phir yahan roz ka kaam khud banega: kise message bhejna hai, kise call karna hai.</li></ol>' +
      '<div class="btnrow"><button class="btn alt" type="button" data-action="demo">Pehle sample data se dekhein</button></div></section>';
  }

  return '' + (S.demo ? demoBanner() : '') +
    '<section class="kpis">' +
      '<div class="kpi"><span class="kpi-l">Aaj ke kaam</span><b class="kpi-v">' + list.length +
        '</b><span class="kpi-s">' + (list.length ? 'neeche list hai' : 'sab nipta') + '</span></div>' +
      '<div class="kpi"><span class="kpi-l">Khatre me customer</span><b class="kpi-v' + (risky.length ? ' bad' : '') + '">' + risky.length +
        '</b><span class="kpi-s">' + (atRisk ? money(atRisk) + '/mahina daav par' : 'koi nahi') + '</span></div>' +
      '<div class="kpi"><span class="kpi-l">Bazaar me phansa paisa</span><b class="kpi-v">' + money(p.outstanding) +
        '</b><span class="kpi-s">' + (p.overdue > 0 ? money(p.overdue) + ' overdue' : 'sab time par') + '</span></div>' +
      '<div class="kpi"><span class="kpi-l">Sabse bada buyer</span><b class="kpi-v' + (cc.top && cc.top.pct >= 60 ? ' bad' : '') + '">' +
        (cc.top ? fmt(cc.top.pct, 0) + '%' : '—') + '</b><span class="kpi-s">' + (cc.top ? esc(cc.top.c.name) + ' ka hissa' : 'order daalein') + '</span></div>' +
    '</section>' + start +
    '<section class="card"><div class="card-head"><h2>Aaj ka kaam</h2><span class="hint">sabse zaroori pehle</span></div>' +
      (list.length ? list.map(jobCard).join('') :
        '<p class="ok" style="margin:0">Abhi koi kaam baaki nahi. Orders aur bills daalte rahein, list khud banegi.</p>') +
      '<p class="muted small" style="margin:10px 0 0">WhatsApp button par message pehle se likha khulta hai; bhejna aapko dabana hota hai. ' +
        '“Ho gaya” dabane par wo kaam kuch din ke liye hat jata hai.</p>' +
    '</section>';
}

/* ---------------- Customer ---------------- */

function custListRow(c) {
  var st = custStanding(c);
  var os = orderStats(c.id);
  var cr = churnRisk(c);
  var due = custDue(c);
  var out = sum(due.map(function (b) { return b.amount; }));
  var over = sum(due.filter(function (b) { return b.overdueDays > 0; }).map(function (b) { return b.amount; }));
  return '<button class="crow" type="button" data-action="open-cust" data-id="' + esc(c.id) + '">' +
    '<div class="crow-l"><b>' + esc(c.name) + '</b> ' + gradeChip(st.grade) +
      (cr.level ? ' <span class="tag bad">khatra</span>' : '') +
      '<div class="small muted">' + (os.last ? 'aakhri order ' + daysAgoText(os.daysSince) + (os.cycle ? ' · har ' + os.cycle + ' din' : '') : 'abhi order nahi') + '</div></div>' +
    '<div class="crow-r"><b>' + money(out) + '</b><div class="small ' + (over ? 'bad' : 'muted') + '">' +
      (over ? money(over) + ' overdue' : 'time par') + '</div></div></button>';
}

function editCustForm(c) {
  return '<form data-form="cust-edit" class="grid2">' +
    '<input type="hidden" name="id" value="' + esc(c.id) + '">' +
    field('Naam', 'name', c.name, 'text') +
    field('Phone (WhatsApp)', 'phone', c.phone, 'tel') +
    field('Credit days (terms)', 'creditDays', c.creditDays, 'number', '60') +
    field('Credit limit ₹', 'creditLimit', c.creditLimit, 'number', '0') +
    '<div class="row-end"><button class="btn" type="submit">Save</button>' +
    '<button class="btn alt" type="button" data-action="cancel-edit">Cancel</button></div></form>';
}

function orderRow(o) {
  var status;
  if (o.delivered) {
    var late = o.promised ? daysBetween(o.promised, o.delivered) : 0;
    status = late > 0 ? '<span class="tag bad">' + late + ' din late</span>' : '<span class="tag good">time par</span>';
  } else if (o.promised && o.promised < todayISO()) {
    status = '<span class="tag bad">' + daysBetween(o.promised, todayISO()) + ' din late, baaki</span>';
  } else {
    status = '<span class="tag">pending' + (o.promised ? ' · ' + dmy(o.promised) : '') + '</span>';
  }
  var rej = num(o.rejected) > 0
    ? '<div class="small bad">rejection ' + fmt(o.rejected, 0) + (o.replaced ? ' (replace ho gaya)' : ' (replacement baaki)') + '</div>' : '';
  var pn = o.product ? productName(o.product) : '';
  return '<tr><td>' + dmy(o.date) + (pn ? '<div class="small"><b>' + esc(pn) + '</b></div>' : '') + (o.note ? '<div class="small muted">' + esc(o.note) + '</div>' : '') + '</td>' +
    '<td class="num">' + fmt(o.qty, 0) + ' × ' + rs(o.rate) + '</td>' +
    '<td>' + status + rej + '</td>' +
    '<td class="actions">' +
      (o.delivered ? '' : '<button class="link" type="button" data-action="order-delivered" data-id="' + esc(o.id) + '">Delivered</button>') +
      (o.delivered && num(o.rejected) <= 0 ? '<button class="link" type="button" data-action="order-reject" data-id="' + esc(o.id) + '">Rejection</button>' : '') +
      (num(o.rejected) > 0 && !o.replaced ? '<button class="link" type="button" data-action="order-replaced" data-id="' + esc(o.id) + '">Replaced</button>' : '') +
      '<button class="link del" type="button" data-action="del-order" data-id="' + esc(o.id) + '">×</button></td></tr>';
}

function billRow(c, b) {
  var dueIso = addDays(b.date, c.creditDays);
  var late = b.paidOn ? 0 : daysBetween(dueIso, todayISO());
  var status;
  if (b.paidOn) { status = '<span class="tag good">paid ' + dmy(b.paidOn) + ' (' + Math.max(0, daysBetween(b.date, b.paidOn)) + ' din)</span>'; }
  else if (late > 0) { status = '<span class="tag bad">' + late + ' din late</span>'; }
  else { status = '<span class="tag">' + Math.max(0, -late) + ' din baaki</span>'; }
  return '<tr><td>' + dmy(b.date) + '<div class="small muted">due ' + dmy(dueIso) + '</div></td>' +
    '<td class="num">' + money(b.amount) + (b.note ? '<div class="small muted">' + esc(b.note) + '</div>' : '') + '</td>' +
    '<td>' + status + '</td><td class="actions">' +
    (b.paidOn ? '' : '<button class="link" type="button" data-action="mark-paid" data-id="' + esc(c.id) + '" data-bill="' + esc(b.id) + '">Paid</button>') +
    '<button class="link del" type="button" data-action="del-bill" data-id="' + esc(c.id) + '" data-bill="' + esc(b.id) + '">×</button></td></tr>';
}

function statementCard(c) {
  var v = valueStatement(c, ui.stmtDays);
  var opts = [30, 90, 180, 365].map(function (d) {
    return '<button class="tone' + (ui.stmtDays === d ? ' active' : '') + '" type="button" data-action="stmt-days" data-days="' + d + '">' + d + ' din</button>';
  }).join('');
  var body;
  if (!v.orders) {
    body = '<p class="muted small">Is period me koi order nahi. Order aur delivery daalne par statement banega.</p>';
  } else {
    var msg = statementMessage(c, v);
    body = '<div class="mini">' +
      '<div><span>Time par delivery</span><b>' + (v.onTimePct === null ? '—' : fmt(v.onTimePct, 0) + '%') + '</b><i>' + v.onTime + '/' + v.delivered + ' order</i></div>' +
      '<div><span>Rejection</span><b>' + fmt(v.rejPct) + '%</b><i>' + v.replaced + '/' + v.rejOrders + ' replace</i></div>' +
      '<div><span>Credit ka faayda</span><b>' + money(v.creditValue) + '</b><i>avg ' + fmt(v.avgCreditDays, 0) + ' din</i></div></div>' +
      (v.warn.length
        ? '<div class="signal warn" style="margin-top:10px"><b>Pehle ye sudharein</b><p>' + esc(v.warn.join('; ')) +
          '. Ye statement abhi customer ko mat bhejein — pehle kami door karein.</p></div>'
        : '<p class="small ok" style="margin:10px 0 0">Numbers acche hain — customer ke saamne rakhne layak.</p>') +
      msgBox(msg) + '<div class="btnrow">' + sendButtons(c.phone, msg, 'Statement bhejein') + '</div>';
  }
  return '<section class="card"><div class="card-head"><h2>Mahine ka statement</h2><span class="hint">jab wo kahe “doosra sasta hai”</span></div>' +
    '<div class="tonebar" style="margin:0 0 10px">' + opts + '</div>' + body + '</section>';
}

function viewCustDetail(c) {
  var st = custStanding(c);
  var os = orderStats(c.id);
  var cr = churnRisk(c);
  var cs = claimStats(c.id);
  var q = quoteFor(c, os.avgQty, os.pid);
  var due = custDue(c);
  var outAmt = sum(due.map(function (b) { return b.amount; }));
  var limit = num(c.creditLimit);
  var util = limit > 0 ? Math.min(100, outAmt / limit * 100) : 0;
  var tone = toneFor(c);
  var editing = ui.editCustomer === c.id;
  var msg = reminderMessage(c, tone);
  var defRate = q.ask ? q.ask.toFixed(2) : (os.lastRate || '');
  var orderRows = os.os.slice().reverse().map(orderRow).join('');
  var billRows = c.bills.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })
    .map(function (b) { return billRow(c, b); }).join('');

  return '' + (S.demo ? demoBanner() : '') +
    '<button class="btn alt tiny" type="button" data-action="back-cust">← Saare customer</button>' +
    '<section class="card" style="margin-top:10px">' +
      '<div class="card-head"><h2>' + esc(c.name) + '</h2>' + gradeChip(st.grade) + '</div>' +
      '<div class="small muted">' + (c.phone ? esc(c.phone) + ' · ' : '') + 'terms ' + st.terms + ' din · asli payment ~' + st.days + ' din' +
        (st.paidCount < 2 ? ' (abhi kam record)' : '') + '</div>' +
      (limit > 0 ? '<div class="limit" style="margin-top:8px"><div class="limit-top"><span class="small muted">Credit limit ' + money(limit) +
        '</span><span class="small ' + (util > 90 ? 'bad' : 'muted') + '">' + fmt(util, 0) + '% use</span></div>' +
        '<div class="bar-track"><div class="bar-fill' + (util > 90 ? ' red' : '') + '" style="width:' + Math.round(util) + '%"></div></div></div>' : '') +
      (editing ? editCustForm(c) :
        '<div class="btnrow"><button class="btn tiny alt" type="button" data-action="edit-customer" data-id="' + esc(c.id) + '">Details badlein</button>' +
        '<button class="btn tiny danger" type="button" data-action="del-customer" data-id="' + esc(c.id) + '">Hataayein</button></div>') +
    '</section>' +

    (cr.level ? '<section class="card"><div class="alert ' + (cr.level === 'high' ? 'high' : 'mid') + '" style="margin:0"><b>' +
      (cr.level === 'high' ? 'Jaane ka khatra: zyada' : 'Jaane ka khatra: thoda') + '</b>' +
      cr.reasons.map(function (r) { return '<p>' + esc(r) + '</p>'; }).join('') + '</div>' +
      '<div class="btnrow">' + sendButtons(c.phone, churnMessage(c, cr), 'Hal-chaal puchhein') + '</div></section>' : '') +

    '<section class="card"><div class="card-head"><h2>Is customer ka rate</h2>' +
      '<button class="link" type="button" data-action="go-quote" data-id="' + esc(c.id) + '">Quote kholein →</button></div>' +
      (q.product ? '<div class="small muted" style="margin-bottom:6px">Product: <b>' + esc(q.product.name) + '</b></div>' : '') +
      (q.ask ?
        '<div class="mini"><div><span>Pehle bolein</span><b>' + rs(q.ask) + '</b><i>' + st.days + ' din payment</i></div>' +
        '<div><span>Floor (isse neeche nahi)</span><b>' + rs(q.floor) + '</b><i>' + fmt((q.ask - q.floor) / q.ask * 100) + '% gunjaish</i></div>' +
        '<div><span>Pichhla rate</span><b>' + (os.lastRate ? rs(os.lastRate) : '—') + '</b><i>' +
          (os.lastRate && q.floor && os.lastRate < q.floor ? 'floor se neeche tha' : (os.last ? dmy(os.last.date) : '')) + '</i></div></div>'
        : '<p class="muted small" style="margin:0">' + esc(costLine(q.costInfo)) + '</p>') +
      (cs.n || cs.pending ? '<p class="small" style="margin:10px 0 0"><b>Bluff tracker:</b> ' + esc(cs.verdict) + '</p>' : '') +
    '</section>' +

    '<section class="card"><div class="card-head"><h2>Orders</h2><span class="hint">' + (os.cycle ? 'aam taur par har ' + os.cycle + ' din' : os.n + ' order') + '</span></div>' +
      '<form data-form="order" class="grid2"><input type="hidden" name="customerId" value="' + esc(c.id) + '">' +
        field('Order date', 'date', todayISO(), 'date') +
        productSelect('product', os.pid, 'Product') +
        field('Quantity (' + unitOf() + ')', 'qty', os.avgQty ? Math.round(os.avgQty) : '', 'number', '0') +
        field('Rate (₹ per ' + unitOf() + ')', 'rate', defRate, 'number', '0') +
        field('Delivery ka vaada', 'promised', addDays(todayISO(), num(S.settings.deliveryDays) || 3), 'date') +
        field('Delivered (agar ho gaya)', 'delivered', '', 'date') +
        field('Rejected qty', 'rejected', '', 'number', '0') +
        '<label class="chk" style="grid-column:1/-1"><input type="checkbox" name="mkbill" checked> <span>Bill bhi ban jaye (qty × rate, ' + st.terms + ' din terms)</span></label>' +
        '<div class="row-end"><button class="btn" type="submit">Order add karein</button></div></form>' +
      (orderRows ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th class="num">Qty × rate</th><th>Delivery</th><th></th></tr></thead><tbody>' + orderRows + '</tbody></table></div>'
        : '<p class="muted small">Abhi koi order nahi. Pehle 3-4 purane order daal dein — tabhi cycle aur alarm kaam karenge.</p>') +
    '</section>' +

    '<section class="card"><div class="card-head"><h2>Bills / payment</h2><span class="hint">baaki ' + money(outAmt) + '</span></div>' +
      '<form data-form="bill" class="billform"><input type="hidden" name="customerId" value="' + esc(c.id) + '">' +
        '<div class="billrow">' +
        '<label class="fld"><span>Bill date</span><input type="date" name="date" value="' + todayISO() + '"></label>' +
        '<label class="fld"><span>Amount ₹</span><input type="number" name="amount" inputmode="decimal" step="any" placeholder="0"></label>' +
        '<label class="fld"><span>Bill no. / note</span><input type="text" name="note" placeholder="optional"></label>' +
        '<button class="btn" type="submit">Bill add</button></div></form>' +
      (billRows ? '<div class="table-wrap"><table><thead><tr><th>Bill</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>' + billRows + '</tbody></table></div>'
        : '<p class="muted small">Abhi koi bill nahi.</p>') +
      '<div class="tonebar">' +
        ['soft', 'normal', 'firm'].map(function (t) {
          return '<button class="tone' + (tone === t ? ' active' : '') + '" type="button" data-action="tone" data-id="' + esc(c.id) + '" data-tone="' + t + '">' +
            ({ soft: 'Naram', normal: 'Normal', firm: 'Sakht' })[t] + '</button>';
        }).join('') + '</div>' +
      '<p class="muted small" style="margin:6px 0 0">Tone grade se apne aap chunti hai; aap badal sakte hain.</p>' +
      msgBox(msg) + '<div class="btnrow">' + sendButtons(c.phone, msg, 'Reminder bhejein') + '</div>' +
    '</section>' +
    statementCard(c);
}

function viewCust() {
  if (ui.custId) {
    var c = findCust(ui.custId);
    if (c) { return viewCustDetail(c); }
    ui.custId = null;
  }
  var rows = S.customers.slice().sort(function (a, b) {
    var oa = sum(custDue(a).map(function (x) { return x.amount; }));
    var ob = sum(custDue(b).map(function (x) { return x.amount; }));
    return ob - oa;
  }).map(custListRow).join('');
  return '' + (S.demo ? demoBanner() : '') +
    '<section class="card"><div class="card-head"><h2>Customer</h2><span class="hint">' + S.customers.length + ' customer</span></div>' +
      (rows || '<p class="muted" style="margin:0">Abhi koi customer nahi. Neeche se add karein.</p>') + '</section>' +
    '<section class="card"><div class="card-head"><h2>Naya customer</h2></div>' +
      '<form data-form="customer" class="grid2">' +
        field('Naam', 'name', '', 'text', 'jaise: Verma Garments') +
        field('Phone (WhatsApp)', 'phone', '', 'tel', '10 digit') +
        field('Credit days (terms)', 'creditDays', S.settings.creditGiven, 'number', '60') +
        field('Credit limit ₹', 'creditLimit', '', 'number', '0') +
        '<div class="row-end"><button class="btn" type="submit">Customer add karein</button></div></form></section>';
}

/* ---------------- Quote (ladder, floor, bluff, lock) ---------------- */

function claimCard(c, q) {
  var cl = ui.claim && ui.claim.cid === c.id ? ui.claim : null;
  var a = cl ? claimAnalysis(c, ui.quoteQty, cl.claimed, cl.theirDays, ui.quotePid) : null;
  var form = '<form data-form="claim" class="grid2"><input type="hidden" name="cid" value="' + esc(c.id) + '">' +
    field('Unhone kitna bataya (₹ per ' + unitOf() + ')', 'claimed', cl ? cl.claimed : '', 'number', '0') +
    field('Unki payment terms (din) — pata ho to', 'theirDays', cl ? cl.theirDays : '', 'number', 'khaali = hamari jaisi') +
    '<div class="row-end"><button class="btn" type="submit">Sach-fark nikalein</button></div></form>';
  var res = '';
  if (cl && !q.ask) {
    res = '<p class="muted small">' + esc(costLine(q.costInfo)) + '</p>';
  } else if (a) {
    var cls, title, text;
    if (a.below) {
      cls = 'bad'; title = 'Ye rate aapke floor se neeche hai';
      text = 'Unka ' + rs(a.claimed) + ' (' + a.td + ' din) hamari terms par ~' + rs(a.claimedAtOurs) + ' padta hai; aapka floor ' + rs(a.q.floor) +
        '. Match karenge to ' + rs(a.lossPerUnit) + ' per ' + unitOf() + ' kam, is order par ~' + money(a.lossOrder) +
        ' ki chot. Rate nahi, terms ya delivery slot par baat karein, ya ye order jaane dein.';
    } else if (a.realCheaper) {
      cls = 'warn'; title = 'Sach me thoda sasta hai (' + fmt(a.gapPct) + '% fark)';
      text = 'Barabar terms par unka ~' + rs(a.claimedAtOurs) + ', aapka ' + rs(a.q.ask) + '. Counter: ' + rs(a.counter) +
        ' (chhoot ' + rs(a.giveUp) + ' per ' + unitOf() + '). Floor ' + rs(a.q.floor) + ' hai, uske neeche nahi.';
    } else {
      cls = 'good'; title = 'Dabaav lag raha hai — fark nahi ke barabar';
      text = 'Unki terms par hamara rate ' + rs(a.oursAtTheir) + ' padta hai, unka ' + rs(a.claimed) + '. Rate girane ki zaroorat nahi; terms barabar karke dikhayein.';
    }
    var reply = claimReply(c, a);
    res = '<div class="signal ' + cls + '" style="margin-top:12px"><b>' + esc(title) + '</b><p>' + esc(text) + '</p>' +
      (a.hasTheir ? '' : '<p>Unki terms nahi bharin, isliye hamari ' + a.qd + ' din jaisi maani gayi.</p>') + '</div>' +
      msgBox(reply) +
      '<div class="btnrow">' + sendButtons(c.phone, reply, 'Customer ko jawab bhejein') +
      '<button class="btn alt" type="button" data-action="claim-log">Claim note karein</button></div>';
  }

  var stt = claimStats(c.id);
  var hist = S.claims.filter(function (x) { return x.customerId === c.id; }).sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date));
  }).slice(0, 8).map(function (x) {
    var out;
    if (x.outcome) {
      out = '<span class="tag ' + (x.outcome === 'ordered' ? 'good' : (x.outcome === 'lost' ? 'bad' : '')) + '">' +
        ({ ordered: 'order diya', lost: 'chhod diya', partial: 'aadha' })[x.outcome] + '</span>';
    } else {
      out = ['ordered', 'partial', 'lost'].map(function (k) {
        return '<button class="link" type="button" data-action="claim-outcome" data-id="' + esc(x.id) + '" data-out="' + k + '">' +
          ({ ordered: 'Order diya', partial: 'Aadha', lost: 'Chhoda' })[k] + '</button>';
      }).join('');
    }
    return '<tr><td>' + dmy(x.date) + '</td><td class="num">' + rs(x.claimed) + (x.theirDays ? ' · ' + x.theirDays + 'd' : '') +
      '</td><td>' + out + '</td><td class="actions"><button class="link del" type="button" data-action="del-claim" data-id="' + esc(x.id) + '">×</button></td></tr>';
  }).join('');

  return '<section class="card"><div class="card-head"><h2>“Doosre ka rate kam hai”</h2><span class="hint">bluff tracker</span></div>' +
    '<p class="muted small" style="margin:0 0 10px">Customer jo rate bataye wo yahan daalein. App dono ko ek hi payment terms par laakar asli fark batati hai.</p>' +
    form + res +
    (stt.n || stt.pending ? '<div class="signal ' + (stt.level === 'bluff' ? 'good' : (stt.level === 'real' ? 'bad' : 'warn')) + '" style="margin-top:12px"><b>Is customer ka record</b><p>' + esc(stt.verdict) + '</p></div>' : '') +
    (hist ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th class="num">Unka rate</th><th>Nateeja</th><th></th></tr></thead><tbody>' + hist + '</tbody></table></div>' : '') +
    '</section>';
}

function viewQuote() {
  if (!S.customers.length) {
    return (S.demo ? demoBanner() : '') + '<section class="card"><p class="muted" style="margin:0">Pehle Customer tab me ek customer daalein. Phir yahan uska rate, floor aur ladder banega.</p></section>';
  }
  var c = findCust(ui.quoteCust) || S.customers[0];
  ui.quoteCust = c.id;
  var os = orderStats(c.id);
  var qty = ui.quoteQty !== '' ? ui.quoteQty : (os.avgQty ? Math.round(os.avgQty) : '');
  if (ui.quoteQty === '' && qty !== '') { ui.quoteQty = String(qty); }
  if (!ui.quotePid || !findProduct(ui.quotePid) || ui.quoteCustPid !== c.id) {
    ui.quotePid = pidOr(os.pid);
    ui.quoteCustPid = c.id;
  }
  var q = quoteFor(c, qty, ui.quotePid);
  var s = S.settings;
  var cap = capacityInfo(ui.quotePid);

  var top = '<form data-form="quote-pick" class="grid2">' +
    selectField('Customer', 'cid', S.customers.map(function (x) { return [x.id, x.name]; }), c.id).replace('<select ', '<select data-live="1" ') +
    productSelect('pid', ui.quotePid, 'Product') +
    field('Quantity (' + unitOf() + ')', 'qty', qty, 'number', '0') +
    '<div class="row-end"><button class="btn" type="submit">Hisaab dekhein</button></div></form>';

  var body;
  if (!q.ask) {
    body = '<section class="card"><p class="muted" style="margin:0">' + esc(costLine(q.costInfo)) + '</p></section>';
  } else {
    var rows = q.ladder.map(function (r) {
      return '<tr' + (r.isNow ? ' class="hi"' : '') + '><td>' + r.d + ' din' +
        (r.isNow ? ' <span class="tag good">aap abhi</span>' : '') + (r.isTerms && !r.isNow ? ' <span class="tag">terms</span>' : '') + '</td>' +
        '<td class="num"><b>' + (r.price ? rs(r.price) : '—') + '</b></td>' +
        '<td class="num muted">' + (r.floor ? rs(r.floor) : '—') + '</td></tr>';
    }).join('');
    var lm = ladderMessage(c, q);
    var cnote = costLine(q.costInfo);
    var priv = '<div class="mini">' +
      '<div><span>Pehle bolein</span><b>' + rs(q.ask) + '</b><i>' + q.st.days + ' din payment</i></div>' +
      '<div><span>Floor</span><b>' + rs(q.floor) + '</b><i>isse neeche nahi</i></div>' +
      '<div><span>Chhoot ki gunjaish</span><b>' + rs(q.ask - q.floor) + '</b><i>' + fmt((q.ask - q.floor) / q.ask * 100) + '% / ' + unitOf() + '</i></div></div>' +
      bomTable(q.costInfo) +
      (cap ? '<p class="small" style="margin:10px 0 0">Plant: pichhle 30 din me ' + fmt(cap.used, 0) + ' / ' + fmt(cap.cap, 0) + ' ' + unitOf() + ' (' + fmt(cap.pct, 0) + '% use). ' +
        (cap.pct < 60 ? 'Capacity khaali hai — volume ke badle thodi chhoot soch sakte hain, par floor ke upar.' : 'Capacity tight hai — chhoot ki zaroorat nahi.') + '</p>' : '') +
      '<p class="muted small" style="margin:10px 0 0">' + esc(cnote) + ' Overhead ' + rs(s.overhead) + ', delivery kharcha ' + money(s.perDelivery) +
      ' (' + (q.qty > 0 ? rs(num(s.perDelivery) / q.qty) : '—') + ' per ' + unitOf() + '). Paise ki lagat ' + fmt(s.costOfFunds) + '% saalana.</p>' +
      '<p class="muted small" style="margin:6px 0 0">Grade ' + esc(gradeLabel(q.st.grade)) + (q.st.risk ? ' — risk ' + fmt(q.st.risk) + '% jod kar.' : '.') +
      ' Margin: target ' + fmt(s.targetMargin) + '%, minimum ' + fmt(s.minMargin) + '% (bechne ke rate ka, byaaj aur risk ke baad).</p>';
    body = '<section class="card"><div class="card-head"><h2>' + esc(c.name) + ' — aapki taiyari</h2><span class="hint">sirf aap ke liye</span></div>' + priv + '</section>' +
      '<section class="card"><div class="card-head"><h2>Rate ki seedhi</h2><span class="hint">customer khud chunta hai</span></div>' +
        '<p class="muted small" style="margin:0 0 4px">Rate payment ke din se juda hai: jaldi payment, kam rate. Bargain “rate kam karo” se hat kar “kaun si row” par aa jata hai. ' +
        'Customer ko sirf Rate wala column jata hai.</p>' +
        '<div class="table-wrap"><table><thead><tr><th>Payment</th><th class="num">Rate</th><th class="num">Floor</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div class="btnrow">' + sendButtons(c.phone, lm, 'Ladder WhatsApp karein') + '</div></section>';
  }

  var L = S.lock;
  var draft = lockDraft(c, q.ask ? q : null);
  var lockCard = '<section class="card"><div class="card-head"><h2>Rate lock draft</h2><span class="hint">bargain mahine bhar band</span></div>' +
    '<form data-form="lock" class="grid2">' +
      field('Kitne mahine', 'months', L.months, 'number', '3') +
      field('Mahine ki quantity', 'qty', L.qty, 'text', 'jaise: 2000') +
      field('Reference rate kaun sa (dono ko manya)', 'ref', L.ref, 'text', 'jaise: mandi / association rate') +
      field('Review band (%)', 'band', L.band, 'number', '3') +
      '<div class="row-end"><button class="btn" type="submit">Draft banayein</button></div></form>' +
    msgBox(draft) + '<div class="btnrow">' + sendButtons(c.phone, draft, 'Draft bhejein') + '</div>' +
    '<p class="muted small" style="margin:10px 0 0">Reference rate aisa chunein jo customer khud dekh sake — aapki apni quote sheet ko wo index nahi maanega.</p></section>';

  return '' + (S.demo ? demoBanner() : '') +
    '<section class="card"><div class="card-head"><h2>Quote</h2><span class="hint">floor, ladder, jawab</span></div>' + top + '</section>' +
    body + claimCard(c, q) + lockCard;
}

/* ---------------- Rate (supplier) ---------------- */

function rateSignal(st) {
  if (!st.count) {
    return { level: 'warn', title: 'Pehla rate daalein', text: 'Aaj 2-3 suppliers se rate le kar yahan daalein. Isi se bechne ka floor nikalta hai.' };
  }
  if (st.staleDays > 15) {
    return { level: 'warn', title: 'Rate purana hai (' + st.staleDays + ' din)',
      text: 'Naya rate lein — purani lagat par quote dene se margin kam ho sakta hai.' };
  }
  if (st.avg <= 0) { return { level: 'ok', title: 'Rate record ban raha hai', text: 'Rate daalte rahein.' }; }
  var diff = (num(st.latest.rate) - st.avg) / st.avg * 100;
  if (diff <= -1.5) {
    return { level: 'good', title: 'Rate average se ' + fmt(Math.abs(diff)) + '% kam',
      text: 'Aakhri rate ' + rs(st.latest.rate) + ', average ' + rs(st.avg) + '. Stock badhane ka acha mauka; Quote tab me lock offer bhi dekhein.' };
  }
  if (diff >= 1.5) {
    return { level: 'bad', title: 'Rate average se ' + fmt(diff) + '% zyada',
      text: 'Rate chadh raha hai. Zaroorat ka hi maal lein; customers ko Aaj tab se pehle batayein.' };
  }
  return { level: 'ok', title: 'Rate stable hai', text: 'Aakhri rate average ke aas paas hai.' };
}

function monthHistory(months) {
  if (!months || months.length < 2) {
    return '<p class="muted small" style="margin-top:10px">2-3 mahine ka record hone par yahan dikhega ki rate kis mahine sasta rehta hai.</p>';
  }
  var min = months.reduce(function (a, b) { return b.avg < a.avg ? b : a; }, months[0]);
  var max = months.reduce(function (a, b) { return b.avg > a.avg ? b : a; }, months[0]);
  var bars = months.map(function (m) {
    var w = max.avg > 0 ? Math.max(4, Math.round(m.avg / max.avg * 100)) : 4;
    return '<div class="bar"><span>' + monLabel(m.key) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + w + '%"></div></div><b>' + rs(m.avg) + '</b></div>';
  }).join('');
  return '<div class="hist"><div class="hist-head">Mahine ka average rate</div>' + bars +
    '<p class="small" style="margin:6px 0 0">Sabse sasta: <b>' + monLabel(min.key) + '</b> (' + rs(min.avg) + ').</p></div>';
}

function dataLists() {
  var sup = {}, supl = [];
  ['Godrej', 'VVF', 'Moksha Chemicals', 'Khona Drugs'].forEach(function (x) { sup[normName(x)] = 1; supl.push(x); });
  S.quotes.forEach(function (q) { var k = normName(q.supplier); if (k && !sup[k]) { sup[k] = 1; supl.push(q.supplier); } });
  var mats = materialNames();
  S.products.forEach(function (p) { p.bom.forEach(function (b) {
    if (mats.map(normName).indexOf(normName(b.material)) < 0) { mats.push(b.material); } }); });
  return '<datalist id="dl-sup">' + supl.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' +
    '<datalist id="dl-mat">' + mats.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>';
}

function productCostCards() {
  if (!S.products.length) {
    var cn = costNow();
    var tr0 = costTrend();
    return '<div class="signal ' + (cn.v ? 'good' : 'warn') + '"><b>' + (cn.v ? rs(cn.v) + ' per ' + unitOf() : 'Lagat nahi pata') + '</b><p>' + esc(costLine(cn)) + '</p></div>' +
      (tr0 ? '<p class="small" style="margin:10px 0 0">Haal ke rate pehle ke average se <b>' + fmt(Math.abs(tr0.pct)) + '% ' + (tr0.pct < 0 ? 'neeche' : 'upar') + '</b> hain.</p>' : '');
  }
  return S.products.map(function (p) {
    var cn = costNow(p.id);
    var tr = costTrend(p.id);
    return '<details class="obj" style="margin:0 0 8px"' + (cn.v ? '' : '') + '><summary><b>' + esc(p.name) + '</b> — ' +
      (cn.v ? rs(cn.v) + ' per ' + unitOf() : 'lagat adhoori') +
      (tr ? ' <span class="tag ' + (tr.pct < 0 ? 'good' : 'bad') + '">' + (tr.pct < 0 ? '' : '+') + fmt(tr.pct) + '%</span>' : '') + '</summary>' +
      '<p class="small muted" style="margin:6px 0">' + esc(costLine(cn)) + '</p>' + bomTable(cn) + '</details>';
  }).join('');
}

function materialSummary() {
  var names = materialNames();
  if (!names.length) { return ''; }
  var rows = names.map(function (n) {
    var b = materialBest(n);
    var tr = trendOfQuotes(S.quotes.filter(function (q) { return normName(q.item) === normName(n); }));
    return '<tr><td><b>' + esc(n) + '</b></td><td>' + (b ? esc(b.q.supplier) : '—') + '</td>' +
      '<td class="num"><b>' + (b ? rs(b.v) : '—') + '</b></td>' +
      '<td>' + (tr ? '<span class="tag ' + (tr.pct <= -1.5 ? 'good' : (tr.pct >= 1.5 ? 'bad' : '')) + '">' + (tr.pct > 0 ? '+' : '') + fmt(tr.pct) + '%</span>' : '—') + '</td>' +
      '<td class="small ' + (b && b.stale > 15 ? 'bad' : 'muted') + '">' + (b ? b.stale + ' din' : '') + '</td></tr>';
  }).join('');
  return '<div class="table-wrap"><table><thead><tr><th>Raw material</th><th>Sabse sasta</th><th class="num">Asli ₹</th><th>Trend</th><th>Purana</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p class="muted small" style="margin:8px 0 0">Asli ₹ = (rate + freight) ÷ (1 − rejection%) − supplier credit ka faayda. Trend = pichhle 14 din ka rate vs pichhle 4 mahine ka average.</p>';
}

function viewRate() {
  var multi = S.products.length > 0 && materialNames().length > 0;
  var st = multi ? null : quoteStats();
  var sig = multi ? null : rateSignal(st);
  var rows = S.quotes.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 25).map(function (q) {
    var e = effQuote(q);
    return '<tr><td>' + dmy(q.date) + '</td><td>' + esc(q.supplier) + (q.item ? '<div class="small muted">' + esc(q.item) + '</div>' : '') + '</td><td class="num">' + rs(q.rate) + '</td><td class="num"><b>' + rs(e.effective) + '</b></td>' +
      '<td>' + (q.moq ? esc(q.moq) : '—') + '</td><td>' + (num(q.deliveryDays) ? num(q.deliveryDays) + ' din' : '—') + '</td>' +
      '<td>' + (num(q.payDays) ? num(q.payDays) + ' din' : '—') + '</td>' +
      '<td class="actions"><button class="link del" type="button" data-action="del-quote" data-id="' + esc(q.id) + '">×</button></td></tr>';
  }).join('');

  var signalCard = multi
    ? '<section class="card"><div class="card-head"><h2>Raw material rate</h2><span class="hint">' + S.quotes.length + ' record</span></div>' + materialSummary() + '</section>'
    : '<section class="card"><div class="card-head"><h2>Rate signal</h2><span class="hint">' + S.quotes.length + ' record</span></div>' +
      '<div class="signal ' + sig.level + '"><b>' + esc(sig.title) + '</b><p>' + esc(sig.text) + '</p></div>' +
      '<div class="mini">' +
        '<div><span>Sabse sasta (' + (st.poolN || 0) + ' rate me)</span><b>' + (st.best ? rs(st.best.rate) : '—') + '</b><i>' + (st.best ? esc(st.best.supplier) : '') + '</i></div>' +
        '<div><span>Average</span><b>' + (st.count ? rs(st.avg) : '—') + '</b><i>fark ' + fmt(st.spread) + '%</i></div>' +
        '<div><span>Aakhri rate</span><b>' + (st.latest ? rs(st.latest.rate) : '—') + '</b><i>' + (st.latest ? daysAgoText(st.staleDays) : '') + '</i></div></div>' +
      (st.bestEff && st.best && st.bestEff.id !== st.best.id
        ? '<div class="msg">Dhyan dein: sabse kam rate (' + esc(st.best.supplier) + ') asli me sabse sasta nahi. Asli lagat me sabse kam: ' + esc(st.bestEff.supplier) + ' — ' + rs(st.bestEffV) + '.</div>' : '') +
      '<p class="muted small" style="margin:10px 0 0">Asli lagat = (rate + freight) ÷ (1 − rejection%) − supplier ke credit ka faayda (' + fmt(S.settings.costOfFunds) + '% saalana). Jitna zyada credit, utni kam lagat.</p>' +
      monthHistory(st.months) + '</section>';

  return '' + (S.demo ? demoBanner() : '') + dataLists() +
    '<section class="card"><div class="card-head"><h2>' + (S.products.length ? 'Product ki lagat' : 'Aaj ki lagat') + '</h2><span class="hint">bechne ke rate ki buniyaad</span></div>' +
      productCostCards() + '</section>' +
    signalCard +
    '<section class="card"><div class="card-head"><h2>Message: ek saath 2-3 parties se rate</h2></div>' +
      '<form data-form="rfq" class="grid2">' +
        '<label class="fld"><span>Kaun sa maal</span><input type="text" name="material" list="dl-mat" value="' + esc(S.rfq.material || '') + '" placeholder="jaise: Stearyl alcohol"></label>' +
        field('Kitna chahiye', 'qty', S.rfq.qty, 'text', 'jaise: 2000') +
        field('Delivery kitne din me', 'days', S.rfq.days, 'number', '3') +
        field('Koi khaas baat (optional)', 'note', S.rfq.note, 'text', 'jaise: GST bill + transport') +
        '<div class="row-end"><button class="btn" type="submit">Message banayein</button></div></form>' +
      msgBox(rfqMessage()) +
      '<div class="btnrow">' + sendButtons('', rfqMessage(), 'WhatsApp me kholein') + '</div>' +
      '<p class="muted small" style="margin:10px 0 0">WhatsApp me jis supplier ko bhejna ho, chun kar bhej dein; jawab neeche daal dein.</p></section>' +
    '<section class="card"><div class="card-head"><h2>Naya rate daalein</h2></div>' +
      '<form data-form="quote" class="grid2">' +
        field('Date', 'date', todayISO(), 'date') +
        '<label class="fld"><span>Supplier</span><input type="text" name="supplier" list="dl-sup" placeholder="jaise: Godrej"></label>' +
        '<label class="fld"><span>Raw material / item</span><input type="text" name="item" list="dl-mat" value="' + esc(S.products.length ? '' : (S.settings.item || '')) + '"></label>' +
        field('Rate (₹ per ' + unitOf() + ')', 'rate', '', 'number', '0') +
        field('MOQ', 'moq', '', 'text', 'jaise: 500 kg') + field('Delivery (din)', 'deliveryDays', '', 'number', '0') +
        field('Supplier kitne din credit de raha', 'payDays', '', 'number', '0') +
        field('Freight (₹ per ' + unitOf() + ')', 'freight', '', 'number', '0') +
        field('Rejection / wastage (%)', 'rejection', '', 'number', '0') +
        '<div class="row-end"><button class="btn" type="submit">Rate add karein</button></div></form></section>' +
    '<section class="card"><div class="card-head"><h2>Rate sheet</h2><span class="hint">aakhri 25</span></div>' +
      (rows ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Supplier</th><th class="num">Rate</th><th class="num">Asli</th><th>MOQ</th><th>Delivery</th><th>Credit</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<p class="muted">Abhi koi rate nahi.</p>') +
      '<p class="muted small" style="margin:10px 0 0">Ye app bazaar ka live rate nahi laati — aapke daale rate ka record rakhti hai. Excel me rate sheet ho to Setup > Excel se data laayein.</p></section>';
}

/* ---------------- Paisa ---------------- */

function viewPaisa() {
  var s = S.settings;
  var w = wcCalc();
  var cost = num(s.costOfFunds);
  var ccc = num(s.stockDays) + num(s.creditGiven) - num(s.creditReceived);
  var dailySales = num(s.monthlySales) / 30;
  var e = S.epd;
  var discAmt = num(e.amount) * num(e.disc) / 100;
  var ds = num(e.daysSaved);
  var annual = ds > 0 ? num(e.disc) * 365 / ds : 0;
  var interest = num(e.amount) * cost / 100 * ds / 365;
  var net = interest - discAmt;
  var t = S.tre;
  var bCost = num(t.amount) * num(t.rate) / 100 * num(t.days) / 365;
  var creditRows = [15, 30, 45, 60, 90].map(function (d) {
    return '<tr><td>' + d + ' din</td><td class="num">' + money(100000 * cost / 100 * d / 365) + '</td><td class="num">' + money(1000000 * cost / 100 * d / 365) + '</td></tr>';
  }).join('');
  var g = gapsSorted();
  var p = num(s.monthlyPurchase);
  var rateBenefit = p * num(S.rvc.diff) / 100 * 12;
  var creditBenefit = p * cost / 100 * num(S.rvc.days) / 30;
  var rvcLine = creditBenefit >= rateBenefit
    ? 'Faisla: pehle ' + num(S.rvc.days) + ' din credit nikaalein, phir rate par baat karein.'
    : 'Faisla: credit kam mil raha hai, to rate par zor dein; credit ki demand ek baar zaroor rakhein.';

  return '' + (S.demo ? demoBanner() : '') +
    '<section class="card"><div class="card-head"><h2>Business ki sehat</h2><span class="hint">' + g.length + ' baat</span></div>' +
      (g.length ? g.slice(0, 6).map(gapCard).join('') : '<p class="ok" style="margin:0">Abhi koi badi kami nahi dikh rahi.</p>') +
      '<div class="btnrow"><button class="btn alt" type="button" data-action="copy-report">Report copy karein</button></div></section>' +
    '<section class="card"><div class="card-head"><h2>Working capital</h2></div>' +
      '<form data-form="settings" class="grid2">' +
        field('Mahine ki bikri ₹', 'monthlySales', s.monthlySales, 'number', '0') +
        field('Mahine ki kharid ₹', 'monthlyPurchase', s.monthlyPurchase, 'number', '0') +
        field('Mahine ka kharcha ₹', 'monthlyExpenses', s.monthlyExpenses, 'number', '0') +
        field('Customer ko credit (din)', 'creditGiven', s.creditGiven, 'number', '60') +
        field('Supplier se credit (din)', 'creditReceived', s.creditReceived, 'number', '0') +
        field('Stock kitne din ka', 'stockDays', s.stockDays, 'number', '10') +
        field('Paise ki lagat (% saalana)', 'costOfFunds', s.costOfFunds, 'number', '12') +
        field('Buffer kitne mahine ka', 'cashMonths', s.cashMonths, 'number', '3') +
        '<div class="row-end"><button class="btn" type="submit">Hisaab update karein</button></div></form>' +
      '<div class="table-wrap"><table><thead><tr><th>Kahaan paisa phansa hai</th><th class="num">Amount</th></tr></thead><tbody>' +
        '<tr><td>Customer se lena hai<br><span class="small muted">(' + num(s.monthlySales) + ' ÷ 30) × ' + num(s.creditGiven) + ' din</span></td><td class="num">' + money(w.recv) + '</td></tr>' +
        '<tr><td>Stock me pada maal<br><span class="small muted">' + num(s.stockDays) + ' din</span></td><td class="num">' + money(w.inv) + '</td></tr>' +
        '<tr><td>Supplier ka credit (kam)<br><span class="small muted">' + num(s.creditReceived) + ' din</span></td><td class="num">− ' + money(w.pay) + '</td></tr>' +
        '<tr><td><b>Net phansa paisa</b></td><td class="num"><b>' + money(w.net) + '</b></td></tr>' +
        '<tr><td>' + num(s.cashMonths || 3) + ' mahine ka kharcha (buffer)</td><td class="num">' + money(w.buffer) + '</td></tr>' +
        '<tr><td><b>Total cash chahiye</b></td><td class="num"><b>' + money(w.total) + '</b></td></tr></tbody></table></div>' +
      '<p class="small" style="margin:10px 0 0"><b>Cycle ' + Math.round(ccc) + ' din.</b> Ek din = ' + money(dailySales) + '. 10 din kam karein to ' + money(dailySales * 10) + ' free hota hai (' + money(dailySales * 10 * cost / 100) + ' saalana byaaj).</p></section>' +
    '<section class="card"><div class="card-head"><h2>Jaldi payment par discount — kiske liye faayda?</h2></div>' +
      '<form data-form="epd" class="grid2">' +
        field('Bill amount ₹', 'amount', e.amount, 'number', '0') + field('Discount (%)', 'disc', e.disc, 'number', '2') +
        field('Kitne din pehle payment', 'daysSaved', e.daysSaved, 'number', '45') +
        '<div class="row-end"><button class="btn" type="submit">Hisaab dekhein</button></div></form>' +
      '<div class="msg">Aap discount dete hain: ' + money(discAmt) + ' (' + fmt(e.disc) + '%)\n' +
        'Paisa ' + ds + ' din pehle aane se byaaj bachta hai (' + fmt(cost) + '% par): ' + money(interest) + '\n' +
        'Is bill par aapka net: ' + (net >= 0 ? '+' : '−') + money(Math.abs(net)) + '\n' +
        'Discount ka saalana kharcha: ' + fmt(annual) + '%\n\n' +
        (net >= 0
          ? 'Matlab: ye discount aapke liye sasta hai — loan se kam kharcha.'
          : 'Matlab: aapke liye ye discount loan se MEHNGA hai (' + fmt(annual) + '% vs ' + fmt(cost) + '%). Tabhi dein jab (1) aapka paisa ' + fmt(annual) + '% se mehnga ho (bahar ka udhaar), ' +
            'ya (2) ye customer varna 30-40 din late hota ho. Customer ke liye ye hamesha faayda hai.') + '</div></section>' +
    '<section class="card"><div class="card-head"><h2>Rate ya credit — kaun bada faayda</h2></div>' +
      '<form data-form="rvc" class="grid2">' + field('Rate ka fark (%)', 'diff', S.rvc.diff, 'number', '0.5') +
        field('Supplier se credit (din)', 'days', S.rvc.days, 'number', '30') +
        '<div class="row-end"><button class="btn" type="submit">Compare karein</button></div></form>' +
      '<div class="msg">' + fmt(S.rvc.diff) + '% sasta rate = ' + money(rateBenefit) + ' saalana bachat\n' + num(S.rvc.days) + ' din supplier credit = ' + money(creditBenefit) + ' saalana bachat\n' + rvcLine + '</div></section>' +
    '<section class="card"><div class="card-head"><h2>Credit dene ki asli keemat</h2><span class="hint">' + fmt(cost) + '% saalana</span></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Credit period</th><th class="num">₹1 lakh</th><th class="num">₹10 lakh</th></tr></thead><tbody>' + creditRows + '</tbody></table></div></section>' +
    '<section class="card"><div class="card-head"><h2>Bill discounting / TReDS</h2></div>' +
      '<p class="muted small" style="margin:0 0 10px">Customer ko credit milta rahe, aapko paisa turant. TReDS (RXIL, M1xchange, Invoicemart) me buyer ka bhi platform par juda hona zaroori hai, aur wo bill accept karta hai — chhote buyers aksar juda nahi hote.</p>' +
      '<form data-form="tre" class="grid2">' + field('Bill amount ₹', 'amount', t.amount, 'number', '0') +
        field('Discounting rate (% saalana)', 'rate', t.rate, 'number', '11') + field('Bill kitne din baad due', 'days', t.days, 'number', '60') +
        '<div class="row-end"><button class="btn" type="submit">Lagat dekhein</button></div></form>' +
      '<div class="msg">Bill: ' + money(t.amount) + ', due ' + num(t.days) + ' din baad\nDiscounting ki lagat: ' + money(bCost) + '\nTurant haath me: ' + money(num(t.amount) - bCost) + '</div>' +
      '<p class="muted small" style="margin:10px 0 0"><b>MSME payment niyam (Sec 43B(h)):</b> sirf micro aur small supplier ke dues par. Written agreement na ho to 15 din, ho to adhiktam 45 din; ' +
        'uske baad ki payment par buyer ko kharche ka deduction payment wale saal me milta hai. Ek reading ke hisaab se traders ke liye lagu nahi. Medium supplier par nahi. Apne CA se confirm karein.</p></section>';
}

/* ---------------- Setup ---------------- */

function bomText(p) {
  return (p.bom || []).map(function (b) { return b.material + ' = ' + b.qty; }).join('\n');
}

function productForm(p) {
  var isNew = !p;
  p = p || { id: '', name: '', bom: [], conv: '', yieldPct: 100, capacity: '', cost: '' };
  return '<form data-form="product" class="grid2" style="margin-bottom:12px">' +
    '<input type="hidden" name="id" value="' + esc(p.id) + '">' +
    field('Product ka naam', 'name', p.name, 'text', 'jaise: DSTDP') +
    field('Conversion ₹ per kg (bijli, labour, etc.)', 'conv', p.conv, 'number', '0') +
    field('Yield (%)', 'yieldPct', p.yieldPct, 'number', '100') +
    field('Capacity (kg / mahina)', 'capacity', p.capacity, 'number', '0') +
    field('Seedhi lagat ₹/kg (recipe na ho to)', 'cost', p.cost, 'number', '0') +
    '<label class="fld" style="grid-column:1/-1"><span>Recipe: har line me “raw material = kg per 1 kg product”</span>' +
      '<textarea name="bom" rows="3" placeholder="Stearyl alcohol = 0.80\nThiodipropionic acid (TDPA) = 0.26">' + esc(bomText(p)) + '</textarea></label>' +
    '<div class="row-end"><button class="btn" type="submit">' + (isNew ? 'Product add karein' : 'Save') + '</button>' +
      (isNew ? '' : '<button class="btn tiny danger" type="button" data-action="del-product" data-id="' + esc(p.id) + '">Hataayein</button>') + '</div></form>';
}

function productsCard() {
  var list = S.products.map(function (p) {
    var cn = costNow(p.id);
    return '<details class="obj"><summary><b>' + esc(p.name) + '</b> <span class="small muted">' +
      (cn.v ? rs(cn.v) + '/' + unitOf() : (p.bom.length ? 'rate adhoore' : 'recipe nahi')) +
      (num(p.capacity) ? ' · ' + fmt(p.capacity, 0) + ' kg/mahina' : '') + '</span></summary>' + productForm(p) + '</details>';
  }).join('');
  return '<section class="card"><div class="card-head"><h2>Products aur recipe</h2><span class="hint">' + S.products.length + ' product</span></div>' +
    '<p class="muted small" style="margin:0 0 10px">Recipe bharne se lagat khud nikalti hai: raw material ka asli rate × kg ÷ yield + conversion. ' +
    'Raw material ke naam Rate tab ke “item” se bilkul milne chahiye.</p>' +
    (list || '<p class="muted small">Abhi koi product nahi.</p>') +
    '<details class="obj"' + (S.products.length ? '' : ' open') + '><summary><b>+ Naya product</b></summary>' + productForm(null) + '</details>' +
    (S.products.length ? '' : '<div class="btnrow"><button class="btn alt" type="button" data-action="preset-sameer">Sameer Enterprises ke 15 products daalein</button></div>' +
      '<p class="muted small" style="margin:6px 0 0">Sirf naam aur capacity (company profile se). Recipe aur lagat aapko bharni hogi.</p>') +
    '</section>';
}

function excelCard() {
  return '<section class="card"><div class="card-head"><h2>Excel se data laayein</h2></div>' +
    '<p class="muted small" style="margin:0 0 10px">Excel me rows select karke copy karein aur yahan paste karein (header wali line samet). Column ka order kuch bhi ho. Dobara paste karne par purani entry dobara nahi judti.</p>' +
    '<form data-form="xl-sales"><label class="fld"><span>Bikri register (Date, Party, Product, Qty, Rate, Invoice, Paid date…)</span>' +
      '<textarea name="text" rows="4" placeholder="' + esc(xlTemplate('sales')) + '"></textarea></label>' +
      '<div class="row-end" style="margin-top:8px"><button class="btn" type="submit">Bikri import karein</button></div></form>' +
    '<form data-form="xl-rates" style="margin-top:14px"><label class="fld"><span>Raw material rate (Date, Supplier, Material, Rate, Freight, Credit days…)</span>' +
      '<textarea name="text" rows="4" placeholder="' + esc(xlTemplate('rates')) + '"></textarea></label>' +
      '<div class="row-end" style="margin-top:8px"><button class="btn" type="submit">Rate import karein</button></div></form></section>';
}

function viewSetup() {
  var s = S.settings;
  var standalone = false;
  try { standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches; } catch (e) { /* ignore */ }
  var p = paymentStats();
  return '' + (S.demo ? demoBanner() : '') +
    '<section class="card"><div class="card-head"><h2>Mera business</h2></div>' +
      '<form data-form="settings" class="grid2">' +
        field('Business ka naam', 'business', s.business, 'text', 'jaise: Sharma Traders') +
        field('Aapka naam', 'person', s.person, 'text', 'jaise: Rakesh') +
        field('Maal / item', 'item', s.item, 'text', 'jaise: cotton yarn') +
        field('Unit', 'unit', s.unit, 'text', 'kg / piece / bag') +
        field('Mahine ki bikri ₹', 'monthlySales', s.monthlySales, 'number', '0') +
        field('Mahine ki kharid ₹', 'monthlyPurchase', s.monthlyPurchase, 'number', '0') +
        field('Mahine ka kharcha ₹', 'monthlyExpenses', s.monthlyExpenses, 'number', '0') +
        field('Customer ko credit (din)', 'creditGiven', s.creditGiven, 'number', '60') +
        field('Supplier se credit (din)', 'creditReceived', s.creditReceived, 'number', '0') +
        field('Stock kitne din ka', 'stockDays', s.stockDays, 'number', '10') +
        field('Paise ki lagat (% saalana)', 'costOfFunds', s.costOfFunds, 'number', '12') +
        field('Buffer kitne mahine ka', 'cashMonths', s.cashMonths, 'number', '3') +
        '<div class="row-end"><button class="btn" type="submit">Save karein</button></div></form></section>' +
    productsCard() + excelCard() +
    '<section class="card"><div class="card-head"><h2>Rate ka hisaab (floor aur ladder)</h2></div>' +
      '<p class="muted small" style="margin:0 0 10px">Margin = bechne ke rate ka %, jo paise ki lagat, risk aur kharche ke baad bachna chahiye.</p>' +
      '<form data-form="settings" class="grid2">' +
        field('Target margin (%)', 'targetMargin', s.targetMargin, 'number', '6') +
        field('Minimum margin (%) — floor', 'minMargin', s.minMargin, 'number', '3') +
        field('Overhead per ' + (s.unit || 'unit') + ' (₹)', 'overhead', s.overhead, 'number', '0') +
        field('Har delivery ka kharcha (₹)', 'perDelivery', s.perDelivery, 'number', '0') +
        field('Delivery aam taur par kitne din', 'deliveryDays', s.deliveryDays, 'number', '3') +
        field('Lagat khud likhni ho (₹ per ' + (s.unit || 'unit') + ')', 'costOverride', s.costOverride, 'number', '0 = supplier rate se') +
        field('Customer grade B ka risk (%)', 'riskB', s.riskB, 'number', '0.3') +
        field('Customer grade C ka risk (%)', 'riskC', s.riskC, 'number', '1') +
        '<div class="row-end"><button class="btn" type="submit">Save karein</button></div></form></section>' +
    '<section class="card"><div class="card-head"><h2>Backup / data</h2></div>' +
      '<p class="muted small" style="margin:0 0 10px">Data sirf is phone ke browser me rehta hai. Hafte me ek baar backup copy karke WhatsApp par apne aap ko bhej lein.</p>' +
      '<div class="btnrow"><button class="btn" type="button" data-action="copy-backup">Backup copy karein</button>' +
        '<button class="btn alt" type="button" data-action="export">File download</button>' +
        '<button class="btn alt" type="button" data-action="demo">Sample data</button>' +
        '<button class="btn danger" type="button" data-action="reset">Sab khaali karein</button></div>' +
      '<form data-form="import" style="margin-top:12px"><label class="fld"><span>Backup paste karke restore karein</span>' +
        '<textarea name="json" placeholder="Yahan backup ka text paste karein"></textarea></label>' +
        '<div class="row-end" style="margin-top:8px"><button class="btn" type="submit">Restore</button></div></form>' +
      '<p class="muted small" style="margin:10px 0 0">Total baaki: ' + money(p.outstanding) + ' · Customer: ' + S.customers.length + ' · Order: ' + S.orders.length + ' · Rate record: ' + S.quotes.length + '</p></section>' +
    (standalone ? '' : '<section class="card"><div class="card-head"><h2>Phone me app ki tarah</h2></div>' +
      '<p class="muted small" style="margin:0">Chrome ka menu (⋮) → “Add to Home screen” / “Install app”. Phir ye bina internet ke bhi khulegi.</p></section>');
}
