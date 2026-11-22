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
  return '<a class="btn" href="' + esc(waLink(phone, text)) + '" target="_blank" rel="noopener">' + esc(label || 'Send on WhatsApp') + '</a>' +
    '<button class="btn alt" type="button" data-action="copy" data-idx="' + i + '">Copy</button>';
}

function msgBox(text) { return '<div class="msg">' + esc(text) + '</div>'; }

function demoBanner() {
  return '<div class="demo"><div><b>Sample data is on</b>' +
    '<div class="small muted">These numbers are only examples. Delete the sample data before you enter your own.</div></div>' +
    '<button class="btn tiny alt" type="button" data-action="demo-clear">Delete sample</button></div>';
}

function gapCard(g) {
  return '<div class="alert ' + g.level + '"><b>' + esc(g.title) + '</b><p>' + esc(g.why) + '</p>' +
    '<p class="act">Action: ' + esc(g.action) + '</p></div>';
}

function gradeChip(g) {
  var cls = g === 'A' ? 'good' : (g === 'C' ? 'bad' : (g === 'B' ? 'warn' : ''));
  return '<span class="tag ' + cls + '">' + esc(gradeLabel(g)) + '</span>';
}

function findCust(id) {
  return S.customers.filter(function (c) { return c.id === id; })[0] || null;
}

function costLine(cn) {
  if (cn.src === 'none') { return 'The recipe (BOM) or cost for this product is not entered yet. Enter it in Setup > Products.'; }
  if (cn.src === 'bom' && cn.missing && cn.missing.length) {
    return 'Cost is incomplete. No rate found for these raw materials: ' + cn.missing.join(', ') + '. Enter them in the Rates tab.';
  }
  if (!cn.v) { return 'Cost is not known yet. Enter supplier rates in the Rates tab, or enter the cost in Setup.'; }
  if (cn.src === 'manual') { return 'Cost ' + rs(cn.v) + ' per ' + unitOf() + ' (you entered this in Setup).'; }
  if (cn.src === 'bom') {
    return 'Cost ' + rs(cn.v) + ' per ' + unitOf() + ' = raw material ' + rs(cn.rawBeforeYield) +
      (cn.yieldPct < 100 ? ' ÷ Yield ' + fmt(cn.yieldPct, 1) + '% = ' + rs(cn.raw) : '') +
      ' + Conversion cost ' + rs(cn.conv) + '.';
  }
  var q = cn.q;
  return 'Cost ' + rs(cn.v) + ' per ' + unitOf() + ' — based on the rate of ' + q.supplier + ' (after freight, rejection and credit).' +
    (cn.stale > 15 ? ' Note: the rate is ' + cn.stale + ' days old.' : '');
}

function productSelect(name, selected, label) {
  if (!S.products.length) { return ''; }
  return '<label class="fld"><span>' + esc(label || 'Product') + '</span><select name="' + name + '">' +
    '<option value="">— Select —</option>' +
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
  return '<table class="tbl"><thead><tr><th>Raw material</th><th>Per kg</th><th>True rate</th><th>₹ / kg</th><th>Supplier</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

/* ---------------- Aaj ---------------- */

var JOB_LABEL = {
  delay: 'Delivery', churn: 'Customer may leave', remind: 'Payment',
  reorder: 'Time to reorder', rate: 'Rate changed', lock: 'Price lock'
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
    '<details class="obj"><summary>View message</summary>' + msgBox(j.msg) + '</details>' +
    '<div class="btnrow">' + sendButtons(phone, j.msg, j.call ? 'Ask on WhatsApp' : 'Send on WhatsApp') +
      '<button class="btn alt" type="button" data-action="snooze" data-key="' + esc(j.key) + '" data-days="' + j.snoozeDays + '">Done</button>' +
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
    start = '<section class="card"><div class="card-head"><h2>How to start</h2></div>' +
      '<ol class="steps small">' +
      '<li>In <b>Setup</b>, enter your business name, product and cost of money.</li>' +
      '<li>In <b>Rates</b>, enter rates from 2-3 suppliers. The app uses them to find your Floor price.</li>' +
      '<li>In <b>Customers</b>, add each customer with their orders and bills.</li>' +
      '<li>Then your daily task list will appear here: who to message and who to call.</li></ol>' +
      '<div class="btnrow"><button class="btn alt" type="button" data-action="demo">Try with sample data first</button></div></section>';
  }

  return '' + (S.demo ? demoBanner() : '') +
    '<section class="kpis">' +
      '<div class="kpi"><span class="kpi-l">Tasks for today</span><b class="kpi-v">' + list.length +
        '</b><span class="kpi-s">' + (list.length ? 'see list below' : 'all done') + '</span></div>' +
      '<div class="kpi"><span class="kpi-l">Customers at risk</span><b class="kpi-v' + (risky.length ? ' bad' : '') + '">' + risky.length +
        '</b><span class="kpi-s">' + (atRisk ? money(atRisk) + '/month at risk' : 'none') + '</span></div>' +
      '<div class="kpi"><span class="kpi-l">Money stuck in market</span><b class="kpi-v">' + money(p.outstanding) +
        '</b><span class="kpi-s">' + (p.overdue > 0 ? money(p.overdue) + ' overdue' : 'all on time') + '</span></div>' +
      '<div class="kpi"><span class="kpi-l">Biggest customer</span><b class="kpi-v' + (cc.top && cc.top.pct >= 60 ? ' bad' : '') + '">' +
        (cc.top ? fmt(cc.top.pct, 0) + '%' : '—') + '</b><span class="kpi-s">' + (cc.top ? esc(cc.top.c.name) + '\'s share' : 'add orders') + '</span></div>' +
    '</section>' + start +
    '<section class="card"><div class="card-head"><h2>Tasks for today</h2><span class="hint">most important first</span></div>' +
      (list.length ? list.map(jobCard).join('') :
        '<p class="ok" style="margin:0">No tasks pending. Keep adding orders and bills. The list will build itself.</p>') +
      '<p class="muted small" style="margin:10px 0 0">The WhatsApp button opens a message that is already written. You must press Send yourself. ' +
        'Pressing “Done” hides that task for a few days.</p>' +
    '</section>';
}

/* ---------------- Customers ---------------- */

