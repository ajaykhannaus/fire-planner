import { PRESETS, PRESET_ORDER, planFromPreset, ASSETS, EXP_CATS, INV_CATS, GOALS } from './presets.js';
import * as E from './engine.js';
import { fmtMoney, fmtRaw, fmtPct } from './format.js';
import { buildStrategies } from './strategies.js';
import { generateReport } from './report.js';
import { store } from './store.js';

// ---------- state ----------
let plan = planFromPreset('IN');
let currentPlanId = null;
let currentPlanName = 'Untitled plan';
let chart = null, chartMode = 'corpus';
const expanded = { expBreak: false, invBreak: false };

const $ = (id) => document.getElementById(id);
const money = (v) => fmtMoney(v, plan.country.symbol, plan.country.numberStyle);
const raw = (v) => fmtRaw(v, plan.country.symbol);

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200);
}

// =========================================================
// PLANS (browser-local, no login)
// =========================================================
function loadPlanList() {
  const plans = store.list();
  const el = $('planList');
  if (!plans.length) { el.innerHTML = '<div class="plan-empty">No saved plans yet.</div>'; return; }
  el.innerHTML = '';
  for (const p of plans) {
    const item = document.createElement('div');
    item.className = 'plan-item' + (p.id === currentPlanId ? ' active' : '');
    item.innerHTML = `<span>${escapeHtml(p.name)}</span><button class="pdel" title="Delete">✕</button>`;
    item.querySelector('span').onclick = () => openPlan(p.id);
    item.querySelector('.pdel').onclick = (e) => {
      e.stopPropagation();
      if (!confirm(`Delete plan "${p.name}"?`)) return;
      store.remove(p.id);
      if (p.id === currentPlanId) { currentPlanId = null; currentPlanName = 'Untitled plan'; }
      loadPlanList(); syncTopbar();
    };
    el.appendChild(item);
  }
}

function openPlan(id) {
  const p = store.get(id);
  if (!p) { toast('Plan not found'); loadPlanList(); return; }
  plan = migrate(p.data);
  currentPlanId = p.id; currentPlanName = p.name;
  buildInputs(); refresh(); populateCountrySelect();
  loadPlanList(); syncTopbar();
}

// guard against older payloads missing fields
function migrate(data) {
  const base = planFromPreset('IN');
  const merged = { ...base, ...data };
  merged.country = { ...base.country, ...(data.country || {}) };
  merged.alloc = { ...base.alloc, ...(data.alloc || {}) };
  merged.expenses = { ...base.expenses, ...(data.expenses || {}) };
  merged.invest = { ...base.invest, ...(data.invest || {}) };
  // deep-merge each goal so older saved plans inherit new finance/appreciation fields
  merged.goals = {};
  for (const id of Object.keys(base.goals)) {
    merged.goals[id] = { ...base.goals[id], ...((data.goals || {})[id] || {}) };
  }
  return merged;
}

$('btnNewPlan').onclick = () => {
  plan = planFromPreset(plan.country.code in PRESETS ? plan.country.code : 'IN');
  currentPlanId = null; currentPlanName = 'Untitled plan';
  buildInputs(); refresh(); populateCountrySelect(); syncTopbar();
  toast('Started a new plan');
};

$('btnSave').onclick = () => {
  $('saveName').value = currentPlanName === 'Untitled plan' ? '' : currentPlanName;
  $('saveModal').style.display = 'flex'; $('saveName').focus();
};
$('smCancel').onclick = () => $('saveModal').style.display = 'none';
$('smSave').onclick = () => {
  const name = $('saveName').value.trim() || 'My FIRE plan';
  try {
    if (currentPlanId && store.get(currentPlanId)) { store.update(currentPlanId, name, plan); }
    else { currentPlanId = store.create(name, plan); }
    currentPlanName = name;
    $('saveModal').style.display = 'none';
    loadPlanList(); syncTopbar(); toast('Plan saved in this browser');
  } catch (err) { toast(err.message); }
};

function syncTopbar() { $('currentPlanName').textContent = currentPlanName; }

// =========================================================
// COUNTRY
// =========================================================
function populateCountrySelect() {
  const sel = $('countrySelect');
  sel.innerHTML = '';
  for (const code of PRESET_ORDER) {
    const p = PRESETS[code];
    const o = document.createElement('option');
    o.value = code; o.textContent = `${p.flag} ${p.name} (${p.symbol.trim()})`;
    sel.appendChild(o);
  }
  const custom = document.createElement('option');
  custom.value = '__custom'; custom.textContent = '⚙️ Custom…';
  sel.appendChild(custom);
  sel.value = PRESET_ORDER.includes(plan.country.code) ? plan.country.code : '__custom';
}

$('countrySelect').addEventListener('change', (e) => {
  if (e.target.value === '__custom') { openCountryModal(); populateCountrySelect(); return; }
  applyCountry(e.target.value);
});

