import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../context.jsx';
import { callAI, limitForPrompt } from '../utils/api.js';
import { today, todayStr, WEEKDAY_NAMES } from '../utils/dates.js';
import { calcTDEE, calcIMC, calcAge } from '../utils/calculations.js';
import DonutChart from '../components/DonutChart.jsx';
import LineChart from '../components/LineChart.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import AICard from '../components/AICard.jsx';

const Dashboard = () => {
  const { state, dispatch } = useApp();
  const prof = state.profiles[state.perfil];
  const isMama = state.perfil === 'mama';
  const todayKey = today();
  const dayLog = state.dayLogs[state.perfil][todayKey] || {};
  const mediciones = state.mediciones[state.perfil];

  // Usamos los datos más recientes, con fallbacks seguros
  const pesoInicial = useMemo(() => mediciones.length > 0 ? mediciones[mediciones.length - 1].peso : Number(prof.peso) || 0, [mediciones, prof.peso]);
  const pesoActual  = useMemo(() => mediciones.length > 0 ? mediciones[0].peso : Number(prof.peso) || 0, [mediciones, prof.peso]);
  const pesoMeta    = Number(prof.pesoMeta) || 0;
  const perdido     = Math.max(0, pesoInicial - pesoActual);
  const falta       = Math.max(0, pesoActual - pesoMeta);
  const totalPerder = Math.max(pesoInicial - pesoMeta, 0.01); // no cero
  const pctLogrado  = Math.min((perdido / totalPerder) * 100, 100);
  const calObjetivo = prof.calorias_objetivo || 2000;
  const comidasHoy  = dayLog.comidas || [];
  const calHoy      = comidasHoy.reduce((a, c) => a + (Number(c.calorias) || 0), 0);
  const aguaHoy     = dayLog.agua || 0;
  const insight     = state.aiInsightDiario[state.perfil][todayKey];
  const [loadingInsight, setLoadingInsight] = useState(false);
  const abortRef = useRef(null);

  // Streak calculado con useMemo — no se recalcula en cada render
  const streak = useMemo(() => {
    let s = 0;
    const logs = state.dayLogs[state.perfil];
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const key = d.toISOString().split('T')[0];
      const log = logs[key];
      if (log && (log.actividad !== 'descanso' || log.dieta === 'completa')) s++;
      else break;
      d.setDate(d.getDate() - 1);
    }
    return s;
  }, [state.dayLogs, state.perfil]);

  // Detectar estancamiento con useMemo
  const stagnantInfo = useMemo(() => {
    if (mediciones.length < 4) return null;
    const last4 = mediciones.slice(0, 4);
    const maxDiff = Math.max(...last4.map(m => m.peso)) - Math.min(...last4.map(m => m.peso));
    return maxDiff < 0.5 ? maxDiff : null;
  }, [mediciones]);

  // Detectar recomposición corporal con useMemo
  const recomposicion = useMemo(() => {
    if (mediciones.length < 2) return null;
    const [m1, m2] = mediciones;
    if (!m1.porcGrasa || !m2.porcGrasa || !m1.porcMusculo || !m2.porcMusculo) return null;
    if (m1.porcGrasa < m2.porcGrasa && m1.porcMusculo > m2.porcMusculo) {
      return {
        grasaDiff: (m2.porcGrasa - m1.porcGrasa).toFixed(1),
        musculoDiff: (m1.porcMusculo - m2.porcMusculo).toFixed(1)
      };
    }
    return null;
  }, [mediciones]);

  // Datos para la gráfica — memoizados
  const chartData = useMemo(() =>
    [...mediciones].reverse().slice(-28).map(m => ({ valor: m.peso, fecha: m.fecha })),
    [mediciones]
  );

  const updateDayLog = useCallback((data) => {
    dispatch({ type: 'UPDATE_DAY_LOG', payload: { fecha: todayKey, data } });
  }, [dispatch, todayKey]);

  const generateInsight = useCallback(async () => {
    if (loadingInsight) return; // evitar doble llamada
    setLoadingInsight(true);
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    // Limitamos mediciones en el prompt — máx 10 registros
    const recentMeds = limitForPrompt(mediciones, 10);
    const sys = `Eres un coach de salud personal. Responde en español, de forma breve (máx 3 oraciones), motivadora y accionable. Usa un emoji al inicio.`;
    const msg = `Consejo diario para ${prof.nombre || 'el usuario'}: lleva ${streak} días activo, perdió ${perdido.toFixed(1)}kg de ${totalPerder.toFixed(1)}kg objetivo. Hoy: ${calHoy} de ${calObjetivo} kcal, ${aguaHoy} vasos agua.`;
    try {
      const text = await callAI(sys, msg, null, 'image/jpeg', abortRef.current.signal);
      dispatch({ type: 'SET_AI_INSIGHT', payload: text });
    } catch (e) {
      if (e.name !== 'AbortError') {
        dispatch({ type: 'SET_AI_INSIGHT', payload: `💡 Cada día cuenta en tu camino hacia el objetivo. ¡Sigue así, ${prof.nombre || ''}!` });
      }
    }
    setLoadingInsight(false);
  }, [loadingInsight, mediciones, prof.nombre, streak, perdido, totalPerder, calHoy, calObjetivo, aguaHoy, dispatch]);

  // Generar insight automático UNA vez al día — deps correctas
  useEffect(() => {
    if (!insight && prof.nombre) {
      generateInsight();
    }
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [prof.nombre]); // solo cuando cambia el nombre (login nuevo) — intencional

  const planHoy = state.planSemanal[todayKey];
  const excesoCal = calHoy - calObjetivo;

  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            Hola {prof.nombre || (isMama ? 'Mamá' : 'tú')} 👋
          </div>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>{todayStr()}</div>
        </div>
        {streak > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 12, padding: '8px 14px'
          }}>
            <span className="animate-fire" style={{ fontSize: 20 }}>🔥</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b', lineHeight: 1 }}>{streak}</div>
              <div style={{ fontSize: 9, color: '#92400e' }}>días</div>
            </div>
          </div>
        )}
      </div>

      {/* Progreso al objetivo */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>Progreso al objetivo</div>
          <div className="badge badge-green">{pctLogrado.toFixed(0)}% ✓</div>
        </div>
        <ProgressBar value={perdido} max={totalPerder} h={10} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#10b981' }}>
              {perdido > 0 ? `−${perdido.toFixed(1)}` : '0'} kg
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>perdidos</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{pesoActual}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>kg actuales</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#6366f1' }}>
              {falta > 0 ? `−${falta.toFixed(1)}` : '🎯'} {falta > 0 ? 'kg' : ''}
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>faltan</div>
          </div>
        </div>
        {falta > 0 && prof.deficit > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#6366f1' }}>
            ≈ {Math.ceil(falta / Math.max((prof.deficit * 7) / 7700, 0.01))} semanas estimadas
          </div>
        )}
      </div>

      {/* Calorías donut */}
      {!isMama ? (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <DonutChart valor={calHoy} total={calObjetivo}
            onClick={() => dispatch({ type: 'SET_TAB', payload: 'ia' })} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Calorías de hoy</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: calHoy <= calObjetivo ? '#10b981' : '#ef4444' }}>{calHoy}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>consumidas</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#6366f1' }}>{calObjetivo}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>objetivo</div>
              </div>
            </div>
            <ProgressBar value={calHoy} max={calObjetivo} h={6}
              color={calHoy <= calObjetivo * 0.8
                ? 'linear-gradient(90deg,#10b981,#34d399)'
                : calHoy <= calObjetivo
                  ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
                  : 'linear-gradient(90deg,#ef4444,#f87171)'} />
          </div>
        </div>
      ) : (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#94a3b8' }}>🔥 Calorías objetivo diario</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#10b981' }}>
            {calObjetivo} <span style={{ fontSize: 16, fontWeight: 400, color: '#64748b' }}>kcal</span>
          </div>
        </div>
      )}

      {/* Tarjetas rápidas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Agua */}
        <div className="card">
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
            💧 Agua <span style={{ fontSize: 10, fontWeight: 400 }}>(250ml/vaso)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#3b82f6' }}>{aguaHoy}</div>
              <div style={{ fontSize: 14, color: '#3b82f6', opacity: 0.8, fontWeight: 600 }}>({(aguaHoy * 0.25).toFixed(2).replace(/\.00$/, '')}L)</div>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', textAlign: 'right' }}>
              /8 vasos<br/><span style={{ fontSize: 10 }}>(2L)</span>
            </div>
          </div>
          <ProgressBar value={aguaHoy} max={8} h={4} color="linear-gradient(90deg,#3b82f6,#60a5fa)" />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="stepper-btn" onClick={() => updateDayLog({ agua: Math.max(0, aguaHoy - 1) })}>−</button>
            <button className="stepper-btn active" onClick={() => updateDayLog({ agua: Math.min(20, aguaHoy + 1) })}>+</button>
          </div>
        </div>

        {/* Pasos — solo Yo */}
        {!isMama && (() => {
          const pasosData = state.pasos?.[state.perfil]?.[todayKey];
          const pasosHoy = pasosData?.pasos || 0;
          const kmHoy = pasosData?.km || 0;
          const calPasos = pasosData?.calorias || 0;
          const objPasos = prof.objetivoPasos || 10000;
          const pctPasos = Math.min((pasosHoy / objPasos) * 100, 100);
          const colorPasos = pasosHoy >= objPasos ? '#10b981'
            : pasosHoy >= objPasos * 0.7 ? '#f59e0b' : '#64748b';
          return (
            <div className="card" onClick={() => dispatch({ type: 'SET_TAB', payload: 'pasos' })}
              style={{ cursor: 'pointer', border: pasosHoy >= objPasos ? '1px solid rgba(16,185,129,0.3)' : undefined }}>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>👟 Pasos</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: colorPasos }}>{pasosHoy.toLocaleString()}</div>
              <ProgressBar value={pasosHoy} max={objPasos} h={4}
                color={pasosHoy >= objPasos
                  ? 'linear-gradient(90deg,#10b981,#34d399)'
                  : pasosHoy >= objPasos * 0.7
                    ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
                    : 'linear-gradient(90deg,#64748b,#94a3b8)'} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#64748b' }}>
                <span>{kmHoy} km</span>
                <span>{calPasos} kcal</span>
              </div>
            </div>
          );
        })()}
        
        {/* Días para el objetivo (solo Mamá) */}
        {isMama && (() => {
          const dias = prof.fechaMeta ? Math.max(0, Math.ceil((new Date(prof.fechaMeta) - new Date()) / 86400000)) : 0;
          return (
            <div className="card" style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.08),rgba(16,185,129,0.04))', border: '1px solid rgba(99,102,241,0.2)' }}>
              <div style={{ fontSize: 13, color: '#6366f1', marginBottom: 8, fontWeight: 600 }}>🎯 Para tu objetivo</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#6366f1' }}>{dias}</div>
                <div style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>días</div>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                Mantén el ritmo, ¡tú puedes!
              </div>
            </div>
          );
        })()}

        {/* Actividad */}
        {!isMama && (
          <div className="card">
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>🏃 Actividad</div>
            <div style={{ fontSize: 22, marginBottom: 8 }}>
              {dayLog.actividad === 'gym' ? '🏋️' : dayLog.actividad === 'paseo' ? '🚶' : '😴'}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: dayLog.actividad === 'descanso' ? '#475569' : '#10b981' }}>
              {dayLog.actividad === 'gym' ? 'Gym hoy ✓' : dayLog.actividad === 'paseo' ? 'Paseo ✓' : 'Descanso'}
            </div>
            <button style={{ marginTop: 8, fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              onClick={() => dispatch({ type: 'SET_TAB', payload: 'calendario' })}>
              Registrar →
            </button>
          </div>
        )}

        {/* Dieta */}
        {!isMama && (
          <div className="card">
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>🥗 Dieta hoy</div>
            <div style={{ fontSize: 28 }}>
              {dayLog.dieta === 'completa' ? '✅' : dayLog.dieta === 'parcial' ? '⚠️' : dayLog.dieta === 'rota' ? '❌' : '⬜'}
            </div>
            <div style={{ fontSize: 12, marginTop: 4, color: '#94a3b8' }}>
              {dayLog.dieta === 'completa' ? 'Respetada' : dayLog.dieta === 'parcial' ? 'Parcial' : dayLog.dieta === 'rota' ? 'Rota' : 'Sin registrar'}
            </div>
          </div>
        )}

        {/* Suplementos (Yo) */}
        {!isMama && (
          <div className="card">
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>💊 Suplementos</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => updateDayLog({ proteinaTomada: !dayLog.proteinaTomada })}
                style={{
                  flex: 1, padding: '6px 4px', borderRadius: 8,
                  border: `1px solid ${dayLog.proteinaTomada ? '#10b981' : '#334155'}`,
                  background: dayLog.proteinaTomada ? 'rgba(16,185,129,0.15)' : 'transparent',
                  color: dayLog.proteinaTomada ? '#10b981' : '#64748b', cursor: 'pointer', fontSize: 12
                }}>
                🥤 {dayLog.proteinaTomada ? '✓' : ''}
              </button>
              <button onClick={() => updateDayLog({ creatinaTomada: !dayLog.creatinaTomada })}
                style={{
                  flex: 1, padding: '6px 4px', borderRadius: 8,
                  border: `1px solid ${dayLog.creatinaTomada ? '#6366f1' : '#334155'}`,
                  background: dayLog.creatinaTomada ? 'rgba(99,102,241,0.15)' : 'transparent',
                  color: dayLog.creatinaTomada ? '#6366f1' : '#64748b', cursor: 'pointer', fontSize: 12
                }}>
                ⚡ {dayLog.creatinaTomada ? '✓' : ''}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tarjeta cintura (solo Mamá) */}
      {isMama && (() => {
        const medidas = state.medidasCorporales?.[state.perfil] || [];
        const ultimaM = medidas[0];
        const penultimaM = medidas[1];
        const primeraM = medidas[medidas.length - 1];
        const deltaPrev = ultimaM && penultimaM ? Number((ultimaM.cintura - penultimaM.cintura).toFixed(1)) : null;
        const deltaT = ultimaM && primeraM && medidas.length >= 2 ? Number((ultimaM.cintura - primeraM.cintura).toFixed(1)) : null;
        const daysSince = ultimaM ? Math.floor((new Date() - new Date(ultimaM.fecha + 'T00:00:00')) / 86400000) : Infinity;
        return (
          <div className="card" style={{ background: 'linear-gradient(135deg,rgba(236,72,153,0.08),rgba(16,185,129,0.04))', border: '1px solid rgba(236,72,153,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#ec4899' }}>📏 Cintura</div>
              {ultimaM && <div style={{ fontSize: 10, color: '#475569' }}>{ultimaM.fecha.split('-').reverse().join('/')}</div>}
            </div>
            {ultimaM ? (
              <>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 40, fontWeight: 800, color: '#10b981' }}>
                    {ultimaM.cintura} <span style={{ fontSize: 16, fontWeight: 400 }}>cm</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 6 }}>
                    {deltaPrev !== null && (
                      <span style={{ fontSize: 13, color: deltaPrev <= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                        {deltaPrev <= 0 ? '↓' : '↑'} {Math.abs(deltaPrev)} cm prev
                      </span>
                    )}
                    {deltaT !== null && (
                      <span style={{ fontSize: 13, color: deltaT <= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                        {deltaT <= 0 ? '↓' : '↑'} {Math.abs(deltaT)} cm total
                      </span>
                    )}
                  </div>
                </div>
                {daysSince >= 5 && (
                  <button onClick={() => dispatch({ type: 'SET_TAB', payload: 'medidas' })} style={{
                    marginTop: 12, width: '100%', padding: '10px', borderRadius: 10,
                    border: '1px solid rgba(236,72,153,0.4)', background: 'rgba(236,72,153,0.1)',
                    color: '#ec4899', cursor: 'pointer', fontSize: 13, fontWeight: 600
                  }}>📏 + Medir hoy</button>
                )}
              </>
            ) : (
              <button onClick={() => dispatch({ type: 'SET_TAB', payload: 'medidas' })} className="btn-primary"
                style={{ width: '100%', background: 'linear-gradient(135deg,#ec4899,#db2777)' }}>
                📏 Registrar primera medida
              </button>
            )}
          </div>
        );
      })()}

      {/* Cena del día (Yo) */}
      {!isMama && planHoy?.cena && (
        <div className="card" style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.1),rgba(16,185,129,0.05))', border: '1px solid rgba(99,102,241,0.2)' }}>
          <div style={{ fontSize: 12, color: '#6366f1', fontWeight: 600, marginBottom: 4 }}>🍽️ Cena de hoy</div>
          <div style={{ fontSize: 16, fontWeight: 700, wordBreak: 'break-word' }}>
            {planHoy.cena.nombre}
          </div>
          {planHoy.cena.calorias && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>~{planHoy.cena.calorias} kcal</div>
          )}
        </div>
      )}

      {/* Consejo IA diario */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#6366f1' }}>💡 Consejo del día</div>
          <button onClick={generateInsight} disabled={loadingInsight}
            style={{ fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: loadingInsight ? 'not-allowed' : 'pointer', opacity: loadingInsight ? 0.5 : 1 }}>
            {loadingInsight ? '...' : '↻ Nuevo'}
          </button>
        </div>
        <AICard text={insight} loading={loadingInsight} />
      </div>

      {/* Estancamiento */}
      {stagnantInfo !== null && (
        <div className="card animate-fade-in" style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.1),rgba(239,68,68,0.05))', border: '1px solid rgba(245,158,11,0.3)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>🔄 Posible estancamiento detectado</div>
          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
            Llevas ~2 semanas con variación de solo {stagnantInfo.toFixed(1)} kg. Considera ajustar calorías o cambiar el entrenamiento.
          </div>
          <button style={{ marginTop: 10, fontSize: 12, color: '#f59e0b', background: 'none', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
            onClick={() => dispatch({ type: 'SET_TAB', payload: 'ia' })}>
            Pedir consejo a la IA →
          </button>
        </div>
      )}

      {/* Recomposición corporal */}
      {recomposicion && (
        <div className="card animate-fade-in" style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.1),rgba(99,102,241,0.05))', border: '1px solid rgba(16,185,129,0.3)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981', marginBottom: 6 }}>💪 ¡Recomposición corporal detectada!</div>
          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
            Tu grasa bajó {recomposicion.grasaDiff}% y tu músculo subió {recomposicion.musculoDiff}%. ¡Tu cuerpo se está transformando! 🔥
          </div>
        </div>
      )}

      {/* Día de trampa */}
      {dayLog.dieta === 'rota' && excesoCal > 0 && (
        <div className="card animate-fade-in" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#6366f1', marginBottom: 6 }}>🎉 Modo Día de Trampa</div>
          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
            Comiste ~{excesoCal} kcal de más. Solo necesitas {Math.ceil(excesoCal / Math.max(prof.deficit || 500, 1))} día(s) en déficit para compensarlo. La constancia importa más que la perfección. ¡Mañana vuelves con todo! 💪
          </div>
        </div>
      )}

      {/* Gráfica peso */}
      {mediciones.length >= 1 && (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>📈 Progreso de peso</div>
          <LineChart data={chartData} label="Peso (kg)" />
        </div>
      )}
      <div style={{ height: 20 }} />
    </div>
  );
};
export default Dashboard;