function custListRow(c) {
  var st = custStanding(c);
  var os = orderStats(c.id);
  var cr = churnRisk(c);
  var due = custDue(c);
  var out = sum(due.map(function (b) { return b.amount; }));
  var over = sum(due.filter(function (b) { return b.overdueDays > 0; }).map(function (b) { return b.amount; }));
  return '<button class="crow" type="button" data-action="open-cust" data-id="' + esc(c.id) + '">' +
    '<div class="crow-l"><b>' + esc(c.name) + '</b> ' + gradeChip(st.grade) +
      (cr.level ? ' <span class="tag bad">risk</span>' : '') +
      '<div class="small muted">' + (os.last ? 'last order ' + daysAgoText(os.daysSince) + (os.cycle ? ' · every ' + os.cycle + ' days' : '') : 'no orders yet') + '</div></div>' +
    '<div class="crow-r"><b>' + money(out) + '</b><div class="small ' + (over ? 'bad' : 'muted') + '">' +
      (over ? money(over) + ' overdue' : 'on time') + '</div></div></button>';
}

function editCustForm(c) {
  return '<form data-form="cust-edit" class="grid2">' +
    '<input type="hidden" name="id" value="' + esc(c.id) + '">' +
    field('Name', 'name', c.name, 'text') +
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
    status = late > 0 ? '<span class="tag bad">' + late + ' days late</span>' : '<span class="tag good">on time</span>';
  } else if (o.promised && o.promised < todayISO()) {
    status = '<span class="tag bad">' + daysBetween(o.promised, todayISO()) + ' days late, not delivered</span>';
  } else {
    status = '<span class="tag">pending' + (o.promised ? ' · ' + dmy(o.promised) : '') + '</span>';
  }
  var rej = num(o.rejected) > 0
    ? '<div class="small bad">rejection ' + fmt(o.rejected, 0) + (o.replaced ? ' (replaced)' : ' (replacement pending)') + '</div>' : '';
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
  if (b.paidOn) { status = '<span class="tag good">paid ' + dmy(b.paidOn) + ' (' + Math.max(0, daysBetween(b.date, b.paidOn)) + ' days)</span>'; }
  else if (late > 0) { status = '<span class="tag bad">' + late + ' days late</span>'; }
  else { status = '<span class="tag">' + Math.max(0, -late) + ' days left</span>'; }
  return '<tr><td>' + dmy(b.date) + '<div class="small muted">due ' + dmy(dueIso) + '</div></td>' +
    '<td class="num">' + money(b.amount) + (b.note ? '<div class="small muted">' + esc(b.note) + '</div>' : '') + '</td>' +
    '<td>' + status + '</td><td class="actions">' +
    (b.paidOn ? '' : '<button class="link" type="button" data-action="mark-paid" data-id="' + esc(c.id) + '" data-bill="' + esc(b.id) + '">Paid</button>') +
    '<button class="link del" type="button" data-action="del-bill" data-id="' + esc(c.id) + '" data-bill="' + esc(b.id) + '">×</button></td></tr>';
}

