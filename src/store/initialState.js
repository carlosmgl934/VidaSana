// ============================================================
// ESTADO INICIAL
// ============================================================
import { today } from '../utils/dates.js';

export const defaultProfile = {
  nombre: '',
  sexo: 'hombre',
  fechaNacimiento: '',
  altura: '',
  peso: '',
  imc: '',
  porcGrasa: '',
  porcAgua: '',
  porcMusculo: '',
  porcHueso: '',
  pesoMeta: '',
  fechaMeta: '',
  actividad: 'moderado',
  tomaProteina: false,
  tomaCreatina: false,
  dosisProteina: 30,
  dosisCreatina: 5,
  onboardingCompleto: false,
  analisisInicial: null,
  calorias_objetivo: 0,
  deficit: 0,
  macros: { proteina: 0, carbos: 0, grasa: 0 },
  objetivoPasos: 10000,
  longitudZancada: 75
};

export const defaultDayLog = {
  agua: 0,
  proteinaTomada: false,
  creatinaTomada: false,
  actividad: 'descanso',
  gymEntrada: '',
  gymSalida: '',
  gymNota: '',
  paseoDuracion: 0,
  paseoDistancia: 0,
  paseoTipo: 'paseo',
  dieta: null,
  dietaNota: '',
  estadoAnimo: null,
  calidadSueno: 0,
  horasSueno: 0,
  nota: '',
  comidas: []
};

export const initialState = {
  perfil: 'yo',
  perfilSeleccionado: false,
  tab: 'dashboard',
  profiles: {
    yo: { ...defaultProfile },
    mama: { ...defaultProfile }
  },
  mediciones: { yo: [], mama: [] },
  medidasCorporales: { yo: [], mama: [] },
  dayLogs: { yo: {}, mama: {} },
  cenas: [],
  pasos: { yo: {}, mama: {} },
  alimentosGuardados: { yo: [], mama: [] },
  planSemanal: {},
  fotoHistorial: { yo: [], mama: [] },
  aiInsightDiario: { yo: {}, mama: {} },
  semanalReport: { yo: null, mama: null },
  mamaChats: { yo: [], mama: [] },
  milestones: [],
  calendarDate: today(),
};
