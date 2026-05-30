// ============================================================
// VidaSana — API de IA (Google Gemini)
//
//  Modelo: gemini-1.5-flash  — rápido, gratuito, CON visión
//  Key:    VITE_GEMINI_API_KEY en .env.local
//
//  callAI() / callAIGemini() → misma función, dos nombres
//  para retrocompatibilidad con todos los módulos.
// ============================================================

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

// gemini-2.0-flash: mejor visión, mejor razonamiento nutricional, capa gratuita
const GEMINI_MODEL = 'gemini-2.0-flash';

const GEMINI_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

// ── Helpers ──────────────────────────────────────────────────
export const isValidBase64 = (str) => {
  if (!str || typeof str !== 'string') return false;
  return str.length > 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(str);
};

// ── Rate limiter (máx 5 llamadas / 10 s) ────────────────────
const RATE_LIMIT     = { maxCalls: 5, windowMs: 10_000 };
const callTimestamps = [];

const checkRateLimit = () => {
  const now = Date.now();
  while (callTimestamps.length > 0 && now - callTimestamps[0] > RATE_LIMIT.windowMs) {
    callTimestamps.shift();
  }
  if (callTimestamps.length >= RATE_LIMIT.maxCalls) {
    const waitMs = RATE_LIMIT.windowMs - (now - callTimestamps[0]);
    throw new Error(
      `Demasiadas consultas seguidas. Espera ${Math.ceil(waitMs / 1000)}s antes de intentarlo de nuevo.`
    );
  }
  callTimestamps.push(now);
};

// ════════════════════════════════════════════════════════════
//  callAIGemini — función principal
// ════════════════════════════════════════════════════════════
/**
 * @param {string}      systemPrompt
 * @param {string}      userMessage
 * @param {string|null} imageBase64      - Solo base64 puro (sin prefijo data:...)
 * @param {string}      imageMediaType   - 'image/jpeg' | 'image/png' | 'image/webp'
 * @param {AbortSignal|null} signal
 * @param {object}      genConfig        - Override de generationConfig (opcional)
 * @returns {Promise<string>}
 */
