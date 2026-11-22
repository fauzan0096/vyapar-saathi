'use strict';

/* =========================================================
   Vyapar Saathi v2 — engine: six jobs
   1 Rate ladder   2 Customer floor   3 Reorder / rate messages
   4 Bluff tracker 5 Churn alarm      6 Monthly value statement
   ========================================================= */

/* ---------- 1 & 2: rate ladder and floor price ---------- */

/* Margin = % of the selling rate, after deducting the cost of funds and risk.
   rate = (cost + overhead + delivery cost/qty) / (1 - interest - risk - margin) */
function priceFor(cost, qty, days, marginPct, riskPct) {
  var s = S.settings;
  var q = num(qty);
  var base = num(cost) + num(s.overhead) + (q > 0 ? num(s.perDelivery) / q : 0);
  var denom = 1 - num(s.costOfFunds) / 100 * num(days) / 365 - num(riskPct) / 100 - num(marginPct) / 100;
  if (base <= 0 || denom <= 0.05) { return null; }
  return base / denom;
}

function quoteFor(c, qty, pidIn) {
  var s = S.settings;
  var pid = pidOr(pidIn);
  var cn = costNow(pid);
  var st = custStanding(c);
  var q = Math.max(0, num(qty));
  var out = {
    pid: pid, product: findProduct(pid), cost: cn.v, costInfo: cn, st: st, qty: q,
    floor: null, ask: null, zero: null, ladder: []
  };
  if (!cn.v) { return out; }
  out.floor = priceFor(cn.v, q, st.days, s.minMargin, st.risk);
  out.ask = priceFor(cn.v, q, st.days, s.targetMargin, st.risk);
  /* zero = break-even rate (only cost + interest + risk). Selling below this is a direct loss. */
  out.zero = priceFor(cn.v, q, st.days, 0, st.risk);
  var ds = [15, 30, 45, 60, 90];
  [st.terms, st.days].forEach(function (d) { if (ds.indexOf(d) < 0) { ds.push(d); } });
  ds.sort(function (a, b) { return a - b; });
  out.ladder = ds.map(function (d) {
    return {
      d: d,
      price: priceFor(cn.v, q, d, s.targetMargin, st.risk),
      floor: priceFor(cn.v, q, d, s.minMargin, st.risk),
      isTerms: d === st.terms, isNow: d === st.days
    };
  });
  return out;
}

/* ---------- 4: claim checker ---------- */

/* The customer quoted someone else's rate: bring it to the same terms and find the real gap */
function claimAnalysis(c, qty, claimed, theirDaysRaw, pid) {
  var s = S.settings;
  var q = quoteFor(c, qty, pid);
  claimed = num(claimed);
  if (!q.ask || claimed <= 0) { return null; }
  var cof = num(s.costOfFunds) / 100;
  var qd = q.st.days;
  var hasTheir = (theirDaysRaw !== '' && theirDaysRaw !== null && theirDaysRaw !== undefined);
  var td = hasTheir ? Math.max(0, num(theirDaysRaw)) : qd;
  var oursAtTheir = q.ask * (1 + cof * (td - qd) / 365);
  var claimedAtOurs = claimed * (1 + cof * (qd - td) / 365);
  var gapPct = (oursAtTheir - claimed) / oursAtTheir * 100;
  var counter = clamp(claimedAtOurs, q.floor, q.ask);
  var below = claimedAtOurs < q.floor;
  return {
    q: q, claimed: claimed, td: td, qd: qd, hasTheir: hasTheir,
    oursAtTheir: oursAtTheir, claimedAtOurs: claimedAtOurs,
    gapPct: gapPct, realCheaper: gapPct > 0.3,
    counter: counter, giveUp: q.ask - counter,
    below: below, lossPerUnit: below ? q.floor - claimedAtOurs : 0,
    lossOrder: below ? (q.floor - claimedAtOurs) * q.qty : 0
  };
}

function claimStats(cid) {
  var list = S.claims.filter(function (x) { return x.customerId === cid && x.outcome; });
  var all = cid ? list : S.claims.filter(function (x) { return x.outcome; });
  var n = all.length;
  var stay = 0;
  all.forEach(function (x) {
    if (x.outcome === 'ordered') { stay += 1; }
    else if (x.outcome === 'partial') { stay += 0.5; }
  });
  var pct = n ? stay / n * 100 : 0;
  var verdict, level;
  if (n < 3) { verdict = 'Not enough data yet (' + n + '/3 claims) — keep recording the outcome each time.'; level = 'none'; }
  else if (pct >= 70) { verdict = 'Mostly pressure tactics: ' + fmt(pct, 0) + '% of the time the customer still ordered after a claim. Do not drop your rate; show the rate ladder and terms.'; level = 'bluff'; }
  else if (pct <= 40) { verdict = 'Genuine threat: you got the order only ' + fmt(pct, 0) + '% of the time. Go down to the floor price to keep the customer, or offer a new benefit.'; level = 'real'; }
  else { verdict = 'Mixed (' + fmt(pct, 0) + '% ordered). Compare terms like-for-like on every claim.'; level = 'mixed'; }
  return { n: n, pct: pct, verdict: verdict, level: level, pending: S.claims.filter(function (x) { return x.customerId === cid && !x.outcome; }).length };
}

