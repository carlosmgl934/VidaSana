import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useApp } from '../context.jsx';
import { today, WEEKDAY_NAMES } from '../utils/dates.js';

// Constantes fuera del componente
const TAGS = ['proteica','ligera','vegetariana','rápida','italiana','mediterránea','casera','especial'];
const EMOJIS = ['🍽️','🥗','🍝','🥩','🐟','🥚','🥘','🍲','🥙','🫔','🌮','🥣'];
const DEFAULT_FORM = { nombre: '', descripcion: '', calorias: '', tags: [], vecesMax: 3, emoji: '🍽️' };

// Calcula los días de la semana actual — memoizado fuera del componente es suficiente
function getWeekDays() {
  const days = [];
  const start = new Date();
  start.setDate(start.getDate() - start.getDay() + 1);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push({ date: d.toISOString().split('T')[0], label: WEEKDAY_NAMES[d.getDay()] });
  }
  return days;
}

const Cenas = () => {
  const { state, dispatch } = useApp();
  const [tab, setTab] = useState('inventario');
  const [showModal, setShowModal] = useState(false);
  const [editCena, setEditCena] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const spinRef = useRef(null);
  const todayKey = today();

  // weekDays calculado una sola vez al montar
  const weekDays = useMemo(getWeekDays, []);

  const openAdd = useCallback(() => {
    setForm({ ...DEFAULT_FORM });
    setEditCena(null);
    setShowModal(true);
  }, []);

  const openEdit = useCallback((c) => {
    setForm({ ...c });
    setEditCena(c);
    setShowModal(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!form.nombre?.trim()) return;
    if (editCena) {
      dispatch({ type: 'UPDATE_CENA', payload: { ...form, id: editCena.id } });
    } else {
      dispatch({ type: 'ADD_CENA', payload: { ...form, id: Date.now() } });
    }
    setShowModal(false);
  }, [form, editCena, dispatch]);

  const handleDelete = useCallback((id) => {
    dispatch({ type: 'DELETE_CENA', payload: id });
  }, [dispatch]);

  const generateWeek = useCallback(() => {
    if (state.cenas.length < 3) return;
    setSpinning(true);
    if (spinRef.current) clearTimeout(spinRef.current);
    spinRef.current = setTimeout(() => {
      const plan = {};
      const usageCount = {};
      state.cenas.forEach(c => { usageCount[c.id] = 0; });
      let lastUsed = null;
      for (const day of weekDays) {
        // Prioridad: cenas que no han alcanzado vecesMax Y no son la última usada
        let available = state.cenas.filter(c =>
          usageCount[c.id] < (c.vecesMax || 3) && c.id !== lastUsed
        );
        // Fallback 1: ignorar restricción lastUsed
        if (available.length === 0) {
          available = state.cenas.filter(c => usageCount[c.id] < (c.vecesMax || 3));
        }
        // Fallback 2: ignorar vecesMax (último recurso)
        if (available.length === 0) {
          available = state.cenas.filter(c => c.id !== lastUsed);
        }
        if (available.length === 0) available = [...state.cenas];
        const chosen = available[Math.floor(Math.random() * available.length)];
        plan[day.date] = { cena: chosen, confirmada: false };
        usageCount[chosen.id] = (usageCount[chosen.id] || 0) + 1;
        lastUsed = chosen.id;
      }
      dispatch({ type: 'SET_PLAN_SEMANAL', payload: plan });
      setSpinning(false);
    }, 1500);
  }, [state.cenas, weekDays, dispatch]);

  const changeDay = useCallback((date) => {
    if (state.cenas.length === 0) return;
    const current = state.planSemanal[date]?.cena;
    const others = state.cenas.filter(c => c.id !== current?.id);
    const pool = others.length > 0 ? others : state.cenas;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    dispatch({ type: 'SET_PLAN_SEMANAL', payload: { [date]: { cena: chosen, confirmada: false } } });
  }, [state.cenas, state.planSemanal, dispatch]);

  const confirmDay = useCallback((date) => {
    const existing = state.planSemanal[date];
    if (existing) dispatch({ type: 'SET_PLAN_SEMANAL', payload: { [date]: { ...existing, confirmada: true } } });
  }, [state.planSemanal, dispatch]);

  const toggleTag = useCallback((t) => {
    setForm(f => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t] }));
  }, []);

  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>🍽️ Ruleta de Cenas</div>
      <div className="tab-bar">
        {['inventario','planificador'].map(t => (
          <button key={t} className={`tab-item ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'inventario' ? '📋 Inventario' : '🎰 Planificador'}
          </button>
        ))}
      </div>

      {/* INVENTARIO */}
      {tab === 'inventario' && (
        <>
          <button className="btn-primary" onClick={openAdd}>+ Añadir cena</button>
          {state.cenas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>
              <div style={{ fontSize: 48 }}>🍽️</div>
              <div style={{ marginTop: 12, fontSize: 15 }}>Sin cenas guardadas</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Añade tus cenas favoritas</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {state.cenas.map(cena => (
                <div key={cena.id} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ fontSize: 32, flexShrink: 0 }}>{cena.emoji || '🍽️'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cena.nombre}</div>
                    {cena.descripcion && (
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cena.descripcion}</div>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {cena.calorias && <span className="badge badge-amber" style={{ fontSize: 10 }}>{cena.calorias} kcal</span>}
                      <span className="badge badge-indigo" style={{ fontSize: 10 }}>max {cena.vecesMax}×/sem</span>
                      {(cena.tags || []).map(t => (
                        <span key={t} className="badge" style={{ background: '#1e293b', color: '#64748b', fontSize: 10 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    <button className="btn-icon" style={{ fontSize: 14, padding: 8 }} onClick={() => openEdit(cena)}>✏️</button>
                    <button className="btn-icon" style={{ fontSize: 14, padding: 8, borderColor: '#ef4444' }}
                      onClick={() => handleDelete(cena.id)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* PLANIFICADOR */}
      {tab === 'planificador' && (
        <>
          <button className="btn-primary" onClick={generateWeek} disabled={spinning || state.cenas.length < 3}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: spinning || state.cenas.length < 3 ? '#334155' : 'linear-gradient(135deg,#6366f1,#4f46e5)',
              color: 'white', border: 'none', borderRadius: 12, padding: 14,
              fontSize: 16, fontWeight: 600,
              cursor: spinning || state.cenas.length < 3 ? 'not-allowed' : 'pointer',
              opacity: state.cenas.length < 3 ? 0.5 : 1
            }}>
            <span className={spinning ? 'roulette-spin' : ''}>🎰</span>
            {spinning ? 'Generando...' : '¡Generar mi semana!'}
          </button>

          {state.cenas.length < 3 && (
            <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: 12, fontSize: 13, color: '#f59e0b' }}>
              ⚠️ Añade al menos 3 cenas para poder generar la semana ({state.cenas.length}/3)
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {weekDays.map(({ date, label }) => {
              const plan = state.planSemanal[date];
              return (
                <div key={date} className="card" style={{
                  border: plan?.confirmada ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.04)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, color: date === todayKey ? '#10b981' : '#94a3b8', fontWeight: date === todayKey ? 700 : 400 }}>
                      {label} {date === todayKey ? '(hoy)' : ''}
                    </div>
                    {plan?.confirmada && <span className="badge badge-green" style={{ fontSize: 10 }}>✅ Confirmada</span>}
                  </div>
                  {plan?.cena ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                      <div style={{ fontSize: 28, flexShrink: 0 }}>{plan.cena.emoji || '🍽️'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plan.cena.nombre}</div>
                        {plan.cena.calorias && <div style={{ fontSize: 12, color: '#64748b' }}>~{plan.cena.calorias} kcal</div>}
                      </div>
                      {!plan.confirmada && (
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button className="btn-icon" style={{ fontSize: 14, padding: 8 }} onClick={() => changeDay(date)}>🔄</button>
                          <button className="btn-icon" style={{ fontSize: 14, padding: 8, borderColor: '#10b981' }} onClick={() => confirmDay(date)}>✅</button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: '#475569', fontSize: 13, marginTop: 8 }}>Sin planificar</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal add/edit cena */}
      {/* Modal add/edit cena */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editCena ? 'Editar cena' : 'Nueva cena'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Emoji */}
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>Emoji</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {EMOJIS.map(e => (
                <button key={e} type="button" onClick={() => setForm(f => ({ ...f, emoji: e }))} style={{
                  fontSize: 22, padding: '8px', borderRadius: 8,
                  border: `2px solid ${form.emoji === e ? '#10b981' : '#334155'}`,
                  background: form.emoji === e ? 'rgba(16,185,129,0.1)' : '#0f172a', cursor: 'pointer'
                }}>{e}</button>
              ))}
            </div>
          </div>
          {/* Nombre */}
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>Nombre *</label>
            <input className="input-field" placeholder="ej: Tortilla de patatas ligera"
              value={form.nombre} maxLength={80}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          {/* Descripción */}
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>Descripción</label>
            <input className="input-field" placeholder="Descripción breve"
              value={form.descripcion} maxLength={200}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </div>
          {/* Calorías */}
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>Calorías aproximadas</label>
            <input className="input-field" type="number" inputMode="numeric" placeholder="350"
              value={form.calorias} onChange={e => setForm(f => ({ ...f, calorias: e.target.value }))} />
          </div>
          {/* Veces máximo */}
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>
              Máximo veces/semana: {form.vecesMax}
            </label>
            <input type="range" min={1} max={7} value={form.vecesMax}
              onChange={e => setForm(f => ({ ...f, vecesMax: Number(e.target.value) }))}
              style={{ width: '100%', accentColor: '#10b981' }} />
          </div>
          {/* Tags */}
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 8 }}>Tags</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TAGS.map(t => (
                <button key={t} type="button" className={`tag-chip ${(form.tags || []).includes(t) ? 'selected' : ''}`}
                  onClick={() => toggleTag(t)}>{t}</button>
              ))}
            </div>
          </div>
          <button className="btn-primary" onClick={handleSave} disabled={!form.nombre?.trim()}>
            💾 Guardar
          </button>
        </div>
      </Modal>
      <div style={{ height: 20 }} />
    </div>
  );
};
export default Cenas;
