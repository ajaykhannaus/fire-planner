// Country preset library. Each preset seeds editable assumptions; everything
// remains user-editable via the custom country editor, so the app works for ANY country.
//
// fields:
//  code, name, flag, symbol, numberStyle, inflation(%), depr(%) [local-currency depreciation vs USD],
//  fxRate [units of local currency per 1 USD], returns {us, mf, epf, fd} (%),
//  expenses {…} monthly defaults, ranges for the "invested" slider.

export const ASSETS = [
  { id: 'us',  label: 'US / Global Stocks', short: 'Stocks', color: '#185FA5' },
  { id: 'mf',  label: 'Local Equity / MF',  short: 'Equity', color: '#0F6E56' },
  { id: 'epf', label: 'Retirement (EPF/401k/Pension)', short: 'Retirement', color: '#533AB7' },
  { id: 'fd',  label: 'Bonds / FD / Cash',  short: 'Bonds',  color: '#BA7517' },
];

export const EXP_CATS = [
  { id: 'food',  label: 'Food / Groceries', icon: '🍔', color: '#FF6B6B' },
  { id: 'rent',  label: 'Rent / Housing',   icon: '🏠', color: '#4ECDC4' },
  { id: 'util',  label: 'Utilities',        icon: '⚡', color: '#45B7D1' },
  { id: 'lux',   label: 'Luxury / Leisure', icon: '💎', color: '#96CEB4' },
  { id: 'car',   label: 'Car / Transport',  icon: '🚗', color: '#FFD479' },
  { id: 'emi',   label: 'Mortgage / EMI',   icon: '🏦', color: '#DDA0DD' },
  { id: 'other', label: 'Other',            icon: '📦', color: '#98D8C8' },
];

export const INV_CATS = [
  { id: 'us',    label: 'US / Global ETF',  icon: '🌐', color: '#FF6B6B' },
  { id: 'mf',    label: 'Local Stocks / MF', icon: '📈', color: '#4ECDC4' },
  { id: 'epf',   label: 'Retirement acct',  icon: '🏦', color: '#45B7D1' },
  { id: 'fd',    label: 'Bonds / FD',       icon: '💰', color: '#96CEB4' },
  { id: 'other', label: 'Other',            icon: '📦', color: '#FFD479' },
];

// amtLabel = label for the goal's total cost/price.
// apprDefault = default annual appreciation % of the asset (houses gain, most goals 0).
export const GOALS = [
  { id: 'house',   label: 'House Purchase',     icon: '🏠', amtLabel: 'Property price', apprDefault: 5 },
  { id: 'car',     label: 'Car',                icon: '🚗', amtLabel: 'Price',          apprDefault: 0 },
  { id: 'wedding', label: 'Wedding / Event',    icon: '💍', amtLabel: 'Budget',         apprDefault: 0 },
  { id: 'edu',     label: 'Higher Education',   icon: '🎓', amtLabel: 'Budget',         apprDefault: 0 },
  { id: 'travel',  label: 'Travel / Experience', icon: '✈️', amtLabel: 'Budget',        apprDefault: 0 },
  { id: 'custom',  label: 'Custom Goal',        icon: '⭐', amtLabel: 'Amount',         apprDefault: 0 },
];

