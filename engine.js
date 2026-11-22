'use strict';

/* =========================================================
   Vyapar Saathi v2 — engine: chhe kaam
   1 Rate ladder   2 Customer floor   3 Reorder / rate messages
   4 Bluff tracker 5 Churn alarm      6 Monthly value statement
   ========================================================= */

/* ---------- 1 & 2: rate ladder aur floor ---------- */

/* Margin = bechne ke rate ka %, paise ki lagat aur risk nikalne ke baad.
   rate = (lagat + overhead + delivery kharcha/qty) / (1 - byaaj - risk - margin) */
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
  /* zero = bilkul bina munafe ka rate (sirf lagat + byaaj + risk). Isse neeche bechna seedha ghata hai. */
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

/* ---------- 4: bluff tracker ---------- */

/* Customer ne kisi aur ka rate bataya: usi terms par laa kar sach-fark nikalo */
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
  if (n < 3) { verdict = 'Abhi data kam (' + n + '/3 claim) — har baar outcome likhte rahein.'; level = 'none'; }
  else if (pct >= 70) { verdict = 'Aksar dabaav: ' + fmt(pct, 0) + '% baar claim ke baad bhi order diya. Rate na girayein; ladder aur terms dikhayein.'; level = 'bluff'; }
  else if (pct <= 40) { verdict = 'Sachcha khatra: sirf ' + fmt(pct, 0) + '% baar order mila. Floor tak jaakar bachayein ya naya faayda dein.'; level = 'real'; }
  else { verdict = 'Mixed (' + fmt(pct, 0) + '% order mila). Har claim par terms barabar karke dekhein.'; level = 'mixed'; }
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

/* ---------- 5: churn alarm ---------- */

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
      reasons.push('Aakhri order ko ' + os.daysSince + ' din ho gaye; aam taur par har ' + os.cycle + ' din me aata tha (' + fmt(ratio) + ' guna gap).');
    } else if (ratio >= 1.5) {
      score += 2;
      reasons.push('Aakhri order ko ' + os.daysSince + ' din ho gaye; aam taur par har ' + os.cycle + ' din me aata tha.');
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
        reasons.push('Quantity gir gayi: pehle ~' + fmt(before, 0) + ', ab ~' + fmt(recent2, 0) + ' (' + fmt((1 - r) * 100, 0) + '% kam).');
      } else if (r < 0.85) {
        score += 1;
        reasons.push('Quantity thodi kam ho rahi hai: ~' + fmt(before, 0) + ' se ~' + fmt(recent2, 0) + '.');
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
      reasons.push('Payment dheema ho gaya: pehle ~' + fmt(old, 0) + ' din, ab ~' + fmt(rec, 0) + ' din.');
    }
  }
  if (st.oldestAge > st.terms + 30) {
    score += 1;
    reasons.push('Ek bill terms se 30+ din late hai.');
  }
  var lost = S.claims.filter(function (x) {
    return x.customerId === c.id && x.outcome === 'lost' && daysBetween(x.date, t) <= 60;
  }).length;
  if (lost) {
    score += 2;
    reasons.push('Pichhle 60 din me ' + lost + ' baar doosre ke paas gaya.');
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
  if (out.onTimePct !== null && out.onTimePct < 85) { warn.push('Time par delivery sirf ' + fmt(out.onTimePct, 0) + '% hai'); }
  if (out.rejPct > 2) { warn.push('Rejection ' + fmt(out.rejPct) + '% hai'); }
  if (out.rejOrders > out.replaced) { warn.push((out.rejOrders - out.replaced) + ' rejection ka replacement baaki'); }
  out.warn = warn;
  out.sendable = out.orders > 0 && warn.length === 0;
  return out;
}

/* ---------- 3: rate move aur lock ---------- */

