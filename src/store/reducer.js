// ============================================================
// REDUCER — Gestión de estado global
// ============================================================
import { initialState, defaultProfile, defaultDayLog } from './initialState.js';
import { today } from '../utils/dates.js';

export const reducer = (state, action) => {
  switch (action.type) {
    case 'SET_PERFIL':
      return { ...state, perfil: action.payload, perfilSeleccionado: true };

    case 'SET_TAB':
      return { ...state, tab: action.payload };

    case 'UPDATE_PROFILE':
      return {
        ...state,
        profiles: {
          ...state.profiles,
          [state.perfil]: { ...state.profiles[state.perfil], ...action.payload }
        }
      };

    case 'COMPLETE_ONBOARDING': {
      const p = {
        ...state.profiles[state.perfil],
        onboardingCompleto: true,
        ...action.payload
      };
      return { ...state, profiles: { ...state.profiles, [state.perfil]: p } };
    }

    case 'ADD_MEDICION': {
      const prof = state.perfil;
      const newList = [action.payload, ...state.mediciones[prof]]
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      return { ...state, mediciones: { ...state.mediciones, [prof]: newList } };
    }

    case 'DELETE_MEDICION': {
      const prof = state.perfil;
      return {
        ...state,
        mediciones: {
          ...state.mediciones,
          [prof]: state.mediciones[prof].filter(m => (m.id || m.fecha + m.hora) !== action.payload)
        }
      };
    }

    case 'UPDATE_DAY_LOG': {
      const prof = state.perfil;
      const d = action.payload.fecha || today();
      const existing = state.dayLogs[prof][d] || { ...defaultDayLog };
      const updated = { ...existing, ...action.payload.data };
      return {
        ...state,
        dayLogs: {
          ...state.dayLogs,
          [prof]: { ...state.dayLogs[prof], [d]: updated }
        }
      };
    }

    case 'ADD_COMIDA': {
      const prof = state.perfil;
      const d = today();
      const existing = state.dayLogs[prof][d] || { ...defaultDayLog };
      const updated = { ...existing, comidas: [...existing.comidas, action.payload] };
      return {
        ...state,
        dayLogs: {
          ...state.dayLogs,
          [prof]: { ...state.dayLogs[prof], [d]: updated }
        }
      };
    }

    case 'ADD_CENA':
      return { ...state, cenas: [...state.cenas, action.payload] };

    case 'UPDATE_CENA': {
      const newCenas = state.cenas.map(c =>
        c.id === action.payload.id ? action.payload : c
      );
      return { ...state, cenas: newCenas };
    }

    case 'DELETE_CENA':
      return { ...state, cenas: state.cenas.filter(c => c.id !== action.payload) };

    case 'SET_PLAN_SEMANAL':
      return { ...state, planSemanal: { ...state.planSemanal, ...action.payload } };

    case 'UPDATE_PASOS': {
      const prof = state.perfil;
      const d = action.payload.fecha;
      return {
        ...state,
        pasos: {
          ...state.pasos,
          [prof]: { ...(state.pasos?.[prof] || {}), [d]: action.payload.data }
        }
      };
    }

    case 'DELETE_PASOS': {
      const prof = state.perfil;
      const newPasos = { ...(state.pasos?.[prof] || {}) };
      delete newPasos[action.payload];
      return {
        ...state,
        pasos: { ...state.pasos, [prof]: newPasos }
      };
    }

    case 'ADD_ALIMENTO_GUARDADO': {
      const prof = state.perfil;
      const lista = [...(state.alimentosGuardados?.[prof] || []), action.payload];
      return { ...state, alimentosGuardados: { ...state.alimentosGuardados, [prof]: lista } };
    }

    case 'DELETE_ALIMENTO_GUARDADO': {
      const prof = state.perfil;
      return {
        ...state,
        alimentosGuardados: {
          ...state.alimentosGuardados,
          [prof]: (state.alimentosGuardados?.[prof] || []).filter(a => a.id !== action.payload)
        }
      };
    }

    case 'ADD_FOTO_HISTORIAL': {
      const prof = state.perfil;
      const newFotos = [action.payload, ...(state.fotoHistorial[prof] || [])].slice(0, 10);
      return { ...state, fotoHistorial: { ...state.fotoHistorial, [prof]: newFotos } };
    }

    case 'SET_AI_INSIGHT':
      return {
        ...state,
        aiInsightDiario: {
          ...state.aiInsightDiario,
          [state.perfil]: {
            ...state.aiInsightDiario[state.perfil],
            [today()]: action.payload
          }
        }
      };

    case 'SET_SEMANAL_REPORT':
      return {
        ...state,
        semanalReport: { ...state.semanalReport, [state.perfil]: action.payload }
      };

    case 'ADD_MAMA_CHAT': {
      const prof = state.perfil;
      const existingChats = state.mamaChats[prof] || [];
      return {
        ...state,
        mamaChats: {
          ...state.mamaChats,
          [prof]: [...existingChats, action.payload].slice(-20)
        }
      };
    }

    case 'ADD_MEDIDA_CORPORAL': {
      const prof = state.perfil;
      const newList = [action.payload, ...(state.medidasCorporales?.[prof] || [])]
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      return { ...state, medidasCorporales: { ...state.medidasCorporales, [prof]: newList } };
    }

    case 'DELETE_MEDIDA_CORPORAL': {
      const prof = state.perfil;
      return {
        ...state,
        medidasCorporales: {
          ...state.medidasCorporales,
          [prof]: (state.medidasCorporales?.[prof] || []).filter(m => m.id !== action.payload)
        }
      };
    }

    case 'UPDATE_MEDIDA_IA': {
      const prof = state.perfil;
      return {
        ...state,
        medidasCorporales: {
          ...state.medidasCorporales,
          [prof]: (state.medidasCorporales?.[prof] || []).map(m =>
            m.id === action.payload.id ? { ...m, analisisIA: action.payload.analisisIA } : m
          )
        }
      };
    }

    case 'SET_CALENDAR_DATE':
      return { ...state, calendarDate: action.payload };

    case 'ADD_MILESTONE':
      return { ...state, milestones: [...state.milestones, action.payload] };

    case 'LOAD_STATE':
      return { ...initialState, ...action.payload };

    case 'SWITCH_PROFILE':
      // Cambio seguro de perfil — NO borra datos
      return { ...state, perfil: action.payload, perfilSeleccionado: true, tab: 'dashboard' };

    case 'RESET_PROFILE': {
      // Borra TODOS los datos del perfil activo
      const prof = state.perfil;
      return {
        ...state,
        profiles: { ...state.profiles, [prof]: { ...defaultProfile } },
        mediciones: { ...state.mediciones, [prof]: [] },
        medidasCorporales: { ...state.medidasCorporales, [prof]: [] },
        dayLogs: { ...state.dayLogs, [prof]: {} },
        pasos: { ...state.pasos, [prof]: {} },
        alimentosGuardados: { ...state.alimentosGuardados, [prof]: [] },
        fotoHistorial: { ...state.fotoHistorial, [prof]: [] },
        aiInsightDiario: { ...state.aiInsightDiario, [prof]: {} },
        semanalReport: { ...state.semanalReport, [prof]: null },
        mamaChats: { ...state.mamaChats, [prof]: [] },
        milestones: [],
      };
    }

    default:
      return state;
  }
};
