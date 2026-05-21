/**
 * Teto constitucional remuneratório (art. 37, XI, CF). Atualizar quando o
 * STF publicar novo valor anual. Valores em R$, mensais brutos.
 */
const TETO_POR_ANO: Record<number, number> = {
  2023: 41650.92,
  2024: 44008.52,
  2025: 46366.19,
};

const TETO_FALLBACK = 46366.19;

export function tetoConstitucional(ano: number): number {
  return TETO_POR_ANO[ano] ?? TETO_FALLBACK;
}
