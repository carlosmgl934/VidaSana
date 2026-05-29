import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useApp } from '../context.jsx';
import { callAI, parseAIJson, isValidBase64, limitForPrompt } from '../utils/api.js';
import { today, formatDate } from '../utils/dates.js';
import { calcTDEE, calcIMC, calcAge } from '../utils/calculations.js';
import DonutChart from '../components/DonutChart.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import AICard from '../components/AICard.jsx';
import TypingIndicator from '../components/TypingIndicator.jsx';

// Colores de valoración — constante fuera del componente
const VALOR_COLORS = {
  excelente: '#10b981', bueno: '#34d399', aceptable: '#f59e0b',
  mejorable: '#f97316', malo: '#ef4444'
};

// Sugerencias de chat para Mamá — fuera del componente
const CHAT_SUGGESTIONS = [
  '¿Qué debería cenar esta noche?',
  '¿Voy bien con mi progreso?',
  '¿Qué puedo comer para bajar de peso?',
  'Dame un consejo de motivación'
];

const MacroResult = React.memo(({ result, onAddToLog }) => {
  if (!result) return null;
  const color = VALOR_COLORS[result.valoracion] || '#94a3b8';
  const macroRows = [
    { l: 'Proteína', v: result.proteina_g, max: 50, color: '#10b981' },
    { l: 'Carbos', v: result.carbohidratos_g, max: 100, color: '#f59e0b' },
    { l: 'Grasa', v: result.grasas_g, max: 50, color: '#6366f1' },
    { l: 'Fibra', v: result.fibra_g, max: 25, color: '#3b82f6' },
  ];
  return (
    <div className="card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.nombre_plato}</div>
          {result.descripcion && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{result.descripcion}</div>}
        </div>
        <span className="badge" style={{ background: `${color}22`, color, flexShrink: 0, marginLeft: 8 }}>{result.valoracion}</span>
      </div>
      <div style={{ fontSize: 36, fontWeight: 800, color: '#10b981', textAlign: 'center' }}>
        {result.calorias} kcal
      </div>
      {macroRows.map(({ l, v, max, color: c }) => (
        <div key={l}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: '#94a3b8' }}>{l}</span>
            <span style={{ fontWeight: 600 }}>{v}g</span>
          </div>
          <ProgressBar value={v} max={max} h={6}
            color={`linear-gradient(90deg, ${c}, ${c}aa)`} />
        </div>
      ))}
      {result.consejo && (
        <div style={{ background: 'rgba(99,102,241,0.1)', borderRadius: 10, padding: 12, fontSize: 13, color: '#a5b4fc' }}>
          💡 {result.consejo}
        </div>
      )}
      {result.alertas?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {result.alertas.map((a, i) => (
            <div key={i} style={{ fontSize: 12, color: '#f59e0b' }}>⚠️ {a}</div>
          ))}
        </div>
      )}
      {result.alternativas_saludables?.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Alternativas más saludables:</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {result.alternativas_saludables.map((a, i) => (
              <span key={i} className="tag-chip" style={{ fontSize: 11 }}>{a}</span>
            ))}
          </div>
        </div>
      )}
      <button className="btn-primary" onClick={onAddToLog}>
        ➕ Añadir al log de hoy
      </button>
    </div>
  );
});
MacroResult.displayName = 'MacroResult';