function statementCard(c) {
  var v = valueStatement(c, ui.stmtDays);
  var opts = [30, 90, 180, 365].map(function (d) {
    return '<button class="tone' + (ui.stmtDays === d ? ' active' : '') + '" type="button" data-action="stmt-days" data-days="' + d + '">' + d + ' days</button>';
  }).join('');
  var body;
  if (!v.orders) {
    body = '<p class="muted small">There are no orders in this period. The statement is created once you add orders and deliveries.</p>';
  } else {
    var msg = statementMessage(c, v);
    body = '<div class="mini">' +
      '<div><span>On-time delivery</span><b>' + (v.onTimePct === null ? '—' : fmt(v.onTimePct, 0) + '%') + '</b><i>' + v.onTime + '/' + v.delivered + ' orders</i></div>' +
      '<div><span>Rejection</span><b>' + fmt(v.rejPct) + '%</b><i>' + v.replaced + '/' + v.rejOrders + ' replaced</i></div>' +
      '<div><span>Credit benefit</span><b>' + money(v.creditValue) + '</b><i>avg ' + fmt(v.avgCreditDays, 0) + ' days</i></div></div>' +
      (v.warn.length
        ? '<div class="signal warn" style="margin-top:10px"><b>Fix this first</b><p>' + esc(v.warn.join('; ')) +
          '. Do not send this statement to the customer yet. Fix these problems first.</p></div>'
        : '<p class="small ok" style="margin:10px 0 0">The numbers are good. You can show them to the customer.</p>') +
      msgBox(msg) + '<div class="btnrow">' + sendButtons(c.phone, msg, 'Send statement') + '</div>';
  }
  return '<section class="card"><div class="card-head"><h2>Monthly value statement</h2><span class="hint">use when the customer says “A competitor is cheaper”</span></div>' +
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
    '<button class="btn alt tiny" type="button" data-action="back-cust">← All customers</button>' +
    '<section class="card" style="margin-top:10px">' +
      '<div class="card-head"><h2>' + esc(c.name) + '</h2>' + gradeChip(st.grade) + '</div>' +
      '<div class="small muted">' + (c.phone ? esc(c.phone) + ' · ' : '') + 'terms ' + st.terms + ' days · actual payment ~' + st.days + ' days' +
        (st.paidCount < 2 ? ' (few records so far)' : '') + '</div>' +
      (limit > 0 ? '<div class="limit" style="margin-top:8px"><div class="limit-top"><span class="small muted">Credit limit ' + money(limit) +
        '</span><span class="small ' + (util > 90 ? 'bad' : 'muted') + '">' + fmt(util, 0) + '% used</span></div>' +
        '<div class="bar-track"><div class="bar-fill' + (util > 90 ? ' red' : '') + '" style="width:' + Math.round(util) + '%"></div></div></div>' : '') +
      (editing ? editCustForm(c) :
        '<div class="btnrow"><button class="btn tiny alt" type="button" data-action="edit-customer" data-id="' + esc(c.id) + '">Edit details</button>' +
        '<button class="btn tiny danger" type="button" data-action="del-customer" data-id="' + esc(c.id) + '">Delete</button></div>') +
    '</section>' +

    (cr.level ? '<section class="card"><div class="alert ' + (cr.level === 'high' ? 'high' : 'mid') + '" style="margin:0"><b>' +
      (cr.level === 'high' ? 'Risk of losing customer: high' : 'Risk of losing customer: low') + '</b>' +
      cr.reasons.map(function (r) { return '<p>' + esc(r) + '</p>'; }).join('') + '</div>' +
      '<div class="btnrow">' + sendButtons(c.phone, churnMessage(c, cr), 'Ask how they are') + '</div></section>' : '') +

    '<section class="card"><div class="card-head"><h2>Rate for this customer</h2>' +
      '<button class="link" type="button" data-action="go-quote" data-id="' + esc(c.id) + '">Open Quote →</button></div>' +
      (q.product ? '<div class="small muted" style="margin-bottom:6px">Product: <b>' + esc(q.product.name) + '</b></div>' : '') +
      (q.ask ?
        '<div class="mini"><div><span>Opening price</span><b>' + rs(q.ask) + '</b><i>' + st.days + ' days payment</i></div>' +
        '<div><span>Floor price (do not go below)</span><b>' + rs(q.floor) + '</b><i>' + fmt((q.ask - q.floor) / q.ask * 100) + '% room to negotiate</i></div>' +
        '<div><span>Last rate</span><b>' + (os.lastRate ? rs(os.lastRate) : '—') + '</b><i>' +
          (os.lastRate && q.floor && os.lastRate < q.floor ? 'was below Floor price' : (os.last ? dmy(os.last.date) : '')) + '</i></div></div>'
        : '<p class="muted small" style="margin:0">' + esc(costLine(q.costInfo)) + '</p>') +
      (cs.n || cs.pending ? '<p class="small" style="margin:10px 0 0"><b>Claim checker:</b> ' + esc(cs.verdict) + '</p>' : '') +
    '</section>' +

    '<section class="card"><div class="card-head"><h2>Orders</h2><span class="hint">' + (os.cycle ? 'usually every ' + os.cycle + ' days' : os.n + ' orders') + '</span></div>' +
      '<form data-form="order" class="grid2"><input type="hidden" name="customerId" value="' + esc(c.id) + '">' +
        field('Order date', 'date', todayISO(), 'date') +
        productSelect('product', os.pid, 'Product') +
        field('Quantity (' + unitOf() + ')', 'qty', os.avgQty ? Math.round(os.avgQty) : '', 'number', '0') +
        field('Rate (₹ per ' + unitOf() + ')', 'rate', defRate, 'number', '0') +
        field('Promised delivery date', 'promised', addDays(todayISO(), num(S.settings.deliveryDays) || 3), 'date') +
        field('Delivered on (if done)', 'delivered', '', 'date') +
        field('Rejected qty', 'rejected', '', 'number', '0') +
        '<label class="chk" style="grid-column:1/-1"><input type="checkbox" name="mkbill" checked> <span>Also create a bill (qty × rate, ' + st.terms + ' days terms)</span></label>' +
        '<div class="row-end"><button class="btn" type="submit">Add order</button></div></form>' +
      (orderRows ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th class="num">Qty × rate</th><th>Delivery</th><th></th></tr></thead><tbody>' + orderRows + '</tbody></table></div>'
        : '<p class="muted small">No orders yet. Add 3-4 past orders first. Only then will the order cycle and alerts work.</p>') +
    '</section>' +

    '<section class="card"><div class="card-head"><h2>Bills / payment</h2><span class="hint">outstanding ' + money(outAmt) + '</span></div>' +
      '<form data-form="bill" class="billform"><input type="hidden" name="customerId" value="' + esc(c.id) + '">' +
        '<div class="billrow">' +
        '<label class="fld"><span>Bill date</span><input type="date" name="date" value="' + todayISO() + '"></label>' +
        '<label class="fld"><span>Amount ₹</span><input type="number" name="amount" inputmode="decimal" step="any" placeholder="0"></label>' +
        '<label class="fld"><span>Bill no. / note</span><input type="text" name="note" placeholder="optional"></label>' +
        '<button class="btn" type="submit">Add bill</button></div></form>' +
      (billRows ? '<div class="table-wrap"><table><thead><tr><th>Bill</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>' + billRows + '</tbody></table></div>'
        : '<p class="muted small">No bills yet.</p>') +
      '<div class="tonebar">' +
        ['soft', 'normal', 'firm'].map(function (t) {
          return '<button class="tone' + (tone === t ? ' active' : '') + '" type="button" data-action="tone" data-id="' + esc(c.id) + '" data-tone="' + t + '">' +
            ({ soft: 'Soft', normal: 'Normal', firm: 'Firm' })[t] + '</button>';
        }).join('') + '</div>' +
      '<p class="muted small" style="margin:6px 0 0">The tone is chosen automatically from the grade of the customer. You can change it.</p>' +
      msgBox(msg) + '<div class="btnrow">' + sendButtons(c.phone, msg, 'Send reminder') + '</div>' +
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
    '<section class="card"><div class="card-head"><h2>Customers</h2><span class="hint">' + S.customers.length + ' customers</span></div>' +
      (rows || '<p class="muted" style="margin:0">No customers yet. Add one below.</p>') + '</section>' +
    '<section class="card"><div class="card-head"><h2>New customer</h2></div>' +
      '<form data-form="customer" class="grid2">' +
        field('Name', 'name', '', 'text', 'e.g. Verma Garments') +
        field('Phone (WhatsApp)', 'phone', '', 'tel', '10 digit') +
        field('Credit days (terms)', 'creditDays', S.settings.creditGiven, 'number', '60') +
        field('Credit limit ₹', 'creditLimit', '', 'number', '0') +
        '<div class="row-end"><button class="btn" type="submit">Add customer</button></div></form></section>';
}

/* ---------------- Quote (ladder, floor, claim, lock) ---------------- */