function rateMove(c) {
  var os = orderStats(c.id);
  if (!os.last || !os.lastRate) { return null; }
  var q = quoteFor(c, os.avgQty, os.pid);
  if (!q.ask) { return null; }
  var delta = (q.ask - os.lastRate) / os.lastRate * 100;
  return { q: q, os: os, delta: delta, type: delta <= -1.5 ? 'drop' : (delta >= 1.5 ? 'rise' : '') };
}

/* Bazaar dheela ho to regular customers ko 3 mahine ka rate lock offer */
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

/* ---------- buyer par nirbhartaa aur plant capacity ---------- */

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

/* Pichhle 30 din ke orders / plant ki mahine ki capacity */
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
function itemOf(pid) { return productName(pid) || S.settings.item || 'maal'; }

function rfqMessage() {
  var pay = num(S.settings.creditReceived) > 0 ? num(S.settings.creditReceived) + ' din credit' : 'turant / cash';
  var lines = [];
  lines.push('Namaste ji,');
  lines.push('');
  lines.push((S.rfq.material || itemOf()) + ' ka rate bhej dein:');
  lines.push('1. Quantity: ' + (S.rfq.qty || '____') + ' ' + unitOf());
  lines.push('2. Delivery: ' + (num(S.rfq.days) || 3) + ' din me');
  lines.push('3. Payment: ' + pay + ' (ya aap apni terms bata dein)');
  lines.push('4. Rate ke saath GST, freight aur packing clear likhein');
  if (S.rfq.note) { lines.push('5. Note: ' + S.rfq.note); }
  lines.push('');
  lines.push('Aaj shaam tak rate aur availability bata dein, order confirm karna hai.');
  lines.push('');
  lines.push('Dhanyavaad,');
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
    return 'Namaste ' + c.name + ' ji,\n\nAapka koi payment pending nahi hai. Samay par payment ke liye dhanyavaad.\n\n' + biz;
  }
  var lines = due.map(function (b, i) {
    return (i + 1) + '. ' + dmy(b.date) + ' ka bill ' + money(b.amount) + ' — due ' + dmy(b.due) +
      (b.overdueDays > 0 ? ' (' + b.overdueDays + ' din ho gaye)' : '');
  });
  var total = due.reduce(function (x, b) { return x + num(b.amount); }, 0);
  var over = due.filter(function (b) { return b.overdueDays > 0; });
  var overAmt = over.reduce(function (x, b) { return x + num(b.amount); }, 0);
  var maxLate = over.reduce(function (m, b) { return Math.max(m, b.overdueDays); }, 0);

  if (tone === 'soft') {
    return 'Namaste ' + c.name + ' ji,\n\nUmeed hai sab theek hai. Aapke account ka hisaab:\n\n' + lines.join('\n') +
      '\n\nTotal pending: ' + money(total) + '\n\nPayment ki koi date bata dein taake main account update kar lu. ' +
      'Koi dikkat ho to bata dein, hum saath milkar dekh lenge.\n\nDhanyavaad,\n' + biz;
  }
  if (tone === 'firm') {
    var head = over.length
      ? 'Aapke account me ' + money(total) + ' pending hai, jisme ' + money(overAmt) + ' due date ke baad ka hai (' + maxLate + ' din tak).'
      : 'Aapke account me ' + money(total) + ' pending hai.';
    var ask = over.length
      ? 'Kripya 3 din ke andar payment clear karein, ya nayi date likhit me confirm karein. Pichhla baaki clear hone tak agla order hold par rahega.'
      : 'Kripya payment ki date confirm kar dein taake agla order time par dispatch ho sake.';
    return c.name + ' ji,\n\n' + head + '\n\n' + lines.join('\n') + '\n\n' + ask + '\n\nDhanyavaad,\n' + biz;
  }
  return 'Namaste ' + c.name + ' ji,\n\n' + dmy(todayISO()) + ' tak ka hisaab:\n\n' + lines.join('\n') +
    '\n\nTotal pending: ' + money(total) + '\n\nKripya payment ki date confirm kar dein. ' +
    'Payment aate hi agla maal dispatch kar denge.\n\nDhanyavaad,\n' + biz;
}