/* ---------- order history, reorder cycle ---------- */

function ordersOf(cid) {
  return S.orders.filter(function (o) { return o.customerId === cid; }).sort(function (a, b) {
    return String(a.date).localeCompare(String(b.date));
  });
}

function orderStats(cid) {
  var os = ordersOf(cid);
  var t = todayISO();
  var out = { n: os.length, last: null, cycle: 0, avgQty: 0, daysSince: 0, nextDue: '', lastRate: 0, monthly: 0, os: os, pid: '' };
  if (!os.length) { return out; }
  var last = os[os.length - 1];
  out.last = last;
  out.pid = last.product || '';
  out.lastRate = num(last.rate);
  out.daysSince = Math.max(0, daysBetween(last.date, t));
  out.avgQty = avg(os.slice(-4).map(function (o) { return o.qty; }));
  if (os.length >= 2) {
    var gaps = [];
    for (var i = 1; i < os.length; i++) {
      var g = daysBetween(os[i - 1].date, os[i].date);
      if (g > 0) { gaps.push(g); }
    }
    if (gaps.length) {
      out.cycle = Math.max(1, Math.round(median(gaps.slice(-5))));
      out.nextDue = addDays(last.date, out.cycle);
      out.monthly = out.avgQty * out.lastRate * 30 / out.cycle;
    }
  }
  return out;
}

/* ---------- 5: loss alert ---------- */

function churnRisk(c) {
  var os = orderStats(c.id);
  var st = custStanding(c);
  var t = todayISO();
  var reasons = [];
  var score = 0;

  if (os.cycle && os.n >= 3) {
    var ratio = os.daysSince / os.cycle;
    if (ratio >= 2) {
      score += 3;
      reasons.push('Last order was ' + os.daysSince + ' days ago; usually orders every ' + os.cycle + ' days (' + fmt(ratio) + 'x the usual gap).');
    } else if (ratio >= 1.5) {
      score += 2;
      reasons.push('Last order was ' + os.daysSince + ' days ago; usually orders every ' + os.cycle + ' days.');
    }
  }
  if (os.n >= 4) {
    var qs = os.os.map(function (o) { return o.qty; });
    var recent2 = avg(qs.slice(-2));
    var before = avg(qs.slice(0, -2).slice(-4));
    if (before > 0) {
      var r = recent2 / before;
      if (r < 0.7) {
        score += 2;
        reasons.push('Quantity has dropped: earlier ~' + fmt(before, 0) + ', now ~' + fmt(recent2, 0) + ' (' + fmt((1 - r) * 100, 0) + '% lower).');
      } else if (r < 0.85) {
        score += 1;
        reasons.push('Quantity is slightly lower: from ~' + fmt(before, 0) + ' to ~' + fmt(recent2, 0) + '.');
      }
    }
  }
  var paid = c.bills.filter(function (b) { return b.paidOn; }).sort(function (a, b) {
    return String(a.paidOn).localeCompare(String(b.paidOn));
  }).map(function (b) { return Math.max(0, daysBetween(b.date, b.paidOn)); });
  if (paid.length >= 4) {
    var rec = avg(paid.slice(-2));
    var old = avg(paid.slice(0, -2));
    if (rec - old >= 10) {
      score += 1;
      reasons.push('Payments have slowed: earlier ~' + fmt(old, 0) + ' days, now ~' + fmt(rec, 0) + ' days.');
    }
  }
  if (st.oldestAge > st.terms + 30) {
    score += 1;
    reasons.push('One bill is more than 30 days past its terms.');
  }
  var lost = S.claims.filter(function (x) {
    return x.customerId === c.id && x.outcome === 'lost' && daysBetween(x.date, t) <= 60;
  }).length;
  if (lost) {
    score += 2;
    reasons.push('Went to a competitor ' + lost + ' time(s) in the last 60 days.');
  }
  var level = score >= 4 ? 'high' : (score >= 2 ? 'mid' : '');
  return { score: score, level: level, reasons: reasons, os: os, valueAtRisk: os.monthly };
}

/* ---------- 6: monthly value statement ---------- */