function claimCard(c, q) {
  var cl = ui.claim && ui.claim.cid === c.id ? ui.claim : null;
  var a = cl ? claimAnalysis(c, ui.quoteQty, cl.claimed, cl.theirDays, ui.quotePid) : null;
  var form = '<form data-form="claim" class="grid2"><input type="hidden" name="cid" value="' + esc(c.id) + '">' +
    field('Rate they claimed (₹ per ' + unitOf() + ')', 'claimed', cl ? cl.claimed : '', 'number', '0') +
    field('Their payment terms (days), if known', 'theirDays', cl ? cl.theirDays : '', 'number', 'blank = same as ours') +
    '<div class="row-end"><button class="btn" type="submit">Find the real difference</button></div></form>';
  var res = '';
  if (cl && !q.ask) {
    res = '<p class="muted small">' + esc(costLine(q.costInfo)) + '</p>';
  } else if (a) {
    var cls, title, text;
    if (a.below) {
      cls = 'bad'; title = 'This rate is below your Floor price';
      text = 'Their ' + rs(a.claimed) + ' (' + a.td + ' days) works out to ~' + rs(a.claimedAtOurs) + ' on our terms. Your Floor price is ' + rs(a.q.floor) +
        '. If you match it, you lose ' + rs(a.lossPerUnit) + ' per ' + unitOf() + ', about ' + money(a.lossOrder) +
        ' on this order. Talk about terms or delivery slot, not rate. Or let this order go.';
    } else if (a.realCheaper) {
      cls = 'warn'; title = 'Slightly cheaper in reality (' + fmt(a.gapPct) + '% difference)';
      text = 'On equal terms, theirs is ~' + rs(a.claimedAtOurs) + ' and yours is ' + rs(a.q.ask) + '. Counter offer: ' + rs(a.counter) +
        ' (discount ' + rs(a.giveUp) + ' per ' + unitOf() + '). Your Floor price is ' + rs(a.q.floor) + '. Do not go below it.';
    } else {
      cls = 'good'; title = 'This looks like pressure. The real difference is almost nil.';
      text = 'On their terms, our rate works out to ' + rs(a.oursAtTheir) + ' and theirs is ' + rs(a.claimed) + '. You do not need to cut your rate. Show the customer the rates on equal terms.';
    }
    var reply = claimReply(c, a);
    res = '<div class="signal ' + cls + '" style="margin-top:12px"><b>' + esc(title) + '</b><p>' + esc(text) + '</p>' +
      (a.hasTheir ? '' : '<p>Their terms were not entered, so we assumed ' + a.qd + ' days, same as ours.</p>') + '</div>' +
      msgBox(reply) +
      '<div class="btnrow">' + sendButtons(c.phone, reply, 'Send reply to customer') +
      '<button class="btn alt" type="button" data-action="claim-log">Save this claim</button></div>';
  }

  var stt = claimStats(c.id);
  var hist = S.claims.filter(function (x) { return x.customerId === c.id; }).sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date));
  }).slice(0, 8).map(function (x) {
    var out;
    if (x.outcome) {
      out = '<span class="tag ' + (x.outcome === 'ordered' ? 'good' : (x.outcome === 'lost' ? 'bad' : '')) + '">' +
        ({ ordered: 'ordered', lost: 'lost', partial: 'partial' })[x.outcome] + '</span>';
    } else {
      out = ['ordered', 'partial', 'lost'].map(function (k) {
        return '<button class="link" type="button" data-action="claim-outcome" data-id="' + esc(x.id) + '" data-out="' + k + '">' +
          ({ ordered: 'Ordered', partial: 'Partial', lost: 'Lost' })[k] + '</button>';
      }).join('');
    }
    return '<tr><td>' + dmy(x.date) + '</td><td class="num">' + rs(x.claimed) + (x.theirDays ? ' · ' + x.theirDays + 'd' : '') +
      '</td><td>' + out + '</td><td class="actions"><button class="link del" type="button" data-action="del-claim" data-id="' + esc(x.id) + '">×</button></td></tr>';
  }).join('');

  return '<section class="card"><div class="card-head"><h2>“A competitor is cheaper”</h2><span class="hint">Claim checker</span></div>' +
    '<p class="muted small" style="margin:0 0 10px">Enter the rate the customer tells you. The app puts both rates on the same payment terms and shows the real difference.</p>' +
    form + res +
    (stt.n || stt.pending ? '<div class="signal ' + (stt.level === 'bluff' ? 'good' : (stt.level === 'real' ? 'bad' : 'warn')) + '" style="margin-top:12px"><b>Record for this customer</b><p>' + esc(stt.verdict) + '</p></div>' : '') +
    (hist ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th class="num">Their rate</th><th>Result</th><th></th></tr></thead><tbody>' + hist + '</tbody></table></div>' : '') +
    '</section>';
}

