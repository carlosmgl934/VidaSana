// ============================================================
// CONTEXT — Provider con persistencia localStorage robusta
// ============================================================
import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { reducer } from './store/reducer.js';
import { initialState } from './store/initialState.js';
import { validateAndMigrateState } from './utils/validation.js';

export const AppContext = createContext(null);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp debe usarse dentro de AppProvider');
  return ctx;
};

const LS_KEY = 'vidasana_v3';

export const AppProvider = ({ children }) => {
  const [state, dispatchRaw] = useReducer(reducer, initialState);
  const saveTimer = useRef(null);
  const isMounted = useRef(true);

  // Estabilizar dispatch con useCallback — evita re-renders en consumidores
  const dispatch = useCallback((action) => {
    if (isMounted.current) dispatchRaw(action);
  }, []);

  // ── Carga inicial desde localStorage ──
  useEffect(() => {
    isMounted.current = true;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const migrated = validateAndMigrateState(parsed);
        if (migrated) {
          dispatchRaw({ type: 'LOAD_STATE', payload: migrated });
        } else {
          // Datos corruptos: empezar de cero silenciosamente
          console.warn('[VidaSana] Datos corruptos detectados, iniciando limpio.');
          localStorage.removeItem(LS_KEY);
        }
      }
    } catch (e) {
      // localStorage bloqueado (modo privado iOS, etc.)
      console.warn('[VidaSana] No se pudo leer localStorage:', e.message);
    }
    return () => { isMounted.current = false; };
  }, []); // Solo al montar — deps vacías intencionales

  // ── Auto-save con debounce de 500ms ──
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(state));
      } catch (e) {
        // Cuota excedida o bloqueado: fallo silencioso
        if (e.name === 'QuotaExceededError') {
          console.warn('[VidaSana] localStorage lleno, intentando limpiar historial antiguo...');
          try {
            // Limitar mediciones antiguas para liberar espacio
            const slim = {
              ...state,
              mediciones: {
                yo: state.mediciones.yo.slice(0, 50),
                mama: state.mediciones.mama.slice(0, 50),
              }
            };
            localStorage.setItem(LS_KEY, JSON.stringify(slim));
          } catch {
            console.error('[VidaSana] No se pudo guardar incluso tras reducir datos.');
          }
        }
      }
    }, 500);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};