// Apply a preset's currency + assumptions, KEEP the user's amounts/allocations.
function applyCountry(code) {
  const p = PRESETS[code];
  plan.country = {
    code: p.code, name: p.name, flag: p.flag, symbol: p.symbol, numberStyle: p.numberStyle,
    investedMin: p.investedMin, investedMax: p.investedMax, investedStep: p.investedStep,
  };
  plan.inflation = p.inflation; plan.fxRate = p.fxRate; plan.depr = p.depr;
  plan.taxWd = p.taxWd ?? 0;
  for (const a of ASSETS) plan.alloc[a.id].ret = p.returns[a.id];
  plan.invested = Math.min(Math.max(plan.invested, p.investedMin), p.investedMax);
  buildInputs(); refresh();
  toast(`Applied ${p.name} assumptions`);
}

// ---- custom country modal ----
$('btnCustomCountry').onclick = openCountryModal;
$('cmCancel').onclick = () => $('countryModal').style.display = 'none';
function openCountryModal() {
  const c = plan.country;
  $('countryForm').innerHTML = `
    <div class="field full"><label>Country / label</label><input id="cf_name" value="${escapeAttr(c.name)}"/></div>
    <div class="field"><label>Currency symbol</label><input id="cf_symbol" value="${escapeAttr(c.symbol)}"/></div>
    <div class="field"><label>Number format</label>
      <select id="cf_style" class="select" style="margin:0">
        <option value="western"${c.numberStyle === 'western' ? ' selected' : ''}>Western (K / M / B)</option>
        <option value="indian"${c.numberStyle === 'indian' ? ' selected' : ''}>Indian (K / L / cr)</option>
      </select></div>
    <div class="field"><label>Inflation %/yr</label><input id="cf_infl" type="number" step="0.1" value="${plan.inflation}"/></div>
    <div class="field"><label>FX: local per 1 USD</label><input id="cf_fx" type="number" step="0.01" value="${plan.fxRate}"/></div>
    <div class="field"><label>Currency depreciation %/yr</label><input id="cf_depr" type="number" step="0.1" value="${plan.depr}"/></div>
    <div class="field"><label>Withdrawal tax %</label><input id="cf_tax" type="number" step="0.5" value="${plan.taxWd ?? 0}"/></div>
    <div class="field"><label>Return: Global stocks %</label><input id="cf_us" type="number" step="0.1" value="${plan.alloc.us.ret}"/></div>
    <div class="field"><label>Return: Local equity %</label><input id="cf_mf" type="number" step="0.1" value="${plan.alloc.mf.ret}"/></div>
    <div class="field"><label>Return: Retirement acct %</label><input id="cf_epf" type="number" step="0.1" value="${plan.alloc.epf.ret}"/></div>
    <div class="field"><label>Return: Bonds/FD %</label><input id="cf_fd" type="number" step="0.1" value="${plan.alloc.fd.ret}"/></div>`;
  $('countryModal').style.display = 'flex';
}
$('cmApply').onclick = () => {
  const g = (id) => $(id).value;
  const num = (id, d) => { const v = parseFloat(g(id)); return isFinite(v) ? v : d; };
  plan.country = {
    ...plan.country,
    code: 'CUSTOM', name: g('cf_name') || 'Custom', flag: '⚙️',
    symbol: g('cf_symbol') || '$', numberStyle: g('cf_style'),
  };
  plan.inflation = num('cf_infl', plan.inflation);
  plan.fxRate = num('cf_fx', plan.fxRate);
  plan.depr = num('cf_depr', plan.depr);
  plan.taxWd = num('cf_tax', plan.taxWd);
  plan.alloc.us.ret = num('cf_us', plan.alloc.us.ret);
  plan.alloc.mf.ret = num('cf_mf', plan.alloc.mf.ret);
  plan.alloc.epf.ret = num('cf_epf', plan.alloc.epf.ret);
  plan.alloc.fd.ret = num('cf_fd', plan.alloc.fd.ret);
  $('countryModal').style.display = 'none';
  buildInputs(); refresh(); populateCountrySelect();
  toast('Custom country applied');
};

// separate goals toggle
$('separateGoals').addEventListener('change', (e) => { plan.separateGoals = e.target.checked; refresh(); });

