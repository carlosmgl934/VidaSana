import React from 'react';
import Skeleton from './Skeleton.jsx';

const AICard = React.memo(({ text, loading, color = '#6366f1' }) => {
  if (loading) return (
    <div className="card" style={{ borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 20 }}>🤖</div>
        <div style={{ fontWeight: 600, color }}>IA pensando…</div>
      </div>
      <Skeleton h={12} w="90%" />
      <div style={{ marginTop: 8 }}><Skeleton h={12} w="70%" /></div>
      <div style={{ marginTop: 8 }}><Skeleton h={12} w="80%" /></div>
    </div>
  );
  if (!text) return null;
  return (
    <div className="card animate-fade-in" style={{ borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>🤖</div>
        {/* whiteSpace pre-wrap preserves newlines — safe, no dangerouslySetInnerHTML */}
        <div style={{
          fontSize: 14, lineHeight: 1.6, color: '#cbd5e1',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word'
        }}>{text}</div>
      </div>
    </div>
  );
});
AICard.displayName = 'AICard';
export default AICard;
