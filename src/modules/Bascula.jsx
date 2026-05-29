import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useApp } from '../context.jsx';
import { callAI, limitForPrompt } from '../utils/api.js';
import { today, formatDate } from '../utils/dates.js';
import { calcIMC, clasificarIMC } from '../utils/calculations.js';
import { validateNumericField } from '../utils/validation.js';
import LineChart from '../components/LineChart.jsx';
import Modal from '../components/Modal.jsx';
import AICard from '../components/AICard.jsx';

// Campos del formulario de medición — fuera del componente para evitar re-creación
const FORM_FIELDS = [
  { k: 'porcGrasa',   l: '🔴 % Grasa corporal',          validKey: 'porcGrasa' },
  { k: 'porcAgua',    l: '💧 % Agua corporal',            validKey: 'porcAgua' },
  { k: 'porcMusculo', l: '💪 % Músculo',                  validKey: 'porcMusculo' },
  { k: 'porcHueso',   l: '🦴 % Hueso',                    validKey: 'porcHueso' },
];

const METRIC_LABELS = {
  peso: '⚖️ Peso (kg)', porcGrasa: '🔴 Grasa (%)',
  porcMusculo: '💪 Músculo (%)', porcAgua: '💧 Agua (%)', imc: '📊 IMC'
};

// Clasificación IMC con colores y rangos
const IMC_INFO = [
  { label: 'Bajo peso',    range: '< 18.5',    color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  { label: 'Normal',       range: '18.5 – 24.9', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  { label: 'Sobrepeso',    range: '25 – 29.9',  color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  { label: 'Obesidad',     range: '≥ 30',       color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
];

const getImcColor = (imc) => {
  const v = Number(imc);
  if (v < 18.5) return { color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' };
  if (v < 25)   return { color: '#10b981', bg: 'rgba(16,185,129,0.15)' };
  if (v < 30)   return { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' };
  return               { color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
};

const Bascula = () => {
  const { state, dispatch } = useApp();
  const prof = state.profiles[state.perfil];
  const mediciones = state.mediciones[state.perfil];

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    fecha: today(), hora: new Date().toTimeString().slice(0, 5),
    peso: '', porcGrasa: '', porcAgua: '', porcMusculo: '', porcHueso: '', calorias: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [aiAnalisis, setAiAnalisis] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState('peso');
  const [periodo, setPeriodo] = useState('mes');
  const abortRef = useRef(null);

  const updf = useCallback((k, v) => {
    setForm(f => {
      const nf = { ...f, [k]: v };
      // Auto-calcular IMC cuando cambia el peso
      if (k === 'peso' && v && prof.altura) {
        nf.imc = String(calcIMC(Number(v), Number(prof.altura)));
      }
      return nf;
    });
    // Validar en tiempo real
    if (k !== 'fecha' && k !== 'hora') {
      const { error } = validateNumericField(k, v);
      setFormErrors(e => ({ ...e, [k]: error }));
    }
  }, [prof.altura]);

  const canSave = form.peso && !formErrors.peso && Number(form.peso) > 0;

  const handleSave = useCallback(async () => {
    if (!canSave || loadingAi) return;
    const nueva = {
      id: Date.now().toString(),
      fecha: form.fecha,
      hora: form.hora,
      peso: Number(form.peso),
      imc: form.imc || String(calcIMC(Number(form.peso), Number(prof.altura))),
      porcGrasa:   Number(form.porcGrasa)   || null,
      porcAgua:    Number(form.porcAgua)    || null,
      porcMusculo: Number(form.porcMusculo) || null,
      porcHueso:   Number(form.porcHueso)   || null,
      calorias:    Number(form.calorias)    || null
    };
    dispatch({ type: 'ADD_MEDICION', payload: nueva });
    setShowModal(false);
    setLoadingAi(true);
    setAiAnalisis(null);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const anterior = mediciones[0];
    const diff = anterior ? +(nueva.peso - anterior.peso).toFixed(1) : 0;
    // Limitamos historial en el prompt
    const recentMeds = limitForPrompt(mediciones, 5);
    const sys = state.perfil === 'mama'
      ? `Eres una nutricionista muy cariñosa. Hablas de forma simple y afectuosa. Máx 4 oraciones.`
      : `Eres un coach de salud experto. Español motivador. Máx 150 palabras.`;
    const msg = `Nueva medición: ${nueva.peso}kg el ${nueva.fecha}.
Anterior: ${anterior ? `${anterior.peso}kg el ${anterior.fecha}` : 'primera medición'}.
Diferencia: ${diff > 0 ? '+' : ''}${diff}kg.
Grasa: ${nueva.porcGrasa ?? '?'}%, Músculo: ${nueva.porcMusculo ?? '?'}%, Agua: ${nueva.porcAgua ?? '?'}%.
Objetivo: ${prof.pesoMeta}kg. Faltan ${(nueva.peso - Number(prof.pesoMeta)).toFixed(1)}kg.
Analiza de forma personalizada y motivadora.`;

    try {
      const text = await callAI(sys, msg, null, 'image/jpeg', abortRef.current.signal);
      setAiAnalisis(text);
      // Hitos de pérdida de peso
      const perdidoTotal = Number(prof.peso) - nueva.peso;
      const HITOS = [
        { kg: 1, emoji: '🌟', titulo: '¡Primer kilo!' },
        { kg: 3, emoji: '🏆', titulo: '¡3 kilos menos!' },
        { kg: 5, emoji: '🎉', titulo: '¡5 kilos menos!' },
        { kg: 10, emoji: '👑', titulo: '¡10 kilos menos!' },
      ];
      for (const h of HITOS) {
        const anteriorPerdido = anterior ? Number(prof.peso) - anterior.peso : 0;
        if (perdidoTotal >= h.kg && anteriorPerdido < h.kg) {
          const mText = await callAI(sys, `Mensaje de celebración muy corto (2 oraciones) para ${prof.nombre} que acaba de perder ${h.kg}kg.`, null, 'image/jpeg', abortRef.current.signal)
            .catch(() => `¡Increíble, ${prof.nombre}! ¡Sigue así!`);
          dispatch({ type: 'ADD_MILESTONE', payload: { ...h, mensaje: mText } });
          break;
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setAiAnalisis(diff < 0
          ? `¡Genial! Perdiste ${Math.abs(diff)}kg 🎉 Sigue con ese ritmo.`
          : diff > 0 ? `Subiste ${diff}kg. Puede ser retención de líquidos. Sin drama, sigue adelante.`
            : '¡Mantuviste el peso! Analiza tu hidratación y sigue con el plan.');
      }
    }
    setLoadingAi(false);
  }, [canSave, loadingAi, form, mediciones, prof, state.perfil, dispatch]);

  // chartData memoizado — no se recalcula en cada render
  const chartData = useMemo(() => {
    const all = [...mediciones].reverse();
    const cutoff = new Date();
    if (periodo === 'semana') cutoff.setDate(cutoff.getDate() - 7);
    else if (periodo === 'mes') cutoff.setDate(cutoff.getDate() - 30);
    else cutoff.setFullYear(2000);
    return all
      .filter(m => new Date(m.fecha + 'T00:00:00') >= cutoff)
      .map(m => ({ valor: m[selectedMetric] || m.peso, fecha: m.fecha }))
      .filter(m => m.valor != null);
  }, [mediciones, selectedMetric, periodo]);

  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>⚖️ Báscula</div>
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 18px', fontSize: 14 }}
          onClick={() => setShowModal(true)}>
          + Nueva
        </button>
      </div>

      {/* Análisis IA */}
      {(loadingAi || aiAnalisis) && (
        <AICard text={aiAnalisis} loading={loadingAi} color="#10b981" />
      )}

      {/* Gráfica con selector de métrica y período */}
      {mediciones.length > 0 && (
        <div className="card">
          {/* Selector métrica */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 12 }}>
            {Object.entries(METRIC_LABELS).map(([k, l]) => (
              <button key={k} className={`tab-item ${selectedMetric === k ? 'active' : ''}`}
                style={{ whiteSpace: 'nowrap', minWidth: 'fit-content', fontSize: 11 }}
                onClick={() => setSelectedMetric(k)}>{l}</button>
            ))}
          </div>
          {/* Selector período */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {[['semana','7d'],['mes','30d'],['todo','Todo']].map(([p, label]) => (
              <button key={p} onClick={() => setPeriodo(p)} style={{
                padding: '4px 12px', borderRadius: 8,
                border: `1px solid ${periodo === p ? '#10b981' : '#334155'}`,
                background: periodo === p ? 'rgba(16,185,129,0.1)' : 'transparent',
                color: periodo === p ? '#10b981' : '#64748b', cursor: 'pointer', fontSize: 12
              }}>{label}</button>
            ))}
          </div>
          <LineChart data={chartData} label={selectedMetric} />
        </div>
      )}

      {/* Historial */}
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>Historial</div>
      {mediciones.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>
          <div style={{ fontSize: 48 }}>⚖️</div>
          <div style={{ marginTop: 12, fontSize: 15 }}>Aún no tienes mediciones</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Añade tu primera medición</div>
          <button className="btn-primary" style={{ marginTop: 16, width: 'auto', padding: '10px 24px' }}
            onClick={() => setShowModal(true)}>
            + Primera medición
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {mediciones.map((m, i) => {
            const prev = mediciones[i + 1];
            const delta = prev ? +(m.peso - prev.peso).toFixed(1) : null;
            return (
              <div key={m.id || m.fecha+m.hora} className="card animate-fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{formatDate(m.fecha)}</div>
                      <button onClick={() => {
                        if (confirm('¿Borrar esta medición?')) {
                          dispatch({ type: 'DELETE_MEDICION', payload: m.id || m.fecha + m.hora });
                        }
                      }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 4px', fontSize: 12 }} aria-label="Borrar">
                        🗑️
                      </button>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, marginTop: 2 }}>
                      {m.peso} <span style={{ fontSize: 14, color: '#64748b', fontWeight: 400 }}>kg</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {delta !== null && (
                      <div style={{ fontSize: 18, fontWeight: 700, color: delta < 0 ? '#10b981' : delta > 0 ? '#ef4444' : '#64748b' }}>
                        {delta < 0 ? '↓' : delta > 0 ? '↑' : '='} {Math.abs(delta)} kg
                      </div>
                    )}
                    {m.imc && (() => {
                      const { color } = getImcColor(m.imc);
                      const cat = clasificarIMC(m.imc);
                      return (
                        <div style={{ fontSize: 12 }}>
                          <span style={{ color: '#64748b' }}>IMC </span>
                          <span style={{ fontWeight: 700, color }}>{m.imc}</span>
                          <span style={{ color: '#475569' }}> · {cat}</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
                {(m.porcGrasa || m.porcMusculo || m.porcAgua || m.porcHueso) && (
                  <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                    {m.porcGrasa   && <span style={{ fontSize: 11, color: '#ef4444' }}>🔴 {m.porcGrasa}%</span>}
                    {m.porcMusculo && <span style={{ fontSize: 11, color: '#10b981' }}>💪 {m.porcMusculo}%</span>}
                    {m.porcAgua    && <span style={{ fontSize: 11, color: '#3b82f6' }}>💧 {m.porcAgua}%</span>}
                    {m.porcHueso   && <span style={{ fontSize: 11, color: '#f59e0b' }}>🦴 {m.porcHueso}%</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal nueva medición */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nueva Medición">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>Fecha</label>
              <input className="input-field" type="date" value={form.fecha}
                onChange={e => updf('fecha', e.target.value)}
                max={today()} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>Hora</label>
              <input className="input-field" type="time" value={form.hora}
                onChange={e => updf('hora', e.target.value)} />
            </div>
          </div>

          {/* Peso obligatorio */}
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>⚖️ Peso (kg) *</label>
            <input className="input-field" type="number" inputMode="decimal" placeholder="80.5"
              value={form.peso} onChange={e => updf('peso', e.target.value)} />
            {formErrors.peso && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>⚠ {formErrors.peso}</div>}
          </div>

          {/* IMC calculado con clasificación */}
          {form.peso && prof.altura && (() => {
            const imc = calcIMC(Number(form.peso), Number(prof.altura));
            const cat = clasificarIMC(imc);
            const { color, bg } = getImcColor(imc);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="card" style={{ background: bg, padding: '10px 14px', border: `1px solid ${color}44` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>📊 IMC calculado</span>
                    <span style={{ fontSize: 22, fontWeight: 800, color }}>{imc}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color, marginTop: 2 }}>{cat}</div>
                </div>
                {/* Tabla de rangos de referencia */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {IMC_INFO.map(({ label, range, color: c, bg: b }) => (
                    <div key={label} style={{
                      padding: '6px 10px', borderRadius: 8,
                      background: cat === label ? b : 'transparent',
                      border: `1px solid ${cat === label ? c : '#334155'}`,
                      opacity: cat === label ? 1 : 0.5
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: cat === label ? c : '#64748b' }}>{label}</div>
                      <div style={{ fontSize: 10, color: '#475569' }}>{range}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Campos opcionales con validación */}
          {FORM_FIELDS.map(({ k, l, validKey }) => (
            <div key={k}>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>{l}</label>
              <input className="input-field" type="number" inputMode="decimal"
                value={form[k]} onChange={e => updf(k, e.target.value)} />
              {formErrors[k] && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>⚠ {formErrors[k]}</div>}
            </div>
          ))}

          <button className="btn-primary" onClick={handleSave} disabled={!canSave || loadingAi}
            style={{ opacity: !canSave || loadingAi ? 0.5 : 1 }}>
            {loadingAi ? '⏳ Guardando...' : '💾 Guardar medición'}
          </button>
        </div>
      </Modal>
      <div style={{ height: 20 }} />
    </div>
  );
};
export default Bascula;
