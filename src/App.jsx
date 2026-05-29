// ============================================================
// APP.JSX — Punto de entrada ultra-delgado (~100 líneas)
// Toda la lógica está en context.jsx + store/ + utils/ + components/ + modules/
// ============================================================
import React, { useState, useCallback, useEffect } from 'react';
import { AppProvider, useApp } from './context.jsx';

// Módulos de pantalla
import ProfileSelector from './components/ProfileSelector.jsx';
import Onboarding     from './modules/Onboarding.jsx';
import Dashboard      from './modules/Dashboard.jsx';
import Bascula        from './modules/Bascula.jsx';
import Calendario     from './modules/Calendario.jsx';
import Cenas          from './modules/Cenas.jsx';
import IANutricional  from './modules/IANutricional.jsx';
import MedidasMama    from './modules/MedidasMama.jsx';
import PasosDiarios   from './modules/PasosDiarios.jsx';
import Settings       from './modules/Settings.jsx';

// Componentes compartidos
import BottomNav        from './components/BottomNav.jsx';
import MilestoneOverlay from './components/MilestoneOverlay.jsx';

const AppContent = () => {
  const { state, dispatch } = useApp();
  const [showSettings, setShowSettings] = useState(false);
  const [pendingMilestone, setPendingMilestone] = useState(null);

  const isMama = state.perfil === 'mama';
  const prof   = state.profiles[state.perfil];

  const setTab = useCallback((t) => dispatch({ type: 'SET_TAB', payload: t }), [dispatch]);

  // Cola de milestones — evita mostrar varios a la vez
  useEffect(() => {
    if (state.milestones.length > 0 && !pendingMilestone) {
      setPendingMilestone(state.milestones[state.milestones.length - 1]);
    }
  }, [state.milestones]); // pendingMilestone no va en deps para no re-enquenar

  // 1. Selector de perfil
  if (!state.perfilSeleccionado) return <ProfileSelector />;

  // 2. Onboarding (si el perfil activo no lo completó)
  if (!prof?.onboardingCompleto) return <Onboarding />;

  // 3. App principal
  const renderTab = () => {
    switch (state.tab) {
      case 'dashboard':  return <Dashboard />;
      case 'bascula':    return <Bascula />;
      case 'calendario': return !isMama ? <Calendario /> : <Dashboard />;
      case 'pasos':      return !isMama ? <PasosDiarios /> : <Dashboard />;
      case 'cenas':      return !isMama ? <Cenas /> : <Dashboard />;
      case 'medidas':    return isMama ? <MedidasMama /> : <Dashboard />;
      case 'ia':         return <IANutricional />;
      default:           return <Dashboard />;
    }
  };

  return (
    <div className="app-container">
      {/* Top bar */}
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px 8px',
        background: 'rgba(15,23,42,0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        flexShrink: 0,
        position: 'sticky', top: 0, zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 20 }}>💚</div>
          <div style={{
            fontSize: 16, fontWeight: 800,
            background: 'linear-gradient(135deg,#10b981,#34d399)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>
            VidaSana
          </div>
          <span style={{
            fontSize: 11,
            background: isMama ? 'rgba(236,72,153,0.2)' : 'rgba(16,185,129,0.2)',
            color: isMama ? '#ec4899' : '#10b981',
            padding: '2px 8px', borderRadius: 999, fontWeight: 600
          }}>
            {isMama ? '👩 Mamá' : '💪 Yo'}
          </span>
        </div>
        <button className="btn-icon" style={{ fontSize: 18, padding: 8 }}
          onClick={() => setShowSettings(true)}
          aria-label="Configuración">
          ⚙️
        </button>
      </header>

      {/* Contenido principal con scroll */}
      <main className="content-scroll" role="main">
        {renderTab()}
      </main>

      {/* Navegación inferior */}
      <BottomNav tab={state.tab} setTab={setTab} isMama={isMama} />

      {/* Modal de configuración */}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}

      {/* Overlay de logro */}
      {pendingMilestone && (
        <MilestoneOverlay
          milestone={pendingMilestone}
          onClose={() => setPendingMilestone(null)}
        />
      )}
    </div>
  );
};

// App raíz: envuelve todo en el provider
export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