function valueStatement(c, days) {
  var t = todayISO();
  var from = addDays(t, -days);
  var cof = num(S.settings.costOfFunds);
  var os = ordersOf(c.id).filter(function (o) { return o.date >= from; });
  var deliv = os.filter(function (o) { return o.delivered; });
  var onTime = deliv.filter(function (o) { return !o.promised || o.delivered <= o.promised; }).length;
  var late = deliv.filter(function (o) { return o.promised && o.delivered > o.promised; });
  var avgDelay = late.length ? avg(late.map(function (o) { return daysBetween(o.promised, o.delivered); })) : 0;
  var qtyD = sum(deliv.map(function (o) { return o.qty; }));
  var rej = sum(deliv.map(function (o) { return o.rejected; }));
  var rejOrders = deliv.filter(function (o) { return num(o.rejected) > 0; });
  var replaced = rejOrders.filter(function (o) { return o.replaced; }).length;
  var credit = 0, dsum = 0, dn = 0;
  c.bills.filter(function (b) { return b.date >= from; }).forEach(function (b) {
    var d = b.paidOn ? Math.max(0, daysBetween(b.date, b.paidOn)) : Math.max(0, daysBetween(b.date, t));
    credit += num(b.amount) * cof / 100 * d / 365;
    dsum += d;
    dn += 1;
  });
  var out = {
    days: days, orders: os.length, delivered: deliv.length, onTime: onTime,
    onTimePct: deliv.length ? onTime / deliv.length * 100 : null,
    lateCount: late.length, avgDelay: avgDelay,
    rejPct: qtyD > 0 ? rej / qtyD * 100 : 0, rejOrders: rejOrders.length, replaced: replaced,
    creditValue: credit, avgCreditDays: dn ? dsum / dn : 0, bills: dn,
    total: sum(os.map(function (o) { return o.qty * o.rate; }))
  };
  var warn = [];
  if (out.onTimePct !== null && out.onTimePct < 85) { warn.push('On-time delivery is only ' + fmt(out.onTimePct, 0) + '%'); }
  if (out.rejPct > 2) { warn.push('Rejection is ' + fmt(out.rejPct) + '%'); }
  if (out.rejOrders > out.replaced) { warn.push((out.rejOrders - out.replaced) + ' rejection replacement(s) pending'); }
  out.warn = warn;
  out.sendable = out.orders > 0 && warn.length === 0;
  return out;
}

/* ---------- 3: rate move and lock ---------- */

function rateMove(c) {
  var os = orderStats(c.id);
  if (!os.last || !os.lastRate) { return null; }
  var q = quoteFor(c, os.avgQty, os.pid);
  if (!q.ask) { return null; }
  var delta = (q.ask - os.lastRate) / os.lastRate * 100;
  return { q: q, os: os, delta: delta, type: delta <= -1.5 ? 'drop' : (delta >= 1.5 ? 'rise' : '') };
}

/* When the market is soft, offer regular customers a 3-month price lock */
function lockPlan() {
  var s = S.settings;
  var months = Math.max(1, num(S.lock.months) || 3);
  var cands = [];
  S.customers.forEach(function (c) {
    var os = orderStats(c.id);
    var st = custStanding(c);
    if (os.n < 3 || !os.cycle || st.grade === 'C') { return; }
    if (os.daysSince > os.cycle * 1.5) { return; }
    var pid = pidOr(os.pid);
    var tr = costTrend(pid);
    var cn = costNow(pid);
    if (!tr || tr.pct > -3 || !cn.v) { return; }
    var qty = os.avgQty;
    var normalCost = cn.v / (1 + tr.pct / 100);
    var normal = priceFor(normalCost, qty, st.days, s.targetMargin, st.risk);
    var floor = priceFor(cn.v, qty, st.days + months * 15, s.minMargin, st.risk);
    var lock = priceFor(cn.v, qty, st.days + months * 15, s.targetMargin, st.risk);
    if (!normal || !lock || lock >= normal) { return; }
    var monthlyQty = qty * 30 / os.cycle;
    cands.push({
      c: c, os: os, st: st, pid: pid, pct: tr.pct, normal: normal, lock: Math.max(lock, floor || 0),
      monthlyQty: monthlyQty, stockCost: monthlyQty * months * cn.v
    });
  });
  if (!cands.length) { return null; }
  return { months: months, cands: cands };
}

/* ---------- customer dependence and plant capacity ---------- */

function concentration() {
  var from = addDays(todayISO(), -90);
  var rows = S.customers.map(function (c) {
    var v = sum(S.orders.filter(function (o) { return o.customerId === c.id && o.date >= from; })
      .map(function (o) { return o.qty * o.rate; }));
    return { c: c, value: v };
  });
  var total = sum(rows.map(function (r) { return r.value; }));
  rows.forEach(function (r) { r.pct = total > 0 ? r.value / total * 100 : 0; });
  rows.sort(function (a, b) { return b.value - a.value; });
  var active = rows.filter(function (r) { return r.value > 0; });
  return { rows: rows, total: total, active: active.length, top: active.length ? active[0] : null };
}

/* Orders of the last 30 days / plant's monthly capacity */
function capacityInfo(pid) {
  var p = pid ? findProduct(pid) : null;
  if (!p || !(num(p.capacity) > 0)) { return null; }
  var from = addDays(todayISO(), -30);
  var used = sum(S.orders.filter(function (o) { return o.product === pid && o.date >= from; })
    .map(function (o) { return o.qty; }));
  return { cap: num(p.capacity), used: used, pct: used / num(p.capacity) * 100, free: Math.max(0, num(p.capacity) - used) };
}

