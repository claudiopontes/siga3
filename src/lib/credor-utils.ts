/**
 * Helpers compartilhados para CPF/CNPJ e busca de credores.
 * Usado por API routes server-side — não importar no browser.
 */

export function onlyDigits(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

export function tipoDocumento(digits: string): "CPF" | "CNPJ" | "DESCONHECIDO" {
  if (digits.length === 11) return "CPF";
  if (digits.length === 14) return "CNPJ";
  return "DESCONHECIDO";
}

export function formatCpfCnpj(digits: string): string {
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  return digits;
}

export function normalizeSearchTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Retorna true se a string contém apenas dígitos (após limpeza). */
export function isNumericQuery(q: string): boolean {
  return /^\d+$/.test(onlyDigits(q)) && onlyDigits(q).length > 0 && /^\d+$/.test(q.replace(/[\s.\-/]/g, ""));
}