// =========================================================
// SLIDER HELPER
// =========================================================
function makeSlider(container, opts) {
  const row = document.createElement('div'); row.className = 'slider-row';
  const lab = document.createElement('label');
  const name = document.createElement('span'); name.textContent = opts.label;
  // the value is an editable field: click/tap to type an exact number instead of dragging
  const val = document.createElement('input');
  val.className = 'val val-input'; val.type = 'text'; val.inputMode = 'decimal';
  val.setAttribute('aria-label', opts.label + ' value'); val.title = 'Click to type an exact value';
  lab.append(name, val);
  const inp = document.createElement('input');
  inp.type = 'range'; inp.min = opts.min; inp.max = opts.max; inp.step = opts.step; inp.value = opts.value;

  const min = parseFloat(opts.min), max = parseFloat(opts.max);
  let cur = parseFloat(inp.value);   // the true value (text entry can be more precise than the slider step)
  let editing = false;

  // slider drag → update everything live
  inp.addEventListener('input', () => {
    cur = parseFloat(inp.value);
    if (!editing) val.value = opts.fmt(cur);
    opts.onInput(cur);
  });

  // typed entry: show the raw number while editing, commit (clamped) on blur / Enter
  val.addEventListener('focus', () => { editing = true; val.value = String(cur); val.select(); });
  val.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); val.blur(); } });
  val.addEventListener('blur', () => {
    editing = false;
    let num = parseFloat(String(val.value).replace(/[^0-9.\-]/g, ''));
    if (!isFinite(num)) { val.value = opts.fmt(cur); return; }   // ignore garbage, keep previous
    num = Math.min(max, Math.max(min, num));
    cur = num; inp.value = num; val.value = opts.fmt(cur);
    opts.onInput(cur);   // may rebuild inputs (e.g. current age) — safe, we've already blurred
  });

  val.value = opts.fmt(cur);
  if (cur !== opts.value) opts.onInput(cur);   // initial clamp
  row.append(lab, inp); container.appendChild(row);
  return inp;
}

// =========================================================
// BUILD INPUTS (structural)
// =========================================================
function buildInputs() {
  $('separateGoals').checked = !!plan.separateGoals;
  buildCore(); buildAlloc(); buildExpenseBreak(); buildInvestBreak(); buildChildren(); buildGoals();
}

function buildCore() {
  const c = $('coreSliders'); c.innerHTML = '';
  const cc = plan.country;
  makeSlider(c, { label: 'Current age', min: 18, max: 70, step: 1, value: plan.startAge,
    fmt: v => v + ' yrs', onInput: v => {
      plan.startAge = v;
      if (plan.retireAge <= v) plan.retireAge = v + 1;   // keep retirement after current age
      buildInputs(); refresh();                          // dependent bounds/labels change
    } });
  makeSlider(c, { label: 'Invested today', min: cc.investedMin, max: cc.investedMax, step: cc.investedStep,
    value: plan.invested, fmt: money, onInput: v => { plan.invested = v; refresh(); } });
  makeSlider(c, { label: 'Retire age', min: plan.startAge + 1, max: Math.max(plan.startAge + 5, 75), step: 1, value: plan.retireAge,
    fmt: v => v + ' yrs', onInput: v => { plan.retireAge = v; refresh(); } });
  makeSlider(c, { label: 'Inflation per year', min: 0, max: 12, step: 0.5, value: plan.inflation,
    fmt: v => v + '%', onInput: v => { plan.inflation = v; refresh(); } });
  makeSlider(c, { label: `FX rate (local per $1)`, min: Math.max(0.1, plan.fxRate * 0.3), max: plan.fxRate * 2 || 130, step: 0.01,
    value: plan.fxRate, fmt: v => v.toFixed(2), onInput: v => { plan.fxRate = v; refresh(); } });
  makeSlider(c, { label: 'Currency depreciation/yr', min: 0, max: 8, step: 0.5, value: plan.depr,
    fmt: v => v + '%', onInput: v => { plan.depr = v; refresh(); } });
  makeSlider(c, { label: 'Target withdrawal %', min: 1, max: 10, step: 0.5, value: plan.targetWd,
    fmt: v => v + '%', onInput: v => { plan.targetWd = v; refresh(); } });
  makeSlider(c, { label: 'Withdrawal tax %', min: 0, max: 50, step: 0.5, value: plan.taxWd ?? 0,
    fmt: v => v + '%', onInput: v => { plan.taxWd = v; refresh(); } });
}

function buildAlloc() {
  const body = $('allocBody'); body.innerHTML = '';
  for (const a of ASSETS) {
    const tr = document.createElement('tr');
    const td0 = document.createElement('td');
    td0.innerHTML = `<span style="color:${a.color}">●</span> ${a.label}`;
    tr.appendChild(td0);
    for (const key of ['pre', 'post', 'ret']) {
      const td = document.createElement('td');
      const mini = document.createElement('div'); mini.className = 'mini';
      const mx = key === 'ret' ? 20 : 100;
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = 0; inp.max = mx;
      inp.step = key === 'ret' ? 0.5 : 5; inp.value = plan.alloc[a.id][key];
      const v = document.createElement('input'); v.className = 'minival mini-input';
      v.type = 'text'; v.inputMode = 'decimal'; v.value = plan.alloc[a.id][key] + '%';
      v.title = 'Click to type an exact value';
      inp.addEventListener('input', () => {
        plan.alloc[a.id][key] = parseFloat(inp.value);
        if (document.activeElement !== v) v.value = inp.value + '%';
        refresh();
      });
      v.addEventListener('focus', () => { v.value = String(plan.alloc[a.id][key]); v.select(); });
      v.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); v.blur(); } });
      v.addEventListener('blur', () => {
        let num = parseFloat(String(v.value).replace(/[^0-9.\-]/g, ''));
        if (!isFinite(num)) { v.value = plan.alloc[a.id][key] + '%'; return; }
        num = Math.min(mx, Math.max(0, num));
        plan.alloc[a.id][key] = num; inp.value = num; v.value = num + '%'; refresh();
      });
      mini.append(inp, v); td.appendChild(mini); tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  const trt = document.createElement('tr'); trt.className = 'total-row'; trt.id = 'allocTotalRow';
  body.appendChild(trt);
}

