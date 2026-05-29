// ============================================================
// VALIDACIÓN DE DATOS DE USUARIO
// ============================================================

/**
 * Rangos fisiológicamente posibles para adultos.
 */
export const RANGES = {
  peso:      { min: 20,  max: 300,  label: 'Peso (kg)',       unit: 'kg' },
  altura:    { min: 100, max: 250,  label: 'Altura (cm)',     unit: 'cm' },
  pesoMeta:  { min: 20,  max: 300,  label: 'Peso meta (kg)',  unit: 'kg' },
  porcGrasa: { min: 2,   max: 70,   label: 'Grasa corporal',  unit: '%'  },
  porcAgua:  { min: 20,  max: 80,   label: 'Agua corporal',   unit: '%'  },
  porcMusculo: { min: 5, max: 75,   label: 'Músculo',         unit: '%'  },
  porcHueso: { min: 1,   max: 15,   label: 'Hueso',           unit: '%'  },
  calorias:  { min: 0,   max: 15000, label: 'Calorías',       unit: 'kcal'},
  agua:      { min: 0,   max: 20,   label: 'Vasos de agua',   unit: 'v'  },
};

/**
 * Valida un valor numérico dentro de un rango.
 * Retorna { valid: bool, error: string|null }.
 */
export const validateNumericField = (key, value) => {
  if (value === '' || value === null || value === undefined) {
    return { valid: true, error: null }; // campo opcional vacío = ok
  }
  const num = Number(value);
  if (isNaN(num)) {
    return { valid: false, error: `Introduce un número válido` };
  }
  const range = RANGES[key];
  if (!range) return { valid: true, error: null };
  if (num < range.min) {
    return { valid: false, error: `Mínimo ${range.min} ${range.unit}` };
  }
  if (num > range.max) {
    return { valid: false, error: `Máximo ${range.max} ${range.unit}` };
  }
  return { valid: true, error: null };
};

/**
 * Sanitiza un valor numérico: clampea al rango y retorna Number.
 * Si es inválido, retorna null.
 */
export const sanitizeNumeric = (key, value) => {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  if (isNaN(num)) return null;
  const range = RANGES[key];
  if (!range) return num;
  return Math.min(Math.max(num, range.min), range.max);
};

/**
 * Sanitiza texto libre: recorta espacios y limita longitud.
 */
export const sanitizeText = (text, maxLen = 200) => {
  if (!text) return '';
  return String(text).trim().slice(0, maxLen);
};

/**
 * Valida el esquema del estado cargado desde localStorage.
 * Retorna el estado reparado o null si está completamente corrupto.
 */
export const validateAndMigrateState = (raw) => {
  try {
    if (!raw || typeof raw !== 'object') return null;

    // Campos obligatorios
    const requiredKeys = ['profiles', 'mediciones', 'dayLogs'];
    for (const k of requiredKeys) {
      if (!raw[k] || typeof raw[k] !== 'object') {
        console.warn(`[VidaSana] Estado corrupto: falta ${k}. Reseteando.`);
        return null;
      }
    }

    // Migrar fotoHistorial de array a objeto por perfil (v2→v3)
    if (Array.isArray(raw.fotoHistorial)) {
      raw = { ...raw, fotoHistorial: { yo: raw.fotoHistorial, mama: [] } };
    }

    // Migrar mamaChats de array a objeto por perfil (v2→v3)
    if (Array.isArray(raw.mamaChats)) {
      raw = { ...raw, mamaChats: { yo: [], mama: raw.mamaChats } };
    }

    // Asegurar que mediciones y dayLogs tienen ambos perfiles
    raw = {
      ...raw,
      mediciones: {
        yo: Array.isArray(raw.mediciones?.yo) ? raw.mediciones.yo : [],
        mama: Array.isArray(raw.mediciones?.mama) ? raw.mediciones.mama : [],
      },
      dayLogs: {
        yo: (raw.dayLogs?.yo && typeof raw.dayLogs.yo === 'object') ? raw.dayLogs.yo : {},
        mama: (raw.dayLogs?.mama && typeof raw.dayLogs.mama === 'object') ? raw.dayLogs.mama : {},
      },
      fotoHistorial: {
        yo: Array.isArray(raw.fotoHistorial?.yo) ? raw.fotoHistorial.yo : [],
        mama: Array.isArray(raw.fotoHistorial?.mama) ? raw.fotoHistorial.mama : [],
      },
      mamaChats: {
        yo: Array.isArray(raw.mamaChats?.yo) ? raw.mamaChats.yo : [],
        mama: Array.isArray(raw.mamaChats?.mama) ? raw.mamaChats.mama : [],
      },
      medidasCorporales: {
        yo: Array.isArray(raw.medidasCorporales?.yo) ? raw.medidasCorporales.yo : [],
        mama: Array.isArray(raw.medidasCorporales?.mama) ? raw.medidasCorporales.mama : [],
      },
      pasos: {
        yo: (raw.pasos?.yo && typeof raw.pasos.yo === 'object') ? raw.pasos.yo : {},
        mama: (raw.pasos?.mama && typeof raw.pasos.mama === 'object') ? raw.pasos.mama : {},
      },
      alimentosGuardados: {
        yo: Array.isArray(raw.alimentosGuardados?.yo) ? raw.alimentosGuardados.yo : [],
        mama: Array.isArray(raw.alimentosGuardados?.mama) ? raw.alimentosGuardados.mama : [],
      },
      aiInsightDiario: {
        yo: (raw.aiInsightDiario?.yo && typeof raw.aiInsightDiario.yo === 'object') ? raw.aiInsightDiario.yo : {},
        mama: (raw.aiInsightDiario?.mama && typeof raw.aiInsightDiario.mama === 'object') ? raw.aiInsightDiario.mama : {},
      },
    };

    return raw;
  } catch (e) {
    console.error('[VidaSana] Error al migrar estado:', e);
    return null;
  }
};