export const PRESETS = {
  IN: {
    code: 'IN', name: 'India', flag: '🇮🇳', symbol: '₹', numberStyle: 'indian',
    inflation: 6, depr: 3, fxRate: 83,
    returns: { us: 12, mf: 12, epf: 8, fd: 7 },
    expenses: { food: 30000, rent: 45000, util: 10000, lux: 20000, car: 15000, emi: 25000, other: 5000 },
    investedMin: 500000, investedMax: 500000000, investedStep: 500000, investedDefault: 30000000,
    goalDefaults: { house: 15000000, car: 1500000, wedding: 3000000, edu: 5000000, travel: 1000000, custom: 2000000 },
    childCostDefault: 5000000,
  },
  US: {
    code: 'US', name: 'United States', flag: '🇺🇸', symbol: '$', numberStyle: 'western',
    inflation: 3, depr: 0, fxRate: 1,
    returns: { us: 10, mf: 9, epf: 7, fd: 4.5 },
    expenses: { food: 800, rent: 1500, util: 300, lux: 600, car: 400, emi: 300, other: 100 },
    investedMin: 10000, investedMax: 20000000, investedStep: 10000, investedDefault: 500000,
    goalDefaults: { house: 100000, car: 40000, wedding: 50000, edu: 80000, travel: 15000, custom: 30000 },
    childCostDefault: 100000,
  },
  GB: {
    code: 'GB', name: 'United Kingdom', flag: '🇬🇧', symbol: '£', numberStyle: 'western',
    inflation: 3, depr: 0.5, fxRate: 0.79,
    returns: { us: 9, mf: 8, epf: 6.5, fd: 4.5 },
    expenses: { food: 500, rent: 1400, util: 280, lux: 500, car: 350, emi: 400, other: 120 },
    investedMin: 10000, investedMax: 15000000, investedStep: 10000, investedDefault: 400000,
    goalDefaults: { house: 80000, car: 30000, wedding: 40000, edu: 60000, travel: 12000, custom: 25000 },
    childCostDefault: 90000,
  },
  EU: {
    code: 'EU', name: 'Eurozone', flag: '🇪🇺', symbol: '€', numberStyle: 'western',
    inflation: 2.5, depr: 0, fxRate: 0.92,
    returns: { us: 9, mf: 8, epf: 6, fd: 4 },
    expenses: { food: 550, rent: 1300, util: 300, lux: 500, car: 350, emi: 400, other: 120 },
    investedMin: 10000, investedMax: 15000000, investedStep: 10000, investedDefault: 400000,
    goalDefaults: { house: 90000, car: 35000, wedding: 45000, edu: 50000, travel: 12000, custom: 25000 },
    childCostDefault: 70000,
  },
  AE: {
    code: 'AE', name: 'UAE', flag: '🇦🇪', symbol: 'AED ', numberStyle: 'western',
    inflation: 2.5, depr: 0, fxRate: 3.67,
    returns: { us: 10, mf: 8, epf: 0, fd: 5 },
    expenses: { food: 2500, rent: 6000, util: 800, lux: 2000, car: 1500, emi: 2000, other: 700 },
    investedMin: 50000, investedMax: 50000000, investedStep: 50000, investedDefault: 1500000,
    goalDefaults: { house: 400000, car: 120000, wedding: 150000, edu: 250000, travel: 50000, custom: 80000 },
    childCostDefault: 300000,
  },
  SG: {
    code: 'SG', name: 'Singapore', flag: '🇸🇬', symbol: 'S$', numberStyle: 'western',
    inflation: 2.5, depr: 0, fxRate: 1.35,
    returns: { us: 9, mf: 8, epf: 4, fd: 3.5 },
    expenses: { food: 900, rent: 2800, util: 250, lux: 800, car: 900, emi: 1200, other: 300 },
    investedMin: 20000, investedMax: 30000000, investedStep: 20000, investedDefault: 800000,
    goalDefaults: { house: 200000, car: 120000, wedding: 60000, edu: 100000, travel: 20000, custom: 40000 },
    childCostDefault: 150000,
  },
  AU: {
    code: 'AU', name: 'Australia', flag: '🇦🇺', symbol: 'A$', numberStyle: 'western',
    inflation: 3, depr: 1, fxRate: 1.52,
    returns: { us: 9, mf: 8.5, epf: 7, fd: 4.5 },
    expenses: { food: 900, rent: 2200, util: 350, lux: 700, car: 500, emi: 600, other: 200 },
    investedMin: 20000, investedMax: 30000000, investedStep: 20000, investedDefault: 700000,
    goalDefaults: { house: 150000, car: 40000, wedding: 50000, edu: 70000, travel: 15000, custom: 30000 },
    childCostDefault: 120000,
  },
  CA: {
    code: 'CA', name: 'Canada', flag: '🇨🇦', symbol: 'C$', numberStyle: 'western',
    inflation: 3, depr: 1, fxRate: 1.36,
    returns: { us: 9, mf: 8, epf: 6.5, fd: 4.5 },
    expenses: { food: 800, rent: 1900, util: 300, lux: 600, car: 450, emi: 500, other: 200 },
    investedMin: 20000, investedMax: 30000000, investedStep: 20000, investedDefault: 600000,
    goalDefaults: { house: 120000, car: 40000, wedding: 45000, edu: 60000, travel: 14000, custom: 28000 },
    childCostDefault: 100000,
  },
};

export const PRESET_ORDER = ['IN', 'US', 'GB', 'EU', 'AE', 'SG', 'AU', 'CA'];

// Build a fresh plan object from a preset code.
export function planFromPreset(code) {
  const p = PRESETS[code] || PRESETS.US;
  const goals = {};
  for (const g of GOALS) goals[g.id] = {
    on: false, age: 40, amount: p.goalDefaults[g.id],
    // financing: when financed, you pay downPct now and take a loan for the rest,
    // whose EMI then counts as an ongoing (incl. retirement) expense across loanYears.
    financed: false, downPct: 20, loanRate: 8, loanYears: 20,
    appr: g.apprDefault || 0,   // annual appreciation % of the asset's value
  };
  return {
    country: {
      code: p.code, name: p.name, flag: p.flag, symbol: p.symbol, numberStyle: p.numberStyle,
      investedMin: p.investedMin, investedMax: p.investedMax, investedStep: p.investedStep,
    },
    startAge: 30,            // current age — drives the whole simulation horizon
    invested: p.investedDefault,
    retireAge: 45,
    inflation: p.inflation,
    fxRate: p.fxRate,        // local currency per 1 USD
    depr: p.depr,            // local-currency depreciation vs USD per year (%)
    targetWd: 4,
    separateGoals: false,
    alloc: {
      us:  { pre: 30, post: 15, ret: p.returns.us },
      mf:  { pre: 40, post: 25, ret: p.returns.mf },
      epf: { pre: 20, post: 30, ret: p.returns.epf },
      fd:  { pre: 10, post: 30, ret: p.returns.fd },
    },
    expenses: { ...p.expenses },
    invest: { us: 0, mf: 0, epf: 0, fd: 0, other: 0 },
    children: 0,
    childYears: [10, 14, 18],
    childCost: p.childCostDefault,
    goals,
  };
}