function buildBreak(boxId, cats, store, maxFor, step) {
  const box = $(boxId); box.innerHTML = '';
  box.classList.toggle('collapsed', !expanded[boxId]);
  for (const c of cats) {
    makeSlider(box, { label: `${c.icon} ${c.label}`, min: 0, max: maxFor(c), step,
      value: store[c.id] || 0, fmt: raw, onInput: v => { store[c.id] = v; refresh(); } });
  }
}
function buildExpenseBreak() {
  const big = plan.country.numberStyle === 'indian';
  buildBreak('expBreak', EXP_CATS, plan.expenses,
    (c) => Math.max((plan.expenses[c.id] || 0) * 3, big ? 200000 : 6000),
    big ? 1000 : 50);
}
function buildInvestBreak() {
  const big = plan.country.numberStyle === 'indian';
  buildBreak('invBreak', INV_CATS, plan.invest,
    (c) => Math.max((plan.invest[c.id] || 0) * 3, big ? 1000000 : 30000),
    big ? 1000 : 100);
}

function buildChildren() {
  const cs = $('childSliders'); cs.innerHTML = '';
  [...$('childPills').children].forEach(b => b.classList.toggle('active', +b.dataset.n === plan.children));
  for (let i = 0; i < plan.children; i++) {
    makeSlider(cs, { label: `Child ${i + 1} education in`, min: 1, max: 30, step: 1, value: plan.childYears[i] ?? 18,
      fmt: v => `${v} yrs (your age ${plan.startAge + v})`, onInput: v => { plan.childYears[i] = v; refresh(); } });
  }
  const cw = $('childCostWrap'); cw.innerHTML = '';
  if (plan.children > 0) {
    const big = plan.country.numberStyle === 'indian';
    makeSlider(cw, { label: 'Education cost per child', min: 0, max: big ? 30000000 : 300000, step: big ? 100000 : 5000,
      value: plan.childCost, fmt: money, onInput: v => { plan.childCost = v; refresh(); } });
  }
}

function buildGoals() {
  const grid = $('goalGrid'); grid.innerHTML = '';
  const big = plan.country.numberStyle === 'indian';
  for (const g of GOALS) {
    const gs = plan.goals[g.id];
    const card = document.createElement('div'); card.className = 'goal-card' + (gs.on ? '' : ' disabled');
    const head = document.createElement('div'); head.className = 'ghead';
    head.innerHTML = `<span>${g.icon} ${g.label}</span>`;
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = gs.on;
    cb.onchange = () => { gs.on = cb.checked; buildGoals(); refresh(); };
    head.appendChild(cb); card.appendChild(head);
    const inner = document.createElement('div');
    makeSlider(inner, { label: 'Target age', min: plan.startAge + 1, max: 90, step: 1, value: gs.age,
      fmt: v => 'age ' + v, onInput: v => { gs.age = v; refresh(); } });
    makeSlider(inner, { label: g.amtLabel, min: 0, max: big ? 50000000 : 1000000, step: big ? 100000 : 5000,
      value: gs.amount, fmt: money, onInput: v => { gs.amount = v; refresh(); } });
    makeSlider(inner, { label: 'Appreciation %/yr', min: -10, max: 15, step: 0.5, value: gs.appr ?? 0,
      fmt: v => v + '%/yr', onInput: v => { gs.appr = v; refresh(); } });

    // ---- financing (loan) ----
    const finRow = document.createElement('label'); finRow.className = 'switch-row tiny';
    const finCb = document.createElement('input'); finCb.type = 'checkbox'; finCb.checked = !!gs.financed;
    const finTxt = document.createElement('span'); finTxt.textContent = '🏦 Finance with a loan';
    finRow.append(finCb, finTxt);
    finCb.onchange = () => { gs.financed = finCb.checked; buildGoals(); refresh(); };
    inner.appendChild(finRow);

    if (gs.financed) {
      const loan = document.createElement('div'); loan.className = 'loan-fields';
      makeSlider(loan, { label: 'Down payment', min: 0, max: 100, step: 5, value: gs.downPct,
        fmt: v => v + '%', onInput: v => { gs.downPct = v; refresh(); } });
      makeSlider(loan, { label: 'Interest rate', min: 0, max: 18, step: 0.25, value: gs.loanRate,
        fmt: v => v + '%/yr', onInput: v => { gs.loanRate = v; refresh(); } });
      makeSlider(loan, { label: 'Loan tenure', min: 1, max: 35, step: 1, value: gs.loanYears,
        fmt: v => v + ' yrs', onInput: v => { gs.loanYears = v; refresh(); } });
      inner.appendChild(loan);
    }
    card.appendChild(inner); grid.appendChild(card);
  }
}

