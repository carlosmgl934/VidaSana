// ============================================================
// UTILIDADES DE FECHAS — Funciones puras, sin estado
// ============================================================

export const today = () => new Date().toISOString().split('T')[0];

export const todayStr = () => {
  const d = new Date();
  return `${d.getDate()} ${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getFullYear()}`;
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

// Siempre usamos YYYY-MM-DD como clave canónica
export const toISODate = (date) => {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  if (date instanceof Date) return date.toISOString().split('T')[0];
  return today();
};

export const WEEKDAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];
export const MONTH_NAMES_SHORT = [
  'ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'
];
