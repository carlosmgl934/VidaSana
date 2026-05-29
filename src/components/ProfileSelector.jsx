import React from 'react';
import { useApp } from '../context.jsx';

const ProfileSelector = () => {
  const { dispatch } = useApp();
  return (
    <div style={{
      minHeight: '100%',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '24px 24px calc(24px + env(safe-area-inset-bottom, 0px))',
      background: 'linear-gradient(180deg, #0f172a 0%, #1a1f35 100%)'
    }}>
      <div className="animate-fade-in" style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>💚</div>
          <div style={{
            fontSize: 28, fontWeight: 800,
            background: 'linear-gradient(135deg, #10b981, #34d399)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>VidaSana</div>
          <div style={{ color: '#64748b', marginTop: 8, fontSize: 15 }}>¿Quién eres hoy?</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="profile-card" onClick={() => dispatch({ type: 'SET_PERFIL', payload: 'yo' })}>
            <div style={{ fontSize: 64 }}>💪</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 12 }}>Soy Carlos</div>
            <div style={{ color: '#64748b', fontSize: 14, marginTop: 6 }}>
              Acceso completo a todos los módulos
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              {['Dashboard','Báscula','Calendario','Cenas','IA'].map(t => (
                <span key={t} className="badge badge-green" style={{ fontSize: 10 }}>{t}</span>
              ))}
            </div>
          </div>
          <div className="profile-card" onClick={() => dispatch({ type: 'SET_PERFIL', payload: 'mama' })}>
            <div style={{ fontSize: 64 }}>👩</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 12 }}>Soy Mamá</div>
            <div style={{ color: '#64748b', fontSize: 14, marginTop: 6 }}>
              Versión simplificada y cariñosa
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
              {['Dashboard','Báscula','Consejos IA'].map(t => (
                <span key={t} className="badge" style={{ background: 'rgba(236,72,153,0.15)', color: '#ec4899', fontSize: 10 }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default ProfileSelector;