function viewQuote() {
  if (!S.customers.length) {
    return (S.demo ? demoBanner() : '') + '<section class="card"><p class="muted" style="margin:0">First add a customer in the Customers tab. Then the rate, Floor price and Rate ladder will appear here.</p></section>';
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
    '<div class="row-end"><button class="btn" type="submit">Show calculation</button></div></form>';

  var body;
  if (!q.ask) {
    body = '<section class="card"><p class="muted" style="margin:0">' + esc(costLine(q.costInfo)) + '</p></section>';
  } else {
    var rows = q.ladder.map(function (r) {
      return '<tr' + (r.isNow ? ' class="hi"' : '') + '><td>' + r.d + ' days' +
        (r.isNow ? ' <span class="tag good">you now</span>' : '') + (r.isTerms && !r.isNow ? ' <span class="tag">terms</span>' : '') + '</td>' +
        '<td class="num"><b>' + (r.price ? rs(r.price) : '—') + '</b></td>' +
        '<td class="num muted">' + (r.floor ? rs(r.floor) : '—') + '</td></tr>';
    }).join('');
    var lm = ladderMessage(c, q);
    var cnote = costLine(q.costInfo);
    var priv = '<div class="mini">' +
      '<div><span>Opening price</span><b>' + rs(q.ask) + '</b><i>' + q.st.days + ' days payment</i></div>' +
      '<div><span>Floor price</span><b>' + rs(q.floor) + '</b><i>do not go below</i></div>' +
      '<div><span>Room for discount</span><b>' + rs(q.ask - q.floor) + '</b><i>' + fmt((q.ask - q.floor) / q.ask * 100) + '% / ' + unitOf() + '</i></div></div>' +
      bomTable(q.costInfo) +
      (cap ? '<p class="small" style="margin:10px 0 0">Plant: last 30 days ' + fmt(cap.used, 0) + ' / ' + fmt(cap.cap, 0) + ' ' + unitOf() + ' (' + fmt(cap.pct, 0) + '% used). ' +
        (cap.pct < 60 ? 'Capacity is free. You can think of a small discount for more volume, but stay above the Floor price.' : 'Capacity is tight. No need to give a discount.') + '</p>' : '') +
      '<p class="muted small" style="margin:10px 0 0">' + esc(cnote) + ' Overhead ' + rs(s.overhead) + ', delivery expense ' + money(s.perDelivery) +
      ' (' + (q.qty > 0 ? rs(num(s.perDelivery) / q.qty) : '—') + ' per ' + unitOf() + '). Cost of money ' + fmt(s.costOfFunds) + '% per year.</p>' +
      '<p class="muted small" style="margin:6px 0 0">Grade ' + esc(gradeLabel(q.st.grade)) + (q.st.risk ? ' — risk ' + fmt(q.st.risk) + '% added.' : '.') +
      ' Margin: target ' + fmt(s.targetMargin) + '%, minimum ' + fmt(s.minMargin) + '% (of selling rate, after interest and risk).</p>';
    body = '<section class="card"><div class="card-head"><h2>' + esc(c.name) + ' — your preparation</h2><span class="hint">for you only</span></div>' + priv + '</section>' +
      '<section class="card"><div class="card-head"><h2>Rate ladder</h2><span class="hint">the customer chooses</span></div>' +
        '<p class="muted small" style="margin:0 0 4px">The rate depends on payment days: faster payment, lower rate. The talk changes from “reduce the rate” to “which row do you choose”. ' +
        'Only the Rate column is sent to the customer.</p>' +
        '<div class="table-wrap"><table><thead><tr><th>Payment</th><th class="num">Rate</th><th class="num">Floor price</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div class="btnrow">' + sendButtons(c.phone, lm, 'Send Rate ladder on WhatsApp') + '</div></section>';
  }

  var L = S.lock;
  var draft = lockDraft(c, q.ask ? q : null);
  var lockCard = '<section class="card"><div class="card-head"><h2>Price lock draft</h2><span class="hint">no bargaining for the month</span></div>' +
    '<form data-form="lock" class="grid2">' +
      field('Number of months', 'months', L.months, 'number', '3') +
      field('Quantity per month', 'qty', L.qty, 'text', 'e.g. 2000') +
      field('Reference rate (accepted by both)', 'ref', L.ref, 'text', 'e.g. market / association rate') +
      field('Review band (%)', 'band', L.band, 'number', '3') +
      '<div class="row-end"><button class="btn" type="submit">Create draft</button></div></form>' +
    msgBox(draft) + '<div class="btnrow">' + sendButtons(c.phone, draft, 'Send draft') + '</div>' +
    '<p class="muted small" style="margin:10px 0 0">Choose a reference rate that the customer can check on their own. The customer will not accept your own quote sheet as the reference.</p></section>';

  return '' + (S.demo ? demoBanner() : '') +
    '<section class="card"><div class="card-head"><h2>Quote</h2><span class="hint">Floor price, Rate ladder, reply</span></div>' + top + '</section>' +
    body + claimCard(c, q) + lockCard;
}

/* ---------------- Rates (supplier) ---------------- */

function rateSignal(st) {
  if (!st.count) {
    return { level: 'warn', title: 'Enter your first rate', text: 'Get rates from 2-3 suppliers today and enter them here. The app uses them to find your Floor price.' };
  }
  if (st.staleDays > 15) {
    return { level: 'warn', title: 'Rate is old (' + st.staleDays + ' days)',
      text: 'Get a new rate. Quoting on an old cost can reduce your margin.' };
  }
  if (st.avg <= 0) { return { level: 'ok', title: 'Rate record is building', text: 'Keep entering rates.' }; }
  var diff = (num(st.latest.rate) - st.avg) / st.avg * 100;
  if (diff <= -1.5) {
    return { level: 'good', title: 'Rate is ' + fmt(Math.abs(diff)) + '% below average',
      text: 'Last rate ' + rs(st.latest.rate) + ', average ' + rs(st.avg) + '. This is a good time to add stock. Also see the Price lock offer in the Quote tab.' };
  }
  if (diff >= 1.5) {
    return { level: 'bad', title: 'Rate is ' + fmt(diff) + '% above average',
      text: 'The rate is going up. Buy only what you need. Tell your customers before you tell them in the Today tab.' };
  }
  return { level: 'ok', title: 'Rate is steady', text: 'The last rate is close to the average.' };
}

function monthHistory(months) {
  if (!months || months.length < 2) {
    return '<p class="muted small" style="margin-top:10px">After 2-3 months of records, this will show which month the rate is lowest.</p>';
  }
  var min = months.reduce(function (a, b) { return b.avg < a.avg ? b : a; }, months[0]);
  var max = months.reduce(function (a, b) { return b.avg > a.avg ? b : a; }, months[0]);
  var bars = months.map(function (m) {
    var w = max.avg > 0 ? Math.max(4, Math.round(m.avg / max.avg * 100)) : 4;
    return '<div class="bar"><span>' + monLabel(m.key) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + w + '%"></div></div><b>' + rs(m.avg) + '</b></div>';
  }).join('');
  return '<div class="hist"><div class="hist-head">Average rate by month</div>' + bars +
    '<p class="small" style="margin:6px 0 0">Cheapest: <b>' + monLabel(min.key) + '</b> (' + rs(min.avg) + ').</p></div>';
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
    return '<div class="signal ' + (cn.v ? 'good' : 'warn') + '"><b>' + (cn.v ? rs(cn.v) + ' per ' + unitOf() : 'Cost not known') + '</b><p>' + esc(costLine(cn)) + '</p></div>' +
      (tr0 ? '<p class="small" style="margin:10px 0 0">Recent rates are <b>' + fmt(Math.abs(tr0.pct)) + '% ' + (tr0.pct < 0 ? 'below' : 'above') + '</b> the earlier average.</p>' : '');
  }
  return S.products.map(function (p) {
    var cn = costNow(p.id);
    var tr = costTrend(p.id);
    return '<details class="obj" style="margin:0 0 8px"' + (cn.v ? '' : '') + '><summary><b>' + esc(p.name) + '</b> — ' +
      (cn.v ? rs(cn.v) + ' per ' + unitOf() : 'cost incomplete') +
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
      '<td class="small ' + (b && b.stale > 15 ? 'bad' : 'muted') + '">' + (b ? b.stale + ' days' : '') + '</td></tr>';
  }).join('');
  return '<div class="table-wrap"><table><thead><tr><th>Raw material</th><th>Cheapest</th><th class="num">True ₹</th><th>Trend</th><th>Age</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p class="muted small" style="margin:8px 0 0">True ₹ = (rate + freight) ÷ (1 − rejection%) − benefit of supplier credit. Trend = rate of the last 14 days compared with the average of the last 4 months.</p>';
}