function ladderMessage(c, q) {
  var lines = q.ladder.map(function (r) {
    return r.d + ' din payment par: ' + rs(r.price) + ' per ' + unitOf();
  });
  return 'Namaste ' + c.name + ' ji,\n\n' + itemOf(q.pid) + ' ka rate (GST alag) aapki payment ke hisaab se:\n\n' +
    lines.join('\n') + '\n\nJis din me payment karenge, wahi rate lagu hoga. ' +
    'Aap abhi aam taur par ' + q.st.days + ' din me dete hain (' + rs(q.ask) + ').\n\nDhanyavaad,\n' + sign();
}

function claimReply(c, a) {
  var u = unitOf();
  var lines = [];
  lines.push('Namaste ' + c.name + ' ji,');
  lines.push('');
  if (a.realCheaper) {
    lines.push('Tulna ek hi payment terms par karein: unka ' + rs(a.claimed) + ' ' + a.td + ' din payment par hai, ' +
      'to hamare ' + a.qd + ' din ki terms par wo lagbhag ' + rs(a.claimedAtOurs) + ' padta hai. ' +
      'Hamara rate ' + rs(a.q.ask) + ' hai (' + a.qd + ' din).');
    lines.push('');
    if (a.counter < a.q.ask - 0.005) {
      lines.push('Aapke liye best rate: ' + rs(a.counter) + ' per ' + u + ' (' + a.qd + ' din payment). ' +
        'Delivery aur quality ki guarantee isi me.');
    } else {
      lines.push('Aapke liye rate ' + rs(a.q.ask) + ' per ' + u + ' (' + a.qd + ' din payment).');
    }
  } else {
    lines.push('Tulna ek hi payment terms par karein: unka ' + rs(a.claimed) + ' ' + a.td + ' din par hai, ' +
      'hamara rate ' + a.td + ' din par ' + rs(a.oursAtTheir) + ' padta hai — yaani fark nahi ke barabar. ' +
      'Upar se delivery aur quality ki guarantee hamari taraf se.');
  }
  lines.push('');
  lines.push('Dhanyavaad,');
  lines.push(sign());
  return lines.join('\n');
}

function reorderMessage(c, os, mv) {
  var left = Math.max(0, os.cycle - os.daysSince);
  var lines = [];
  lines.push('Namaste ' + c.name + ' ji,');
  lines.push('');
  lines.push('Pichhli baar ' + dmy(os.last.date) + ' ko ' + fmt(os.last.qty, 0) + ' ' + unitOf() + ' ' + itemOf(os.pid) + ' liya tha. ' +
    (left > 0 ? 'Hisaab se ab ' + left + ' din ka stock bacha hoga.' : 'Hisaab se stock lagbhag khatam hona chahiye.'));
  if (mv && mv.q.ask) {
    lines.push('Aaj ka rate ' + rs(mv.q.ask) + ' per ' + unitOf() + ' (' + mv.q.st.days + ' din payment)' +
      (os.lastRate ? ', pichhli baar ' + rs(os.lastRate) + ' tha.' : '.'));
  }
  lines.push('Is hafte bhej doon? Quantity bata dein.');
  lines.push('');
  lines.push('Dhanyavaad,');
  lines.push(sign());
  return lines.join('\n');
}

function rateMoveMessage(c, mv) {
  var u = unitOf();
  var lines = ['Namaste ' + c.name + ' ji,', ''];
  if (mv.type === 'drop') {
    lines.push('Bazaar me ' + itemOf(mv.q.pid) + ' ka rate neeche aaya hai, isliye aapke liye bhi: ' + rs(mv.q.ask) +
      ' per ' + u + ' (' + mv.q.st.days + ' din payment), pichhli baar ' + rs(mv.os.lastRate) + ' tha.');
    lines.push('Agle 3 din ke order par ye rate lagu. Quantity bata dein, bhej dete hain.');
  } else {
    lines.push('Bazaar me ' + itemOf(mv.q.pid) + ' ka rate chadh raha hai. Abhi ' + rs(mv.q.ask) + ' per ' + u +
      ' (' + mv.q.st.days + ' din payment) par hai; aage isse upar jaane ka andesha hai.');
    lines.push('Is hafte ka order aaj confirm kar dein to aaj ke rate par pakka.');
  }
  lines.push('');
  lines.push('Dhanyavaad,');
  lines.push(sign());
  return lines.join('\n');
}

