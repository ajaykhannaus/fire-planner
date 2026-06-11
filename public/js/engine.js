// Pure finance engine. No DOM. Takes a `plan` object, returns numbers.
import { ASSETS, EXP_CATS, INV_CATS, GOALS } from './presets.js?v=DEV';

export const START_AGE = 30;   // default current age when a plan doesn't specify one
export const END_AGE = 100;

// The plan's current age (the simulation's starting age). Falls back to START_AGE.
export const startAge = (plan) => plan.startAge ?? START_AGE;

// How many years (from the current age) the monthly SIP keeps running before it
// stops. Some people invest for, say, 10 years but retire at 15 — contributions
// halt while the corpus keeps compounding. 0 / blank = contribute for the whole
// accumulation phase (until retirement). Always capped at the accumulation horizon.
export function sipYears(plan) {
  const horizon = Math.max(0, plan.retireAge - startAge(plan));
  const n = +plan.sipYears || 0;
  return n > 0 ? Math.min(n, horizon) : horizon;
}
// True while contributions are still being made at the given age.
export const isContributing = (plan, age) => (age - startAge(plan)) < sipYears(plan);

// Global / USD-denominated assets (US / Global Stocks) earn the local-currency
// depreciation on top of their native return: when the home currency weakens vs
// USD by `depr`%/yr, a foreign-currency holding gains that much extra in local terms.
// Local-currency assets (MF, EPF, FD) are unaffected.
const FX_ASSETS = new Set(['us']);

// Mutual-fund buckets that can hold named individual funds. When a bucket has
// funds, its return is the weight-weighted average of its funds' returns (weights
// are relative — normalized by their sum), overriding the bucket's single `ret`.
export const FUND_ASSETS = new Set(['mf', 'mfd', 'mfx']);
export function bucketReturn(plan, id) {
  const al = plan.alloc[id];
  if (!al) return 0;
  const funds = Array.isArray(al.funds) ? al.funds : [];
  if (FUND_ASSETS.has(id) && funds.length) {
    let w = 0, num = 0;
    for (const f of funds) { const fw = +f.weight || 0; w += fw; num += fw * (+f.ret || 0); }
    if (w > 0) return num / w;
  }
  return al.ret || 0;
}

export function effectiveReturn(plan, id) {
  const base = bucketReturn(plan, id);
  return FX_ASSETS.has(id) ? base + (plan.depr || 0) : base;
}

export function blended(plan, phase) {
  let wsum = 0, num = 0;
  for (const a of ASSETS) {
    const w = plan.alloc[a.id][phase];
    wsum += w; num += w * effectiveReturn(plan, a.id);
  }
  return wsum > 0 ? (num / wsum) / 100 : 0;
}

// Post-retirement allocation-weighted EFFECTIVE withdrawal tax. The single-corpus
// sim can't track per-asset depletion, so we blend each asset's tax by its post-ret
// allocation weight — the honest approximation. Falls back to plan.taxWd per asset,
// and to plan.taxWd overall when no post weights exist.
export function effectiveTaxRate(plan) {
  let wsum = 0, num = 0;
  for (const a of ASSETS) {
    const al = plan.alloc[a.id];
    if (!al) continue;
    const w = al.post || 0;
    if (w <= 0) continue;
    const t = (al.tax != null ? al.tax : (plan.taxWd || 0)) / 100;
    wsum += w; num += w * t;
  }
  const rate = wsum > 0 ? num / wsum : (plan.taxWd || 0) / 100;
  return Math.min(0.95, Math.max(0, rate));
}

// Withdrawal tax as a fraction in [0, 0.95]. To net `E` of spending in retirement
// you must withdraw E/(1-tax) from the corpus; the rest goes to tax.
export const taxRate = (plan) => effectiveTaxRate(plan);

export const totalExpenses = (plan) => EXP_CATS.reduce((s, c) => s + (plan.expenses[c.id] || 0), 0);
export const totalInvest = (plan) => INV_CATS.reduce((s, c) => s + (plan.invest[c.id] || 0), 0);
export const inflFactor = (plan, age) => Math.pow(1 + plan.inflation / 100, age - startAge(plan));
export const futureRate = (plan, age) => plan.fxRate * Math.pow(1 + plan.depr / 100, age - startAge(plan));

export function activeGoals(plan) {
  const list = [];
  for (let i = 0; i < plan.children; i++) {
    const yrs = plan.childYears[i] ?? 18;
    list.push({ label: `Child ${i + 1} education`, icon: '👶', age: startAge(plan) + yrs, today: plan.childCost,
      financed: false, downPct: 100, loanRate: 0, loanYears: 0, appr: 0 });
  }
  for (const g of GOALS) {
    const gs = plan.goals[g.id];
    if (gs && gs.on) list.push({
      label: g.label, icon: g.icon, age: gs.age, today: gs.amount,
      financed: !!gs.financed, downPct: gs.downPct ?? 20, loanRate: gs.loanRate ?? 8,
      loanYears: gs.loanYears ?? 20, appr: gs.appr ?? 0,
    });
  }
  return list;
}