/* ---------- messages ---------- */

function sign() { return S.settings.business || ''; }
function unitOf() { return S.settings.unit || 'unit'; }
function itemOf(pid) { return productName(pid) || S.settings.item || 'goods'; }

function rfqMessage() {
  var pay = num(S.settings.creditReceived) > 0 ? num(S.settings.creditReceived) + ' days credit' : 'immediate / cash';
  var lines = [];
  lines.push('Hello,');
  lines.push('');
  lines.push('Please send your rate for ' + (S.rfq.material || itemOf()) + ':');
  lines.push('1. Quantity: ' + (S.rfq.qty || '____') + ' ' + unitOf());
  lines.push('2. Delivery: within ' + (num(S.rfq.days) || 3) + ' days');
  lines.push('3. Payment: ' + pay + ' (or please share your own terms)');
  lines.push('4. Please state GST, freight and packing clearly along with the rate');
  if (S.rfq.note) { lines.push('5. Note: ' + S.rfq.note); }
  lines.push('');
  lines.push('Please share your rate and availability by this evening; we intend to confirm the order.');
  lines.push('');
  lines.push('Regards,');
  lines.push(sign() || '______');
  return lines.join('\n');
}

function toneFor(c) {
  if (S.tones[c.id]) { return S.tones[c.id]; }
  var g = custStanding(c).grade;
  return g === 'C' ? 'firm' : (g === 'A' ? 'soft' : 'normal');
}

function reminderMessage(c, tone) {
  var due = custDue(c);
  var biz = sign() || '______';
  if (!due.length) {
    return 'Dear ' + c.name + ',\n\nYou have no pending payments. Thank you for paying on time.\n\n' + biz;
  }
  var lines = due.map(function (b, i) {
    return (i + 1) + '. Bill dated ' + dmy(b.date) + ' for ' + money(b.amount) + ' — due ' + dmy(b.due) +
      (b.overdueDays > 0 ? ' (' + b.overdueDays + ' days overdue)' : '');
  });
  var total = due.reduce(function (x, b) { return x + num(b.amount); }, 0);
  var over = due.filter(function (b) { return b.overdueDays > 0; });
  var overAmt = over.reduce(function (x, b) { return x + num(b.amount); }, 0);
  var maxLate = over.reduce(function (m, b) { return Math.max(m, b.overdueDays); }, 0);

  if (tone === 'soft') {
    return 'Dear ' + c.name + ',\n\nI hope you are well. Here is the statement of your account:\n\n' + lines.join('\n') +
      '\n\nTotal pending: ' + money(total) + '\n\nPlease share a payment date so that I can update our records. ' +
      'If there is any difficulty, please let me know and we will work it out together.\n\nRegards,\n' + biz;
  }
  if (tone === 'firm') {
    var head = over.length
      ? 'A total of ' + money(total) + ' is pending in your account, of which ' + money(overAmt) + ' is past the due date (up to ' + maxLate + ' days).'
      : 'A total of ' + money(total) + ' is pending in your account.';
    var ask = over.length
      ? 'Please clear the payment within 3 days, or confirm a new date in writing. The next order will be on hold until the previous balance is cleared.'
      : 'Please confirm the payment date so that the next order can be dispatched on time.';
    return 'Dear ' + c.name + ',\n\n' + head + '\n\n' + lines.join('\n') + '\n\n' + ask + '\n\nRegards,\n' + biz;
  }
  return 'Dear ' + c.name + ',\n\nStatement of account as of ' + dmy(todayISO()) + ':\n\n' + lines.join('\n') +
    '\n\nTotal pending: ' + money(total) + '\n\nPlease confirm the payment date. ' +
    'We will dispatch the next order as soon as payment is received.\n\nRegards,\n' + biz;
}

function ladderMessage(c, q) {
  var lines = q.ladder.map(function (r) {
    return r.d + '-day payment: ' + rs(r.price) + ' per ' + unitOf();
  });
  return 'Dear ' + c.name + ',\n\nOur rate for ' + itemOf(q.pid) + ' (GST extra) according to your payment timing:\n\n' +
    lines.join('\n') + '\n\nThe rate applicable will be the one for the day you make payment. ' +
    'You usually pay in ' + q.st.days + ' days (' + rs(q.ask) + ').\n\nRegards,\n' + sign();
}

