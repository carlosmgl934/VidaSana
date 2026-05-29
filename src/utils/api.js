// ============================================================
// GOOGLE GEMINI API — Con AbortController, rate limiting y JSON safety
// Modelo: gemini-2.5-pro  |  Clave: VITE_GEMINI_API_KEY en .env.local
// ============================================================

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const MODEL   = 'gemini-pro';

// Endpoint REST de Gemini (browser-safe, sin SDK, sin CORS extra)
const GEMINI_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

// ---- Rate Limiter (token bucket: máx 5 llamadas cada 10s) ----
// Gemini free tier es más generoso que Anthropic, subimos a 5
const RATE_LIMIT = { maxCalls: 5, windowMs: 10_000 };
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

// ---- Validador de base64 ----
export const isValidBase64 = (str) => {
  if (!str || typeof str !== 'string') return false;
  return str.length > 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(str);
};

/**
 * Llama a la API de Google Gemini con soporte para:
 * - AbortController (cancelación si el componente se desmonta)
 * - Rate limiting (máx 5 llamadas/10s)
 * - Imagen base64 opcional (vision)
 * - Manejo de errores detallado
 *
 * Firma IDÉNTICA a la versión de Anthropic para que el resto de módulos
 * no necesite ningún cambio.
 *
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {string|null} imageBase64  - Solo el dato base64 puro (sin prefijo data:...)
 * @param {string}      imageMediaType
 * @param {AbortSignal|null} signal  - Para cancelación con AbortController
 * @returns {Promise<string>}
 */
export const callAI = async (
  systemPrompt,
  userMessage,
  imageBase64    = null,
  imageMediaType = 'image/jpeg',
  signal         = null
) => {
  if (!API_KEY) {
    throw new Error(
      'Falta la API key de Gemini. Añádela en VITE_GEMINI_API_KEY en el archivo .env.local'
    );
  }

  // Rate limit check
  checkRateLimit();

  // Validar imagen si se proporciona
  if (imageBase64 !== null && !isValidBase64(imageBase64)) {
    throw new Error('La imagen no se pudo procesar correctamente. Intenta con otra foto.');
  }

  // ── Construir el array de partes del mensaje del usuario ──
  // Gemini usa "parts" en lugar de "content" de Anthropic
  const userParts = [];

  // Si hay imagen, va ANTES del texto (igual que Anthropic)
  if (imageBase64) {
    userParts.push({
      inline_data: {
        mime_type: imageMediaType,
        data: imageBase64
      }
    });
  }

  userParts.push({ text: userMessage });

  // ── Cuerpo de la petición Gemini ──
  const body = {
    // system_instruction equivale al "system" de Anthropic
    system_instruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: [
      {
        role: 'user',
        parts: userParts
      }
    ],
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.7,      // balance creatividad/precisión
      topP: 0.9
    },
    // Safety settings relajados para contenido médico/nutricional
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
    ]
  };

  let requestUrl = GEMINI_URL(API_KEY);
  let res = await fetch(requestUrl, {
    method:  'POST',
    signal,                   // AbortController signal
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body)
  });

  // Si el modelo no se encuentra, buscar dinámicamente uno que exista en la cuenta
  if (res.status === 404) {
    try {
      const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
      const modelsData = await modelsRes.json();
      const validModel = modelsData.models?.find(m => m.supportedGenerationMethods?.includes('generateContent') && m.name.includes('gemini'));
      if (validModel) {
        requestUrl = `https://generativelanguage.googleapis.com/v1beta/${validModel.name}:generateContent?key=${API_KEY}`;
        res = await fetch(requestUrl, {
          method:  'POST',
          signal,
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body)
        });
      }
    } catch (err) {
      console.warn('Fallo al buscar modelos alternativos', err);
    }
  }

  if (!res.ok) {
    // Gemini devuelve errores en { error: { code, message, status } }
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || `Error ${res.status} de la API de Gemini`;

    // Mapear códigos de error comunes a mensajes en español
    if (res.status === 429) {
      throw new Error('Has superado el límite de peticiones de Gemini. Espera un momento.');
    }
    if (res.status === 400 && msg.includes('API_KEY')) {
      throw new Error('API key de Gemini inválida. Revisa VITE_GEMINI_API_KEY en .env.local');
    }
    throw new Error(msg);
  }

  const data = await res.json();

  // ── Extraer el texto de la respuesta de Gemini ──
  // Estructura: data.candidates[0].content.parts[0].text
  const candidate = data.candidates?.[0];

  // Comprobar si fue bloqueado por safety filters
  if (!candidate) {
    const reason = data.promptFeedback?.blockReason;
    throw new Error(
      reason
        ? `Respuesta bloqueada por filtros de seguridad (${reason}). Reformula la pregunta.`
        : 'Gemini no devolvió ninguna respuesta.'
    );
  }

  // finish_reason puede ser SAFETY o MAX_TOKENS — seguimos igual
  const text = candidate.content?.parts?.[0]?.text ?? '';
  return text;
};

/**
 * Parsea JSON de una respuesta de IA de forma segura.
 * Extrae el primer objeto JSON del texto (incluso si hay texto antes/después).
 * Compatible con las respuestas de Gemini que a veces añaden markdown ```json...```
 *
 * @param {string} text
 * @param {object} fallback - Objeto a retornar si el parse falla
 */
export const parseAIJson = (text, fallback = {}) => {
  try {
    // Primero intentar extraer JSON de bloque markdown ```json ... ```
    const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (mdMatch) {
      return JSON.parse(mdMatch[1].trim());
    }
    // Fallback: extraer el primer objeto JSON del texto libre
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (!objMatch) throw new Error('Sin JSON en respuesta');
    return JSON.parse(objMatch[0]);
  } catch (e) {
    console.warn('[VidaSana] JSON de IA malformado:', e.message);
    return fallback;
  }
};

/**
 * Limita un array de registros para no inflar el prompt.
 * Siempre usa los más recientes.
 */
export const limitForPrompt = (arr, max = 10) =>
  Array.isArray(arr) ? arr.slice(0, max) : [];