function lockMessage(c, cand, plan) {
  var u = unitOf();
  var band = num(S.lock.band) || 3;
  var lines = ['Namaste ' + c.name + ' ji,', ''];
  lines.push('Abhi bazaar me ' + itemOf(cand.pid) + ' ka rate pichhle mahino se lagbhag ' + fmt(Math.abs(cand.pct), 0) + '% neeche hai.');
  lines.push('Aap har mahine lagbhag ' + fmt(cand.monthlyQty, 0) + ' ' + u + ' lete hain. ' +
    'Agar ' + plan.months + ' mahine ka rate abhi lock kar lein to ' + rs(cand.lock) + ' per ' + u +
    ' (normal rate ' + rs(cand.normal) + ').');
  lines.push('Delivery aapke schedule se, payment ' + cand.st.days + ' din me.');
  lines.push('Agar bazaar ' + band + '% se zyada neeche chala gaya to dono taraf baat dobara kar lenge.');
  lines.push('');
  lines.push('Dhanyavaad,');
  lines.push(sign());
  return lines.join('\n');
}

function churnMessage(c, cr) {
  var os = cr.os;
  var lines = ['Namaste ' + c.name + ' ji,', ''];
  if (os.cycle && os.daysSince >= os.cycle * 1.5) {
    lines.push('Kaafi din ho gaye, aapka order nahi aaya (' + os.daysSince + ' din). Sab theek hai na?');
  } else {
    lines.push('Kaisa chal raha hai kaam? Kuch din se aapse baat nahi hui.');
  }
  lines.push('Rate, quality ya delivery me koi dikkat ho to seedha bata dein, hum dekh lete hain.');
  lines.push('Is hafte ke liye maal alag rakh dein?');
  lines.push('');
  lines.push('Dhanyavaad,');
  lines.push(sign());
  return lines.join('\n');
}

function delayMessage(c, o) {
  var late = Math.max(1, daysBetween(o.promised, todayISO()));
  return 'Namaste ' + c.name + ' ji,\n\n' + dmy(o.date) + ' ke order (' + fmt(o.qty, 0) + ' ' + unitOf() + ') ki delivery ' +
    late + ' din late ho gayi hai, iska khed hai. Naya delivery time: ______ (bhejne se pehle bharein).\n' +
    'Aapki line ruke nahi, isliye pehle se bata rahe hain.\n\nDhanyavaad,\n' + sign();
}

