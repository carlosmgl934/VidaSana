// ============================================================
// CÁLCULOS MATEMÁTICOS — Funciones puras, 100% testeables
// ============================================================

/**
 * Calcula la edad en años completos a partir de una fecha de nacimiento ISO.
 */
export const calcAge = (dob) => {
  if (!dob) return 0;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
};

/**
 * IMC = peso(kg) / (altura(m))²
 * Retorna 0 si los datos son inválidos.
 */
export const calcIMC = (peso, altura) => {
  const p = Number(peso);
  const a = Number(altura);
  if (!p || !a || a <= 0) return 0;
  return +(p / ((a / 100) ** 2)).toFixed(1);
};

/**
 * TDEE usando Mifflin-St Jeor diferenciado por sexo.
 * Retorna 2000 como fallback si faltan datos.
 */
export const calcTDEE = (perfil) => {
  const { sexo, actividad, fechaNacimiento } = perfil;
  const peso = Number(perfil.peso);
  const altura = Number(perfil.altura);
  if (!peso || !altura || peso <= 0 || altura <= 0) return 2000;
  const edad = calcAge(fechaNacimiento);
  // Mifflin-St Jeor
  const bmr = sexo === 'hombre'
    ? 10 * peso + 6.25 * altura - 5 * edad + 5
    : 10 * peso + 6.25 * altura - 5 * edad - 161;
  const factores = {
    sedentario: 1.2, ligero: 1.375, moderado: 1.55,
    activo: 1.725, muy_activo: 1.9
  };
  return Math.round(bmr * (factores[actividad] ?? 1.55));
};

/**
 * Calcula el déficit calórico según la diferencia de peso.
 * Conservador: máx 700 kcal para evitar pérdida de músculo.
 */
export const calcDeficit = (pesoActual, pesoMeta) => {
  const diff = Number(pesoActual) - Number(pesoMeta);
  if (diff <= 0) return 0;
  if (diff < 5) return 300;
  if (diff < 10) return 500;
  return 700;
};

/**
 * Calcula macros diarios a partir del objetivo calórico.
 * Proteína: 2g/kg; Grasa: 25% calorías; Carbos: resto.
 * Nunca retorna valores negativos.
 */
export const calcMacros = (peso, calObjetivo) => {
  const p = Number(peso);
  const cal = Number(calObjetivo);
  if (!p || !cal || cal <= 0) return { proteina: 0, carbos: 0, grasa: 0 };
  const proteina = Math.round(p * 2);
  const grasa = Math.round(cal * 0.25 / 9);
  const carbos = Math.max(0, Math.round((cal - proteina * 4 - grasa * 9) / 4));
  return { proteina, carbos, grasa };
};

/**
 * Pérdida de peso estimada semanal en kg basada en el déficit.
 * 7700 kcal ≈ 1kg de grasa.
 */
export const calcPerdidaSemanal = (deficit) => {
  if (!deficit || deficit <= 0) return 0;
  return +((deficit * 7) / 7700).toFixed(2);
};

/**
 * Clasifica el IMC con etiqueta legible.
 */
export const clasificarIMC = (imc) => {
  const v = Number(imc);
  if (v < 18.5) return 'Bajo peso';
  if (v < 25) return 'Peso normal';
  if (v < 30) return 'Sobrepeso';
  return 'Obesidad';
};