function claimReply(c, a) {
  var u = unitOf();
  var lines = [];
  lines.push('Dear ' + c.name + ',');
  lines.push('');
  if (a.realCheaper) {
    lines.push('Please compare on the same payment terms: their ' + rs(a.claimed) + ' is for ' + a.td + '-day payment, ' +
      'so on our ' + a.qd + '-day terms it works out to about ' + rs(a.claimedAtOurs) + '. ' +
      'Our rate is ' + rs(a.q.ask) + ' (' + a.qd + ' days).');
    lines.push('');
    if (a.counter < a.q.ask - 0.005) {
      lines.push('Our best rate for you: ' + rs(a.counter) + ' per ' + u + ' (' + a.qd + '-day payment). ' +
        'Delivery and quality guarantee are included.');
    } else {
      lines.push('Our rate for you is ' + rs(a.q.ask) + ' per ' + u + ' (' + a.qd + '-day payment).');
    }
  } else {
    lines.push('Please compare on the same payment terms: their ' + rs(a.claimed) + ' is for ' + a.td + ' days, ' +
      'and our rate at ' + a.td + ' days works out to ' + rs(a.oursAtTheir) + ' — practically no difference. ' +
      'In addition, we provide a delivery and quality guarantee.');
  }
  lines.push('');
  lines.push('Regards,');
  lines.push(sign());
  return lines.join('\n');
}

function reorderMessage(c, os, mv) {
  var left = Math.max(0, os.cycle - os.daysSince);
  var lines = [];
  lines.push('Dear ' + c.name + ',');
  lines.push('');
  lines.push('Last time, on ' + dmy(os.last.date) + ', you took ' + fmt(os.last.qty, 0) + ' ' + unitOf() + ' of ' + itemOf(os.pid) + '. ' +
    (left > 0 ? 'By our estimate, you should have about ' + left + ' days of stock left.' : 'By our estimate, your stock should be nearly finished.'));
  if (mv && mv.q.ask) {
    lines.push('Today\'s rate is ' + rs(mv.q.ask) + ' per ' + unitOf() + ' (' + mv.q.st.days + '-day payment)' +
      (os.lastRate ? ', compared with ' + rs(os.lastRate) + ' last time.' : '.'));
  }
  lines.push('Shall I dispatch this week? Please let me know the quantity.');
  lines.push('');
  lines.push('Regards,');
  lines.push(sign());
  return lines.join('\n');
}

function rateMoveMessage(c, mv) {
  var u = unitOf();
  var lines = ['Dear ' + c.name + ',', ''];
  if (mv.type === 'drop') {
    lines.push('The market rate of ' + itemOf(mv.q.pid) + ' has come down, so we are passing the benefit on to you: ' + rs(mv.q.ask) +
      ' per ' + u + ' (' + mv.q.st.days + '-day payment), compared with ' + rs(mv.os.lastRate) + ' last time.');
    lines.push('This rate applies to orders placed in the next 3 days. Please share the quantity and we will dispatch.');
  } else {
    lines.push('The market rate of ' + itemOf(mv.q.pid) + ' is rising. It is currently ' + rs(mv.q.ask) + ' per ' + u +
      ' (' + mv.q.st.days + '-day payment); it may go higher from here.');
    lines.push('If you confirm this week\'s order today, the rate is fixed at today\'s price.');
  }
  lines.push('');
  lines.push('Regards,');
  lines.push(sign());
  return lines.join('\n');
}

function lockMessage(c, cand, plan) {
  var u = unitOf();
  var band = num(S.lock.band) || 3;
  var lines = ['Dear ' + c.name + ',', ''];
  lines.push('The market rate of ' + itemOf(cand.pid) + ' is currently about ' + fmt(Math.abs(cand.pct), 0) + '% lower than in recent months.');
  lines.push('You take about ' + fmt(cand.monthlyQty, 0) + ' ' + u + ' every month. ' +
    'If you lock the rate for ' + plan.months + ' months now, it would be ' + rs(cand.lock) + ' per ' + u +
    ' (normal rate ' + rs(cand.normal) + ').');
  lines.push('Delivery as per your schedule, payment in ' + cand.st.days + ' days.');
  lines.push('If the market moves more than ' + band + '% lower, we can both review the rate again.');
  lines.push('');
  lines.push('Regards,');
  lines.push(sign());
  return lines.join('\n');
}

function churnMessage(c, cr) {
  var os = cr.os;
  var lines = ['Dear ' + c.name + ',', ''];
  if (os.cycle && os.daysSince >= os.cycle * 1.5) {
    lines.push('It has been a while since your last order (' + os.daysSince + ' days). I hope all is well.');
  } else {
    lines.push('How is business going? We have not spoken for a few days.');
  }
  lines.push('If there is any concern with rate, quality or delivery, please tell me directly and we will address it.');
  lines.push('Shall we set aside stock for you this week?');
  lines.push('');
  lines.push('Regards,');
  lines.push(sign());
  return lines.join('\n');
}

function delayMessage(c, o) {
  var late = Math.max(1, daysBetween(o.promised, todayISO()));
  return 'Dear ' + c.name + ',\n\nDelivery of your order dated ' + dmy(o.date) + ' (' + fmt(o.qty, 0) + ' ' + unitOf() + ') is ' +
    late + ' days late, and we regret this. New delivery time: ______ (fill in before sending).\n' +
    'We are informing you in advance so that your production is not affected.\n\nRegards,\n' + sign();
}

