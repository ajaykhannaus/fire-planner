// Generates a briefing of strategies ("plans you can make in your career") to reach
// FIRE and fund goals, with concrete numbers derived from the engine.
import { corpusAtRetFor, targetRetCorpus, blended, totalExpenses, totalInvest, inflFactor, startAge } from './engine.js?v=DEV';

// On-track check for a hypothetical retire age, keeping current savings.
function onTrackAt(plan, retireAge) {
  const p = { ...plan, retireAge };
  return corpusAtRetFor(p, totalInvest(p) * 12) >= targetRetCorpus(p);
}

export function buildStrategies(plan, R) {
  const out = [];
  const preR = R.preR;
  const N = plan.retireAge - startAge(plan);
  const monthlyExp = R.monthlyExp;
  const monthlyInv = R.monthlyInv;

  // 1) Status quo
  out.push({
    id: 'status', icon: '📍', title: 'Status Quo', tag: 'Your current path',
    status: R.canRetire ? 'good' : 'warn',
    summary: R.canRetire
      ? `Keep investing ${money(plan, monthlyInv)}/mo. You reach your target corpus by age ${plan.retireAge} with a surplus of ${money(plan, R.corpusAtRet - R.required)}.`
      : `At ${money(plan, monthlyInv)}/mo you fall short by ${money(plan, R.funding.shortfall)} at age ${plan.retireAge}${R.dep ? `, and the corpus depletes at age ${R.dep}` : ''}.`,
    metrics: [
      { label: 'Corpus @ retire', value: money(plan, R.corpusAtRet) },
      { label: 'Target', value: money(plan, R.required) },
      { label: R.dep ? 'Depletes' : 'Longevity', value: R.dep ? `age ${R.dep}` : 'never' },
    ],
  });

  // 2) Accelerate SIP
  if (!R.canRetire && isFinite(R.funding.addSIP)) {
    out.push({
      id: 'sip', icon: '🚀', title: 'Accelerate SIP', tag: 'Pure monthly investing',
      status: 'info',
      summary: `Raise your monthly SIP to ${money(plan, R.funding.totalSIP)} (that's ${money(plan, R.funding.addSIP)}/mo more). Everything compounds at your pre-retirement blended return of ${pct(preR)} until age ${plan.retireAge}.`,
      metrics: [
        { label: 'New SIP', value: money(plan, R.funding.totalSIP) + '/mo' },
        { label: 'Extra', value: money(plan, R.funding.addSIP) + '/mo' },
        { label: 'For', value: `${N} yrs` },
      ],
    });
  }

  // 3) Lump-sum injection
  if (!R.canRetire && R.funding.lumpNow > 0) {
    out.push({
      id: 'lump', icon: '💰', title: 'Lump-Sum Injection', tag: 'One-time capital',
      status: 'info',
      summary: `Invest ${money(plan, R.funding.lumpNow)} once today (keeping your current SIP). It grows ${R.funding.growth.toFixed(2)}× by age ${plan.retireAge} and closes the gap.`,
      metrics: [
        { label: 'Lump sum today', value: money(plan, R.funding.lumpNow) },
        { label: 'Growth factor', value: R.funding.growth.toFixed(2) + '×' },
      ],
    });
  }

  // 4) Balanced mix
  if (!R.canRetire && R.funding.mixLump > 0) {
    out.push({
      id: 'mix', icon: '⚖️', title: 'Balanced Mix', tag: 'Half lump, half SIP',
      status: 'info',
      summary: `Put in ${money(plan, R.funding.mixLump)} today plus an extra ${money(plan, R.funding.mixSIP)}/mo. Splits the effort between capital you have now and future income.`,
      metrics: [
        { label: 'Lump today', value: money(plan, R.funding.mixLump) },
        { label: 'Extra SIP', value: money(plan, R.funding.mixSIP) + '/mo' },
      ],
    });
  }

  // 5) Retire later
  if (!R.canRetire) {
    let found = null;
    for (let a = plan.retireAge + 1; a <= 70; a++) { if (onTrackAt(plan, a)) { found = a; break; } }
    out.push({
      id: 'later', icon: '🕰️', title: 'Work a Little Longer', tag: 'Shift the date',
      status: 'info',
      summary: found
        ? `Keeping everything the same, your current ${money(plan, monthlyInv)}/mo gets you there by age ${found} (${found - plan.retireAge} more year${found - plan.retireAge === 1 ? '' : 's'}).`
        : `Even by age 70 the current contribution doesn't reach the target — combine with a higher SIP or lower expenses.`,
      metrics: found ? [{ label: 'Retire by', value: `age ${found}` }, { label: 'Extra years', value: `${found - plan.retireAge}` }] : [{ label: 'Retire by', value: '70+' }],
    });
  }

  // 6) Lean FIRE — cut expenses
  {
    const maxExp = R.funding.currentCorpus * (plan.targetWd / 100) / (12 * inflFactor(plan, plan.retireAge));
    const cutPct = monthlyExp > 0 ? 1 - maxExp / monthlyExp : 0;
    if (!R.canRetire && cutPct > 0 && cutPct < 1) {
      out.push({
        id: 'lean', icon: '🌱', title: 'Lean FIRE', tag: 'Trim the lifestyle',
        status: 'info',
        summary: `Cut planned spending by ${(cutPct * 100).toFixed(0)}% to ${money(plan, maxExp)}/mo (today's money) and your current plan already retires you at ${plan.retireAge}.`,
        metrics: [
          { label: 'Spend cap', value: money(plan, maxExp) + '/mo' },
          { label: 'Reduction', value: `${(cutPct * 100).toFixed(0)}%` },
        ],
      });
    }
  }

  // 7) Coast FIRE
  {
    const coastNumber = R.required / Math.pow(1 + preR, N);
    const coasting = plan.invested >= coastNumber;
    out.push({
      id: 'coast', icon: '🏝️', title: 'Coast FIRE', tag: 'Let it ride',
      status: coasting ? 'good' : 'info',
      summary: coasting
        ? `Your ${money(plan, plan.invested)} already exceeds the Coast number — you could stop adding new money today and still hit the target by ${plan.retireAge} on compounding alone.`
        : `If your invested capital reaches ${money(plan, coastNumber)}, you can stop contributing and coast to the target by age ${plan.retireAge}.`,
      metrics: [
        { label: 'Coast number', value: money(plan, coastNumber) },
        { label: 'You have', value: money(plan, plan.invested) },
      ],
    });
  }

  // 8) Separate goals track
  if (R.goalRows.length > 0) {
    out.push({
      id: 'separate', icon: '🎯', title: 'Ring-Fence Goals', tag: 'Goals ≠ retirement',
      status: 'info',
      summary: `Fund your ${R.goalRows.length} goal${R.goalRows.length === 1 ? '' : 's'} with dedicated SIPs totalling ${money(plan, R.goalSIPtotal)}/mo, leaving your retirement corpus untouched. Toggle "Keep retirement separate from goals" to model this.`,
      metrics: [
        { label: 'Goal SIPs', value: money(plan, R.goalSIPtotal) + '/mo' },
        { label: 'Goals', value: `${R.goalRows.length}` },
      ],
    });
  }

  // 9) Allocation tilt
  out.push({
    id: 'alloc', icon: '📈', title: 'Higher-Return Tilt', tag: 'Allocation lever',
    status: 'info',
    summary: `Your pre-retirement blend returns ${pct(preR)}. Shifting ~10% from bonds to equities typically adds ≈0.3–0.5%/yr, which over ${N} years can move the corpus meaningfully — at the cost of more volatility.`,
    metrics: [
      { label: 'Pre-ret return', value: pct(preR) },
      { label: 'Post-ret return', value: pct(R.postBl) },
    ],
  });

  return out;
}

// local formatting helpers (kept here so report can reuse strategies without UI)
import { fmtMoney, fmtPct } from './format.js?v=DEV';
function money(plan, v) { return fmtMoney(v, plan.country.symbol, plan.country.numberStyle); }
function pct(x) { return fmtPct(x); }
