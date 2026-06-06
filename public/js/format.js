// Currency formatting that works for any country.
// style: 'indian' (K / L / cr) or 'western' (K / M / B)

export function fmtMoney(value, symbol = '$', style = 'western') {
  const v = Math.round(value);
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const s = symbol;
  if (style === 'indian') {
    if (a >= 1e7) return sign + s + trim(a / 1e7) + 'cr';
    if (a >= 1e5) return sign + s + trim(a / 1e5) + 'L';
    if (a >= 1e3) return sign + s + Math.round(a / 1e3) + 'K';
    return sign + s + a;
  }
  // western
  if (a >= 1e9) return sign + s + trim(a / 1e9) + 'B';
  if (a >= 1e6) return sign + s + trim(a / 1e6) + 'M';
  if (a >= 1e3) return sign + s + Math.round(a / 1e3) + 'K';
  return sign + s + a;
}

// 2 decimals when small magnitude, 1 when >=10, none when integer-ish
function trim(n) {
  if (n >= 100) return Math.round(n).toString();
  if (n >= 10) return n.toFixed(1).replace(/\.0$/, '');
  return n.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

// Full value with thousands separators (for fine-grained slider readouts)
export function fmtRaw(value, symbol = '$') {
  return symbol + Math.round(value).toLocaleString('en-US');
}

export function fmtPct(x, dp = 2) {
  return (x * 100).toFixed(dp) + '%';
}