// Standard amortized monthly payment for principal P at annual rate% over `years`.
export function emiMonthly(P, ratePct, years) {
  const n = Math.round(years * 12);
  if (n <= 0 || P <= 0) return 0;
  const r = (ratePct / 100) / 12;
  if (Math.abs(r) < 1e-9) return P / n;
  return P * r / (1 - Math.pow(1 + r, -n));
}

// Expand one active goal into its cash-flow impact on the plan.
//   future   = inflation-adjusted cost at the goal age
//   lump     = cash paid at the goal age (full cost, or just the down payment if financed)
//   emi      = monthly loan payment, active over [loanStart, loanEnd)
//   appr     = annual appreciation %, applied to `future` from the goal age onward
export function goalImpact(plan, g) {
  const yrs = g.age - startAge(plan);
  const future = g.today * Math.pow(1 + plan.inflation / 100, yrs);
  if (g.financed) {
    const down = future * (g.downPct / 100);
    const principal = future - down;
    const emi = emiMonthly(principal, g.loanRate, g.loanYears);
    return { future, lump: down, principal, emi, loanStart: g.age, loanEnd: g.age + g.loanYears, appr: g.appr || 0 };
  }
  return { future, lump: future, principal: 0, emi: 0, loanStart: null, loanEnd: null, appr: g.appr || 0 };
}

// goals deducted from corpus only when NOT running them as a separate track
const deductsGoals = (plan) => !plan.separateGoals;

export function simulate(plan, opts = {}) {
  const preR  = opts.preOverride  != null ? opts.preOverride  : blended(plan, 'pre');
  const postBl = opts.postOverride != null ? opts.postOverride : blended(plan, 'post');
  const annualExpBase = totalExpenses(plan) * 12;
  const annualSavings = (opts.savingsOverride != null ? opts.savingsOverride : totalInvest(plan)) * 12;
  const step = (plan.stepUp || 0) / 100;     // annual SIP step-up
  let yearSavings = annualSavings;           // grows by (1+step) after each pre-ret year
  const sy = sipYears(plan);                 // contributions stop after this many years
  const sa = startAge(plan);
  const tax = taxRate(plan);
  const useGoals = opts.includeGoals && deductsGoals(plan);

  // Pre-expand each goal into lump / EMI / appreciation schedule.
  const impacts = useGoals ? activeGoals(plan).map(g => ({ g, imp: goalImpact(plan, g) })) : [];

  let corpus = plan.invested;
  const out = [];
  for (let age = startAge(plan); age <= END_AGE; age++) {
    let goalHit = 0, emiYear = 0, assetValue = 0;
    for (const { g, imp } of impacts) {
      if (age === g.age) { corpus -= imp.lump; goalHit += imp.lump; }
      if (imp.emi > 0 && age >= imp.loanStart && age < imp.loanEnd) emiYear += imp.emi * 12;
      if (imp.appr && age >= g.age) assetValue += imp.future * Math.pow(1 + imp.appr / 100, age - g.age);
    }
    if (corpus < 0) corpus = 0;
    // EMIs are an ongoing expense that carries into retirement.
    const annualExp = annualExpBase * inflFactor(plan, age) + emiYear;
    // The gross draw needed from the corpus to net `annualExp` after withdrawal tax.
    const grossExp = annualExp / (1 - tax);
    const taxPaid = grossExp - annualExp;
    let wd = null;
    if (age >= plan.retireAge) wd = corpus > 0 ? (grossExp / corpus) * 100 : 100;
    out.push({ age, corpus, goalHit, wd, annualExp, grossExp, tax: taxPaid, emi: emiYear, assetValue, netWorth: corpus + assetValue });
    if (age < plan.retireAge) {
      const contributing = (age - sa) < sy;          // SIP halts after sipYears, corpus keeps compounding
      corpus = corpus * (1 + preR) + (contributing ? yearSavings : 0);
      yearSavings *= (1 + step);
    }
    else corpus = corpus * (1 + postBl) - grossExp;
    if (corpus < 0) corpus = 0;
  }
  return out;
}

export function depletionAge(plan, sim) {
  for (const s of sim) if (s.age >= plan.retireAge && s.corpus <= 0) return s.age;
  return null;
}