$('childPills').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  plan.children = +b.dataset.n; buildChildren(); refresh();
});
document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.target; expanded[id] = !expanded[id];
    $(id).classList.toggle('collapsed', !expanded[id]);
    btn.textContent = (expanded[id] ? '▲' : '▼') + ' Category breakdown';
  });
});
$('chartTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  chartMode = b.dataset.t; [...e.currentTarget.children].forEach(x => x.classList.toggle('active', x === b));
  renderChart(window._R);
});

// =========================================================
// REFRESH (compute + render outputs)
// =========================================================
function refresh() {
  const R = E.compute(plan); window._R = R;
  renderDerived(R); updateAlloc(R); updateExpenses(R); updateInvest(R);
  renderGoalSummary(R); renderFire(R); renderFunding(R); renderStrategies(R);
  renderChart(R); renderAgeCards(R); renderSummary(R);
}

let _prevDerived = {};
function renderDerived(R) {
  const chips = [
    ['Pre-ret blended', fmtPct(R.preR)],
    ['Post-ret blended', fmtPct(R.postBl)],
    ['Real return', fmtPct(R.realReturn)],
    ['FIRE multiple', isFinite(R.fireMult) ? R.fireMult.toFixed(1) + '×' : '∞'],
    ['FIRE number today', isFinite(R.fireNumber) ? money(R.fireNumber) : '—'],
    ['Total expenses/mo', money(R.monthlyExp)],
    ['Total savings/mo', money(R.monthlyInv)],
  ];
  // flash any chip whose value changed since the last render, so it's obvious these
  // are live-driven by the return / allocation / expense selections.
  $('derivedChips').innerHTML = chips.map(([k, v]) => {
    const changed = _prevDerived[k] !== undefined && _prevDerived[k] !== v;
    return `<div class="chip${changed ? ' flash' : ''}"><span>${k}</span><b>${v}</b></div>`;
  }).join('');
  _prevDerived = Object.fromEntries(chips);
}

function stackBar(id, parts) {
  const tot = parts.reduce((s, p) => s + p.v, 0) || 1;
  $(id).innerHTML = parts.map(p => `<div style="width:${p.v / tot * 100}%;background:${p.color}"></div>`).join('');
}

function updateAlloc(R) {
  stackBar('preBar', ASSETS.map(a => ({ v: plan.alloc[a.id].pre, color: a.color })));
  stackBar('postBar', ASSETS.map(a => ({ v: plan.alloc[a.id].post, color: a.color })));
  const t = R.allocTotals;
  $('allocTotalRow').innerHTML = `<td>Total</td>
    <td class="${t.pre === 100 ? 'good' : 'bad'}">${t.pre}%</td>
    <td class="${t.post === 100 ? 'good' : 'bad'}">${t.post}%</td><td></td>`;

  // Currency depreciation is added to the return of global (USD-denominated) assets.
  const usEff = E.effectiveReturn(plan, 'us');
  $('allocNote').innerHTML = plan.depr > 0
    ? `<b>🌐 Currency effect:</b> a weakening ${plan.country.symbol.trim() || 'home'} currency adds your <b>${plan.depr}%/yr</b> depreciation to global stocks — so <b>US / Global Stocks</b> effectively returns <b>${plan.alloc.us.ret}% + ${plan.depr}% = ${usEff}%/yr</b> in local-currency terms. Local assets (MF, EPF, FD) are unaffected.`
    : `<b>🌐 Currency effect:</b> set a currency depreciation above 0% (Core Inputs) and it is added to the return of <b>US / Global Stocks</b>, since a weakening home currency boosts foreign-currency holdings.`;
}

function updateExpenses(R) {
  $('expTotal').textContent = money(R.monthlyExp) + '/mo';
  stackBar('expBar', EXP_CATS.map(c => ({ v: plan.expenses[c.id] || 0, color: c.color })));
  $('expLegend').innerHTML = EXP_CATS.map(c => `<span><i style="background:${c.color}"></i>${c.icon} ${c.label} ${money(plan.expenses[c.id] || 0)}</span>`).join('');
}
function updateInvest(R) {
  $('invTotal').textContent = money(R.monthlyInv) + '/mo';
  stackBar('invBar', INV_CATS.map(c => ({ v: plan.invest[c.id] || 0, color: c.color })));
  $('invLegend').innerHTML = INV_CATS.map(c => `<span><i style="background:${c.color}"></i>${c.icon} ${c.label} ${money(plan.invest[c.id] || 0)}</span>`).join('');
}

