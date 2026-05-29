import React, { useState, useEffect } from 'react';
import Confetti from './Confetti.jsx';

const MilestoneOverlay = ({ milestone, onClose }) => {
  const [showConf, setShowConf] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowConf(false), 4000);
    return () => clearTimeout(t); // cleanup — no memory leak
  }, []);

  if (!milestone) return null;
  return (
    <div className="milestone-overlay" onClick={onClose}>
      <Confetti active={showConf} />
      <div className="milestone-card" onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 64 }}>{milestone.emoji}</div>
        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 12, color: '#10b981' }}>
          {milestone.titulo}
        </div>
        <div style={{ color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
          {milestone.mensaje}
        </div>
        <button className="btn-primary" style={{ marginTop: 20 }} onClick={onClose}>
          ¡Seguir adelante! 💪
        </button>
      </div>
    </div>
  );
};
export default MilestoneOverlay;
