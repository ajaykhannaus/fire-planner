// PDF report generator. Uses jsPDF (window.jspdf.jsPDF) + jspdf-autotable (CDN).
// Produces a multi-section downloadable PDF summarizing the whole plan.
import { startAge } from './engine.js';
import { buildStrategies } from './strategies.js';
import { fmtPct } from './format.js';

const ACCENT = [17, 155, 144];   // #119b90
const DARK   = [30, 41, 59];     // slate
const MUTED  = [100, 116, 139];
const GOOD   = [15, 110, 86];
const WARN   = [186, 117, 23];

export function generateReport(plan, R, ctx = {}) {
  const JsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!JsPDF) throw new Error('jsPDF not loaded');
  const money = ctx.money || ((v) => String(Math.round(v)));
  const planName = ctx.currentPlanName || 'Untitled plan';
  const user = ctx.user || {};

  const doc = new JsPDF({ unit: 'pt', format: 'a4' });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 40;                 // margin
  let y = M;

  // ---- helpers ----
  const setColor = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const ensure = (need) => { if (y + need > PH - 50) { doc.addPage(); y = M; } };

  function heading(text) {
    ensure(40);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    setColor(ACCENT); doc.text(text, M, y);
    y += 6;
    doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]); doc.setLineWidth(1.2);
    doc.line(M, y, PW - M, y);
    y += 16;
  }

  function paragraph(text, opts = {}) {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size || 9.5);
    setColor(opts.color || DARK);
    const lines = doc.splitTextToSize(text, PW - 2 * M);
    ensure(lines.length * 12 + 4);
    doc.text(lines, M, y);
    y += lines.length * 12 + (opts.gap != null ? opts.gap : 6);
  }

  function table(head, body, opts = {}) {
    doc.autoTable({
      head: [head], body,
      startY: y,
      margin: { left: M, right: M },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4, textColor: DARK, lineColor: [226, 232, 240], lineWidth: 0.5 },
      headStyles: { fillColor: ACCENT, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 250, 250] },
      columnStyles: opts.columnStyles || {},
      didParseCell: opts.didParseCell,
    });
    y = doc.lastAutoTable.finalY + 16;
  }

  // ====================================================================
  // COVER / HEADER
  // ====================================================================
  doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  doc.rect(0, 0, PW, 70, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(255, 255, 255);
  doc.text('FIRE Planner — Financial Independence Report', M, 44);
  y = 92;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); setColor(DARK);
  doc.text(planName, M, y); y += 18;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); setColor(MUTED);
  const cc = plan.country || {};
  const meta = [
    user.name ? `Prepared for: ${user.name}` : null,
    user.email ? user.email : null,
    `Country: ${cc.flag ? cc.flag + ' ' : ''}${cc.name || cc.code || '—'} (${cc.symbol || ''})`,
    `Generated: ${new Date().toLocaleDateString()}`,
  ].filter(Boolean);
  meta.forEach(line => { doc.text(line, M, y); y += 13; });
  y += 8;

  // ====================================================================
  // PLAN ASSUMPTIONS
  // ====================================================================
  heading('Plan Assumptions');
  table(
    ['Assumption', 'Value'],
    [
      ['Current age', String(startAge(plan))],
      ['Target retirement age', String(plan.retireAge)],
      ['Currently invested', money(plan.invested)],
      ['Monthly investments', money(R.monthlyInv) + '/mo'],
      ['Monthly expenses', money(R.monthlyExp) + '/mo'],
      ['Inflation', fmtPct(plan.inflation / 100)],
      ['Target withdrawal rate', plan.targetWd + '%'],
      ['Withdrawal tax', (plan.taxWd ?? 0) + '%'],
      ['Pre-retirement blended return', fmtPct(R.preR)],
      ['Post-retirement blended return', fmtPct(R.postBl)],
      ['Real (inflation-adjusted) return', fmtPct(R.realReturn)],
      ['Goals funded', plan.separateGoals ? 'Separate track (ring-fenced)' : 'From retirement corpus'],
    ],
    { columnStyles: { 0: { cellWidth: 220, fontStyle: 'bold', textColor: MUTED } } }
  );

  // ====================================================================
  // FIRE STATUS
  // ====================================================================
  heading('FIRE Status');
  const statusLine = R.canRetire
    ? `ON TRACK — you reach your target corpus by age ${plan.retireAge}.`
    : `SHORTFALL — at the current pace you fall short by ${money(R.funding.shortfall)} at age ${plan.retireAge}.`;
  paragraph(statusLine, { bold: true, color: R.canRetire ? GOOD : WARN, size: 10.5 });
  table(
    ['Metric', 'Value'],
    [
      ['Corpus at retirement', money(R.corpusAtRet)],
      ['Target corpus required', money(R.required)],
      [R.canRetire ? 'Surplus' : 'Shortfall', money(Math.abs(R.corpusAtRet - R.required))],
      ['FIRE number (25× style)', isFinite(R.fireNumber) ? money(R.fireNumber) : 'n/a'],
      ['Corpus depletes at', R.dep ? `age ${R.dep}` : 'never (lasts to 100)'],
    ],
    { columnStyles: { 0: { cellWidth: 220, fontStyle: 'bold', textColor: MUTED } } }
  );

  // ====================================================================
  // FUNDING PLAN
  // ====================================================================
  heading(`Funding Plan — how to retire at ${plan.retireAge}`);
  const f = R.funding;
  if (R.canRetire) {
    paragraph(`You are already on track. Maintaining ${money(R.monthlyInv)}/mo of investments gets you to the target corpus of ${money(R.required)} by age ${plan.retireAge}.`);
  } else {
    paragraph(`You need ${money(R.required)} but are projected to have ${money(f.currentCorpus)} — a gap of ${money(f.shortfall)}. Any one of these closes it:`);
    table(
      ['Option', 'Action', 'Detail'],
      [
        ['Accelerate SIP', `Invest ${money(f.totalSIP)}/mo`, `+${money(f.addSIP)}/mo for ${f.N} yrs`],
        ['Lump sum today', `Invest ${money(f.lumpNow)} once`, `grows ${f.growth.toFixed(2)}× by retirement`],
        ['Balanced mix', `${money(f.mixLump)} now + ${money(f.mixSIP)}/mo`, 'split capital & income'],
      ],
      { columnStyles: { 0: { cellWidth: 110, fontStyle: 'bold' } } }
    );
  }

  // ====================================================================
  // STRATEGY BRIEFING
  // ====================================================================
  heading('Career Strategy Briefing');
  let strategies = [];
  try { strategies = buildStrategies(plan, R); } catch { strategies = []; }
  if (strategies.length) {
    table(
      ['Strategy', 'Approach', 'What to do'],
      strategies.map(s => [
        `${s.title}`,
        s.tag || '',
        s.summary,
      ]),
      {
        columnStyles: {
          0: { cellWidth: 95, fontStyle: 'bold' },
          1: { cellWidth: 90, textColor: MUTED },
          2: { cellWidth: PW - 2 * M - 185 },
        },
      }
    );
  }

  // ====================================================================
  // ASSET ALLOCATION
  // ====================================================================
  heading('Asset Allocation');
  table(
    ['Asset', 'Pre-ret %', 'Post-ret %', 'Return %'],
    Object.entries(plan.alloc).map(([id, a]) => {
      const labels = { us: 'US Stocks', mf: 'India MF / Equity', epf: 'EPF / 401K', fd: 'FD / Bonds' };
      return [labels[id] || id, a.pre + '%', a.post + '%', a.ret + '%'];
    }),
    { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } } }
  );

  // ====================================================================
  // GOAL FUNDING
  // ====================================================================
  if (R.goalRows && R.goalRows.length) {
    heading('Goal Funding — dedicated SIP per goal');
    table(
      ['Goal', 'At age', 'Cost today', 'Future cost', 'Monthly SIP'],
      [
        ...R.goalRows.map(g => [
          g.label, String(g.age), money(g.today), money(g.future), money(g.sip) + '/mo',
        ]),
        ['TOTAL', '', money(R.goalTodayTotal), money(R.goalAdjTotal), money(R.goalSIPtotal) + '/mo'],
      ],
      {
        columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
        didParseCell: (d) => { if (d.row.index === R.goalRows.length) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [230, 245, 243]; } },
      }
    );
  }

  // ====================================================================
  // AGE SNAPSHOTS
  // ====================================================================
  heading('Age Snapshots');
  table(
    ['Age', 'Phase', 'Corpus (nominal)', 'Real (today)', 'USD equiv'],
    R.snapshots.map(s => [
      String(s.age), s.phase, money(s.nominal), money(s.real),
      '$' + Math.round(s.usd).toLocaleString('en-US'),
    ]),
    { columnStyles: { 0: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } }
  );

  // ====================================================================
  // YEAR-BY-YEAR SUMMARY
  // ====================================================================
  heading('Summary Table');
  table(
    ['Age', 'Nominal', 'Real (today)', 'USD equiv', 'Income/mo', 'Expenses/mo', 'Surplus/mo', 'WD%'],
    R.summary.map(s => [
      String(s.age) + (s.retired ? ' (R)' : ''),
      money(s.nominal), money(s.real),
      '$' + Math.round(s.usd).toLocaleString('en-US'),
      s.retired ? money(s.incomeMo) : '—',
      money(s.expMo),
      money(s.surplus),
      s.wd == null ? '—' : s.wd.toFixed(1) + '%',
    ]),
    {
      columnStyles: {
        0: { halign: 'center', cellWidth: 42 },
        1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
        4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' },
      },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 6) {
          const neg = String(d.cell.raw).trim().startsWith('-');
          d.cell.styles.textColor = neg ? [214, 69, 69] : GOOD;
        }
      },
    }
  );

  // ====================================================================
  // FOOTER (page numbers + disclaimer)
  // ====================================================================
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setColor(MUTED);
    doc.text('Projections are estimates based on your assumptions and not financial advice.', M, PH - 24);
    doc.text(`Page ${i} of ${pages}`, PW - M, PH - 24, { align: 'right' });
  }

  // ---- save ----
  const safe = planName.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'fire-plan';
  doc.save(`${safe}-FIRE-report.pdf`);
}