// ── Calculadora de calorías + Biblioteca de alimentos ──
const TabCalcular = React.memo(() => {
  const { state, dispatch } = useApp();
  const [nombre, setNombre] = useState('');
  const [kcalPor100, setKcalPor100] = useState('');
  const [gramos, setGramos] = useState('');
  const [guardandoNombre, setGuardandoNombre] = useState('');
  const [showGuardar, setShowGuardar] = useState(false);

  const alimentosGuardados = state.alimentosGuardados?.[state.perfil] || [];

  // Cálculo en tiempo real
  const totalKcal = useMemo(() => {
    const k = Number(kcalPor100);
    const g = Number(gramos);
    if (!k || !g) return null;
    return Math.round((k * g) / 100);
  }, [kcalPor100, gramos]);

  // Seleccionar alimento de la biblioteca → pre-rellena nombre y kcal/100g
  const handleSelect = useCallback((alimento) => {
    setNombre(alimento.nombre);
    setKcalPor100(String(alimento.kcalPor100g));
    setGramos('');
  }, []);

  // Añadir al log de hoy
  const handleAddToLog = useCallback(() => {
    if (!totalKcal) return;
    dispatch({
      type: 'ADD_COMIDA', payload: {
        nombre: nombre || `Alimento (${kcalPor100} kcal/100g)`,
        calorias: totalKcal,
        proteina: 0, carbos: 0, grasa: 0,
        hora: new Date().toTimeString().slice(0, 5)
      }
    });
    // Toast
    const msg = document.createElement('div');
    msg.textContent = `✅ ${nombre || 'Alimento'}: ${totalKcal} kcal añadidas`;
    Object.assign(msg.style, {
      position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)',
      background: '#10b981', color: 'white', padding: '10px 20px', borderRadius: '12px',
      fontSize: '14px', fontWeight: '600', zIndex: '9999', transition: 'opacity 0.5s'
    });
    document.body.appendChild(msg);
    setTimeout(() => { msg.style.opacity = '0'; setTimeout(() => msg.remove(), 500); }, 2000);
    setGramos('');
  }, [totalKcal, nombre, kcalPor100, dispatch]);

  // Guardar en biblioteca
  const handleGuardar = useCallback(() => {
    const n = (guardandoNombre || nombre).trim();
    const k = Number(kcalPor100);
    if (!n || !k) return;
    dispatch({
      type: 'ADD_ALIMENTO_GUARDADO',
      payload: { id: Date.now(), nombre: n, kcalPor100g: k }
    });
    setShowGuardar(false);
    setGuardandoNombre('');
  }, [guardandoNombre, nombre, kcalPor100, dispatch]);

  const handleDelete = useCallback((id) => {
    dispatch({ type: 'DELETE_ALIMENTO_GUARDADO', payload: id });
  }, [dispatch]);

  const colorKcal = totalKcal !== null
    ? totalKcal < 200 ? '#10b981' : totalKcal < 500 ? '#f59e0b' : '#ef4444'
    : '#64748b';

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Calculadora */}
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>🧮 Calculadora</div>

        {/* Nombre opcional */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 6 }}>
            Nombre del alimento (opcional)
          </label>
          <input className="input-field" placeholder="ej: Arroz cocido, Pechuga..."
            value={nombre} onChange={e => setNombre(e.target.value)} />
        </div>

        {/* Dos campos en fila */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 6 }}>
              Kcal por 100g
            </label>
            <input className="input-field" type="number" inputMode="numeric"
              placeholder="350" style={{ textAlign: 'center', fontSize: 18, fontWeight: 700 }}
              value={kcalPor100} onChange={e => setKcalPor100(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 14, fontSize: 20, color: '#475569', flexShrink: 0 }}>×</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 6 }}>
              Gramos
            </label>
            <input className="input-field" type="number" inputMode="numeric"
              placeholder="150" style={{ textAlign: 'center', fontSize: 18, fontWeight: 700 }}
              value={gramos} onChange={e => setGramos(e.target.value)} />
          </div>
        </div>

        {/* Resultado */}
        <div style={{
          textAlign: 'center', padding: '14px 0', marginBottom: 14,
          borderTop: '1px solid #334155', borderBottom: '1px solid #334155'
        }}>
          {totalKcal !== null ? (
            <>
              <div style={{ fontSize: 42, fontWeight: 800, color: colorKcal, lineHeight: 1 }}>
                {totalKcal}
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>kcal totales</div>
            </>
          ) : (
            <div style={{ fontSize: 16, color: '#334155' }}>
              Rellena los dos campos para ver el resultado
            </div>
          )}
        </div>

        {/* Botones acción */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" onClick={handleAddToLog}
            disabled={!totalKcal}
            style={{ flex: 2, opacity: !totalKcal ? 0.4 : 1, fontSize: 14 }}>
            ➕ Añadir al log de hoy
          </button>
          <button onClick={() => { setShowGuardar(true); setGuardandoNombre(nombre); }}
            disabled={!kcalPor100}
            style={{
              flex: 1, padding: '12px 8px', borderRadius: 12, fontSize: 13,
              border: '1px solid #334155', background: '#1e293b', color: '#94a3b8',
              cursor: kcalPor100 ? 'pointer' : 'not-allowed', opacity: kcalPor100 ? 1 : 0.4
            }}>
            💾 Guardar
          </button>
        </div>

        {/* Mini-formulario guardar */}
        {showGuardar && (
          <div className="animate-fade-in" style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <input className="input-field" style={{ flex: 1 }}
              placeholder="Nombre para guardar"
              value={guardandoNombre}
              onChange={e => setGuardandoNombre(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGuardar()} />
            <button onClick={handleGuardar}
              style={{ padding: '12px 14px', borderRadius: 12, background: '#10b981', border: 'none', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
              ✓
            </button>
            <button onClick={() => setShowGuardar(false)}
              style={{ padding: '12px 12px', borderRadius: 12, background: '#1e293b', border: '1px solid #334155', color: '#64748b', cursor: 'pointer' }}>
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Biblioteca de alimentos guardados */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
          📦 Mis alimentos guardados
          {alimentosGuardados.length > 0 && (
            <span style={{ fontSize: 11, color: '#475569', fontWeight: 400, marginLeft: 8 }}>
              Toca para cargar
            </span>
          )}
        </div>
        {alimentosGuardados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#475569' }}>
            <div style={{ fontSize: 32 }}>📦</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>Aún no tienes alimentos guardados</div>
            <div style={{ fontSize: 11, marginTop: 4, color: '#334155' }}>
              Usa el botón "Guardar" arriba para añadirlos
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alimentosGuardados.map(a => (
              <div key={a.id} className="card"
                style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '12px 14px' }}
                onClick={() => handleSelect(a)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.nombre}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {a.kcalPor100g} kcal / 100g
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); handleDelete(a.id); }}
                  style={{ background: 'transparent', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 16, padding: '4px 8px', flexShrink: 0 }}>
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
TabCalcular.displayName = 'TabCalcular';

const IANutricional = () => {

  const { state, dispatch } = useApp();
  const prof = state.profiles[state.perfil];
  const isMama = state.perfil === 'mama';
  const [tab, setTab] = useState(isMama ? 'chat' : 'foto');
  const [image, setImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMediaType, setImageMediaType] = useState('image/jpeg');
  const [pesoAprox, setPesoAprox] = useState('');
  const [analisisResult, setAnalisisResult] = useState(null);
  const [loadingAnalisis, setLoadingAnalisis] = useState(false);
  const [manualText, setManualText] = useState('');
  const [manualResult, setManualResult] = useState(null);
  const [loadingManual, setLoadingManual] = useState(false);
  const [dayAnalysis, setDayAnalysis] = useState(null);
  const [loadingDay, setLoadingDay] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const abortRef = useRef(null);
  const todayKey = today();

  const dayLog = state.dayLogs[state.perfil][todayKey] || {};
  const comidas = dayLog.comidas || [];
  const totalCal  = comidas.reduce((a, c) => a + (Number(c.calorias) || 0), 0);
  const totalProt = comidas.reduce((a, c) => a + (Number(c.proteina) || 0), 0);
  const totalCarbs = comidas.reduce((a, c) => a + (Number(c.carbos) || 0), 0);
  const totalFat  = comidas.reduce((a, c) => a + (Number(c.grasa) || 0), 0);

  const handleImageSelect = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Límite de tamaño: 10MB
    if (file.size > 10 * 1024 * 1024) {
      alert('La imagen es demasiado grande. Máximo 10MB.');
      return;
    }
    const url = URL.createObjectURL(file);
    setImage(url);
    setImageMediaType(file.type || 'image/jpeg');
    setAnalisisResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target.result.split(',')[1];
      if (!isValidBase64(b64)) {
        alert('No se pudo procesar la imagen. Intenta con otra foto.');
        return;
      }
      setImageBase64(b64);
    };
    reader.readAsDataURL(file);
  }, []);

  const analyzeImage = useCallback(async () => {
    if (!imageBase64 || loadingAnalisis) return;
    setLoadingAnalisis(true);
    setAnalisisResult(null);
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const sys = `Eres un nutricionista experto con visión computacional. SIEMPRE respondes en JSON válido con la estructura exacta solicitada. Nada más.`;
    const msg = `Analiza esta imagen de comida${pesoAprox ? ` (aprox. ${pesoAprox}g)` : ''} y devuelve EXACTAMENTE este JSON:
{"nombre_plato":"string","descripcion":"string","calorias":number,"proteina_g":number,"carbohidratos_g":number,"grasas_g":number,"fibra_g":number,"sodio_mg":number,"indice_saciedad":"bajo|medio|alto","valoracion":"excelente|bueno|aceptable|mejorable|malo","consejo":"string","alertas":["string"],"alternativas_saludables":["string"]}`;

    try {
      const text = await callAI(sys, msg, imageBase64, imageMediaType, abortRef.current.signal);
      const json = parseAIJson(text, {
        nombre_plato: 'Plato analizado', calorias: 400, proteina_g: 25,
        carbohidratos_g: 40, grasas_g: 15, fibra_g: 5, sodio_mg: 400,
        indice_saciedad: 'medio', valoracion: 'aceptable',
        consejo: 'Análisis aproximado. Revisa tu API key si el resultado no es preciso.',
        alertas: [], alternativas_saludables: []
      });
      setAnalisisResult(json);
      if (!isMama) {
        dispatch({ type: 'ADD_FOTO_HISTORIAL', payload: { ...json, fecha: todayKey } });
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setAnalisisResult({
          nombre_plato: 'Error al analizar',
          calorias: 0, proteina_g: 0, carbohidratos_g: 0, grasas_g: 0,
          fibra_g: 0, sodio_mg: 0, indice_saciedad: 'medio', valoracion: 'aceptable',
          consejo: e.message || 'No se pudo analizar la imagen.',
          alertas: [], alternativas_saludables: []
        });
      }
    }
    setLoadingAnalisis(false);
  }, [imageBase64, imageMediaType, pesoAprox, loadingAnalisis, isMama, todayKey, dispatch]);

  const analyzeManual = useCallback(async () => {
    if (!manualText || loadingManual) return;
    setLoadingManual(true);
    setManualResult(null);
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const sys = `Eres un nutricionista. Estimas macronutrientes de descripciones. SOLO devuelves JSON válido.`;
    const msg = `Estima los macros de: "${manualText.slice(0, 500)}". Devuelve EXACTAMENTE:
{"nombre_plato":"string","calorias":number,"proteina_g":number,"carbohidratos_g":number,"grasas_g":number,"fibra_g":number,"sodio_mg":number,"valoracion":"excelente|bueno|aceptable|mejorable|malo","consejo":"string","alertas":["string"]}`;
    try {
      const text = await callAI(sys, msg, null, 'image/jpeg', abortRef.current.signal);
      const json = parseAIJson(text, {
        nombre_plato: manualText, calorias: 300, proteina_g: 20, carbohidratos_g: 30,
        grasas_g: 10, fibra_g: 3, sodio_mg: 300, valoracion: 'aceptable',
        consejo: 'Estimación aproximada.', alertas: []
      });
      setManualResult(json);
    } catch (e) {
      if (e.name !== 'AbortError') {
        setManualResult({ nombre_plato: manualText, calorias: 300, proteina_g: 20, carbohidratos_g: 30, grasas_g: 10, fibra_g: 3, sodio_mg: 300, valoracion: 'aceptable', consejo: 'Estimación aproximada.', alertas: [] });
      }
    }
    setLoadingManual(false);
  }, [manualText, loadingManual]);

  const addToLog = useCallback((result) => {
    if (!result) return;
    dispatch({
      type: 'ADD_COMIDA', payload: {
        nombre: result.nombre_plato,
        calorias: result.calorias,
        proteina: result.proteina_g,
        carbos: result.carbohidratos_g,
        grasa: result.grasas_g,
        hora: new Date().toTimeString().slice(0, 5)
      }
    });
    // Feedback no-bloqueante
    const msg = document.createElement('div');
    msg.textContent = `✅ Añadido: ${result.nombre_plato} (${result.calorias} kcal)`;
    Object.assign(msg.style, {
      position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)',
      background: '#10b981', color: 'white', padding: '10px 20px', borderRadius: '12px',
      fontSize: '14px', fontWeight: '600', zIndex: '9999', transition: 'opacity 0.5s'
    });
    document.body.appendChild(msg);
    setTimeout(() => { msg.style.opacity = '0'; setTimeout(() => msg.remove(), 500); }, 2000);
  }, [dispatch]);

  const analyzeDayComplete = useCallback(async () => {
    if (loadingDay) return;
    setLoadingDay(true);
    setDayAnalysis(null);
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const sys = `Eres un nutricionista. En español, máx 200 palabras, motivador y preciso.`;
    const msg = `Analiza la ingesta de ${prof.nombre}: ${totalCal} kcal (objetivo ${prof.calorias_objetivo || 2000}). Proteína: ${totalProt}g/${prof.macros?.proteina || 0}g. Carbos: ${totalCarbs}g. Grasa: ${totalFat}g. Comidas: ${comidas.map(c => c.nombre).join(', ') || 'ninguna'}. ¿Qué cenar para completar bien el día?`;
    try {
      const text = await callAI(sys, msg, null, 'image/jpeg', abortRef.current.signal);
      setDayAnalysis(text);
    } catch (e) {
      if (e.name !== 'AbortError') {
        setDayAnalysis(`Llevas ${totalCal} de ${prof.calorias_objetivo || 2000} kcal. ${totalCal < (prof.calorias_objetivo || 2000) ? 'Puedes comer un poco más.' : 'Has alcanzado tu objetivo.'}`);
      }
    }
    setLoadingDay(false);
  }, [loadingDay, prof, totalCal, totalProt, totalCarbs, totalFat, comidas]);

  const sendChat = useCallback(async () => {
    if (!chatInput.trim() || loadingChat) return;
    const msg = chatInput.trim();
    setChatInput('');
    dispatch({ type: 'ADD_MAMA_CHAT', payload: { rol: 'user', texto: msg } });
    setLoadingChat(true);
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const medicionesRecent = limitForPrompt(state.mediciones[state.perfil], 5);
    const pesoActual = medicionesRecent[0]?.peso || prof.peso;
    const tdeeActual = calcTDEE({ ...prof, peso: pesoActual });
    const sys = `Eres una nutricionista muy cariñosa. Hablas de forma simple y afectuosa. Contexto: ${prof.nombre}, ${calcAge(prof.fechaNacimiento)} años, ${pesoActual}kg, objetivo ${prof.pesoMeta}kg, TDEE ${tdeeActual} kcal. Máx 3-4 oraciones.`;
    try {
      const resp = await callAI(sys, msg, null, 'image/jpeg', abortRef.current.signal);
      dispatch({ type: 'ADD_MAMA_CHAT', payload: { rol: 'ia', texto: resp } });
    } catch (e) {
      if (e.name !== 'AbortError') {
        dispatch({ type: 'ADD_MAMA_CHAT', payload: { rol: 'ia', texto: e.message?.includes('Demasiadas') ? e.message : '¡Hola! Ahora mismo no puedo conectarme, pero estás haciendo un trabajo increíble 💕' } });
      }
    }
    setLoadingChat(false);
  }, [chatInput, loadingChat, dispatch, state.mediciones, state.perfil, prof]);

  const fotoHistorial = state.fotoHistorial[state.perfil] || [];
  const mamaChats = state.mamaChats[state.perfil] || [];

  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>🥙 {isMama ? 'Registro de Comida' : 'Registro de Comida'}</div>

      {!isMama && (
        <div className="tab-bar">
          {[['calcular','🧮 Calcular'],['foto','📸 Foto'],['manual','✍️ IA'],['resumen','📊 Resumen']].map(([t, l]) => (
            <button key={t} className={`tab-item ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{l}</button>
          ))}
        </div>
      )}

      {/* FOTO */}
      {tab === 'foto' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: image ? 'transparent' : '#0f172a',
            border: `2px dashed ${image ? '#10b981' : '#334155'}`,
            borderRadius: 16, padding: image ? 0 : 40, cursor: 'pointer', overflow: 'hidden',
            minHeight: 180, transition: 'all 0.3s'
          }}>
            {image ? (
              <img src={image} alt="Comida" style={{ width: '100%', borderRadius: 14, maxHeight: 250, objectFit: 'cover' }} />
            ) : (
              <>
                <div style={{ fontSize: 48 }}>📸</div>
                <div style={{ marginTop: 8, fontWeight: 600 }}>Toca para seleccionar imagen</div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>Foto de la cámara o galería</div>
              </>
            )}
            <input type="file" accept="image/*" style={{ display: 'none' }}
              onChange={handleImageSelect} capture="environment" />
          </label>
          {image && (
            <>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>Peso aproximado (gramos) — opcional</label>
                <input className="input-field" type="number" inputMode="numeric" placeholder="200"
                  value={pesoAprox} onChange={e => setPesoAprox(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={analyzeImage} disabled={loadingAnalisis || !imageBase64}
                style={{ background: loadingAnalisis ? '#334155' : 'linear-gradient(135deg,#6366f1,#4f46e5)', color: 'white', border: 'none', borderRadius: 12, padding: 14, fontSize: 16, fontWeight: 600, cursor: loadingAnalisis ? 'not-allowed' : 'pointer' }}>
                {loadingAnalisis ? '🔍 Analizando...' : '🔍 Analizar con IA'}
              </button>
            </>
          )}
          {loadingAnalisis && <AICard loading />}
          <MacroResult result={analisisResult} onAddToLog={() => addToLog(analisisResult)} />
          {fotoHistorial.length > 0 && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>📸 Últimos análisis</div>
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
                {fotoHistorial.slice(0, 5).map((h, i) => (
                  <div key={i} className="card" style={{ minWidth: 120, textAlign: 'center', cursor: 'pointer' }}
                    onClick={() => setAnalisisResult(h)}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{formatDate(h.fecha)}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.nombre_plato}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981', marginTop: 4 }}>{h.calorias} kcal</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MANUAL */}
      {tab === 'manual' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 8 }}>
              ¿Qué comiste? Descríbelo con detalle
            </label>
            <textarea className="input-field" rows={4} style={{ resize: 'none' }}
              placeholder="ej: 150g pechuga de pollo a la plancha, 100g arroz cocido, ensalada de lechuga y tomate con aceite de oliva"
              value={manualText} onChange={e => setManualText(e.target.value.slice(0, 500))} />
          </div>
          <button className="btn-primary" onClick={analyzeManual} disabled={loadingManual || !manualText}
            style={{ background: loadingManual || !manualText ? '#334155' : 'linear-gradient(135deg,#6366f1,#4f46e5)', color: 'white', border: 'none', borderRadius: 12, padding: 14, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
            {loadingManual ? '⏳ Estimando...' : '🧮 Estimar macros'}
          </button>
          {loadingManual && <AICard loading />}
          <MacroResult result={manualResult} onAddToLog={() => addToLog(manualResult)} />
        </div>
      )}

      {/* RESUMEN */}
      {tab === 'resumen' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Hoy — Resumen</div>
              <DonutChart valor={totalCal} total={prof.calorias_objetivo || 2000} size={70} />
            </div>
            {[
              { l: 'Proteína', v: totalProt, obj: prof.macros?.proteina, color: '#10b981' },
              { l: 'Carbos', v: totalCarbs, obj: prof.macros?.carbos, color: '#f59e0b' },
              { l: 'Grasa', v: totalFat, obj: prof.macros?.grasa, color: '#6366f1' },
            ].map(({ l, v, obj, color }) => (
              <div key={l} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: '#94a3b8' }}>{l}</span>
                  <span>{v}g {obj ? `/ ${obj}g` : ''}</span>
                </div>
                <ProgressBar value={v} max={obj || 100} h={6}
                  color={`linear-gradient(90deg,${color},${color}aa)`} />
              </div>
            ))}
          </div>
          {/* Balance calórico con pasos */}
          {(() => {
            const calQuemadas = state.pasos?.[state.perfil]?.[todayKey]?.calorias || 0;
            if (calQuemadas <= 0) return null;
            const balanceNeto = totalCal - calQuemadas;
            return (
              <div className="card" style={{ background: 'linear-gradient(135deg,rgba(34,211,238,0.08),rgba(16,185,129,0.04))', border: '1px solid rgba(34,211,238,0.2)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#22d3ee', marginBottom: 8 }}>👟 Balance calórico</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>{totalCal}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>consumidas</div>
                  </div>
                  <span style={{ color: '#475569', fontSize: 16 }}>−</span>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#22d3ee' }}>{calQuemadas}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>quemadas 👟</div>
                  </div>
                  <span style={{ color: '#475569', fontSize: 16 }}>=</span>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: balanceNeto <= (prof.calorias_objetivo || 2000) ? '#10b981' : '#ef4444' }}>{balanceNeto}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>neto</div>
                  </div>
                </div>
              </div>
            );
          })()}
          {comidas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#475569' }}>
              <div style={{ fontSize: 40 }}>🍽️</div>
              <div style={{ marginTop: 8 }}>Aún no has registrado comidas hoy</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {comidas.map((c, i) => (
                <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{c.hora}</div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981', flexShrink: 0 }}>{c.calorias} kcal</div>
                </div>
              ))}
            </div>
          )}
          <button className="btn-primary" onClick={analyzeDayComplete} disabled={loadingDay}
            style={{ background: loadingDay ? '#334155' : 'linear-gradient(135deg,#6366f1,#4f46e5)', color: 'white', border: 'none', borderRadius: 12, padding: 14, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
            {loadingDay ? '⏳ Analizando...' : '🤖 Análisis del día completo'}
          </button>
          {(loadingDay || dayAnalysis) && <AICard text={dayAnalysis} loading={loadingDay} />}
        </div>
      )}

      {/* CHAT (Mamá y también Yo) */}
      {tab === 'chat' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mamaChats.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: '#475569' }}>
              <div style={{ fontSize: 48 }}>💬</div>
              <div style={{ marginTop: 8, fontSize: 15 }}>¡Pregúntame lo que quieras!</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Estoy aquí para ayudarte 💕</div>
            </div>
          )}
          {/* Sugerencias rápidas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CHAT_SUGGESTIONS.map(s => (
              <button key={s} type="button" onClick={() => setChatInput(s)} style={{
                padding: '10px 14px', borderRadius: 10, border: '1px solid #334155',
                background: '#0f172a', color: '#94a3b8', cursor: 'pointer',
                textAlign: 'left', fontSize: 13
              }}>💬 {s}</button>
            ))}
          </div>
          {/* Mensajes */}
          {mamaChats.map((chatMsg, i) => (
            <div key={i} style={{
              alignSelf: chatMsg.rol === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              background: chatMsg.rol === 'user' ? 'rgba(16,185,129,0.2)' : '#1e293b',
              borderRadius: chatMsg.rol === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              padding: '12px 16px', fontSize: 14, lineHeight: 1.5,
              wordBreak: 'break-word'
            }}>
              {chatMsg.rol === 'ia' && <div style={{ fontSize: 11, color: '#6366f1', marginBottom: 4 }}>🤖 Asistente</div>}
              {chatMsg.texto}
            </div>
          ))}
          {loadingChat && <TypingIndicator />}
          {/* Espaciador para que los mensajes no se queden detrás del input fijo */}
          <div style={{ height: 60 }} />
          
          {/* Input de chat fijo en la parte inferior */}
          <div style={{
            position: 'fixed',
            bottom: 'calc(73px + env(safe-area-inset-bottom, 0px))',
            left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: '430px',
            background: '#0f172a',
            padding: '12px 16px',
            boxSizing: 'border-box',
            zIndex: 40,
            borderTop: '1px solid rgba(255,255,255,0.05)'
          }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input-field" style={{ flex: 1, margin: 0 }}
                placeholder="Escribe tu pregunta..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()} />
              <button className="btn-icon"
                style={{ background: '#10b981', borderColor: '#10b981', color: 'white', fontSize: 18, flexShrink: 0, margin: 0 }}
                onClick={sendChat} disabled={loadingChat || !chatInput.trim()}>
                ➤
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ height: 40 }} />

      {/* ══════════ TAB CALCULAR ══════════ */}
      {tab === 'calcular' && <TabCalcular />}
    </div>
  );
};
export default IANutricional;
