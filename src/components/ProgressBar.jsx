import React from 'react';

// value and max are clamped — bar never shows <0% or >100%
const ProgressBar = React.memo(({ value, max, color = 'linear-gradient(90deg, #10b981, #34d399)', h = 8 }) => {
  const safeMax = Math.max(Number(max) || 1, 1);
  const safeValue = Math.max(0, Number(value) || 0);
  const pct = Math.min((safeValue / safeMax) * 100, 100);
  return (
    <div className="progress-bar" style={{ height: h }}>
      <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
});
ProgressBar.displayName = 'ProgressBar';
export default ProgressBar;
