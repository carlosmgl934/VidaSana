import React, { useMemo } from 'react';

const COLORS = ['#10b981','#6366f1','#f59e0b','#ef4444','#ec4899','#3b82f6'];

const Confetti = ({ active }) => {
  const pieces = useMemo(() => {
    if (!active) return [];
    return Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      duration: 2 + Math.random() * 2,
      delay: Math.random() * 1.5,
      size: 6 + Math.random() * 8,
      borderRadius: Math.random() > 0.5 ? '50%' : '2px'
    }));
  }, [active]);

  if (!active) return null;
  return (
    <div className="confetti-container">
      {pieces.map(p => (
        <div key={p.id} className="confetti-piece" style={{
          left: `${p.left}%`,
          background: p.color,
          width: p.size,
          height: p.size,
          borderRadius: p.borderRadius,
          animationDuration: `${p.duration}s`,
          animationDelay: `${p.delay}s`
        }} />
      ))}
    </div>
  );
};
export default Confetti;