function viewRate() {
  var multi = S.products.length > 0 && materialNames().length > 0;
  var st = multi ? null : quoteStats();
  var sig = multi ? null : rateSignal(st);
  var rows = S.quotes.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 25).map(function (q) {
    var e = effQuote(q);
    return '<tr><td>' + dmy(q.date) + '</td><td>' + esc(q.supplier) + (q.item ? '<div class="small muted">' + esc(q.item) + '</div>' : '') + '</td><td class="num">' + rs(q.rate) + '</td><td class="num"><b>' + rs(e.effective) + '</b></td>' +
      '<td>' + (q.moq ? esc(q.moq) : '—') + '</td><td>' + (num(q.deliveryDays) ? num(q.deliveryDays) + ' days' : '—') + '</td>' +
      '<td>' + (num(q.payDays) ? num(q.payDays) + ' days' : '—') + '</td>' +
      '<td class="actions"><button class="link del" type="button" data-action="del-quote" data-id="' + esc(q.id) + '">×</button></td></tr>';
  }).join('');

  var signalCard = multi
    ? '<section class="card"><div class="card-head"><h2>Raw material rates</h2><span class="hint">' + S.quotes.length + ' record</span></div>' + materialSummary() + '</section>'
    : '<section class="card"><div class="card-head"><h2>Rate signal</h2><span class="hint">' + S.quotes.length + ' record</span></div>' +
      '<div class="signal ' + sig.level + '"><b>' + esc(sig.title) + '</b><p>' + esc(sig.text) + '</p></div>' +
      '<div class="mini">' +
        '<div><span>Cheapest (of ' + (st.poolN || 0) + ' rates)</span><b>' + (st.best ? rs(st.best.rate) : '—') + '</b><i>' + (st.best ? esc(st.best.supplier) : '') + '</i></div>' +
        '<div><span>Average</span><b>' + (st.count ? rs(st.avg) : '—') + '</b><i>spread ' + fmt(st.spread) + '%</i></div>' +
        '<div><span>Last rate</span><b>' + (st.latest ? rs(st.latest.rate) : '—') + '</b><i>' + (st.latest ? daysAgoText(st.staleDays) : '') + '</i></div></div>' +
      (st.bestEff && st.best && st.bestEff.id !== st.best.id
        ? '<div class="msg">Note: the lowest rate (' + esc(st.best.supplier) + ') is not the cheapest in true cost. Lowest True cost: ' + esc(st.bestEff.supplier) + ' — ' + rs(st.bestEffV) + '.</div>' : '') +
      '<p class="muted small" style="margin:10px 0 0">True cost = (rate + freight) ÷ (1 − rejection%) − benefit of supplier credit (' + fmt(S.settings.costOfFunds) + '% per year). More credit means lower cost.</p>' +
      monthHistory(st.months) + '</section>';

  return '' + (S.demo ? demoBanner() : '') + dataLists() +
    '<section class="card"><div class="card-head"><h2>' + (S.products.length ? 'Product cost' : 'Cost today') + '</h2><span class="hint">the base for your selling rate</span></div>' +
      productCostCards() + '</section>' +
    signalCard +
    '<section class="card"><div class="card-head"><h2>Message: ask 2-3 suppliers for rates at once</h2></div>' +
      '<form data-form="rfq" class="grid2">' +
        '<label class="fld"><span>Which material</span><input type="text" name="material" list="dl-mat" value="' + esc(S.rfq.material || '') + '" placeholder="e.g. Stearyl alcohol"></label>' +
        field('Quantity needed', 'qty', S.rfq.qty, 'text', 'e.g. 2000') +
        field('Delivery needed within (days)', 'days', S.rfq.days, 'number', '3') +
        field('Special note (optional)', 'note', S.rfq.note, 'text', 'e.g. GST bill + transport') +
        '<div class="row-end"><button class="btn" type="submit">Create message</button></div></form>' +
      msgBox(rfqMessage()) +
      '<div class="btnrow">' + sendButtons('', rfqMessage(), 'Open in WhatsApp') + '</div>' +
      '<p class="muted small" style="margin:10px 0 0">In WhatsApp, choose the suppliers you want to send to and send it. Then enter their replies below.</p></section>' +
    '<section class="card"><div class="card-head"><h2>Add new rate</h2></div>' +
      '<form data-form="quote" class="grid2">' +
        field('Date', 'date', todayISO(), 'date') +
        '<label class="fld"><span>Supplier</span><input type="text" name="supplier" list="dl-sup" placeholder="e.g. Godrej"></label>' +
        '<label class="fld"><span>Raw material / item</span><input type="text" name="item" list="dl-mat" value="' + esc(S.products.length ? '' : (S.settings.item || '')) + '"></label>' +
        field('Rate (₹ per ' + unitOf() + ')', 'rate', '', 'number', '0') +
        field('MOQ', 'moq', '', 'text', 'e.g. 500 kg') + field('Delivery (days)', 'deliveryDays', '', 'number', '0') +
        field('Credit days given by supplier', 'payDays', '', 'number', '0') +
        field('Freight (₹ per ' + unitOf() + ')', 'freight', '', 'number', '0') +
        field('Rejection / wastage (%)', 'rejection', '', 'number', '0') +
        '<div class="row-end"><button class="btn" type="submit">Add rate</button></div></form></section>' +
    '<section class="card"><div class="card-head"><h2>Rate sheet</h2><span class="hint">last 25</span></div>' +
      (rows ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Supplier</th><th class="num">Rate</th><th class="num">True</th><th>MOQ</th><th>Delivery</th><th>Credit</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<p class="muted">No rates yet.</p>') +
      '<p class="muted small" style="margin:10px 0 0">This app does not show live market rates. It only keeps a record of the rates you enter. If you have a rate sheet in Excel, import it from Setup > Import from Excel.</p></section>';
}

