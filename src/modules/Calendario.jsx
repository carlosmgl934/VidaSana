import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useApp } from '../context.jsx';
import { callAI } from '../utils/api.js';
import { today, formatDate, WEEKDAY_NAMES, MONTH_NAMES } from '../utils/dates.js';
import Toggle from '../components/Toggle.jsx';
import Stepper from '../components/Stepper.jsx';
import AICard from '../components/AICard.jsx';

const Calendario = () => {
  const { state, dispatch } = useApp();
  const isMama = state.perfil === 'mama';
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [aiGym, setAiGym] = useState(null);
  const [loadingAiGym, setLoadingAiGym] = useState(false);
  const abortRef = useRef(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const todayKey = today();

  // Funciones puras para colores y dots — memoizadas a través del objeto de logs
  const getDayColor = useCallback((dateStr) => {
    const log = state.dayLogs[state.perfil][dateStr];
    if (!log) return '#1e293b';
    const hasGym = log.actividad === 'gym';
    const dietaOk = log.dieta === 'completa';
    const dietaParcial = log.dieta === 'parcial';
    const supOk = isMama || (log.proteinaTomada && log.creatinaTomada);
    if (hasGym && dietaOk && (isMama || supOk)) return '#064e3b';
    if (dietaOk && !hasGym) return '#065f46';
    if ((hasGym || log.actividad === 'paseo') && dietaParcial) return '#78350f';
    if (!hasGym && log.dieta === 'rota') return '#7c2d12';
    if (log.agua > 0 || log.dieta) return '#1e3a5f';
    return '#1e293b';
  }, [state.dayLogs, state.perfil, isMama]);

  const getDayDots = useCallback((dateStr) => {
    const log = state.dayLogs[state.perfil][dateStr];
    if (!log) return [];
    const dots = [];
    if (log.actividad === 'gym') dots.push('#10b981');
    if (log.actividad === 'paseo') dots.push('#3b82f6');
    if (log.dieta === 'completa') dots.push('#34d399');
    else if (log.dieta === 'parcial') dots.push('#f59e0b');
    else if (log.dieta === 'rota') dots.push('#ef4444');
    if (!isMama && log.proteinaTomada) dots.push('#6366f1');
    if (log.agua >= 6) dots.push('#60a5fa');
    // Pasos: dot cyan si alcanzó objetivo
    const pasosDay = state.pasos?.[state.perfil]?.[dateStr];
    const objPasos = state.profiles[state.perfil]?.objetivoPasos || 10000;
    if (pasosDay?.pasos >= objPasos) dots.push('#22d3ee');
    return dots.slice(0, 5);
  }, [state.dayLogs, state.perfil, isMama, state.pasos, state.profiles]);

  const selLog = selectedDay ? (state.dayLogs[state.perfil][selectedDay] || {}) : {};

  const updateSelLog = useCallback((data) => {
    if (!selectedDay) return;
    dispatch({ type: 'UPDATE_DAY_LOG', payload: { fecha: selectedDay, data } });
  }, [dispatch, selectedDay]);

  const getGymSuggestion = useCallback(async (nota) => {
    if (!nota || nota.length < 3 || loadingAiGym) return;
    setLoadingAiGym(true);
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const sys = `Eres un entrenador personal. Responde en español. Máx 100 palabras.`;
    const msg = `Alguien va a entrenar "${nota}" hoy. Sugiere 3-4 ejercicios básicos con series y repeticiones para principiante/intermedio.`;
    try {
      const text = await callAI(sys, msg, null, 'image/jpeg', abortRef.current.signal);
      setAiGym(text);
    } catch (e) {
      if (e.name !== 'AbortError') {
        setAiGym(`Para ${nota}: 3-4 ejercicios compuestos, 3 series × 10-12 reps. ¡A por ello! 💪`);
      }
    }
    setLoadingAiGym(false);
  }, [loadingAiGym]);

  // Resumen semanal — memoizado
  const weekSummary = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - start.getDay() + 1);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d.toISOString().split('T')[0];
    });
    const pasosTotal = days.reduce((a, d) => a + (state.pasos?.[state.perfil]?.[d]?.pasos || 0), 0);
    return {
      gymWeek: days.filter(d => state.dayLogs[state.perfil][d]?.actividad === 'gym').length,
      dietaWeek: days.filter(d => state.dayLogs[state.perfil][d]?.dieta === 'completa').length,
      pasosWeek: pasosTotal,
    };
  }, [state.dayLogs, state.perfil, state.pasos]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {/* Resumen semanal */}
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>📊 Esta semana</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981' }}>{weekSummary.gymWeek}/7</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>🏋️ Gym</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#34d399' }}>{weekSummary.dietaWeek}/7</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>🥗 Dieta</div>
            </div>
            {!isMama && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#22d3ee' }}>{weekSummary.pasosWeek.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>👟 Pasos</div>
              </div>
            )}
          </div>
        </div>

        {/* Navegación del mes */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn-icon" onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1))}>‹</button>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{MONTH_NAMES[month]} {year}</div>
          <button className="btn-icon" onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1))}>›</button>
        </div>

        {/* Headers días */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {WEEKDAY_NAMES.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, color: '#475569', padding: '4px 0' }}>{d}</div>
          ))}
        </div>

        {/* Grid del mes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {Array.from({ length: firstWeekday }).map((_, i) => <div key={`e-${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === todayKey;
            const isSelected = dateStr === selectedDay;
            const dots = getDayDots(dateStr);
            return (
              <div key={day} className={`cal-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                style={{ background: getDayColor(dateStr) }}
                onClick={() => setSelectedDay(isSelected ? null : dateStr)}>
                <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 400, color: isToday ? '#10b981' : '#e2e8f0' }}>
                  {day}
                </div>
                <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 2 }}>
                  {dots.map((c, idx) => (
                    <div key={idx} style={{ width: 4, height: 4, borderRadius: '50%', background: c }} />
                  ))}
                </div>
                {/* Indicador de pasos */}
                {!isMama && (() => {
                  const pd = state.pasos?.[state.perfil]?.[dateStr];
                  const obj = state.profiles[state.perfil]?.objetivoPasos || 10000;
                  if (!pd) return null;
                  return (
                    <div style={{ fontSize: 8, marginTop: 1, opacity: pd.pasos >= obj ? 1 : 0.4 }}>
                      👟
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* Panel del día seleccionado */}
        {selectedDay && (
          <div className="card animate-scale-in">
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
              📅 {formatDate(selectedDay)}
            </div>

            {/* Gym */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>🏋️ Gym</div>
                <Toggle value={selLog.actividad === 'gym'}
                  onChange={v => { updateSelLog({ actividad: v ? 'gym' : 'descanso' }); setAiGym(null); }} />
              </div>
              {selLog.actividad === 'gym' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={{ fontSize: 11, color: '#64748b' }}>Entrada</label>
                      <input className="input-field" type="time" style={{ padding: '8px', marginTop: 4 }}
                        value={selLog.gymEntrada || ''} onChange={e => updateSelLog({ gymEntrada: e.target.value })} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={{ fontSize: 11, color: '#64748b' }}>Salida</label>
                      <input className="input-field" type="time" style={{ padding: '8px', marginTop: 4 }}
                        value={selLog.gymSalida || ''} onChange={e => updateSelLog({ gymSalida: e.target.value })} />
                    </div>
                  </div>
                  {selLog.gymEntrada && selLog.gymSalida && (
                    <div style={{ fontSize: 12, color: '#10b981' }}>
                      ⏱️ {Math.max(0, Math.round((new Date(`1970-01-01T${selLog.gymSalida}`) - new Date(`1970-01-01T${selLog.gymEntrada}`)) / 60000))} min
                    </div>
                  )}
                  <div>
                    <label style={{ fontSize: 11, color: '#64748b' }}>¿Qué entrené?</label>
                    <input className="input-field" style={{ padding: '8px', marginTop: 4 }}
                      placeholder="piernas, pecho, cardio..."
                      value={selLog.gymNota || ''}
                      onChange={e => updateSelLog({ gymNota: e.target.value })}
                      onBlur={e => getGymSuggestion(e.target.value)} />
                  </div>
                  {(loadingAiGym || aiGym) && (
                    <AICard text={aiGym} loading={loadingAiGym} color="#10b981" />
                  )}
                </div>
              )}
            </div>

            {/* Paseo */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>🚶 Paseo / Cardio</div>
                <Toggle value={selLog.actividad === 'paseo'}
                  onChange={v => updateSelLog({ actividad: v ? 'paseo' : 'descanso' })} />
              </div>
              {selLog.actividad === 'paseo' && (
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 11, color: '#64748b' }}>Km recorridos</label>
                  <input className="input-field" type="number" style={{ padding: '8px', marginTop: 4, width: '100%' }}
                    placeholder="Ej. 4.5"
                    value={selLog.paseoDistancia || ''} onChange={e => updateSelLog({ paseoDistancia: Number(e.target.value) })} />
                </div>
              )}
            </div>

            {/* Dieta */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>🥗 Dieta</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['completa','✅','Respetada','#10b981'],['parcial','⚠️','Parcial','#f59e0b'],['rota','❌','Rota','#ef4444']].map(([v, emoji, l, c]) => (
                  <button key={v} onClick={() => updateSelLog({ dieta: v })} style={{
                    flex: 1, padding: '8px 4px', borderRadius: 10,
                    border: `1.5px solid ${selLog.dieta === v ? c : '#334155'}`,
                    background: selLog.dieta === v ? `${c}22` : 'transparent',
                    cursor: 'pointer', fontSize: 12, color: selLog.dieta === v ? c : '#64748b'
                  }}>{emoji} {l}</button>
                ))}
              </div>
              {selLog.dieta === 'rota' && (
                <input className="input-field" style={{ padding: '8px', marginTop: 8, fontSize: 13 }}
                  placeholder="¿Qué comiste de más? (sin juicio 😊)"
                  value={selLog.dietaNota || ''} onChange={e => updateSelLog({ dietaNota: e.target.value })} />
              )}
            </div>

            {/* Suplementos — solo Yo */}
            {!isMama && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>💊 Suplementos</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <Toggle value={!!selLog.proteinaTomada} onChange={v => updateSelLog({ proteinaTomada: v })} />
                    <span style={{ fontSize: 13 }}>🥤 Proteína</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <Toggle value={!!selLog.creatinaTomada} onChange={v => updateSelLog({ creatinaTomada: v })} />
                    <span style={{ fontSize: 13 }}>⚡ Creatina</span>
                  </label>
                </div>
              </div>
            )}

            {/* Agua */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>💧 Agua</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Stepper value={selLog.agua || 0} onChange={v => updateSelLog({ agua: v })} max={20} />
                <div style={{ fontSize: 12, color: '#64748b' }}>vasos</div>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                {Array.from({ length: 8 }, (_, i) => (
                  <span key={i}
                    className={`glass-icon ${i < (selLog.agua || 0) ? 'filled' : ''}`}
                    onClick={() => updateSelLog({ agua: i + 1 })}
                    style={{ cursor: 'pointer' }}>💧</span>
                ))}
              </div>
            </div>

            {/* Bienestar */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>😴 Bienestar</div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                {[['bien','😊'],['neutro','😐'],['mal','😞']].map(([v, emoji]) => (
                  <button key={v} onClick={() => updateSelLog({ estadoAnimo: v })} style={{
                    flex: 1, padding: '10px', borderRadius: 10,
                    border: `1.5px solid ${selLog.estadoAnimo === v ? '#10b981' : '#334155'}`,
                    background: selLog.estadoAnimo === v ? 'rgba(16,185,129,0.1)' : 'transparent',
                    cursor: 'pointer', fontSize: 22
                  }}>{emoji}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: '#64748b' }}>Sueño (h)</label>
                  <input className="input-field" type="number" style={{ padding: '8px', marginTop: 4 }}
                    min="0" max="24"
                    value={selLog.horasSueno || ''} onChange={e => updateSelLog({ horasSueno: Number(e.target.value) })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: '#64748b' }}>Calidad ⭐</label>
                  <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                    {[1,2,3,4,5].map(s => (
                      <span key={s} className={`star ${s <= (selLog.calidadSueno || 0) ? 'active' : ''}`}
                        onClick={() => updateSelLog({ calidadSueno: s })} style={{ fontSize: 18, cursor: 'pointer' }}>⭐</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>



            {/* Nota */}
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>📝 Nota del día</div>
              <textarea className="input-field" rows={3}
                placeholder="¿Cómo te sientes? ¿Algo importante hoy?"
                value={selLog.nota || ''} onChange={e => updateSelLog({ nota: e.target.value.slice(0, 500) })}
                style={{ resize: 'none' }} />
            </div>
          </div>
        )}
        <div style={{ height: 20 }} />
      </div>
    </div>
  );
};
export default Calendario;
