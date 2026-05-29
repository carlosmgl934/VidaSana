import React from 'react';

const TypingIndicator = () => (
  <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '12px 16px' }}>
    <div style={{ fontSize: 20 }}>🤖</div>
    <div style={{ display: 'flex', gap: 4 }}>
      {[0, 1, 2].map(i => (
        <div key={i} className="typing-dot" style={{ animationDelay: `${i * 0.2}s` }} />
      ))}
    </div>
  </div>
);
export default TypingIndicator;