function renderGoalSummary(R) {
  if (!R.goalRows.length) { $('goalSummary').innerHTML = '<span class="muted">No goals enabled.</span>'; return; }
  const depNo = E.depletionAge(plan, R.simNo);
  const depG = R.dep;
  $('goalSummary').innerHTML =
    `<span><b>Total today:</b> ${money(R.goalTodayTotal)}</span>
     <span><b>Inflation-adjusted:</b> ${money(R.goalAdjTotal)}</span>
     <span><b>Without goals:</b> ${depNo ? 'depletes age ' + depNo : 'never depletes'}</span>
     <span><b>With goals:</b> ${plan.separateGoals ? 'funded separately' : (depG ? 'depletes age ' + depG : 'never depletes')}</span>`;
}

function renderFire(R) {
  const cards = [
    { lbl: `Corpus at retirement (age ${plan.retireAge})`, big: money(R.corpusAtRet), cls: '' },
    { lbl: `Retire at ${plan.retireAge} @ ${plan.targetWd}% WD?`, big: R.canRetire ? '✅ YES' : '❌ NO',
      sub: R.canRetire ? 'Surplus ' + money(R.corpusAtRet - R.required) : 'Shortfall ' + money(R.required - R.corpusAtRet),
      cls: R.canRetire ? 'yes' : 'no' },
    { lbl: 'Corpus longevity', big: R.dep ? 'Depletes age ' + R.dep : '✅ Never depletes', cls: R.dep ? 'no' : 'yes' },
  ];
  $('fireCards').innerHTML = cards.map(c =>
    `<div class="fire-card"><div class="lbl">${c.lbl}</div><div class="big ${c.cls}">${c.big}</div>${c.sub ? `<div class="small muted">${c.sub}</div>` : ''}</div>`).join('');
}

function renderFunding(R) {
  $('fpAge').textContent = 'age ' + plan.retireAge;
  const f = R.funding;
  const head = `<div class="fund-head">
      Target corpus at <b>age ${plan.retireAge}</b>: <b>${money(R.required)}</b> · sustains <b>${money(R.monthlyExp)}/mo</b> (today) at <b>${plan.targetWd}%</b> withdrawal.<br>
      Projected with current <b>${money(R.monthlyInv)}/mo</b> SIP + ${money(plan.invested)} today: <b>${money(f.currentCorpus)}</b>.
    </div>`;
  let body;
  if (f.onTrack) {
    const banner = `<div class="fund-banner ok">✅ On track — projected surplus of ${money(f.currentCorpus - R.required)} at age ${plan.retireAge}.</div>`;
    const opt = f.minMonthlySIP < R.monthlyInv ? `<div class="fund-grid"><div class="fund-opt"><div class="otag">Minimum SIP still OK</div><div class="obig">${money(f.minMonthlySIP)}/mo</div><div class="osub">You could cut your SIP by ${money(R.monthlyInv - f.minMonthlySIP)}/mo and still retire at ${plan.retireAge}.</div></div></div>` : '';
    body = banner + opt;
  } else {
    const banner = `<div class="fund-banner gap">❌ Shortfall of ${money(f.shortfall)} at age ${plan.retireAge}. Close it with any one option:</div>`;
    body = banner + `<div class="fund-grid">
      <div class="fund-opt"><div class="otag">A · Pure SIP</div><div class="obig">${money(f.totalSIP)}/mo</div><div class="osub">${money(f.addSIP)}/mo more than your current ${money(R.monthlyInv)}/mo.</div></div>
      <div class="fund-opt"><div class="otag">B · One-time lump sum</div><div class="obig">${money(f.lumpNow)}</div><div class="osub">Invest once today, keep current SIP.</div></div>
      <div class="fund-opt"><div class="otag">C · Mix (50/50)</div><div class="obig">${money(f.mixLump)} + ${money(f.mixSIP)}/mo</div><div class="osub">Lump sum today plus extra SIP.</div></div>
    </div>`;
  }
  const note = `<div class="note"><b>How:</b> money compounds at your pre-retirement blended return (${fmtPct(R.preR)}) until age ${plan.retireAge}. Target = inflation-adjusted annual expenses ÷ withdrawal %. ${plan.separateGoals ? 'Goals are funded on a <b>separate track</b> (see Goal Funding) and do not touch this corpus.' : 'Goals are paid out of this corpus (deducted at their target ages).'}</div>`;
  $('fundingPlan').innerHTML = head + body + note;

  // goal funding table
  if (!R.goalRows.length) { $('goalFunding').innerHTML = '<div class="note">No goals enabled. Add children or toggle a goal to see required SIPs.</div>'; return; }
  const rows = R.goalRows.map(g => {
    const fin = g.emi > 0
      ? `<span class="loan-chip">🏦 loan ${money(g.principal)} → ${money(g.emi)}/mo til age ${g.loanEnd}</span>`
      : '<span class="muted">cash</span>';
    const apprCell = g.apprValueAtRet > 0 ? money(g.apprValueAtRet) : '—';
    return `<tr><td>${g.icon} ${g.label}<div class="cell-sub">${fin}</div></td><td>age ${g.age}</td>
      <td>${money(g.today)}</td><td>${money(g.future)}</td><td>${money(g.down)}</td>
      <td><b>${money(g.sip)}/mo</b></td><td>${g.emi > 0 ? money(g.emi) + '/mo' : '—'}</td><td>${apprCell}</td></tr>`;
  }).join('');
  $('goalFunding').innerHTML = `<div style="overflow-x:auto"><table class="summary">
    <thead><tr><th>Goal</th><th>Target</th><th>Cost today</th><th>Infl-adj</th><th>Cash due</th><th>Save-up SIP</th><th>Loan EMI</th><th>Asset @ retire</th></tr></thead>
    <tbody>${rows}<tr class="total-row"><td><b>All goals</b></td><td></td><td></td><td></td><td></td><td><b>${money(R.goalSIPtotal)}/mo</b></td><td><b>${R.goalEMItotal > 0 ? money(R.goalEMItotal) + '/mo' : '—'}</b></td><td></td></tr></tbody></table></div>
    <div class="note"><b>Save-up SIP</b> accumulates the cash due at the goal age (full price, or just the down payment if financed). A financed goal then carries a <b>loan EMI</b> that counts as an ongoing expense — including in retirement — until the loan ends. <b>Asset @ retire</b> is the appreciated value of the asset at your retirement age. ${plan.separateGoals ? 'Save-up SIPs run <b>in parallel</b> with your retirement SIP.' : 'Goal cash &amp; EMIs are drawn from your retirement corpus — toggle “Keep retirement separate from goals” to model them independently.'}</div>`;
}

