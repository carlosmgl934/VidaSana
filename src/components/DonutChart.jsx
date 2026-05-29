import React from 'react';

const DonutChart = React.memo(({ valor, total, size = 120, onClick }) => {
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  // Clamp 0..1 — never negative, never overflows SVG
  const safeTotal = Math.max(Number(total) || 1, 1);
  const safeValor = Math.max(0, Number(valor) || 0);
  const pct = Math.min(safeValor / safeTotal, 1);
  const offset = circ * (1 - pct);
  const color = pct < 0.8 ? '#10b981' : pct < 1 ? '#f59e0b' : '#ef4444';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className="donut-svg"
      style={{ cursor: onClick ? 'pointer' : 'default', flexShrink: 0 }}
      onClick={onClick}
      aria-label={`${Math.round(pct * 100)}% del objetivo calórico`}
      role={onClick ? 'button' : 'img'}
    >
      <circle className="donut-ring" cx="50" cy="50" r={radius} />
      <circle
        className="donut-segment"
        cx="50" cy="50" r={radius}
        stroke={color}
        strokeDasharray={circ}
        strokeDashoffset={isNaN(offset) ? circ : offset}
        style={{ '--target-offset': isNaN(offset) ? circ : offset }}
      />
      <text x="50" y="46" textAnchor="middle" fill="#f1f5f9" fontSize="16" fontWeight="700">
        {Math.round(safeValor)}
      </text>
      <text x="50" y="60" textAnchor="middle" fill="#64748b" fontSize="9">kcal</text>
    </svg>
  );
});
DonutChart.displayName = 'DonutChart';
export default DonutChart;