/* ---------------- Cash ---------------- */

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
    return '<tr><td>' + d + ' days</td><td class="num">' + money(100000 * cost / 100 * d / 365) + '</td><td class="num">' + money(1000000 * cost / 100 * d / 365) + '</td></tr>';
  }).join('');
  var g = gapsSorted();
  var p = num(s.monthlyPurchase);
  var rateBenefit = p * num(S.rvc.diff) / 100 * 12;
  var creditBenefit = p * cost / 100 * num(S.rvc.days) / 30;
  var rvcLine = creditBenefit >= rateBenefit
    ? 'Decision: first get ' + num(S.rvc.days) + ' days of credit, then talk about the rate.'
    : 'Decision: you are getting little credit, so push on the rate. Still ask for credit once.';

  return '' + (S.demo ? demoBanner() : '') +
    '<section class="card"><div class="card-head"><h2>Business health</h2><span class="hint">' + g.length + ' items</span></div>' +
      (g.length ? g.slice(0, 6).map(gapCard).join('') : '<p class="ok" style="margin:0">No major problem found right now.</p>') +
      '<div class="btnrow"><button class="btn alt" type="button" data-action="copy-report">Copy report</button></div></section>' +
    '<section class="card"><div class="card-head"><h2>Working capital</h2></div>' +
      '<form data-form="settings" class="grid2">' +
        field('Monthly sales ₹', 'monthlySales', s.monthlySales, 'number', '0') +
        field('Monthly purchases ₹', 'monthlyPurchase', s.monthlyPurchase, 'number', '0') +
        field('Monthly expenses ₹', 'monthlyExpenses', s.monthlyExpenses, 'number', '0') +
        field('Credit given to customers (days)', 'creditGiven', s.creditGiven, 'number', '60') +
        field('Credit from suppliers (days)', 'creditReceived', s.creditReceived, 'number', '0') +
        field('Stock for how many days', 'stockDays', s.stockDays, 'number', '10') +
        field('Cost of money (% per year)', 'costOfFunds', s.costOfFunds, 'number', '12') +
        field('Cash buffer (months)', 'cashMonths', s.cashMonths, 'number', '3') +
        '<div class="row-end"><button class="btn" type="submit">Update calculation</button></div></form>' +
      '<div class="table-wrap"><table><thead><tr><th>Where your money is stuck</th><th class="num">Amount</th></tr></thead><tbody>' +
        '<tr><td>To receive from customers<br><span class="small muted">(' + num(s.monthlySales) + ' ÷ 30) × ' + num(s.creditGiven) + ' days</span></td><td class="num">' + money(w.recv) + '</td></tr>' +
        '<tr><td>Stock in hand<br><span class="small muted">' + num(s.stockDays) + ' days</span></td><td class="num">' + money(w.inv) + '</td></tr>' +
        '<tr><td>Supplier credit (subtract)<br><span class="small muted">' + num(s.creditReceived) + ' days</span></td><td class="num">− ' + money(w.pay) + '</td></tr>' +
        '<tr><td><b>Net money stuck</b></td><td class="num"><b>' + money(w.net) + '</b></td></tr>' +
        '<tr><td>' + num(s.cashMonths || 3) + ' months of expenses (buffer)</td><td class="num">' + money(w.buffer) + '</td></tr>' +
        '<tr><td><b>Total cash needed</b></td><td class="num"><b>' + money(w.total) + '</b></td></tr></tbody></table></div>' +
      '<p class="small" style="margin:10px 0 0"><b>Cycle ' + Math.round(ccc) + ' days.</b> One day = ' + money(dailySales) + '. If you cut 10 days, ' + money(dailySales * 10) + ' is freed (' + money(dailySales * 10 * cost / 100) + ' interest saved per year).</p></section>' +
    '<section class="card"><div class="card-head"><h2>Discount for early payment: who gains?</h2></div>' +
      '<form data-form="epd" class="grid2">' +
        field('Bill amount ₹', 'amount', e.amount, 'number', '0') + field('Discount (%)', 'disc', e.disc, 'number', '2') +
        field('Payment received how many days early', 'daysSaved', e.daysSaved, 'number', '45') +
        '<div class="row-end"><button class="btn" type="submit">Show calculation</button></div></form>' +
      '<div class="msg">Discount you give: ' + money(discAmt) + ' (' + fmt(e.disc) + '%)\n' +
        'Interest saved by getting money ' + ds + ' days early (at ' + fmt(cost) + '%): ' + money(interest) + '\n' +
        'Your net on this bill: ' + (net >= 0 ? '+' : '−') + money(Math.abs(net)) + '\n' +
        'Yearly cost of the discount: ' + fmt(annual) + '%\n\n' +
        (net >= 0
          ? 'Meaning: this discount is cheap for you. It costs less than a loan.'
          : 'Meaning: this discount is MORE EXPENSIVE for you than a loan (' + fmt(annual) + '% vs ' + fmt(cost) + '%). Give it only if (1) your money costs more than ' + fmt(annual) + '% (you borrow from outside), ' +
            'or (2) this customer would otherwise pay 30-40 days late. For the customer, it is always a gain.') + '</div></section>' +
    '<section class="card"><div class="card-head"><h2>Rate or credit: which gives more benefit</h2></div>' +
      '<form data-form="rvc" class="grid2">' + field('Rate difference (%)', 'diff', S.rvc.diff, 'number', '0.5') +
        field('Credit from supplier (days)', 'days', S.rvc.days, 'number', '30') +
        '<div class="row-end"><button class="btn" type="submit">Compare</button></div></form>' +
      '<div class="msg">' + fmt(S.rvc.diff) + '% lower rate = ' + money(rateBenefit) + ' saving per year\n' + num(S.rvc.days) + ' days of supplier credit = ' + money(creditBenefit) + ' saving per year\n' + rvcLine + '</div></section>' +
    '<section class="card"><div class="card-head"><h2>True cost of giving credit</h2><span class="hint">' + fmt(cost) + '% per year</span></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Credit period</th><th class="num">₹1 lakh</th><th class="num">₹10 lakh</th></tr></thead><tbody>' + creditRows + '</tbody></table></div></section>' +
    '<section class="card"><div class="card-head"><h2>Bill discounting / TReDS</h2></div>' +
      '<p class="muted small" style="margin:0 0 10px">The customer keeps getting credit, and you get your money at once. On TReDS (RXIL, M1xchange, Invoicemart), the customer must also join the platform and accept the bill. Small customers often do not join.</p>' +
      '<form data-form="tre" class="grid2">' + field('Bill amount ₹', 'amount', t.amount, 'number', '0') +
        field('Discounting rate (% per year)', 'rate', t.rate, 'number', '11') + field('Bill due after (days)', 'days', t.days, 'number', '60') +
        '<div class="row-end"><button class="btn" type="submit">Show cost</button></div></form>' +
      '<div class="msg">Bill: ' + money(t.amount) + ', due after ' + num(t.days) + ' days\nDiscounting cost: ' + money(bCost) + '\nCash in hand now: ' + money(num(t.amount) - bCost) + '</div>' +
      '<p class="muted small" style="margin:10px 0 0"><b>MSME payment rule (Sec 43B(h)):</b> applies only to dues of micro and small suppliers. Payment is due in 15 days if there is no written agreement, and in at most 45 days if there is one. ' +
        'If the customer pays later, the customer gets the tax deduction for that expense only in the year of payment. One reading says it does not apply to traders. It does not apply to medium suppliers. Please confirm with your CA.</p></section>';
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
    field('Product name', 'name', p.name, 'text', 'e.g. DSTDP') +
    field('Conversion cost ₹ per kg (power, labour, etc.)', 'conv', p.conv, 'number', '0') +
    field('Yield (%)', 'yieldPct', p.yieldPct, 'number', '100') +
    field('Capacity (kg/month)', 'capacity', p.capacity, 'number', '0') +
    field('Direct cost ₹/kg (if there is no recipe)', 'cost', p.cost, 'number', '0') +
    '<label class="fld" style="grid-column:1/-1"><span>Recipe (BOM): on each line write “raw material = kg per 1 kg product”</span>' +
      '<textarea name="bom" rows="3" placeholder="Stearyl alcohol = 0.80\nThiodipropionic acid (TDPA) = 0.26">' + esc(bomText(p)) + '</textarea></label>' +
    '<div class="row-end"><button class="btn" type="submit">' + (isNew ? 'Add product' : 'Save') + '</button>' +
      (isNew ? '' : '<button class="btn tiny danger" type="button" data-action="del-product" data-id="' + esc(p.id) + '">Delete</button>') + '</div></form>';
}