function statementMessage(c, v) {
  var lines = ['Dear ' + c.name + ',', '', 'Summary of the last ' + v.days + ' days (with us):'];
  lines.push('• ' + v.orders + ' orders, total ' + money(v.total));
  if (v.onTimePct !== null) {
    lines.push('• On-time delivery: ' + fmt(v.onTimePct, 0) + '% (' + v.onTime + '/' + v.delivered + ' orders)');
  }
  if (v.delivered) {
    lines.push('• Rejection: ' + fmt(v.rejPct) + '%' +
      (v.rejOrders ? ' — ' + v.replaced + '/' + v.rejOrders + ' replaced' : ''));
  }
  if (v.bills) {
    lines.push('• Credit: you received an average of ' + fmt(v.avgCreditDays, 0) + ' days of credit, worth about ' +
      money(v.creditValue) + ' in interest savings.');
  }
  lines.push('');
  lines.push('Please let us know if you need anything. Regards,');
  lines.push(sign());
  return lines.join('\n');
}

function lockDraft(c, q) {
  var L = S.lock;
  var months = num(L.months) || 3;
  var qty = L.qty || (q ? fmt(q.qty, 0) : '______');
  var rate = (q && q.ask) ? rs(q.ask) : '______';
  var band = num(L.band) || 3;
  var lines = [];
  lines.push('RATE AND SUPPLY AGREEMENT (draft)');
  lines.push('Parties: ' + (sign() || '______') + ' and ' + (c ? c.name : '____________'));
  lines.push('Goods: ' + (itemOf(q ? q.pid : '') || '______') + ' (' + unitOf() + ')');
  lines.push('Quantity: ' + qty + ' ' + unitOf() + ' per month, for ' + months + ' months. Tolerance ±5%.');
  lines.push('Rate: ' + rate + ' per ' + unitOf() + ' (GST extra), fixed for ' + months + ' months.');
  lines.push('Reference rate: ' + (L.ref || '______ (printed or widely accepted market rate, acceptable to both parties)') + '.');
  lines.push('Review: if the reference rate moves more than ' + band + '% above or below the fixed rate, both parties will discuss it on 7 days\' notice.');
  lines.push('Payment: ' + (q ? q.st.days : 'N') + ' days from invoice date.');
  lines.push('Rejection: written claim within 7 days with a test report; replacement ' + 'at our cost.');
  lines.push('Delivery: schedule fixed in advance; the customer will be informed in advance of any delay.');
  lines.push('Signature: ____________   ____________');
  return lines.join('\n');
}

/* ---------- today's jobs (agent list) ---------- */

function snoozed(key) {
  var u = S.snooze[key];
  return !!u && todayISO() < u;
}