function statementMessage(c, v) {
  var lines = ['Namaste ' + c.name + ' ji,', '', 'Pichhle ' + v.days + ' din ka hisaab (humare saath):'];
  lines.push('• ' + v.orders + ' order, kul ' + money(v.total));
  if (v.onTimePct !== null) {
    lines.push('• Time par delivery: ' + fmt(v.onTimePct, 0) + '% (' + v.onTime + '/' + v.delivered + ' order)');
  }
  if (v.delivered) {
    lines.push('• Rejection: ' + fmt(v.rejPct) + '%' +
      (v.rejOrders ? ' — ' + v.replaced + '/' + v.rejOrders + ' ka replacement diya' : ''));
  }
  if (v.bills) {
    lines.push('• Credit: aapko average ' + fmt(v.avgCreditDays, 0) + ' din ka credit mila, jo byaaj ke hisaab se lagbhag ' +
      money(v.creditValue) + ' ka faayda hai.');
  }
  lines.push('');
  lines.push('Koi baat ho to bataiye. Dhanyavaad,');
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
  lines.push('RATE AUR SUPPLY KI SAHMATI (draft)');
  lines.push('Parties: ' + (sign() || '______') + ' aur ' + (c ? c.name : '____________'));
  lines.push('Maal: ' + (itemOf(q ? q.pid : '') || '______') + ' (' + unitOf() + ')');
  lines.push('Quantity: ' + qty + ' ' + unitOf() + ' per mahina, ' + months + ' mahine. Tolerance ±5%.');
  lines.push('Rate: ' + rate + ' per ' + unitOf() + ' (GST alag), ' + months + ' mahine ke liye tay.');
  lines.push('Reference rate: ' + (L.ref || '______ (dono ko manya, chhapa ya sarvmanya bazaar rate)') + '.');
  lines.push('Review: reference rate tay rate se ' + band + '% se zyada upar ya neeche jaaye to 7 din ke notice par dono taraf baat.');
  lines.push('Payment: invoice date se ' + (q ? q.st.days : 'N') + ' din.');
  lines.push('Rejection: test report ke saath 7 din me likhit claim; replacement ' + 'hamari taraf se.');
  lines.push('Delivery: schedule pehle se tay; delivery late hone par customer ko pehle suchna.');
  lines.push('Dastkhat: ____________   ____________');
  return lines.join('\n');
}

/* ---------- aaj ka kaam (agent ki list) ---------- */

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
          title: 'Delivery ' + late + ' din late',
          why: dmy(o.date) + ' ka order (' + fmt(o.qty, 0) + ' ' + unitOf() + ') abhi tak deliver nahi hua. Customer poochne se pehle khud bata dein.',
          msg: delayMessage(c, o)
        });
      }
    });

    if (cr.level) {
      key = 'churn|' + c.id;
      if (!snoozed(key)) {
        out.push({
          key: key, kind: 'churn', cid: c.id, name: c.name, pr: cr.level === 'high' ? 90 : 60, snoozeDays: 7,
          title: cr.level === 'high' ? 'Customer jaane ka khatra: ZYADA' : 'Customer jaane ka khatra: thoda',
          why: cr.reasons.join(' ') + (cr.valueAtRisk ? ' Mahine ka lagbhag ' + money(cr.valueAtRisk) + ' ka kaam daav par.' : ''),
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
          title: 'Payment ' + money(amt) + ' late (' + maxLate + ' din)',
          why: 'Tone grade ke hisaab se chuna gaya: ' + gradeLabel(custStanding(c).grade) + '.',
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
          title: left > 0 ? 'Order ka time paas hai (' + left + ' din)' : 'Order ka time nikal gaya (' + (-left) + ' din)',
          why: 'Aam taur par har ' + os.cycle + ' din me ' + fmt(os.avgQty, 0) + ' ' + unitOf() + ' leta hai; aakhri order ' + os.daysSince + ' din pehle.' +
            (mv && mv.type ? ' Rate bhi ' + (mv.type === 'drop' ? 'gira' : 'chadha') + ' hai (' + fmt(Math.abs(mv.delta)) + '%).' : ''),
          msg: reorderMessage(c, os, mv)
        });
      }
    } else if (mv && mv.type && os.daysSince >= 7 && !hasPending) {
      key = 'rate|' + c.id;
      if (!snoozed(key)) {
        out.push({
          key: key, kind: 'rate', cid: c.id, name: c.name, pr: mv.type === 'rise' ? 50 : 35, snoozeDays: 3,
          title: mv.type === 'drop' ? 'Rate gira: ' + fmt(Math.abs(mv.delta)) + '% neeche' : 'Rate chadh raha: ' + fmt(mv.delta) + '% upar',
          why: 'Pichhla rate ' + rs(mv.os.lastRate) + ', aaj ki lagat se ' + rs(mv.q.ask) + '. ' +
            (mv.type === 'drop' ? 'Pehle khud bata dein — bharosa banta hai.' : 'Aaj confirm karwane ka mauka.'),
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
        title: 'Rate lock offer (' + itemOf(cd.pid) + ': lagat ' + fmt(Math.abs(cd.pct), 0) + '% neeche)',
        why: plan.months + ' mahine ka ~' + fmt(cd.monthlyQty * plan.months, 0) + ' ' + unitOf() + ' = lagbhag ' + money(cd.stockCost) +
          ' ka stock sasta kharidna padega. Lock ' + rs(cd.lock) + ' vs normal ' + rs(cd.normal) + '.',
        msg: lockMessage(cd.c, cd, plan)
      });
    });
  }

  out.sort(function (a, b) { return b.pr - a.pr; });
  return out;
}

