import React, { useState, useCallback, useRef } from 'react';
import { useApp } from '../context.jsx';
import { callAI, limitForPrompt } from '../utils/api.js';
import AICard from '../components/AICard.jsx';

const Settings = ({ onClose }) => {
  const { state, dispatch } = useApp();
  const prof = state.profiles[state.perfil];
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const abortRef = useRef(null);

  const generateWeeklyReport = useCallback(async () => {
    if (loadingReport) return;
    setLoadingReport(true);
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const mediciones = state.mediciones[state.perfil];
    const logs = state.dayLogs[state.perfil];
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekDays = Object.entries(logs).filter(([d]) => new Date(d + 'T00:00:00') >= weekAgo);
    const gymDays = weekDays.filter(([, l]) => l.actividad === 'gym').length;
    const dietaDays = weekDays.filter(([, l]) => l.dieta === 'completa').length;
    const totalCal = weekDays.reduce((a, [, l]) =>
      a + (l.comidas || []).reduce((s, c) => s + (Number(c.calorias) || 0), 0), 0);
    const avgCal = weekDays.length > 0 ? Math.round(totalCal / weekDays.length) : 0;
    // Limitamos mediciones en el prompt
    const recentMeds = limitForPrompt(mediciones, 2);

    const sys = `Eres un coach de salud. Genera un Informe Semanal en español. Máx 250 palabras. Usa emojis.`;

    // Incluir datos de pasos semanales
    const pasosData = state.pasos?.[state.perfil] || {};
    const pasosWeek = weekDays.reduce((a, [d]) => a + (pasosData[d]?.pasos || 0), 0);
    const pasosAvg = weekDays.length > 0 ? Math.round(pasosWeek / weekDays.length) : 0;
    const objPasos = prof.objetivoPasos || 10000;

    const msg = `Informe semanal de ${prof.nombre}:
- Días de gym: ${gymDays}/7
- Días de dieta respetada: ${dietaDays}/7
- Media de calorías: ${avgCal} kcal (objetivo: ${prof.calorias_objetivo})
- Pasos semanales: ${pasosWeek} total, ${pasosAvg} media/día (objetivo: ${objPasos})
- Mediciones: ${recentMeds.map(m => `${m.peso}kg (${m.fecha})`).join(', ') || 'ninguna'}
Genera: nota global (A/B/C/D), puntos fuertes, puntos a mejorar, objetivo esta semana. Si la media de pasos es baja sugiere aumentar actividad, si es alta celébralo.`;

    try {
      const text = await callAI(sys, msg, null, 'image/jpeg', abortRef.current.signal);
      setWeeklyReport(text);
      dispatch({ type: 'SET_SEMANAL_REPORT', payload: text });
    } catch (e) {
      if (e.name !== 'AbortError') {
        const fallback = e.message?.includes('Demasiadas')
          ? e.message
          : `📋 Semana terminada. Gym: ${gymDays}/7, Dieta: ${dietaDays}/7. ¡Sigue mejorando!`;
        setWeeklyReport(fallback);
      }
    }
    setLoadingReport(false);
  }, [loadingReport, state.mediciones, state.dayLogs, state.perfil, prof, dispatch]);

  const handleSwitchProfile = useCallback(() => {
    const next = state.perfil === 'yo' ? 'mama' : 'yo';
    dispatch({ type: 'SWITCH_PROFILE', payload: next });
    onClose();
  }, [state.perfil, dispatch, onClose]);

  const handleGoToSelector = useCallback(() => {
    // Mantiene todos los datos pero vuelve al selector de perfil
    dispatch({ type: 'LOAD_STATE', payload: { ...state, perfilSeleccionado: false } });
    onClose();
  }, [state, dispatch, onClose]);

  const handleResetProfile = useCallback(() => {
    const nombrePerfil = state.perfil === 'yo' ? 'tu perfil (Yo)' : 'el perfil de Mamá';
    const confirmed = window.confirm(
      `⚠️ ¿Estás seguro de que quieres borrar TODOS los datos de ${nombrePerfil}?\n\nEsto incluye mediciones, hábitos, historial de fotos y chat.\nEsta acción NO se puede deshacer.`
    );
    if (confirmed) {
      dispatch({ type: 'RESET_PROFILE' });
      onClose();
    }
  }, [state.perfil, dispatch, onClose]);

  const storedReport = state.semanalReport[state.perfil];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>⚙️ Configuración</div>
          <button className="btn-icon" onClick={onClose} style={{ fontSize: 16, padding: 8 }} aria-label="Cerrar">✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Perfil activo */}
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Perfil activo</div>
            <div style={{ fontSize: 22, marginBottom: 12 }}>
              {state.perfil === 'yo' ? '💪 Yo' : '👩 Mamá'}{prof.nombre ? ` — ${prof.nombre}` : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn-secondary" onClick={handleSwitchProfile}>
                🔄 Cambiar de perfil
              </button>
              <button className="btn-secondary" onClick={handleGoToSelector}>
                🏠 Volver al selector
              </button>
            </div>
          </div>

          {/* Ajustes de Pasos — solo Yo */}
          {state.perfil === 'yo' && (
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#22d3ee' }}>👟 Mis Pasos</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>
                    Objetivo diario de pasos
                  </label>
                  <input className="input-field" type="number" inputMode="numeric"
                    min={3000} max={30000} step={500}
                    value={prof.objetivoPasos || 10000}
                    onChange={e => {
                      const v = Math.max(3000, Math.min(30000, Number(e.target.value) || 10000));
                      dispatch({ type: 'UPDATE_PROFILE', payload: { objetivoPasos: v } });
                    }} />
                  <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>Rango: 3.000 — 30.000 pasos</div>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>
                    Longitud de zancada (cm)
                  </label>
                  <input className="input-field" type="number" inputMode="numeric"
                    min={40} max={120}
                    value={prof.longitudZancada || 75}
                    onChange={e => {
                      const v = Math.max(40, Math.min(120, Number(e.target.value) || 75));
                      dispatch({ type: 'UPDATE_PROFILE', payload: { longitudZancada: v } });
                    }} />
                  <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>Se usa para calcular km desde pasos con más precisión</div>
                </div>
              </div>
            </div>
          )}

          {/* Informe semanal */}
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>📊 Informe Semanal con IA</div>
            {storedReport && !weeklyReport && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>Informe anterior:</div>
                <AICard text={storedReport} />
              </div>
            )}
            <button className="btn-primary" onClick={generateWeeklyReport} disabled={loadingReport}
              style={{ opacity: loadingReport ? 0.6 : 1 }}>
              {loadingReport ? '⏳ Generando...' : '📈 Generar informe semanal'}
            </button>
            {(loadingReport || weeklyReport) && (
              <div style={{ marginTop: 12 }}>
                <AICard text={weeklyReport} loading={loadingReport} />
              </div>
            )}
          </div>

          {/* Zona peligrosa */}
          <div className="card" style={{ border: '1px solid rgba(239,68,68,0.2)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: '#ef4444' }}>⚠️ Zona peligrosa</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
              Borra permanentemente todos los datos del perfil activo.
            </div>
            <button className="btn-secondary" style={{ color: '#ef4444', borderColor: '#ef4444' }}
              onClick={handleResetProfile}>
              🗑️ Reiniciar este perfil
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Settings;
