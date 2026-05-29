import React from 'react';

// Defined outside component to avoid creating new arrays on every render
const YO_ITEMS = [
  { id: 'dashboard', icon: '🏠', label: 'Inicio' },
  { id: 'bascula',   icon: '⚖️', label: 'Báscula' },
  { id: 'calendario',icon: '📅', label: 'Hábitos' },
  { id: 'pasos',     icon: '👟', label: 'Pasos' },
  { id: 'cenas',     icon: '🍽️', label: 'Cenas' },
  { id: 'ia',        icon: '🥙', label: 'Comida' },
];
const MAMA_ITEMS = [
  { id: 'dashboard', icon: '🏠', label: 'Inicio' },
  { id: 'bascula',   icon: '⚖️', label: 'Báscula' },
  { id: 'medidas',   icon: '📏', label: 'Medidas' },
  { id: 'ia',        icon: '🥙', label: 'Comida' },
];

const BottomNav = React.memo(({ tab, setTab, isMama }) => {
  const items = isMama ? MAMA_ITEMS : YO_ITEMS;
  return (
    <div className="bottom-nav">
      {items.map(item => (
        <button
          key={item.id}
          className={`nav-item ${tab === item.id ? 'active' : ''}`}
          onClick={() => setTab(item.id)}
          aria-label={item.label}
          aria-current={tab === item.id ? 'page' : undefined}
        >
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
          {tab === item.id && <div className="nav-dot" />}
        </button>
      ))}
    </div>
  );
});
BottomNav.displayName = 'BottomNav';
export default BottomNav;
