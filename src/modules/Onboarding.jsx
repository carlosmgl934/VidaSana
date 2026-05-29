import React, { useState, useCallback, useRef } from 'react';
import { useApp } from '../context.jsx';
import { defaultProfile } from '../store/initialState.js';
import { calcAge, calcIMC, calcTDEE, calcDeficit, calcMacros } from '../utils/calculations.js';
import { validateNumericField } from '../utils/validation.js';
import { callAI } from '../utils/api.js';
import AICard from '../components/AICard.jsx';
import Skeleton from '../components/Skeleton.jsx';
import Toggle from '../components/Toggle.jsx';

// ── Constantes fuera del componente: no se recrean en cada render ──
const ACTIVITY_LEVELS = [
  { v: 'sedentario', l: '🛋️ Sedentario', d: 'Trabajo de oficina, poco movimiento' },
  { v: 'ligero',     l: '🚶 Ligero',     d: '1-3 días de ejercicio/semana' },
  { v: 'moderado',   l: '🏃 Moderado',   d: '3-5 días de ejercicio/semana' },
  { v: 'activo',     l: '💪 Activo',     d: '6-7 días de ejercicio/semana' },
  { v: 'muy_activo', l: '🔥 Muy activo', d: 'Atleta o trabajo físico intenso' },
];

const MEASUREMENT_FIELDS = [
  { k: 'peso',       label: 'Peso actual (kg) *', placeholder: '80',  required: true, validKey: 'peso' },
  { k: 'porcGrasa',  label: '% Grasa corporal',   placeholder: '25',  validKey: 'porcGrasa' },
  { k: 'porcAgua',   label: '% Agua corporal',    placeholder: '55',  validKey: 'porcAgua' },
  { k: 'porcMusculo',label: '% Músculo',           placeholder: '35',  validKey: 'porcMusculo' },
  { k: 'porcHueso',  label: '% Hueso',             placeholder: '3.5', validKey: 'porcHueso' },
];

// ── Step indicator ──
const OnboardingStep = React.memo(({ step, total, children, title, subtitle }) => (
  <div className="onboarding-step" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className={`step-indicator ${i <= step ? 'active' : ''}`}
            style={{ background: i < step ? '#10b981' : i === step ? '#10b981' : '#334155' }} />
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Paso {step + 1} de {total}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{title}</div>
      {subtitle && <div style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>{subtitle}</div>}
    </div>
    {children}
  </div>
));
OnboardingStep.displayName = 'OnboardingStep';

// ── Field error display ──
const FieldError = ({ message }) =>
  message ? <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>⚠ {message}</div> : null;