function jobs() {
  var out = [];
  var t = todayISO();
  var plan = lockPlan();

  S.customers.forEach(function (c) {
    var os = orderStats(c.id);
    var cr = churnRisk(c);
    var key;

    os.os.forEach(function (o) {
      if (!o.delivered && o.promised && o.promised < t) {
        key = 'delay|' + o.id;
        if (snoozed(key)) { return; }
        var late = daysBetween(o.promised, t);
        out.push({
          key: key, kind: 'delay', cid: c.id, name: c.name, pr: 85, snoozeDays: 1,
          title: 'Delivery ' + late + ' days late',
          why: 'The order dated ' + dmy(o.date) + ' (' + fmt(o.qty, 0) + ' ' + unitOf() + ') has not been delivered yet. Inform the customer yourself before they ask.',
          msg: delayMessage(c, o)
        });
      }
    });

    if (cr.level) {
      key = 'churn|' + c.id;
      if (!snoozed(key)) {
        out.push({
          key: key, kind: 'churn', cid: c.id, name: c.name, pr: cr.level === 'high' ? 90 : 60, snoozeDays: 7,
          title: cr.level === 'high' ? 'Loss alert: HIGH risk' : 'Loss alert: MEDIUM risk',
          why: cr.reasons.join(' ') + (cr.valueAtRisk ? ' About ' + money(cr.valueAtRisk) + ' of monthly business is at stake.' : ''),
          msg: churnMessage(c, cr), call: true
        });
      }
    }

    var over = custDue(c).filter(function (b) { return b.overdueDays > 0; });
    if (over.length) {
      key = 'remind|' + c.id;
      if (!snoozed(key)) {
        var amt = sum(over.map(function (b) { return b.amount; }));
        var maxLate = Math.max.apply(null, over.map(function (b) { return b.overdueDays; }));
        out.push({
          key: key, kind: 'remind', cid: c.id, name: c.name, pr: maxLate > 30 ? 65 : 45, snoozeDays: 3,
          title: 'Payment ' + money(amt) + ' overdue (' + maxLate + ' days)',
          why: 'Tone chosen according to customer grade: ' + gradeLabel(custStanding(c).grade) + '.',
          msg: reminderMessage(c, toneFor(c))
        });
      }
    }

    var mv = rateMove(c);
    var inWindow = os.cycle && os.n >= 2 && os.daysSince >= os.cycle - 3 && os.daysSince <= os.cycle * 1.5;
    var hasPending = os.os.some(function (o) { return !o.delivered; });
    if (inWindow && !hasPending && !(cr.level === 'high')) {
      key = 'reorder|' + c.id;
      if (!snoozed(key)) {
        var left = os.cycle - os.daysSince;
        out.push({
          key: key, kind: 'reorder', cid: c.id, name: c.name, pr: 55, snoozeDays: 4,
          title: left > 0 ? 'Reorder due soon (' + left + ' days)' : 'Reorder overdue (' + (-left) + ' days)',
          why: 'Usually orders ' + fmt(os.avgQty, 0) + ' ' + unitOf() + ' every ' + os.cycle + ' days; last order was ' + os.daysSince + ' days ago.' +
            (mv && mv.type ? ' The rate has also ' + (mv.type === 'drop' ? 'dropped' : 'risen') + ' (' + fmt(Math.abs(mv.delta)) + '%).' : ''),
          msg: reorderMessage(c, os, mv)
        });
      }
    } else if (mv && mv.type && os.daysSince >= 7 && !hasPending) {
      key = 'rate|' + c.id;
      if (!snoozed(key)) {
        out.push({
          key: key, kind: 'rate', cid: c.id, name: c.name, pr: mv.type === 'rise' ? 50 : 35, snoozeDays: 3,
          title: mv.type === 'drop' ? 'Rate dropped: ' + fmt(Math.abs(mv.delta)) + '% lower' : 'Rate rising: ' + fmt(mv.delta) + '% higher',
          why: 'Last rate ' + rs(mv.os.lastRate) + '; at today\'s cost it is ' + rs(mv.q.ask) + '. ' +
            (mv.type === 'drop' ? 'Tell the customer first — it builds trust.' : 'A chance to get confirmation today.'),
          msg: rateMoveMessage(c, mv)
        });
      }
    }
  });

  if (plan) {
    plan.cands.forEach(function (cd) {
      var key = 'lock|' + cd.c.id;
      if (snoozed(key)) { return; }
      out.push({
        key: key, kind: 'lock', cid: cd.c.id, name: cd.c.name, pr: 30, snoozeDays: 7,
        title: 'Price lock offer (' + itemOf(cd.pid) + ': cost ' + fmt(Math.abs(cd.pct), 0) + '% lower)',
        why: plan.months + ' months of ~' + fmt(cd.monthlyQty * plan.months, 0) + ' ' + unitOf() + ' = about ' + money(cd.stockCost) +
          ' of stock to buy at today\'s cheaper cost. Lock ' + rs(cd.lock) + ' vs normal ' + rs(cd.normal) + '.',
        msg: lockMessage(cd.c, cd, plan)
      });
    });
  }

  out.sort(function (a, b) { return b.pr - a.pr; });
  return out;
}

/* ---------- business health ---------- */

/* Supplier-rate summary for each material (or the single item) */
function matStats() {
  var names = materialNames();
  if (S.products.length && names.length) {
    return names.map(function (n) { return { name: n, st: quoteStats(n) }; });
  }
  return [{ name: S.settings.item || 'goods', st: quoteStats() }];
}

