import React from 'react';

const Toggle = React.memo(({ value, onChange }) => (
  <button
    className={`toggle ${value ? 'on' : ''}`}
    onClick={() => onChange(!value)}
    aria-pressed={!!value}
    type="button"
  />
));
Toggle.displayName = 'Toggle';
export default Toggle;