function productsCard() {
  var list = S.products.map(function (p) {
    var cn = costNow(p.id);
    return '<details class="obj"><summary><b>' + esc(p.name) + '</b> <span class="small muted">' +
      (cn.v ? rs(cn.v) + '/' + unitOf() : (p.bom.length ? 'rates incomplete' : 'no recipe')) +
      (num(p.capacity) ? ' · ' + fmt(p.capacity, 0) + ' kg/month' : '') + '</span></summary>' + productForm(p) + '</details>';
  }).join('');
  return '<section class="card"><div class="card-head"><h2>Products and Recipe (BOM)</h2><span class="hint">' + S.products.length + ' products</span></div>' +
    '<p class="muted small" style="margin:0 0 10px">Once you enter the recipe, the cost is worked out automatically: true rate of raw material × kg ÷ Yield + Conversion cost. ' +
    'Raw material names must match the “item” names in the Rates tab exactly.</p>' +
    (list || '<p class="muted small">No products yet.</p>') +
    '<details class="obj"' + (S.products.length ? '' : ' open') + '><summary><b>+ New product</b></summary>' + productForm(null) + '</details>' +
    (S.products.length ? '' : '<div class="btnrow"><button class="btn alt" type="button" data-action="preset-products">Add 15 sample products</button></div>' +
      '<p class="muted small" style="margin:6px 0 0">Only name and capacity (from the company profile). You must enter the recipe and cost yourself.</p>') +
    '</section>';
}

function excelCard() {
  return '<section class="card"><div class="card-head"><h2>Import data from Excel</h2></div>' +
    '<p class="muted small" style="margin:0 0 10px">Select the rows in Excel, copy them and paste them here (include the header line). The column order can be anything. If you paste again, old entries are not added twice.</p>' +
    '<form data-form="xl-sales"><label class="fld"><span>Sales register (Date, Party, Product, Qty, Rate, Invoice, Paid date…)</span>' +
      '<textarea name="text" rows="4" placeholder="' + esc(xlTemplate('sales')) + '"></textarea></label>' +
      '<div class="row-end" style="margin-top:8px"><button class="btn" type="submit">Import sales</button></div></form>' +
    '<form data-form="xl-rates" style="margin-top:14px"><label class="fld"><span>Raw material rates (Date, Supplier, Material, Rate, Freight, Credit days…)</span>' +
      '<textarea name="text" rows="4" placeholder="' + esc(xlTemplate('rates')) + '"></textarea></label>' +
      '<div class="row-end" style="margin-top:8px"><button class="btn" type="submit">Import rates</button></div></form></section>';
}

function viewSetup() {
  var s = S.settings;
  var standalone = false;
  try { standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches; } catch (e) { /* ignore */ }
  var p = paymentStats();
  return '' + (S.demo ? demoBanner() : '') +
    '<section class="card"><div class="card-head"><h2>My business</h2></div>' +
      '<form data-form="settings" class="grid2">' +
        field('Business name', 'business', s.business, 'text', 'e.g. Sharma Traders') +
        field('Your name', 'person', s.person, 'text', 'e.g. Rakesh') +
        field('Product / item', 'item', s.item, 'text', 'e.g. cotton yarn') +
        field('Unit', 'unit', s.unit, 'text', 'kg / piece / bag') +
        field('Monthly sales ₹', 'monthlySales', s.monthlySales, 'number', '0') +
        field('Monthly purchases ₹', 'monthlyPurchase', s.monthlyPurchase, 'number', '0') +
        field('Monthly expenses ₹', 'monthlyExpenses', s.monthlyExpenses, 'number', '0') +
        field('Credit given to customers (days)', 'creditGiven', s.creditGiven, 'number', '60') +
        field('Credit from suppliers (days)', 'creditReceived', s.creditReceived, 'number', '0') +
        field('Stock for how many days', 'stockDays', s.stockDays, 'number', '10') +
        field('Cost of money (% per year)', 'costOfFunds', s.costOfFunds, 'number', '12') +
        field('Cash buffer (months)', 'cashMonths', s.cashMonths, 'number', '3') +
        '<div class="row-end"><button class="btn" type="submit">Save</button></div></form></section>' +
    productsCard() + excelCard() +
    '<section class="card"><div class="card-head"><h2>Rate calculation (Floor price and Rate ladder)</h2></div>' +
      '<p class="muted small" style="margin:0 0 10px">Margin = % of the selling rate that should remain after cost of money, risk and expenses.</p>' +
      '<form data-form="settings" class="grid2">' +
        field('Target margin (%)', 'targetMargin', s.targetMargin, 'number', '6') +
        field('Minimum margin (%) — Floor price', 'minMargin', s.minMargin, 'number', '3') +
        field('Overhead per ' + (s.unit || 'unit') + ' (₹)', 'overhead', s.overhead, 'number', '0') +
        field('Expense per delivery (₹)', 'perDelivery', s.perDelivery, 'number', '0') +
        field('Usual delivery time (days)', 'deliveryDays', s.deliveryDays, 'number', '3') +
        field('Enter cost yourself (₹ per ' + (s.unit || 'unit') + ')', 'costOverride', s.costOverride, 'number', '0 = use supplier rate') +
        field('Risk for grade B customer (%)', 'riskB', s.riskB, 'number', '0.3') +
        field('Risk for grade C customer (%)', 'riskC', s.riskC, 'number', '1') +
        '<div class="row-end"><button class="btn" type="submit">Save</button></div></form></section>' +
    '<section class="card"><div class="card-head"><h2>Backup / data</h2></div>' +
      '<p class="muted small" style="margin:0 0 10px">Your data stays only in the browser of this phone. Once a week, copy the Backup and send it to yourself on WhatsApp.</p>' +
      '<div class="btnrow"><button class="btn" type="button" data-action="copy-backup">Copy Backup</button>' +
        '<button class="btn alt" type="button" data-action="export">Download file</button>' +
        '<button class="btn alt" type="button" data-action="demo">Sample data</button>' +
        '<button class="btn danger" type="button" data-action="reset">Clear everything</button></div>' +
      '<form data-form="import" style="margin-top:12px"><label class="fld"><span>Paste Backup here to restore</span>' +
        '<textarea name="json" placeholder="Paste the Backup text here"></textarea></label>' +
        '<div class="row-end" style="margin-top:8px"><button class="btn" type="submit">Restore</button></div></form>' +
      '<p class="muted small" style="margin:10px 0 0">Total outstanding: ' + money(p.outstanding) + ' · Customers: ' + S.customers.length + ' · Orders: ' + S.orders.length + ' · Rate records: ' + S.quotes.length + '</p></section>' +
    (standalone ? '' : '<section class="card"><div class="card-head"><h2>Use as an app on your phone</h2></div>' +
      '<p class="muted small" style="margin:0">Open the Chrome menu (⋮) and choose “Add to Home screen” or “Install app”. Then it will open even without internet.</p></section>');
}