function renderStrategies(R) {
  const list = buildStrategies(plan, R);
  $('strategies').innerHTML = list.map(s => `
    <div class="strat ${s.status}">
      <div class="st-top"><span class="st-icon">${s.icon}</span><span class="st-title">${s.title}</span><span class="st-tag">${s.tag}</span></div>
      <div class="st-sum">${s.summary}</div>
      <div class="st-metrics">${s.metrics.map(m => `<div class="st-m">${m.label}<b>${m.value}</b></div>`).join('')}</div>
    </div>`).join('');
}

// ---- chart ----
function renderChart(R) {
  if (!R) return;
  const filt = (arr) => arr.filter(s => s.age >= 35);
  const labels = filt(R.simGoals).map(s => s.age);
  const goalPoints = filt(R.simGoals).map(s => s.goalHit > 0 ? (chartMode === 'corpus' ? s.corpus : s.wd) : null);
  const series = chartMode === 'corpus'
    ? [['Your plan', R.simGoals, '#119b90', false], ['No goals', R.simNo, '#185FA5', true], ['8% reference', R.simRef, '#d64545', true]]
    : [['Your plan', R.simGoals, '#119b90', false], ['No goals', R.simNo, '#185FA5', true], ['8% reference', R.simRef, '#d64545', true]];
  const datasets = series.map(([label, sim, color, dash]) => ({
    label, data: filt(sim).map(s => chartMode === 'corpus' ? s.corpus : s.wd),
    borderColor: color, backgroundColor: label === 'Your plan' && chartMode === 'corpus' ? 'rgba(17,155,144,.08)' : 'transparent',
    fill: label === 'Your plan' && chartMode === 'corpus', borderDash: dash ? [6, 4] : [], tension: .25, pointRadius: 0, spanGaps: true,
  }));
  datasets.push({ label: 'Goal hits', data: goalPoints, borderColor: '#d64545', backgroundColor: '#d64545', showLine: false, pointStyle: 'triangle', pointRadius: 9, pointRotation: 180 });
  const target = plan.targetWd;
  if (chart) chart.destroy();
  chart = new Chart($('mainChart'), {
    type: 'line', data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#5a6675', boxWidth: 14, filter: i => i.text !== 'Goal hits' } },
        tooltip: { callbacks: { label: c => c.dataset.label === 'Goal hits' ? (c.raw != null ? '🎯 Goal hits' : null) : (chartMode === 'corpus' ? `${c.dataset.label}: ${money(c.raw)}` : `${c.dataset.label}: ${c.raw == null ? '—' : c.raw.toFixed(1) + '%'}`) } },
      },
      scales: {
        x: { ticks: { color: '#8a96a4' }, grid: { color: 'rgba(0,0,0,.06)' }, title: { display: true, text: 'Age', color: '#8a96a4' } },
        y: chartMode === 'corpus'
          ? { ticks: { color: '#8a96a4', callback: v => money(v) }, grid: { color: 'rgba(0,0,0,.06)' } }
          : { min: 0, max: 20, ticks: { color: '#8a96a4', callback: v => v + '%' }, grid: { color: 'rgba(0,0,0,.06)' } },
      },
    },
    plugins: [{
      id: 'wdzones',
      beforeDraw(c) {
        if (chartMode !== 'wd') return;
        const { ctx, chartArea: ca, scales } = c; if (!ca) return; const y = scales.y;
        const zone = (lo, hi, col) => { const yhi = y.getPixelForValue(Math.min(hi, 20)), ylo = y.getPixelForValue(lo); ctx.save(); ctx.fillStyle = col; ctx.fillRect(ca.left, yhi, ca.right - ca.left, ylo - yhi); ctx.restore(); };
        zone(0, 4, 'rgba(17,155,144,.1)'); zone(4, 8, 'rgba(214,158,46,.12)'); zone(8, 20, 'rgba(229,72,72,.12)');
        const yp = y.getPixelForValue(target); ctx.save(); ctx.strokeStyle = '#1a2230'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(ca.left, yp); ctx.lineTo(ca.right, yp); ctx.stroke(); ctx.fillStyle = '#1a2230'; ctx.setLineDash([]); ctx.fillText('Target ' + target + '%', ca.left + 6, yp - 4); ctx.restore();
      }
    }],
  });
}

