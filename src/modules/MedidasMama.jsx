import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useApp } from '../context.jsx';
import { callAI, limitForPrompt } from '../utils/api.js';
import { today, formatDate } from '../utils/dates.js';
import { calcAge } from '../utils/calculations.js';
import LineChart from '../components/LineChart.jsx';
import AICard from '../components/AICard.jsx';

// ── Constantes de validación ──
const RANGES = {
  cintura: { min: 50, max: 150, label: 'Cintura' },
  cadera:  { min: 30, max: 200, label: 'Cadera' },
  pecho:   { min: 30, max: 200, label: 'Pecho' },
  muslo:   { min: 30, max: 200, label: 'Muslo' },
  brazo:   { min: 15, max: 200, label: 'Brazo' },
};

const MIN_DAYS_BETWEEN = 5;

// ── Hitos de cintura ──
const CINTURA_MILESTONES = [
  { cm: 1,  emoji: '🎉', titulo: '¡Primer centímetro!',   mensaje: 'Has perdido tu primer centímetro de cintura. ¡El cambio ha empezado!' },
  { cm: 3,  emoji: '🔥', titulo: '¡3 cm menos!',          mensaje: 'Tu cintura se está transformando. ¡Sigue así!' },
  { cm: 5,  emoji: '🏆', titulo: '¡5 cm perdidos!',       mensaje: '¡Medio palmo de cintura menos! Eso ya se nota en la ropa.' },
  { cm: 10, emoji: '👑', titulo: '¡10 cm — Increíble!',   mensaje: '¡Has perdido 10 cm de cintura! Eres una máquina.' },
];

const validateField = (key, value) => {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  if (isNaN(num)) return 'Introduce un número válido';
  const r = RANGES[key];
  if (!r) return null;
  if (num < r.min) return `Mínimo ${r.min} cm`;
  if (num > r.max) return `Máximo ${r.max} cm`;
  return null;
};