/* ---------- business ki sehat ---------- */

/* Har material (ya single item) ke supplier-rate ka hisaab */
function matStats() {
  var names = materialNames();
  if (S.products.length && names.length) {
    return names.map(function (n) { return { name: n, st: quoteStats(n) }; });
  }
  return [{ name: S.settings.item || 'maal', st: quoteStats() }];
}

function gaps() {
  var out = [];
  var t = todayISO();
  var p = paymentStats();
  var s = S.settings;
  var ms = matStats();

  if (!S.quotes.length) {
    out.push({ level: 'high', title: 'Supplier / raw material ka koi rate record nahi',
      why: 'Bina record ke bechne ka rate (floor) nahi nikal sakta.', action: 'Rate tab me raw material ke 2-3 suppliers ke rate daalein.' });
  }
  ms.forEach(function (m) {
    var st = m.st;
    if (!st.count) { return; }
    if (st.staleDays > 15) {
      out.push({ level: 'high', title: m.name + ': rate ' + st.staleDays + ' din purana',
        why: 'Purani lagat par bane quote me margin chup-chaap kam ho jata hai.', action: 'Rate tab ka message 2-3 parties ko bhejein.' });
    }
    if (st.count >= 3 && st.spread >= 4) {
      out.push({ level: 'mid', title: m.name + ': suppliers me ' + fmt(st.spread) + '% ka fark',
        why: 'Sasta ' + rs(st.best.rate) + ' (' + st.best.supplier + '), mehnga ' + rs(st.worst.rate) + ' (' + st.worst.supplier + ').',
        action: 'Saste rate par mehnge supplier se match karwayein ya order saste ko dein.' });
    }
    if (st.best && st.bestEff && st.best.id !== st.bestEff.id) {
      out.push({ level: 'mid', title: m.name + ': sabse kam rate wala asli me sasta nahi',
        why: rs(st.best.rate) + ' wale ki asli lagat ' + rs(effQuote(st.best).effective) + ', jabki ' + st.bestEff.supplier + ' ki ' + rs(st.bestEffV) +
          ' (freight, rejection aur credit ke baad).',
        action: 'Faisla "Asli" column par karein.' });
    }
    var recent = uniq(S.quotes.filter(function (q) {
      return normName(q.item) === normName(m.name) && daysBetween(q.date, t) <= 60;
    }).map(function (q) { return q.supplier; })).filter(Boolean);
    if (recent.length === 1) {
      out.push({ level: 'mid', title: m.name + ': sirf ek supplier par nirbhar',
        why: 'Uska rate ya supply rukna matlab aapka production rukna.', action: 'Ek aur supplier approve karein.' });
    }
  });

  S.products.forEach(function (pr) {
    var cn = costOf(pr);
    if (pr.bom.length && cn.missing.length) {
      out.push({ level: 'mid', title: pr.name + ': lagat nahi nikal sakti',
        why: 'In raw material ka rate nahi hai: ' + cn.missing.join(', ') + '.', action: 'Rate tab me inke supplier rate daalein.' });
    }
  });

  var ccc = num(s.stockDays) + num(s.creditGiven) - num(s.creditReceived);
  if (ccc >= 60) {
    out.push({ level: 'mid', title: 'Cash conversion cycle ' + Math.round(ccc) + ' din',
      why: 'Stock ' + num(s.stockDays) + ' + customer credit ' + num(s.creditGiven) + ' − supplier credit ' + num(s.creditReceived) + ' din.',
      action: 'Ek din ' + money(num(s.monthlySales) / 30) + ' ke barabar hai; 10 din kam karna lakshya rakhein.' });
  }
  if (p.outstanding > 0 && p.overdue > 0) {
    var share = p.overdue / p.outstanding * 100;
    out.push({ level: share >= 15 ? 'high' : 'mid', title: 'Overdue ' + money(p.overdue) + ' (' + fmt(share) + '% of baaki)',
      why: 'Sabse purana bill ' + p.oldest + ' din late hai.', action: 'Aaj tab se reminder bhejein.' });
  }
  if (num(s.creditGiven) > num(s.creditReceived)) {
    out.push({ level: 'mid', title: 'Credit ka gap: ' + num(s.creditGiven) + ' din vs ' + num(s.creditReceived) + ' din',
      why: 'Ye ' + (num(s.creditGiven) - num(s.creditReceived)) + ' din ka gap aapka working capital khata hai.',
      action: 'Supplier se credit badhwayein; TReDS dekhein (Paisa tab).' });
  }
  var cc = concentration();
  if (cc.top && cc.total > 0) {
    if (cc.top.pct >= 50) {
      out.push({ level: cc.top.pct >= 70 ? 'high' : 'mid', title: 'Ek buyer par zyada nirbhar: ' + cc.top.c.name,
        why: 'Pichhle 90 din ki bikri ka ' + fmt(cc.top.pct, 0) + '% (' + money(cc.top.value) + ') sirf is ek buyer se. Active buyer: ' + cc.active + '.',
        action: 'Is buyer ko khone ka matlab aadhi se zyada bikri jana. Naye buyer jodna aur isse lock-in karna pehli zaroorat hai.' });
    } else if (cc.active <= 3) {
      out.push({ level: 'mid', title: 'Sirf ' + cc.active + ' active buyer',
        why: 'Ek buyer ka jana bhi bikri ka bada hissa kaat dega.', action: 'Naye buyer ki talaash aur rate lock par kaam karein.' });
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
  lines.push('VYAPAR REPORT — ' + dmy(todayISO()));
  lines.push('Business: ' + (s.business || '-') + ' | Item: ' + (s.item || '-'));
  lines.push('Bikri/mahina: ' + money(s.monthlySales) + ' | Kharid: ' + money(s.monthlyPurchase) + ' | Kharcha: ' + money(s.monthlyExpenses));
  lines.push('Customer ko credit: ' + num(s.creditGiven) + ' din | Supplier se: ' + num(s.creditReceived) + ' din');
  lines.push('');
  lines.push('PAISA');
  lines.push('Customer se lena (receivables): ' + money(w.recv) + ' | Stock: ' + money(w.inv) + ' | Supplier ko dena: ' + money(w.pay));
  lines.push('Working capital chahiye: ' + money(w.total) + ' (' + num(s.cashMonths || 3) + ' mahine buffer ke saath)');
  lines.push('');
  lines.push('PAYMENT');
  lines.push('Total baaki: ' + money(p.outstanding) + ' | Overdue: ' + money(p.overdue) + ' | Sabse purana: ' + p.oldest + ' din');
  lines.push('');
  lines.push('KYA SUDHARNA HAI');
  if (!g.length) { lines.push('Filhaal koi badi kami nahi dikh rahi.'); }
  g.forEach(function (x, i) {
    lines.push((i + 1) + '. [' + x.level.toUpperCase() + '] ' + x.title);
    lines.push('   Kyun: ' + x.why);
    lines.push('   Karein: ' + x.action);
  });
  return lines.join('\n');
}

function waLink(phone, text) {
  var d = String(phone || '').replace(/\D/g, '');
  if (d.length < 10) { return 'https://wa.me/?text=' + encodeURIComponent(text); }
  var n = (d.length === 10) ? ('91' + d) : d;
  return 'https://wa.me/' + n + '?text=' + encodeURIComponent(text);
}