// Corpus at retirement for a given annual savings amount (linear in savings).
export function corpusAtRetFor(plan, annualSavings) {
  const preR = blended(plan, 'pre');
  const goalByAge = {};
  if (deductsGoals(plan)) {
    for (const g of activeGoals(plan)) {
      if (g.age <= plan.retireAge) {
        const imp = goalImpact(plan, g);   // financed goals only cost the down payment up-front
        goalByAge[g.age] = (goalByAge[g.age] || 0) + imp.lump;
      }
    }
  }
  const step = (plan.stepUp || 0) / 100;
  const sy = sipYears(plan);
  const sa = startAge(plan);
  let yearSavings = annualSavings;
  let corpus = plan.invested;
  for (let age = sa; age < plan.retireAge; age++) {
    if (goalByAge[age]) corpus -= goalByAge[age];
    if (corpus < 0) corpus = 0;
    corpus = corpus * (1 + preR) + ((age - sa) < sy ? yearSavings : 0);
    yearSavings *= (1 + step);
  }
  if (goalByAge[plan.retireAge]) corpus -= goalByAge[plan.retireAge];
  return Math.max(0, corpus);
}

// Present value (at the retirement date) of loan EMIs that keep running *into*
// retirement, grossed up for withdrawal tax. Only counted when goals are funded
// from the corpus (separateGoals === false), i.e. when the user asked to include
// goals in retirement. A finite EMI stream (e.g. retire at 48, EMI til age 65)
// is discounted at the post-retirement return so the required corpus / FIRE
// status reflects that ongoing payment instead of ignoring it.
export function retirementEmiPV(plan) {
  if (!deductsGoals(plan)) return 0;
  const postBl = blended(plan, 'post');
  const tax = taxRate(plan);
  let pv = 0;
  for (const g of activeGoals(plan)) {
    const imp = goalImpact(plan, g);
    if (!(imp.emi > 0)) continue;
    const from = Math.max(plan.retireAge, imp.loanStart);
    for (let age = from; age < imp.loanEnd; age++) {
      const grossEmi = (imp.emi * 12) / (1 - tax);   // pre-tax draw needed to net the EMI
      pv += grossEmi / Math.pow(1 + postBl, age - plan.retireAge);
    }
  }
  return pv;
}

export function targetRetCorpus(plan) {
  const annualExpAtRet = totalExpenses(plan) * 12 * inflFactor(plan, plan.retireAge);
  // Withdraw at targetWd%; the draw is taxed, so to net the expenses you need a
  // bigger corpus: corpus·targetWd·(1-tax) = expenses  →  /(1-tax).
  const grossAtRet = annualExpAtRet / (1 - taxRate(plan));
  const base = plan.targetWd > 0 ? grossAtRet / (plan.targetWd / 100) : Infinity;
  // Plus the lump needed today to service any EMI that runs past retirement.
  return base + retirementEmiPV(plan);
}

// Monthly sinking-fund SIP to accumulate futureCost over yrs years at pre-ret return.
export function sipFor(plan, futureCost, yrs) {
  const preR = blended(plan, 'pre');
  const months = Math.round(yrs * 12);
  if (months <= 0) return futureCost;
  const rm = Math.pow(1 + preR, 1 / 12) - 1;
  if (Math.abs(rm) < 1e-9) return futureCost / months;
  return futureCost * rm / (Math.pow(1 + rm, months) - 1);
}