function renderAgeCards(R) {
  const colors = ['var(--age1)', 'var(--age2)', 'var(--age3)', 'var(--age4)'];
  $('ageCards').innerHTML = R.snapshots.map((s, i) => {
    const realPct = s.nominal > 0 ? Math.max(0, Math.min(100, s.real / s.nominal * 100)) : 0;
    const incomeRow = s.retired ? `<div class="row"><span>Real income/mo</span><b>${money(s.realIncome)}</b></div><div class="row"><span>Real surplus/mo</span><b class="${s.realSurplus >= 0 ? 'good' : 'bad'}">${money(s.realSurplus)}</b></div>` : '';
    const goalRow = s.goalHit > 0 ? `<div class="row"><span>Goals deducted</span><b class="bad">${money(s.goalHit)}</b></div>` : '';
    const assetRow = s.assetValue > 0 ? `<div class="row"><span>Assets (property)</span><b class="good">${money(s.assetValue)}</b></div><div class="row"><span>Net worth</span><b>${money(s.netWorth)}</b></div>` : '';
    return `<div class="age-card" style="border-left-color:${colors[i]}">
      <div class="atop"><b>Age ${s.age}</b><span class="phase">${s.phase}</span></div>
      <div class="nw">${money(s.nominal)}</div>
      <div class="row"><span>Real NW (today)</span><b>${money(s.real)}</b></div>
      ${assetRow}
      <div class="realbar"><div style="width:${realPct}%"></div></div>
      <div class="row"><span>FX rate</span><b>${s.fr.toFixed(2)}</b></div>
      <div class="row"><span>USD equiv</span><b>$${Math.round(s.usd).toLocaleString('en-US')}</b></div>
      ${incomeRow}${goalRow}</div>`;
  }).join('');
}

function renderSummary(R) {
  $('summaryBody').innerHTML = R.summary.map(s => `<tr>
    <td>${s.age}${s.retired ? ' 🏖️' : ''}</td>
    <td>${money(s.nominal)}</td><td>${money(s.real)}</td><td>$${Math.round(s.usd).toLocaleString('en-US')}</td>
    <td>${s.retired ? money(s.incomeMo) : '—'}</td><td>${money(s.expMo)}</td>
    <td class="${s.surplus >= 0 ? 'good' : 'bad'}">${money(s.surplus)}</td>
    <td>${s.wd == null ? '—' : s.wd.toFixed(1) + '%'}</td>
    <td>${s.goalHit > 0 ? money(s.goalHit) : ''}</td></tr>`).join('');
}

// ---- report ----
$('btnReport').onclick = () => {
  try { generateReport(plan, window._R || E.compute(plan), { money, currentPlanName }); toast('PDF downloaded'); }
  catch (err) { console.error(err); toast('PDF failed: ' + err.message); }
};

// ---- utils ----
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s); }

// =========================================================
// BOOT — no login, straight into the planner
// =========================================================
(function boot() {
  const plans = store.list();
  if (plans.length) { openPlan(plans[0].id); }
  else { plan = planFromPreset('IN'); currentPlanId = null; currentPlanName = 'Untitled plan'; buildInputs(); refresh(); }
  populateCountrySelect();
  syncTopbar();
  loadPlanList();
})();
