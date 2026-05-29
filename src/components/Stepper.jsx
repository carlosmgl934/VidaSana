import React from 'react';

const Stepper = React.memo(({ value, onChange, min = 0, max = 20 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <button
      type="button"
      className={`stepper-btn ${value > min ? 'active' : ''}`}
      onClick={() => onChange(Math.max(min, value - 1))}
      disabled={value <= min}
      aria-label="Disminuir"
    >−</button>
    <span style={{ fontSize: 24, fontWeight: 700, minWidth: 32, textAlign: 'center' }}>{value}</span>
    <button
      type="button"
      className="stepper-btn active"
      onClick={() => onChange(Math.min(max, value + 1))}
      disabled={value >= max}
      aria-label="Aumentar"
    >+</button>
  </div>
));
Stepper.displayName = 'Stepper';
export default Stepper;