// One master compute that returns everything the UI / report need.
export function compute(plan) {
  const preR = blended(plan, 'pre');
  const postBl = blended(plan, 'post');
  const realReturn = (1 + postBl) / (1 + plan.inflation / 100) - 1;
  const fireMult = realReturn > 0 ? 1 / realReturn : Infinity;
  const monthlyExp = totalExpenses(plan);
  const monthlyInv = totalInvest(plan);
  const tax = taxRate(plan);
  // 25×-style FIRE number, grossed up so the post-tax draw still covers expenses.
  const fireNumber = isFinite(fireMult) ? (monthlyExp * 12 * fireMult) / (1 - tax) : Infinity;

  const simGoals = simulate(plan, { includeGoals: true });
  const simNo    = simulate(plan, { includeGoals: false });
  const simRef   = simulate(plan, { includeGoals: true, preOverride: 0.08, postOverride: 0.08 });

  const retIdx = simGoals.findIndex(s => s.age === plan.retireAge);
  const corpusAtRet = simGoals[retIdx]?.corpus ?? 0;
  const required = targetRetCorpus(plan);
  const canRetire = corpusAtRet >= required;
  const dep = depletionAge(plan, simGoals);

  // ---- funding plan ----
  const N = plan.retireAge - startAge(plan);
  const growth = Math.pow(1 + preR, N);
  const c0 = corpusAtRetFor(plan, 0);
  const B = corpusAtRetFor(plan, 1) - c0;        // retirement corpus added per 1/yr SIP
  const currentCorpus = corpusAtRetFor(plan, monthlyInv * 12);
  const shortfall = required - currentCorpus;
  const onTrack = shortfall <= 0;
  const minMonthlySIP = B > 0 ? Math.max(0, (required - c0) / B) / 12 : 0;
  const addSIP = B > 0 ? Math.max(0, shortfall / B) / 12 : Infinity;
  const totalSIP = monthlyInv + addSIP;
  const lumpNow = shortfall > 0 ? shortfall / growth : 0;
  const mixLump = shortfall > 0 ? (shortfall / 2) / growth : 0;
  const mixSIP = shortfall > 0 && B > 0 ? ((shortfall / 2) / B) / 12 : 0;

  // ---- goal funding (dedicated SIPs) ----
  const goals = activeGoals(plan);
  let goalSIPtotal = 0, goalTodayTotal = 0, goalAdjTotal = 0, goalEMItotal = 0;
  const goalRows = goals.map(g => {
    const yrs = g.age - startAge(plan);
    const imp = goalImpact(plan, g);
    // Dedicated SIP saves up the cash you pay at the goal age (full cost, or the
    // down payment if financed). A financed goal then carries a separate EMI.
    const sipTarget = imp.lump;
    const sip = sipFor(plan, sipTarget, yrs);
    goalSIPtotal += sip; goalTodayTotal += g.today; goalAdjTotal += imp.future; goalEMItotal += imp.emi;
    return {
      ...g, yrs, future: imp.future, sip, sipTarget,
      down: imp.lump, principal: imp.principal, emi: imp.emi,
      loanEnd: imp.loanEnd, apprValueAtRet: imp.appr && plan.retireAge >= g.age
        ? imp.future * Math.pow(1 + imp.appr / 100, plan.retireAge - g.age) : 0,
    };
  });

  // ---- age snapshots ---- (kept within [startAge, END_AGE], distinct, sorted)
  const sa = startAge(plan);
  const snapAges = [...new Set([Math.max(35, sa), plan.retireAge, 65, END_AGE]
    .filter(a => a >= sa && a <= END_AGE))].sort((a, b) => a - b);
  const snapshots = snapAges.map(age => {
    const s = simGoals.find(x => x.age === age) || simGoals[simGoals.length - 1];
    const nominal = s.corpus;
    const real = nominal / inflFactor(plan, age);
    const fr = futureRate(plan, age);
    const usd = plan.country?.code === 'US' ? nominal : nominal / fr; // USD-equivalent
    const retired = age >= plan.retireAge;
    // income shown is the spendable (after-tax) draw at the target withdrawal rate
    const realIncome = retired ? (nominal * (plan.targetWd / 100) * (1 - tax) / 12) / inflFactor(plan, age) : 0;
    const realSurplus = retired ? realIncome - monthlyExp : 0;
    return { age, phase: retired ? 'Retired' : 'Accumulating', nominal, real, fr, usd, retired,
      realIncome, realSurplus, goalHit: s.goalHit, assetValue: s.assetValue || 0, netWorth: s.netWorth || nominal };
  });

  // ---- summary rows ---- (only ages at/after the current age)
  const sumAges = [...new Set([sa, 35, 40, plan.retireAge, 50, 55, 60, 65, 70, 80, 90, 100]
    .filter(a => a >= sa && a <= END_AGE))].sort((a, b) => a - b);
  const summary = sumAges.map(age => {
    const s = simGoals.find(x => x.age === age);
    const real = s.corpus / inflFactor(plan, age);
    const fr = futureRate(plan, age);
    const usd = plan.country?.code === 'US' ? s.corpus : s.corpus / fr;
    const retired = age >= plan.retireAge;
    const incomeMo = retired ? s.corpus * (plan.targetWd / 100) * (1 - tax) / 12 : 0; // after-tax spendable
    const expMo = (s.annualExp || monthlyExp * 12 * inflFactor(plan, age)) / 12; // includes loan EMI
    // during accumulation the monthly surplus is the SIP — but only while it's still running
    const surplus = retired ? incomeMo - expMo : (isContributing(plan, age) ? monthlyInv : 0);
    return { age, retired, nominal: s.corpus, real, usd, incomeMo, expMo, surplus, wd: s.wd,
      goalHit: s.goalHit, assetValue: s.assetValue || 0, netWorth: s.netWorth || s.corpus };
  });

  return {
    preR, postBl, realReturn, fireMult, fireNumber, monthlyExp, monthlyInv,
    simGoals, simNo, simRef,
    corpusAtRet, required, canRetire, dep,
    funding: { N, growth, c0, B, currentCorpus, shortfall, onTrack, minMonthlySIP, addSIP, totalSIP, lumpNow, mixLump, mixSIP },
    goalRows, goalSIPtotal, goalTodayTotal, goalAdjTotal, goalEMItotal,
    snapshots, summary,
    allocTotals: {
      pre: ASSETS.reduce((s, a) => s + plan.alloc[a.id].pre, 0),
      post: ASSETS.reduce((s, a) => s + plan.alloc[a.id].post, 0),
    },
  };
}
