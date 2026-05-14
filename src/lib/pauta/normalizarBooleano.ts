export function normalizarBooleano(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "number") return valor !== 0;
  const s = String(valor).trim().toUpperCase();
  return s === "1" || s === "S" || s === "SIM" || s === "TRUE";
}