const MedidasMama = () => {
  const { state, dispatch } = useApp();
  const prof = state.profiles[state.perfil];
  const medidas = state.medidasCorporales?.[state.perfil] || [];
  const mediciones = state.mediciones[state.perfil]; // peso

  const [tab, setTab] = useState('registrar');
  const [chartMetric, setChartMetric] = useState('cintura');
  const [showExtra, setShowExtra] = useState(false);
  const [form, setForm] = useState({ fecha: today(), cintura: '', cadera: '', pecho: '', muslo: '', brazo: '', nota: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // guard against double-click
  const [aiResult, setAiResult] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const abortRef = useRef(null);

  // Cleanup AbortController on unmount
  React.useEffect(() => {
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  // ── Datos derivados (memoizados) ──
  const ultima = useMemo(() => medidas[0] || null, [medidas]);
  const primera = useMemo(() => medidas[medidas.length - 1] || null, [medidas]);
  const penultima = useMemo(() => medidas[1] || null, [medidas]);

  const deltaVsAnterior = useMemo(() => {
    if (!ultima || !penultima) return null;
    return Number((ultima.cintura - penultima.cintura).toFixed(1));
  }, [ultima, penultima]);

  const deltaTotal = useMemo(() => {
    if (!ultima || !primera || medidas.length < 2) return null;
    return Number((ultima.cintura - primera.cintura).toFixed(1));
  }, [ultima, primera, medidas.length]);

  const daysSinceLast = useMemo(() => {
    if (!ultima) return Infinity;
    const diff = (new Date() - new Date(ultima.fecha + 'T00:00:00')) / (1000 * 60 * 60 * 24);
    return Math.floor(diff);
  }, [ultima]);

  const canMeasure = daysSinceLast >= MIN_DAYS_BETWEEN || medidas.length === 0;

  // Datos para gráficas (memoizados)
  const chartData = useMemo(() => {
    const key = chartMetric;
    return [...medidas].filter(m => m[key] != null).reverse().map(m => ({
      valor: m[key], fecha: m.fecha
    }));
  }, [medidas, chartMetric]);

  const availableMetrics = useMemo(() => {
    const metrics = ['cintura'];
    if (medidas.some(m => m.cadera)) metrics.push('cadera');
    if (medidas.some(m => m.pecho)) metrics.push('pecho');
    if (medidas.some(m => m.muslo)) metrics.push('muslo');
    if (medidas.some(m => m.brazo)) metrics.push('brazo');
    return metrics;
  }, [medidas]);

  const METRIC_LABELS = { cintura: '📏 Cintura', cadera: '🍑 Cadera', pecho: '👗 Pecho', muslo: '🦵 Muslo', brazo: '💪 Brazo' };
  const METRIC_COLORS = { cintura: '#10b981', cadera: '#6366f1', pecho: '#f59e0b', muslo: '#3b82f6', brazo: '#ec4899' };

  // ── Validar y guardar ──
  const handleSave = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;

    // Validar fecha no futura
    if (form.fecha > today()) {
      setErrors({ fecha: 'No puedes poner una fecha futura' });
      savingRef.current = false;
      return;
    }

    // Validar cintura obligatoria
    if (!form.cintura || form.cintura === '') {
      setErrors({ cintura: 'La cintura es obligatoria' });
      savingRef.current = false;
      return;
    }

    // Validar rangos
    const newErrors = {};
    for (const key of Object.keys(RANGES)) {
      if (form[key] !== '' && form[key] !== null && form[key] !== undefined) {
        const err = validateField(key, form[key]);
        if (err) newErrors[key] = err;
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      savingRef.current = false;
      return;
    }

    setSaving(true);
    setErrors({});

    // Lista de hitos ya celebrados (para no repetir)
    const celebrados = new Set((state.milestones || []).map(m => m.titulo));

    const medida = {
      id: Date.now(),
      fecha: form.fecha,
      cintura: Number(form.cintura),
      cadera: form.cadera ? Number(form.cadera) : null,
      pecho: form.pecho ? Number(form.pecho) : null,
      muslo: form.muslo ? Number(form.muslo) : null,
      brazo: form.brazo ? Number(form.brazo) : null,
      nota: (form.nota || '').trim().slice(0, 300),
      analisisIA: null,
    };

    // Guardar inmediatamente
    dispatch({ type: 'ADD_MEDIDA_CORPORAL', payload: medida });

    // Comprobar hitos de cintura
    const allMedidas = [medida, ...medidas];
    const primeraM = allMedidas[allMedidas.length - 1];
    if (primeraM && allMedidas.length >= 2) {
      const cmPerdidos = primeraM.cintura - medida.cintura;
      for (const hito of CINTURA_MILESTONES) {
        // No repetir hitos ya celebrados
        if (celebrados.has(hito.titulo)) continue;
        const cmPerdidosAntes = penultima ? primeraM.cintura - penultima.cintura : 0;
        if (cmPerdidos >= hito.cm && cmPerdidosAntes < hito.cm) {
          dispatch({ type: 'ADD_MILESTONE', payload: hito });
          break;
        }
      }
    }

    // ── Análisis de IA ──
    setLoadingAi(true);
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const recentMedidas = limitForPrompt(allMedidas, 8);
    const pesoActual = mediciones.length > 0 ? mediciones[0].peso : prof.peso;
    const edad = calcAge(prof.fechaNacimiento);
    const deltaTxt = penultima
      ? `La medición anterior fue ${penultima.cintura} cm (${formatDate(penultima.fecha)}). Diferencia: ${(medida.cintura - penultima.cintura).toFixed(1)} cm.`
      : 'Es su primera medición.';
    const pesoCinturaTxt = mediciones.length > 1
      ? `Peso anterior: ${mediciones[1]?.peso || '?'}kg → actual: ${pesoActual}kg.`
      : '';

    const sys = `Eres una entrenadora personal cariñosa y cercana. Hablas como si fueras su amiga de confianza. Sin tecnicismos. En español. Máx 4 oraciones. Usa emojis.`;
    const msg = `Analiza la medida de cintura de ${prof.nombre || 'la usuaria'}:
- Cintura hoy: ${medida.cintura} cm
- ${deltaTxt}
- Historial cintura: ${recentMedidas.map(m => `${m.cintura}cm (${m.fecha})`).join(', ')}
- Edad: ${edad} años, peso actual: ${pesoActual}kg, objetivo: ${prof.pesoMeta || '?'}kg
- ${pesoCinturaTxt}
${medida.nota ? `Nota de la usuaria: "${medida.nota}"` : ''}

Comenta el progreso de cintura: si bajó celebra, si se mantuvo tranquiliza, si subió da posibles causas (retención, sodio, ciclo) sin drama. Relaciona cintura con peso si hay datos.`;

    try {
      const text = await callAI(sys, msg, null, 'image/jpeg', abortRef.current.signal);
      setAiResult(text);
      dispatch({ type: 'UPDATE_MEDIDA_IA', payload: { id: medida.id, analisisIA: text } });
    } catch (e) {
      if (e.name !== 'AbortError') {
        const fallback = medida.cintura < (penultima?.cintura || Infinity)
          ? `📏 ¡Genial! Tu cintura bajó. Cada centímetro cuenta, ¡sigue así! 💪`
          : `📏 Tu cintura se mantiene estable. Es normal, el cuerpo necesita tiempo. ¡No te desanimes! 💕`;
        setAiResult(fallback);
        dispatch({ type: 'UPDATE_MEDIDA_IA', payload: { id: medida.id, analisisIA: fallback } });
      }
    }
    setLoadingAi(false);
    setSaving(false);
    savingRef.current = false;

    // Reset form
    setForm({ fecha: today(), cintura: '', cadera: '', pecho: '', muslo: '', brazo: '', nota: '' });
    setTab('historial');
  }, [form, medidas, penultima, mediciones, prof, state.milestones, dispatch]);

  const handleDelete = useCallback((id) => {
    if (!window.confirm('¿Borrar esta medición?')) return;
    dispatch({ type: 'DELETE_MEDIDA_CORPORAL', payload: id });
  }, [dispatch]);

  // ── Calcular delta para histórico ──
  const getDelta = useCallback((medida, index) => {
    const next = medidas[index + 1]; // la anterior cronológicamente
    if (!next) return null;
    return Number((medida.cintura - next.cintura).toFixed(1));
  }, [medidas]);

  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>📏 Medidas Corporales</div>

      <div className="tab-bar">
        {[['registrar', '📏 Medir'], ['historial', '📊 Historial']].map(([t, l]) => (
          <button key={t} className={`tab-item ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>

      {/* ════ TAB: REGISTRAR ════ */}
      {tab === 'registrar' && (
        <>
          {/* Resumen actual */}
          {ultima && (
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Cintura actual</div>
              <div style={{ fontSize: 48, fontWeight: 800, color: '#10b981' }}>
                {ultima.cintura} <span style={{ fontSize: 20, fontWeight: 400 }}>cm</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 8 }}>
                {deltaVsAnterior !== null && (
                  <div>
                    <span style={{ color: deltaVsAnterior <= 0 ? '#10b981' : '#ef4444', fontWeight: 700, fontSize: 16 }}>
                      {deltaVsAnterior <= 0 ? '↓' : '↑'} {Math.abs(deltaVsAnterior)} cm
                    </span>
                    <div style={{ fontSize: 10, color: '#475569' }}>vs anterior</div>
                  </div>
                )}
                {deltaTotal !== null && (
                  <div>
                    <span style={{ color: deltaTotal <= 0 ? '#10b981' : '#ef4444', fontWeight: 700, fontSize: 16 }}>
                      {deltaTotal <= 0 ? '↓' : '↑'} {Math.abs(deltaTotal)} cm
                    </span>
                    <div style={{ fontSize: 10, color: '#475569' }}>total</div>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 8 }}>
                Última medición: {formatDate(ultima.fecha)}
              </div>
            </div>
          )}

          {/* Aviso si demasiado pronto */}
          {!canMeasure && (
            <div style={{
              background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 12, padding: 14, fontSize: 13, color: '#f59e0b', textAlign: 'center'
            }}>
              Las medidas cambian despacio, espera unos días para ver resultados reales 💪
              <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>
                Podrás medir de nuevo en {MIN_DAYS_BETWEEN - daysSinceLast} día(s)
              </div>
            </div>
          )}

          {/* Formulario */}
          {canMeasure && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Nueva medición</div>

              {/* Fecha */}
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>Fecha</label>
                <input className="input-field" type="date" max={today()}
                  value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                {errors.fecha && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{errors.fecha}</div>}
              </div>

              {/* Cintura (destacado) */}
              <div style={{ background: 'rgba(16,185,129,0.06)', borderRadius: 12, padding: 14, border: '1px solid rgba(16,185,129,0.2)' }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#10b981', display: 'block', marginBottom: 8 }}>📏 Cintura (cm) *</label>
                <input className="input-field" type="number" inputMode="decimal"
                  placeholder="ej: 85" style={{ fontSize: 22, fontWeight: 700, textAlign: 'center' }}
                  value={form.cintura}
                  onChange={e => { setForm(f => ({ ...f, cintura: e.target.value })); setErrors(er => ({ ...er, cintura: null })); }} />
                {errors.cintura && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{errors.cintura}</div>}
                <div style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>
                  Mide a la altura del ombligo, sin apretar
                </div>
              </div>

              {/* Toggle para campos extra */}
              <button type="button" onClick={() => setShowExtra(!showExtra)} style={{
                background: 'none', border: '1px solid #334155', borderRadius: 10,
                padding: '10px 14px', color: '#94a3b8', cursor: 'pointer', fontSize: 13,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <span>{showExtra ? '▾' : '▸'} Ver más medidas (opcional)</span>
              </button>

              {showExtra && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} className="animate-fade-in">
                  {[['cadera', '🍑 Cadera'], ['pecho', '👗 Pecho'], ['muslo', '🦵 Muslo derecho'], ['brazo', '💪 Brazo derecho']].map(([key, label]) => (
                    <div key={key}>
                      <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>{label} (cm)</label>
                      <input className="input-field" type="number" inputMode="decimal" placeholder="Opcional"
                        value={form[key]} onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setErrors(er => ({ ...er, [key]: null })); }} />
                      {errors[key] && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{errors[key]}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Nota */}
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>📝 Nota (opcional)</label>
                <input className="input-field" placeholder='ej: "después del periodo", "mucha sal esta semana"'
                  value={form.nota} maxLength={300}
                  onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} />
              </div>

              <button className="btn-primary" onClick={handleSave}
                disabled={saving || !form.cintura}
                style={{ opacity: saving || !form.cintura ? 0.5 : 1 }}>
                {saving ? '⏳ Guardando...' : '💾 Guardar medición'}
              </button>
            </div>
          )}

          {/* Análisis de IA */}
          {(loadingAi || aiResult) && (
            <AICard text={aiResult} loading={loadingAi} color="#ec4899" />
          )}
        </>
      )}

      {/* ════ TAB: HISTORIAL ════ */}
      {tab === 'historial' && (
        <>
          {medidas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>
              <div style={{ fontSize: 48 }}>📏</div>
              <div style={{ marginTop: 12, fontSize: 15 }}>Sin medidas registradas</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Pulsa "Medir" para empezar</div>
            </div>
          ) : (
            <>
              {/* Tabs de métricas para gráfica */}
              {availableMetrics.length > 1 && (
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                  {availableMetrics.map(m => (
                    <button key={m} onClick={() => setChartMetric(m)}
                      className={`tag-chip ${chartMetric === m ? 'selected' : ''}`}
                      style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                      {METRIC_LABELS[m]}
                    </button>
                  ))}
                </div>
              )}

              {/* Gráfica */}
              <div className="card">
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                  {METRIC_LABELS[chartMetric] || '📏 Cintura'} — Evolución
                </div>
                <LineChart data={chartData} color={METRIC_COLORS[chartMetric] || '#10b981'} label={`${chartMetric} (cm)`} />
              </div>

              {/* Histórico */}
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>📋 Registro</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {medidas.map((m, idx) => {
                  const delta = getDelta(m, idx);
                  return (
                    <div key={m.id} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 60 }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981' }}>{m.cintura}</div>
                        <div style={{ fontSize: 10, color: '#475569' }}>cm</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{formatDate(m.fecha)}</div>
                        {delta !== null && (
                          <div style={{ fontSize: 12, color: delta <= 0 ? '#10b981' : '#ef4444', marginTop: 2 }}>
                            {delta <= 0 ? '↓' : '↑'} {Math.abs(delta)} cm vs anterior
                          </div>
                        )}
                        {m.nota && (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            📝 {m.nota}
                          </div>
                        )}
                        {m.analisisIA && (
                          <details style={{ marginTop: 6 }}>
                            <summary style={{ fontSize: 11, color: '#6366f1', cursor: 'pointer' }}>🤖 Ver análisis IA</summary>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                              {m.analisisIA}
                            </div>
                          </details>
                        )}
                      </div>
                      <button className="btn-icon" style={{ fontSize: 14, padding: 8, borderColor: '#ef4444', flexShrink: 0 }}
                        onClick={() => handleDelete(m.id)}>🗑️</button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
      <div style={{ height: 40 }} />
    </div>
  );
};
export default MedidasMama;