const Onboarding = () => {
  const { state, dispatch } = useApp();
  const isMama = state.perfil === 'mama';
  const totalSteps = isMama ? 3 : 4;
  const [step, setStep] = useState(0);

  // ── FIX BUG CRÍTICO: SIEMPRE arrancar con defaultProfile limpio ──
  // Si el perfil NO ha completado onboarding, el formulario empieza vacío.
  // Esto evita que datos de otro perfil se filtren al onboarding.
  const [form, setForm] = useState(() => {
    const current = state.profiles[state.perfil];
    if (current.onboardingCompleto) {
      // Onboarding ya completado — cargar datos existentes (no debería pasar, pero por seguridad)
      return { ...current };
    }
    // Onboarding nuevo — formulario completamente vacío
    return { ...defaultProfile, sexo: isMama ? 'mujer' : 'hombre' };
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [analisis, setAnalisis] = useState(null);
  const abortRef = useRef(null);

  const updateForm = useCallback((k, v) => setForm(f => ({ ...f, [k]: v })), []);

  const validateField = useCallback((k, v) => {
    const { error } = validateNumericField(k, v);
    setErrors(e => ({ ...e, [k]: error }));
    return !error;
  }, []);

  const canNext = () => {
    if (step === 0) return form.nombre?.trim() && form.fechaNacimiento && form.altura;
    if (step === 1) return form.peso && !errors.peso && !errors.porcGrasa && !errors.porcAgua && !errors.porcMusculo && !errors.porcHueso;
    if (step === 2) return form.pesoMeta && !errors.pesoMeta;
    return true;
  };

  // ── Volver al selector de perfil sin borrar datos ──
  const goBackToSelector = useCallback(() => {
    dispatch({ type: 'LOAD_STATE', payload: { ...state, perfilSeleccionado: false } });
  }, [state, dispatch]);

  const generateAnalisis = async (formData) => {
    setLoading(true);
    abortRef.current = new AbortController();
    const tdee = calcTDEE(formData);
    const deficit = calcDeficit(Number(formData.peso), Number(formData.pesoMeta));
    const objetivo = Math.max(tdee - deficit, 1200);
    const macros = calcMacros(formData.peso, objetivo);
    const imc = calcIMC(Number(formData.peso), Number(formData.altura));
    const edad = calcAge(formData.fechaNacimiento);

    const sys = `Eres un nutricionista y entrenador personal experto. Respondes siempre en español, con tono cálido, motivador y profesional. Usas emojis con moderación.`;
    const msg = `Genera un Análisis Inicial Personalizado para ${formData.nombre}, ${edad} años, ${formData.sexo}.
Datos: Peso ${formData.peso}kg, Altura ${formData.altura}cm, IMC ${imc}, Grasa ${formData.porcGrasa || 'no indicada'}%
Objetivo: bajar a ${formData.pesoMeta}kg. TDEE: ${tdee} kcal, Déficit: ${deficit} kcal, Objetivo: ${objetivo} kcal.
Macros: Proteína ${macros.proteina}g, Carbos ${macros.carbos}g, Grasa ${macros.grasa}g.
Incluye: diagnóstico IMC, calorías objetivo, pérdida semanal realista, fecha estimada, plan de macros, mensaje motivador.
Máximo 280 palabras. Usa saltos de línea entre secciones.`;

    const payload = {
      ...formData,
      calorias_objetivo: objetivo,
      deficit,
      macros,
      imc: String(imc),
      onboardingCompleto: true
    };

    try {
      const text = await callAI(sys, msg, null, 'image/jpeg', abortRef.current.signal);
      setAnalisis(text);
      dispatch({ type: 'COMPLETE_ONBOARDING', payload: { ...payload, analisisInicial: text } });
    } catch (e) {
      if (e.name === 'AbortError') return;
      const fallback = `¡Hola ${formData.nombre}! 🎉\n\nIMC: ${imc} — objetivo calórico diario: ~${objetivo} kcal (déficit ${deficit} kcal).\n\nMacros sugeridos: ${macros.proteina}g proteína | ${macros.carbos}g carbos | ${macros.grasa}g grasa\n\n¡Tú puedes lograrlo! 💪`;
      setAnalisis(fallback);
      dispatch({ type: 'COMPLETE_ONBOARDING', payload: { ...payload, analisisInicial: fallback } });
    }
    setLoading(false);
  };

  const handleNext = async () => {
    // NO guardamos datos parciales al estado global — solo al completar
    if (step < totalSteps - 1) {
      setStep(s => s + 1);
    } else {
      // Último paso: guardar todo y generar análisis
      dispatch({ type: 'UPDATE_PROFILE', payload: form });
      await generateAnalisis(form);
    }
  };

  // Pantalla post-análisis
  if (analisis || loading) {
    const p = state.profiles[state.perfil];
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100dvh' }}>
        <div style={{ fontSize: 28, fontWeight: 800, textAlign: 'center' }}>✨ Tu Análisis</div>
        {loading ? (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 20, color: '#6366f1', fontWeight: 600 }}>
              La IA está analizando tu perfil…
            </div>
            <AICard loading />
            <div style={{ marginTop: 16 }}><Skeleton h={12} w="80%" /></div>
            <div style={{ marginTop: 8 }}><Skeleton h={12} w="60%" /></div>
          </div>
        ) : (
          <>
            <AICard text={analisis} color="#10b981" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { icon: '🔥', label: 'Objetivo', value: `${p.calorias_objetivo} kcal` },
                { icon: '📉', label: 'Déficit',  value: `−${p.deficit} kcal` },
                { icon: '🥩', label: 'Proteína', value: `${p.macros?.proteina ?? 0}g` },
                { icon: '⚡', label: 'Carbos',   value: `${p.macros?.carbos ?? 0}g` },
              ].map(item => (
                <div key={item.label} className="card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24 }}>{item.icon}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981', marginTop: 2 }}>{item.value}</div>
                </div>
              ))}
            </div>
            <button className="btn-primary" onClick={() => dispatch({ type: 'SET_TAB', payload: 'dashboard' })}>
              ¡Empezar mi viaje! 🚀
            </button>
          </>
        )}
      </div>
    );
  }

  // IMC calculado en tiempo real
  const imcCalc = form.peso && form.altura ? calcIMC(Number(form.peso), Number(form.altura)) : '';

  // ── Estilo del botón de retroceso (texto gris sutil) ──
  const backBtnStyle = {
    background: 'none', border: 'none', color: '#64748b',
    fontSize: 14, cursor: 'pointer', padding: '4px 0',
    display: 'flex', alignItems: 'center', gap: 4
  };

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column', padding: 24,
      background: 'linear-gradient(180deg, #0f172a 0%, #1a1f35 100%)'
    }}>
      {/* ── Botón de retroceso arriba ── */}
      <div style={{ marginBottom: 8, minHeight: 28 }}>
        {step === 0 ? (
          <button style={backBtnStyle} onClick={goBackToSelector}>
            ← Volver al inicio
          </button>
        ) : (
          <button style={backBtnStyle} onClick={() => setStep(s => s - 1)}>
            ← Anterior
          </button>
        )}
      </div>

      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 28 }}>💚</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>
          {isMama ? 'Perfil de Mamá' : 'Tu perfil'}
        </div>
      </div>

      {/* Paso 0: Datos personales */}
      {step === 0 && (
        <OnboardingStep step={0} total={totalSteps} title="Cuéntame sobre ti"
          subtitle="Necesito estos datos para personalizarlo todo">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>
                ¿Cómo te llamas? *
              </label>
              <input className="input-field" placeholder="Tu nombre" value={form.nombre}
                onChange={e => updateForm('nombre', e.target.value)} maxLength={50} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Sexo</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {['hombre', 'mujer'].map(s => (
                  <button key={s} type="button" onClick={() => updateForm('sexo', s)} style={{
                    flex: 1, padding: '12px', borderRadius: 12,
                    border: `2px solid ${form.sexo === s ? '#10b981' : '#334155'}`,
                    background: form.sexo === s ? 'rgba(16,185,129,0.1)' : '#0f172a',
                    color: form.sexo === s ? '#10b981' : '#64748b', cursor: 'pointer',
                    fontWeight: 600, transition: 'all 0.2s'
                  }}>
                    {s === 'hombre' ? '👨 Hombre' : '👩 Mujer'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>
                Fecha de nacimiento{form.fechaNacimiento && ` (${calcAge(form.fechaNacimiento)} años)`}
              </label>
              <input className="input-field" type="date" value={form.fechaNacimiento}
                onChange={e => updateForm('fechaNacimiento', e.target.value)}
                max={new Date().toISOString().split('T')[0]} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Estatura (cm) *</label>
              <input className="input-field" type="number" inputMode="numeric" placeholder="170"
                value={form.altura}
                onChange={e => { updateForm('altura', e.target.value); validateField('altura', e.target.value); }}
              />
              <FieldError message={errors.altura} />
            </div>
          </div>
        </OnboardingStep>
      )}

      {/* Paso 1: Mediciones */}
      {step === 1 && (
        <OnboardingStep step={1} total={totalSteps} title="Mediciones actuales"
          subtitle="Datos de tu báscula inteligente">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* IMC calculado automáticamente */}
            {imcCalc && (
              <div className="card" style={{ background: 'rgba(16,185,129,0.08)', padding: 12 }}>
                <span style={{ fontSize: 13, color: '#10b981' }}>📊 IMC calculado: <strong>{imcCalc}</strong></span>
              </div>
            )}
            {MEASUREMENT_FIELDS.map(({ k, label, placeholder, validKey }) => (
              <div key={k}>
                <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>{label}</label>
                <input className="input-field" type="number" inputMode="decimal" placeholder={placeholder}
                  value={form[k]}
                  onChange={e => { updateForm(k, e.target.value); validateField(validKey, e.target.value); }} />
                <FieldError message={errors[k]} />
              </div>
            ))}
          </div>
        </OnboardingStep>
      )}

      {/* Paso 2: Objetivo */}
      {step === 2 && (
        <OnboardingStep step={2} total={totalSteps} title="Tu objetivo" subtitle="¿A dónde quieres llegar?">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Peso meta (kg) *</label>
              <input className="input-field" type="number" inputMode="decimal" placeholder="70" value={form.pesoMeta}
                onChange={e => { updateForm('pesoMeta', e.target.value); validateField('pesoMeta', e.target.value); }} />
              <FieldError message={errors.pesoMeta} />
              {form.peso && form.pesoMeta && Number(form.peso) > Number(form.pesoMeta) && (
                <div style={{ marginTop: 8, fontSize: 13, color: '#10b981' }}>
                  Meta: perder {(Number(form.peso) - Number(form.pesoMeta)).toFixed(1)} kg 🎯
                </div>
              )}
              {form.peso && form.pesoMeta && Number(form.pesoMeta) >= Number(form.peso) && (
                <div style={{ marginTop: 8, fontSize: 13, color: '#f59e0b' }}>
                  ⚠ El peso meta debe ser menor al peso actual
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Fecha límite (opcional)</label>
              <input className="input-field" type="date" value={form.fechaMeta}
                onChange={e => updateForm('fechaMeta', e.target.value)}
                min={new Date().toISOString().split('T')[0]} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Nivel de actividad</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ACTIVITY_LEVELS.map(({ v, l, d }) => (
                  <button key={v} type="button" onClick={() => updateForm('actividad', v)} style={{
                    padding: '12px 16px', borderRadius: 12,
                    border: `1.5px solid ${form.actividad === v ? '#10b981' : '#334155'}`,
                    background: form.actividad === v ? 'rgba(16,185,129,0.1)' : '#0f172a',
                    color: form.actividad === v ? '#10b981' : '#94a3b8',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s'
                  }}>
                    <div style={{ fontWeight: 600 }}>{l}</div>
                    <div style={{ fontSize: 12, marginTop: 2, opacity: 0.7 }}>{d}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </OnboardingStep>
      )}

      {/* Paso 3: Suplementos (solo Yo) */}
      {step === 3 && !isMama && (
        <OnboardingStep step={3} total={4} title="Suplementos" subtitle="¿Tomas algún suplemento actualmente?">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[
              { k: 'tomaProteina', dk: 'dosisProteina', label: '🥤 Proteína', desc: 'Whey, caseína, proteína vegetal…', def: 30, unit: 'g/día' },
              { k: 'tomaCreatina', dk: 'dosisCreatina', label: '⚡ Creatina', desc: 'Creatina monohidrato u otras formas', def: 5, unit: 'g/día' },
            ].map(({ k, dk, label, desc, def, unit }) => (
              <div key={k} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{desc}</div>
                  </div>
                  <Toggle value={!!form[k]} onChange={v => updateForm(k, v)} />
                </div>
                {form[k] && (
                  <div style={{ marginTop: 14 }}>
                    <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>
                      Dosis diaria ({unit})
                    </label>
                    <input className="input-field" type="number" inputMode="numeric"
                      placeholder={def} value={form[dk]}
                      onChange={e => updateForm(dk, Number(e.target.value))} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </OnboardingStep>
      )}

      {/* Botón Siguiente (abajo) */}
      <div style={{ marginTop: 'auto', paddingTop: 24 }}>
        <button
          type="button"
          onClick={handleNext}
          disabled={!canNext()}
          style={{
            width: '100%',
            background: canNext() ? 'linear-gradient(135deg, #10b981, #059669)' : '#334155',
            color: 'white', border: 'none', borderRadius: 12, padding: '14px 24px',
            fontWeight: 600, fontSize: 16, cursor: canNext() ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s', opacity: canNext() ? 1 : 0.5
          }}
        >
          {step === totalSteps - 1 ? '🚀 Generar mi plan' : 'Siguiente →'}
        </button>
      </div>
    </div>
  );
};
export default Onboarding;
