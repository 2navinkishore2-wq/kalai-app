import { formatINR, formatNumber } from '../lib/format';

export interface ChartPoint {
  label: string;
  value: number;
  bills?: number;
}

export function BarChart({ data, height = 210, tone = 'brand', format = 'money' }: { data: ChartPoint[]; height?: number; tone?: 'brand' | 'gold' | 'green'; format?: 'money' | 'number' }) {
  const W = 720;
  const H = height;
  const padL = 8;
  const padR = 8;
  const padT = 18;
  const padB = 34;
  const max = Math.max(1, ...data.map((d) => d.value));
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const step = innerW / Math.max(1, data.length);
  const barW = Math.min(46, step * 0.56);
  const fmt = (v: number) => (format === 'money' ? shortMoney(v) : formatNumber(v, 0));
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bar chart">
        {[0, 0.5, 1].map((g) => (
          <line key={g} x1={padL} x2={W - padR} y1={padT + innerH * g} y2={padT + innerH * g} className="chart-grid" />
        ))}
        {data.map((d, i) => {
          const h = max > 0 ? Math.max(d.value > 0 ? 3 : 0, (d.value / max) * innerH) : 0;
          const x = padL + i * step + (step - barW) / 2;
          const y = padT + innerH - h;
          return (
            <g key={`${d.label}-${i}`}>
              <title>{`${d.label}: ${format === 'money' ? formatINR(d.value) : formatNumber(d.value, 0)}${d.bills != null ? ` · ${d.bills} bills` : ''}`}</title>
              <rect x={x} y={y} width={barW} height={h} rx={5} className={`chart-bar bar-${tone}`} />
              {d.value > 0 && data.length <= 10 ? (
                <text x={x + barW / 2} y={Math.max(11, y - 6)} textAnchor="middle" className="chart-value">
                  {fmt(d.value)}
                </text>
              ) : null}
              <text x={x + barW / 2} y={H - 12} textAnchor="middle" className="chart-label">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function AreaChart({ data, height = 220, tone = 'brand' }: { data: ChartPoint[]; height?: number; tone?: 'brand' | 'gold' | 'green' }) {
  const W = 720;
  const H = height;
  const padL = 16;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const max = Math.max(1, ...data.map((d) => d.value));
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const step = innerW / Math.max(1, data.length - 1);
  const points = data.map((d, i) => [padL + i * step, padT + innerH - (d.value / max) * innerH] as const);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${padL + innerW},${padT + innerH} L${padL},${padT + innerH} Z`;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sales trend">
        <defs>
          <linearGradient id={`grad-${tone}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" className={`area-stop-${tone}`} stopOpacity="0.32" />
            <stop offset="100%" className={`area-stop-${tone}`} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((g) => (
          <line key={g} x1={padL} x2={W - padR} y1={padT + innerH * g} y2={padT + innerH * g} className="chart-grid" />
        ))}
        <path d={area} fill={`url(#grad-${tone})`} />
        <path d={line} className={`chart-line line-${tone}`} fill="none" strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <title>{`${data[i].label}: ${formatINR(data[i].value)} · ${data[i].bills ?? 0} bills`}</title>
            <circle cx={p[0]} cy={p[1]} r={3.4} className={`chart-dot dot-${tone}`} />
          </g>
        ))}
        {data.map((d, i) =>
          data.length <= 12 || i % Math.ceil(data.length / 8) === 0 ? (
            <text key={`l-${i}`} x={points[i]?.[0] ?? padL} y={H - 9} textAnchor="middle" className="chart-label">
              {d.label}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}

export function Donut({ data, size = 170, thickness = 20 }: { data: { label: string; value: number; color?: string }[]; size?: number; thickness?: number }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const colors = ['var(--brand-600)', 'var(--gold-500)', 'var(--green)', 'var(--blue)', 'var(--amber)', 'var(--text-3)'];
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Breakdown">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={thickness} />
        {total > 0 &&
          data.map((d, i) => {
            const frac = d.value / total;
            const dash = frac * c;
            const el = (
              <circle
                key={d.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color || colors[i % colors.length]}
                strokeWidth={thickness}
                strokeDasharray={`${Math.max(0, dash - 2)} ${c}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              >
                <title>{`${d.label}: ${formatINR(d.value)}`}</title>
              </circle>
            );
            offset += dash;
            return el;
          })}
      </svg>
      <div className="donut-legend">
        {data.length === 0 ? <span className="muted small">No collections yet</span> : null}
        {data.map((d, i) => (
          <div key={d.label} className="donut-row">
            <span className="dot-swatch" style={{ background: d.color || colors[i % colors.length] }} />
            <span className="donut-label">{d.label}</span>
            <b>{formatINR(d.value)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ values, tone = 'brand' }: { values: number[]; tone?: 'brand' | 'green' | 'gold' }) {
  const W = 120;
  const H = 36;
  const max = Math.max(1, ...values);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * W},${H - ((v - min) / span) * (H - 4) - 2}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sparkline" aria-hidden="true">
      <polyline points={pts} fill="none" className={`line-${tone}`} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function shortMoney(v: number): string {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
  return `₹${Math.round(v)}`;
}
