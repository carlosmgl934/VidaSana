import React, { useState } from 'react';
import { formatDate } from '../utils/dates.js';

const LineChart = React.memo(({ data, color = '#10b981', label = 'Peso' }) => {
  const [tooltip, setTooltip] = useState(null);

  // 0 mediciones
  if (!data || data.length === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 32, color: '#475569' }}>
      <div style={{ fontSize: 32 }}>📈</div>
      <div style={{ marginTop: 8, fontSize: 13 }}>Añade mediciones para ver la gráfica</div>
    </div>
  );

  // 1 medición: punto solo, sin línea
  if (data.length === 1) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 24, color: '#64748b' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{data[0].valor}</div>
      <div style={{ fontSize: 12, marginTop: 4 }}>{formatDate(data[0].fecha)}</div>
      <div style={{ fontSize: 12, marginTop: 8 }}>Añade más mediciones para ver la evolución</div>
    </div>
  );

  // 2+ mediciones: línea completa
  const vals = data.map(d => Number(d.valor) || 0);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = Math.max(maxV - minV, 0.1); // prevent division by 0
  const W = 320, H = 100, pad = 16;
  const n = data.length;
  const xs = data.map((_, i) => pad + (i / (n - 1)) * (W - pad * 2));
  const ys = vals.map(v => H - pad - ((v - minV) / range) * (H - pad * 2));
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  const areaPath = `${path} L ${xs[n - 1].toFixed(1)} ${H} L ${xs[0].toFixed(1)} ${H} Z`;
  const gradId = `grad-${color.replace('#', '')}`;
  // Show at most 4 x-axis labels
  const labelStep = Math.max(1, Math.ceil(n / 4));

  return (
    <div style={{ width: '100%', overflowX: 'hidden' }}>
      <svg width="100%" height={H + 20} viewBox={`0 0 ${W} ${H + 20}`} preserveAspectRatio="xMidYMid meet" aria-label="Gráfica de evolución">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => (
          <g key={`${d.fecha}-${i}`}>
            <circle
              cx={xs[i]} cy={ys[i]} r="7" fill={color} className="chart-point"
              onMouseEnter={() => setTooltip({ x: xs[i], y: ys[i], v: d.valor, f: d.fecha })}
              onMouseLeave={() => setTooltip(null)}
              onClick={() => setTooltip(t => t?.f === d.fecha ? null : { x: xs[i], y: ys[i], v: d.valor, f: d.fecha })}
            />
            {i % labelStep === 0 && (
              <text x={xs[i]} y={H + 14} textAnchor="middle" fill="#475569" fontSize="9">
                {formatDate(d.fecha).slice(0, 5)}
              </text>
            )}
          </g>
        ))}
        {tooltip && (
          <g>
            <rect
              x={Math.min(tooltip.x - 26, W - 58)} y={tooltip.y - 30}
              width={54} height={22} rx="6" fill="#1e293b" stroke={color} strokeWidth="1"
            />
            <text
              x={Math.min(tooltip.x - 26, W - 58) + 27} y={tooltip.y - 14}
              textAnchor="middle" fill="#f1f5f9" fontSize="10" fontWeight="700"
            >
              {tooltip.v} {label.includes('eso') ? 'kg' : '%'}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
});
LineChart.displayName = 'LineChart';
export default LineChart;