function gaps() {
  var out = [];
  var t = todayISO();
  var p = paymentStats();
  var s = S.settings;
  var ms = matStats();

  if (!S.quotes.length) {
    out.push({ level: 'high', title: 'No record of supplier / raw material rates',
      why: 'Without a record, the selling floor price cannot be calculated.', action: 'In the Rate tab, enter rates from 2-3 raw material suppliers.' });
  }
  ms.forEach(function (m) {
    var st = m.st;
    if (!st.count) { return; }
    if (st.staleDays > 15) {
      out.push({ level: 'high', title: m.name + ': rate is ' + st.staleDays + ' days old',
        why: 'Quotes based on an old cost quietly lose margin.', action: 'Send the Rate tab message to 2-3 parties.' });
    }
    if (st.count >= 3 && st.spread >= 4) {
      out.push({ level: 'mid', title: m.name + ': ' + fmt(st.spread) + '% difference between suppliers',
        why: 'Cheapest ' + rs(st.best.rate) + ' (' + st.best.supplier + '), costliest ' + rs(st.worst.rate) + ' (' + st.worst.supplier + ').',
        action: 'Ask the costlier supplier to match the cheaper rate, or give the order to the cheaper one.' });
    }
    if (st.best && st.bestEff && st.best.id !== st.bestEff.id) {
      out.push({ level: 'mid', title: m.name + ': the lowest rate is not actually the cheapest',
        why: 'The ' + rs(st.best.rate) + ' quote has a true cost of ' + rs(effQuote(st.best).effective) + ', while ' + st.bestEff.supplier + '\'s is ' + rs(st.bestEffV) +
          ' (after freight, rejection and credit).',
        action: 'Decide using the "True cost" column.' });
    }
    var recent = uniq(S.quotes.filter(function (q) {
      return normName(q.item) === normName(m.name) && daysBetween(q.date, t) <= 60;
    }).map(function (q) { return q.supplier; })).filter(Boolean);
    if (recent.length === 1) {
      out.push({ level: 'mid', title: m.name + ': depends on only one supplier',
        why: 'If that supplier\'s rate rises or supply stops, your production stops.', action: 'Approve one more supplier.' });
    }
  });

  S.products.forEach(function (pr) {
    var cn = costOf(pr);
    if (pr.bom.length && cn.missing.length) {
      out.push({ level: 'mid', title: pr.name + ': cost cannot be calculated',
        why: 'Rates are missing for these raw materials: ' + cn.missing.join(', ') + '.', action: 'Enter their supplier rates in the Rate tab.' });
    }
  });

  var ccc = num(s.stockDays) + num(s.creditGiven) - num(s.creditReceived);
  if (ccc >= 60) {
    out.push({ level: 'mid', title: 'Cash conversion cycle ' + Math.round(ccc) + ' days',
      why: 'Stock ' + num(s.stockDays) + ' + customer credit ' + num(s.creditGiven) + ' − supplier credit ' + num(s.creditReceived) + ' days.',
      action: 'One day of sales equals ' + money(num(s.monthlySales) / 30) + '; aim to cut the cycle by 10 days.' });
  }
  if (p.outstanding > 0 && p.overdue > 0) {
    var share = p.overdue / p.outstanding * 100;
    out.push({ level: share >= 15 ? 'high' : 'mid', title: 'Overdue ' + money(p.overdue) + ' (' + fmt(share) + '% of outstanding)',
      why: 'The oldest bill is ' + p.oldest + ' days overdue.', action: 'Send reminders from the Payment tab today.' });
  }
  if (num(s.creditGiven) > num(s.creditReceived)) {
    out.push({ level: 'mid', title: 'Credit gap: ' + num(s.creditGiven) + ' days vs ' + num(s.creditReceived) + ' days',
      why: 'This ' + (num(s.creditGiven) - num(s.creditReceived)) + '-day gap is eating into your working capital.',
      action: 'Get longer credit from suppliers; look at TReDS (Cash tab).' });
  }
  var cc = concentration();
  if (cc.top && cc.total > 0) {
    if (cc.top.pct >= 50) {
      out.push({ level: cc.top.pct >= 70 ? 'high' : 'mid', title: 'Too dependent on one customer: ' + cc.top.c.name,
        why: fmt(cc.top.pct, 0) + '% (' + money(cc.top.value) + ') of the last 90 days\' sales came from this one customer alone. Active customers: ' + cc.active + '.',
        action: 'Losing this customer would mean losing more than half your sales. Adding new customers and securing this one with a price lock are the top priorities.' });
    } else if (cc.active <= 3) {
      out.push({ level: 'mid', title: 'Only ' + cc.active + ' active customers',
        why: 'Losing even one customer would cut out a large share of sales.', action: 'Look for new customers and work on price locks.' });
    }
  }
  return out;
}

function gapsSorted() {
  var rank = { high: 0, mid: 1, ok: 2 };
  return gaps().sort(function (a, b) { return rank[a.level] - rank[b.level]; });
}

function reportText() {
  var g = gapsSorted();
  var p = paymentStats();
  var w = wcCalc();
  var s = S.settings;
  var lines = [];
  lines.push('BUSINESS REPORT — ' + dmy(todayISO()));
  lines.push('Business: ' + (s.business || '-') + ' | Item: ' + (s.item || '-'));
  lines.push('Sales/month: ' + money(s.monthlySales) + ' | Purchases: ' + money(s.monthlyPurchase) + ' | Expenses: ' + money(s.monthlyExpenses));
  lines.push('Credit to customers: ' + num(s.creditGiven) + ' days | From suppliers: ' + num(s.creditReceived) + ' days');
  lines.push('');
  lines.push('CASH');
  lines.push('Receivables: ' + money(w.recv) + ' | Stock: ' + money(w.inv) + ' | Payables: ' + money(w.pay));
  lines.push('Working capital needed: ' + money(w.total) + ' (with ' + num(s.cashMonths || 3) + '-month buffer)');
  lines.push('');
  lines.push('PAYMENT');
  lines.push('Total outstanding: ' + money(p.outstanding) + ' | Overdue: ' + money(p.overdue) + ' | Oldest: ' + p.oldest + ' days');
  lines.push('');
  lines.push('WHAT TO FIX');
  if (!g.length) { lines.push('No major gaps found at the moment.'); }
  g.forEach(function (x, i) {
    lines.push((i + 1) + '. [' + x.level.toUpperCase() + '] ' + x.title);
    lines.push('   Why: ' + x.why);
    lines.push('   Action: ' + x.action);
  });
  return lines.join('\n');
}

function waLink(phone, text) {
  var d = String(phone || '').replace(/\D/g, '');
  if (d.length < 10) { return 'https://wa.me/?text=' + encodeURIComponent(text); }
  var n = (d.length === 10) ? ('91' + d) : d;
  return 'https://wa.me/' + n + '?text=' + encodeURIComponent(text);
}
