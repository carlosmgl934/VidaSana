// ============================================================
// PASOS DIARIOS — Registro de actividad física (solo perfil Yo)
// ============================================================
import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useApp } from '../context.jsx';
import { callAI } from '../utils/api.js';
import { today, formatDate } from '../utils/dates.js';
import ProgressBar from '../components/ProgressBar.jsx';
import AICard from '../components/AICard.jsx';

// ── Helpers de cálculo (funciones puras) ──

const calcKmFromPasos = (pasos, zancadaCm) =>
  pasos > 0 ? +((pasos * zancadaCm) / 100000).toFixed(1) : 0;

const calcPasosFromKm = (km, zancadaCm) =>
  km > 0 ? Math.round((km * 100000) / zancadaCm) : 0;

const calcCalFromPasos = (pasos, pesoKg) =>
  pasos > 0 ? Math.round(pasos * 0.04 * (pesoKg / 70)) : 0;

const calcCalFromMET = (km, minutos, pesoKg) => {
  if (!km || !minutos || minutos <= 0) return 0;
  const vel = km / (minutos / 60);
  const met = vel < 3 ? 2.5 : vel <= 5 ? 3.5 : 5.0;
  return Math.round(met * pesoKg * (minutos / 60));
};

// Clamp genérico
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// ── Sub-componente: Gráfica de barras semanal (SVG) ──
const BarChart7 = React.memo(({ days, objetivo }) => {
  const W = 320, H = 140, padX = 12, padY = 20;
  const barW = 28, gap = (W - padX * 2 - barW * 7) / 6;
  const maxVal = Math.max(objetivo, ...days.map(d => d.pasos || 0), 1);
  const barArea = H - padY * 2;
  const goalY = padY + barArea - (objetivo / maxVal) * barArea;
  const WEEKDAY = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  return (
    <svg width="100%" height={H + 24} viewBox={`0 0 ${W} ${H + 24}`} preserveAspectRatio="xMidYMid meet" aria-label="Gráfica semanal de pasos">
      {/* Línea de objetivo */}
      <line x1={padX} y1={goalY} x2={W - padX} y2={goalY} className="pasos-goal-line" />
      <text x={W - padX - 2} y={goalY - 4} textAnchor="end" fill="#f59e0b" fontSize="9" fontWeight="600">
        {(objetivo / 1000).toFixed(0)}k
      </text>
      {/* Barras */}
      {days.map((d, i) => {
        const x = padX + i * (barW + gap);
        const val = d.pasos || 0;
        const pct = val / maxVal;
        const barH = Math.max(pct * barArea, val > 0 ? 3 : 0);
        const y = padY + barArea - barH;
        const fill = val === 0 ? '#334155'
          : val >= objetivo ? '#10b981'
          : val >= objetivo * 0.7 ? '#f59e0b'
          : '#64748b';
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={6}
              fill={fill} className="pasos-bar"
              style={{ animationDelay: `${i * 0.06}s` }} />
            {val > 0 && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="600">
                {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
              </text>
            )}
            <text x={x + barW / 2} y={H + 14} textAnchor="middle" fill="#475569" fontSize="10">
              {WEEKDAY[i]}
            </text>
            <text x={x + barW / 2} y={H + 23} textAnchor="middle" fill="#334155" fontSize="8">
              {d.fecha ? `${d.fecha.slice(8)}` : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
});
BarChart7.displayName = 'BarChart7';

// ── Componente principal ──
const PasosDiarios = () => {
  const { state, dispatch } = useApp();
  const prof = state.profiles[state.perfil];
  const todayKey = today();
  const allPasos = state.pasos?.[state.perfil] || {};
  const objetivoPasos = prof.objetivoPasos || 10000;
  const zancada = prof.longitudZancada || 75;
  const pesoKg = Number(prof.peso) || 70;

  const [tab, setTab] = useState('hoy');
  const [aiResult, setAiResult] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const abortRef = useRef(null);

  // ── Form state para tab "Hoy" ──
  const existingToday = allPasos[todayKey];
  const [formPasos, setFormPasos] = useState(existingToday?.pasos ?? '');
  const [formKm, setFormKm] = useState(existingToday?.km ?? '');
  const [formMin, setFormMin] = useState(existingToday?.minutos ?? '');
  const [formCal, setFormCal] = useState(existingToday?.calorias ?? '');
  const [lastEdited, setLastEdited] = useState(null);
  const [saved, setSaved] = useState(!!existingToday);

  // Handlers de cambio con cálculo en tiempo real
  const onPasosChange = useCallback((val) => {
    const v = val === '' ? '' : clamp(Number(val) || 0, 0, 100000);
    setFormPasos(v);
    setLastEdited('pasos');
    setSaved(false);
    if (v !== '' && v > 0) {
      const km = calcKmFromPasos(v, zancada);
      setFormKm(km);
      const cal = (formMin && Number(formMin) > 0)
        ? calcCalFromMET(km, Number(formMin), pesoKg)
        : calcCalFromPasos(v, pesoKg);
      setFormCal(cal);
    }
  }, [zancada, pesoKg, formMin]);

  const onKmChange = useCallback((val) => {
    const v = val === '' ? '' : clamp(Number(val) || 0, 0, 80);
    setFormKm(v);
    setLastEdited('km');
    setSaved(false);
    if (v !== '' && v > 0) {
      const pasos = calcPasosFromKm(v, zancada);
      setFormPasos(pasos);
      const cal = (formMin && Number(formMin) > 0)
        ? calcCalFromMET(v, Number(formMin), pesoKg)
        : calcCalFromPasos(pasos, pesoKg);
      setFormCal(cal);
    }
  }, [zancada, pesoKg, formMin]);

  const onMinChange = useCallback((val) => {
    const v = val === '' ? '' : clamp(Number(val) || 0, 0, 600);
    setFormMin(v);
    setLastEdited('min');
    setSaved(false);
    if (v !== '' && v > 0 && formKm && Number(formKm) > 0) {
      const cal = calcCalFromMET(Number(formKm), v, pesoKg);
      setFormCal(cal);
    }
  }, [pesoKg, formKm]);

  const onCalChange = useCallback((val) => {
    const v = val === '' ? '' : clamp(Number(val) || 0, 0, 10000);
    setFormCal(v);
    setLastEdited('cal');
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    const p = Number(formPasos) || 0;
    const k = Number(formKm) || 0;
    const m = Number(formMin) || 0;
    const c = Number(formCal) || 0;
    if (p === 0 && k === 0 && m === 0) return;
    dispatch({
      type: 'UPDATE_PASOS',
      payload: { fecha: todayKey, data: { pasos: p, km: k, minutos: m, calorias: c } }
    });
    setSaved(true);
    // Toast feedback
    const msg = document.createElement('div');
    msg.textContent = `✅ Pasos guardados: ${p.toLocaleString()} pasos`;
    Object.assign(msg.style, {
      position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)',
      background: '#10b981', color: 'white', padding: '10px 20px', borderRadius: '12px',
      fontSize: '14px', fontWeight: '600', zIndex: '9999', transition: 'opacity 0.5s'
    });
    document.body.appendChild(msg);
    setTimeout(() => { msg.style.opacity = '0'; setTimeout(() => msg.remove(), 500); }, 2000);
  }, [formPasos, formKm, formMin, formCal, dispatch, todayKey]);

  // ── Datos de la semana (lunes a domingo) ──
  const weekData = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = d.toISOString().split('T')[0];
      return { fecha: key, ...(allPasos[key] || { pasos: 0, km: 0, minutos: 0, calorias: 0 }) };
    });
  }, [allPasos]);

  // Semana anterior para comparación
  const prevWeekData = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset - 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = d.toISOString().split('T')[0];
      return allPasos[key] || { pasos: 0, km: 0, minutos: 0, calorias: 0 };
    });
  }, [allPasos]);

  const weekTotals = useMemo(() => {
    const pasos = weekData.reduce((a, d) => a + (d.pasos || 0), 0);
    const km = weekData.reduce((a, d) => a + (d.km || 0), 0);
    const cal = weekData.reduce((a, d) => a + (d.calorias || 0), 0);
    const daysWithData = weekData.filter(d => d.pasos > 0).length;
    const avg = daysWithData > 0 ? Math.round(pasos / daysWithData) : 0;
    const prevPasos = prevWeekData.reduce((a, d) => a + (d.pasos || 0), 0);
    const prevDays = prevWeekData.filter(d => d.pasos > 0).length;
    const prevAvg = prevDays > 0 ? Math.round(prevPasos / prevDays) : 0;
    return { pasos, km: +km.toFixed(1), cal, avg, prevAvg, daysWithData };
  }, [weekData, prevWeekData]);

  // ── Historial completo ──
  const historial = useMemo(() =>
    Object.entries(allPasos)
      .map(([fecha, data]) => ({ fecha, ...data }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [allPasos]
  );

  // ── Estadísticas globales ──
  const globalStats = useMemo(() => {
    if (historial.length === 0) return null;
    const best = historial.reduce((a, b) => (b.pasos || 0) > (a.pasos || 0) ? b : a, historial[0]);
    const totalPasos = historial.reduce((a, d) => a + (d.pasos || 0), 0);
    const totalKm = historial.reduce((a, d) => a + (d.km || 0), 0);
    const totalCal = historial.reduce((a, d) => a + (d.calorias || 0), 0);
    const avg = Math.round(totalPasos / historial.length);
    return {
      bestDay: best,
      avg,
      totalKm: +totalKm.toFixed(1),
      totalCal,
      totalDays: historial.length
    };
  }, [historial]);

  // ── Borrar registro ──
  const handleDelete = useCallback((fecha) => {
    if (window.confirm(`¿Eliminar el registro del ${formatDate(fecha)}?`)) {
      dispatch({ type: 'DELETE_PASOS', payload: fecha });
    }
  }, [dispatch]);

  // ── Análisis IA semanal ──
  const analyzeWeek = useCallback(async () => {
    if (loadingAi) return;
    setLoadingAi(true);
    setAiResult(null);
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const avgPasos = weekTotals.avg;
    const nivel = avgPasos < 5000 ? 'sedentario' : avgPasos < 10000 ? 'activo' : 'muy activo';
    const prevAvg = weekTotals.prevAvg;
    const cambio = prevAvg > 0 ? (((avgPasos - prevAvg) / prevAvg) * 100).toFixed(0) : 'N/A';
    const bernabeuVueltas = (weekTotals.km / 0.58).toFixed(1); // perímetro ~580m

    const sys = `Eres un coach de actividad física. Responde en español, motivador, máx 200 palabras. Usa emojis.`;
    const msg = `Análisis semanal de pasos de ${prof.nombre || 'el usuario'}:
- Media diaria: ${avgPasos} pasos (nivel: ${nivel})
- Objetivo diario: ${objetivoPasos} pasos
- Semana anterior media: ${prevAvg} pasos (${cambio}% cambio)
- Total km esta semana: ${weekTotals.km} km
- Total calorías quemadas andando: ${weekTotals.cal} kcal
- Días registrados: ${weekTotals.daysWithData}/7
- Equivalencia: ${bernabeuVueltas} vueltas al estadio Santiago Bernabéu

Genera:
1. Evaluación del nivel de actividad (sedentario/activo/muy activo)
2. Comparativa con semana anterior
3. Impacto estimado en déficit calórico semanal
4. Recomendación personalizada
5. Equivalencia motivadora de distancia (ciudades españolas u objetos cotidianos)`;

    try {
      const text = await callAI(sys, msg, null, 'image/jpeg', abortRef.current.signal);
      setAiResult(text);
    } catch (e) {
      if (e.name !== 'AbortError') {
        setAiResult(`👟 Esta semana: ${weekTotals.pasos.toLocaleString()} pasos, ${weekTotals.km} km. Media: ${avgPasos} pasos/día. ${avgPasos >= objetivoPasos ? '¡Objetivo cumplido! 🎉' : 'Sigue sumando pasos, ¡cada uno cuenta! 💪'}`);
      }
    }
    setLoadingAi(false);
  }, [loadingAi, weekTotals, prof.nombre, objetivoPasos]);

  // Cleanup de AbortController
  React.useEffect(() => {
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  // ── Progreso de hoy para header ──
  const todayPasos = allPasos[todayKey]?.pasos || 0;
  const todayPct = Math.min((todayPasos / objetivoPasos) * 100, 100);
  const todayColor = todayPasos >= objetivoPasos ? '#10b981'
    : todayPasos >= objetivoPasos * 0.7 ? '#f59e0b' : '#64748b';

  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>👟 Mis Pasos</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: todayColor }}>{todayPasos.toLocaleString()}</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>/ {objetivoPasos.toLocaleString()} hoy</div>
        </div>
      </div>

      {/* Mini progress */}
      <ProgressBar value={todayPasos} max={objetivoPasos} h={6}
        color={todayPasos >= objetivoPasos
          ? 'linear-gradient(90deg,#10b981,#34d399)'
          : todayPasos >= objetivoPasos * 0.7
            ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
            : 'linear-gradient(90deg,#64748b,#94a3b8)'} />

      {/* Tabs */}
      <div className="tab-bar">
        {[['hoy', '📝 Hoy'], ['semana', '📊 Semana'], ['historial', '📋 Historial']].map(([t, l]) => (
          <button key={t} className={`tab-item ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>

      {/* ══════════ TAB HOY ══════════ */}
      {tab === 'hoy' && (
        <div className="card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {saved && existingToday && (
            <div className="badge badge-green" style={{ alignSelf: 'flex-start' }}>
              ✏️ Editando registro de hoy
            </div>
          )}

          {/* Pasos */}
          <div className="pasos-input-group">
            <label>👟 Pasos dados</label>
            <input className="input-field" type="number" inputMode="numeric"
              placeholder="ej: 8500"
              value={formPasos} onChange={e => onPasosChange(e.target.value)}
              min={0} max={100000} />
            {lastEdited && lastEdited !== 'pasos' && formPasos !== '' && (
              <div className="pasos-calc-hint">calculado automáticamente</div>
            )}
          </div>

          {/* Km */}
          <div className="pasos-input-group">
            <label>📍 Kilómetros andados</label>
            <input className="input-field" type="number" inputMode="decimal"
              placeholder="ej: 6.3" step="0.1"
              value={formKm} onChange={e => onKmChange(e.target.value)}
              min={0} max={80} />
            {lastEdited && lastEdited !== 'km' && formKm !== '' && (
              <div className="pasos-calc-hint">calculado automáticamente</div>
            )}
          </div>

          {/* Minutos */}
          <div className="pasos-input-group">
            <label>⏱️ Minutos andando</label>
            <input className="input-field" type="number" inputMode="numeric"
              placeholder="ej: 60"
              value={formMin} onChange={e => onMinChange(e.target.value)}
              min={0} max={600} />
          </div>

          {/* Calorías */}
          <div className="pasos-input-group">
            <label>🔥 Calorías quemadas</label>
            <input className="input-field" type="number" inputMode="numeric"
              placeholder="auto"
              value={formCal} onChange={e => onCalChange(e.target.value)}
              min={0} max={10000} />
            {lastEdited && lastEdited !== 'cal' && formCal !== '' && (
              <div className="pasos-calc-hint">
                {formMin && Number(formMin) > 0 ? 'calculado con fórmula MET' : 'calculado desde pasos'}
              </div>
            )}
          </div>

          {/* Preview en tiempo real */}
          {(formPasos || formKm) && (
            <div style={{
              display: 'flex', justifyContent: 'space-around', padding: '12px 0',
              borderTop: '1px solid #334155', borderBottom: '1px solid #334155'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>{Number(formPasos || 0).toLocaleString()}</div>
                <div style={{ fontSize: 10, color: '#64748b' }}>pasos</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#3b82f6' }}>{formKm || 0}</div>
                <div style={{ fontSize: 10, color: '#64748b' }}>km</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b' }}>{formMin || 0}</div>
                <div style={{ fontSize: 10, color: '#64748b' }}>min</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444' }}>{Number(formCal || 0).toLocaleString()}</div>
                <div style={{ fontSize: 10, color: '#64748b' }}>kcal</div>
              </div>
            </div>
          )}

          <button className="btn-primary" onClick={handleSave}
            disabled={!formPasos && !formKm}
            style={{ opacity: (!formPasos && !formKm) ? 0.5 : 1 }}>
            {saved ? '✅ Actualizar registro' : '💾 Guardar pasos de hoy'}
          </button>
        </div>
      )}

      {/* ══════════ TAB SEMANA ══════════ */}
      {tab === 'semana' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Gráfica de barras */}
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>📊 Últimos 7 días</div>
            <BarChart7 days={weekData} objetivo={objetivoPasos} />
          </div>

          {/* Totales */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div className="pasos-stat-card">
              <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>{weekTotals.pasos.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>pasos total</div>
            </div>
            <div className="pasos-stat-card">
              <div style={{ fontSize: 20, fontWeight: 800, color: '#3b82f6' }}>{weekTotals.km}</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>km total</div>
            </div>
            <div className="pasos-stat-card">
              <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444' }}>{weekTotals.cal.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>kcal quemadas</div>
            </div>
          </div>

          {/* Media y comparativa */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Media diaria</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: weekTotals.avg >= objetivoPasos ? '#10b981' : '#f1f5f9' }}>
                  {weekTotals.avg.toLocaleString()}
                </div>
              </div>
              {weekTotals.prevAvg > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#64748b' }}>vs semana anterior</div>
                  {(() => {
                    const diff = weekTotals.avg - weekTotals.prevAvg;
                    const pct = ((diff / weekTotals.prevAvg) * 100).toFixed(0);
                    return (
                      <div style={{ fontSize: 18, fontWeight: 700, color: diff >= 0 ? '#10b981' : '#ef4444' }}>
                        {diff >= 0 ? '↑' : '↓'} {Math.abs(Number(pct))}%
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* Botón IA */}
          <button className="btn-primary" onClick={analyzeWeek} disabled={loadingAi || weekTotals.daysWithData === 0}
            style={{
              background: loadingAi ? '#334155' : 'linear-gradient(135deg,#6366f1,#4f46e5)',
              opacity: weekTotals.daysWithData === 0 ? 0.5 : 1
            }}>
            {loadingAi ? '⏳ Analizando...' : '🤖 Analizar mi semana de pasos'}
          </button>
          {(loadingAi || aiResult) && <AICard text={aiResult} loading={loadingAi} />}
        </div>
      )}

      {/* ══════════ TAB HISTORIAL ══════════ */}
      {tab === 'historial' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Estadísticas globales */}
          {globalStats && (
            <div className="card" style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.08),rgba(99,102,241,0.04))', border: '1px solid rgba(16,185,129,0.2)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#10b981' }}>🏆 Estadísticas globales</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>Mejor día</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b' }}>{(globalStats.bestDay.pasos || 0).toLocaleString()}</div>
                  <div style={{ fontSize: 9, color: '#475569' }}>{formatDate(globalStats.bestDay.fecha)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>Media histórica</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{globalStats.avg.toLocaleString()}</div>
                  <div style={{ fontSize: 9, color: '#475569' }}>{globalStats.totalDays} días</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>Km acumulados</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#3b82f6' }}>{globalStats.totalKm}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>Kcal quemadas</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#ef4444' }}>{globalStats.totalCal.toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}

          {/* Lista de registros */}
          {historial.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>
              <div style={{ fontSize: 48 }}>👟</div>
              <div style={{ marginTop: 12, fontSize: 15 }}>Aún no hay registros</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Empieza registrando los pasos de hoy</div>
            </div>
          ) : (
            historial.map(entry => (
              <div key={entry.fecha} className="card"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>
                      {(entry.pasos || 0) >= objetivoPasos ? '🟢' : '🔴'}
                    </span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{formatDate(entry.fecha)}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {(entry.pasos || 0).toLocaleString()} pasos · {entry.km || 0} km · {(entry.calorias || 0).toLocaleString()} kcal
                      </div>
                    </div>
                  </div>
                </div>
                <button onClick={() => handleDelete(entry.fecha)}
                  style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                    color: '#ef4444', fontSize: 12, flexShrink: 0
                  }}>
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>
      )}
      <div style={{ height: 20 }} />
    </div>
  );
};
export default PasosDiarios;