export const callAIGemini = async (
  systemPrompt,
  userMessage,
  imageBase64    = null,
  imageMediaType = 'image/jpeg',
  signal         = null,
  genConfig      = {}
) => {
  if (!GEMINI_KEY) {
    throw new Error('Falta la API key de Gemini. Añádela en VITE_GEMINI_API_KEY en .env.local');
  }

  checkRateLimit();

  if (imageBase64 !== null && !isValidBase64(imageBase64)) {
    throw new Error('La imagen no se pudo procesar correctamente. Intenta con otra foto.');
  }

  const userParts = [];
  if (imageBase64) {
    userParts.push({ inline_data: { mime_type: imageMediaType, data: imageBase64 } });
  }
  userParts.push({ text: userMessage });

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: userParts }],
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.4,   // más bajo = más preciso y menos repetitivo
      topP: 0.85,
      topK: 40,
      ...genConfig,       // permite sobreescribir desde el punto de llamada
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };

  let requestUrl = GEMINI_URL(GEMINI_KEY);
  let res = await fetch(requestUrl, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // Fallback automático si el modelo no existe en la cuenta
  if (res.status === 404) {
    try {
      const modelsRes  = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_KEY}`);
      const modelsData = await modelsRes.json();
      // Preferir modelos flash con visión
      const validModel = modelsData.models?.find(
        m => m.supportedGenerationMethods?.includes('generateContent') &&
             m.name.includes('gemini') &&
             (m.name.includes('flash') || m.name.includes('pro'))
      );
      if (validModel) {
        requestUrl = `https://generativelanguage.googleapis.com/v1beta/${validModel.name}:generateContent?key=${GEMINI_KEY}`;
        res = await fetch(requestUrl, {
          method: 'POST', signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
    } catch (err) {
      console.warn('[VidaSana] Fallo al buscar modelos alternativos de Gemini', err);
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || `Error ${res.status} de la API de Gemini`;

    // 429 — Rate limit: esperar 65s y reintentar una vez automáticamente
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers?.get?.('Retry-After') || '65', 10);
      const waitMs = Math.max(retryAfter, 65) * 1000;
      console.warn(`[VidaSana] Rate limit Gemini. Reintentando en ${Math.round(waitMs/1000)}s...`);

      // Esperar respetando el AbortSignal
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, waitMs);
        signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); });
      });

      // Reintento
      const retryRes = await fetch(requestUrl, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (retryRes.status === 429) {
        throw new Error('Límite de peticiones de Gemini alcanzado. Espera 1 minuto antes de volver a intentarlo.');
      }
      if (!retryRes.ok) {
        const retryErr = await retryRes.json().catch(() => ({}));
        throw new Error(retryErr.error?.message || `Error ${retryRes.status} en reintento`);
      }

      // El reintento funcionó — continuar con la respuesta del reintento
      const retryData      = await retryRes.json();
      const retryCandidate = retryData.candidates?.[0];
      if (!retryCandidate) throw new Error('Gemini no devolvió respuesta en el reintento.');
      return retryCandidate.content?.parts?.[0]?.text ?? '';
    }

    if (res.status === 400 && msg.includes('API_KEY')) throw new Error('API key de Gemini inválida. Revisa VITE_GEMINI_API_KEY en .env.local');
    throw new Error(msg);
  }

  const data      = await res.json();
  const candidate = data.candidates?.[0];

  if (!candidate) {
    const reason = data.promptFeedback?.blockReason;
    throw new Error(
      reason
        ? `Respuesta bloqueada por filtros de seguridad (${reason}). Reformula la pregunta.`
        : 'Gemini no devolvió ninguna respuesta.'
    );
  }

  return candidate.content?.parts?.[0]?.text ?? '';
};

// callAI — alias de retrocompatibilidad (todos los módulos lo siguen usando)
export const callAI = callAIGemini;

// ════════════════════════════════════════════════════════════
//  Utilidades compartidas
// ════════════════════════════════════════════════════════════

/**
 * Parsea JSON de una respuesta de IA de forma segura.
 * Estrategias en orden:
 *  1. Parse directo (Gemini obedeció y devolvió solo JSON)
 *  2. Extracción de bloque markdown ```json ... ```
 *  3. Brace-counting: encuentra el objeto JSON aunque haya texto antes/después
 *     (resistente a respuestas como "Esta ensalada es baja en calorías. {...}")
 */
export const parseAIJson = (text, fallback = {}) => {
  if (!text || typeof text !== 'string') return fallback;

  // 1 — Intento directo
  try { return JSON.parse(text.trim()); } catch {}

  // 2 — Bloque markdown
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) {
    try { return JSON.parse(mdMatch[1].trim()); } catch {}
  }

  // 3 — Brace-counting: busca el primer { y encuentra el } de cierre correcto
  //     (no se confunde con } dentro de strings ni con llaves anidadas)
  const start = text.indexOf('{');
  if (start !== -1) {
    let depth = 0, inString = false, escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escaped)              { escaped = false; continue; }
      if (ch === '\\' && inString) { escaped = true;  continue; }
      if (ch === '"')           { inString = !inString; continue; }
      if (inString)             continue;
      if (ch === '{')           depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(text.slice(start, i + 1)); } catch {}
          break; // JSON malformado aunque encontramos el cierre
        }
      }
    }
  }

  console.warn('[VidaSana] parseAIJson falló. Primeros 300 chars de respuesta:', text?.slice(0, 300));
  return fallback;
};

/**
 * Limita un array de registros para no inflar el prompt.
 * Siempre usa los más recientes.
 */
export const limitForPrompt = (arr, max = 10) =>
  Array.isArray(arr) ? arr.slice(0, max) : [];
