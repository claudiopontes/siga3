export function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const p = parseFloat(v.replace(",", "."));
    return Number.isFinite(p) ? p : 0;
  }
  return 0;
}

export function fmtMoeda(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

export function fmtCompacto(v: number): string {
  const s = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e9) return `${s}R$ ${(a / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} bi`;
  if (a >= 1e6) return `${s}R$ ${(a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (a >= 1e3) return `${s}R$ ${(a / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return fmtMoeda(v);
}

export function fmtNum(v: number | string | null | undefined): string {
  return toNum(v).toLocaleString("pt-BR");
}

export function fmtCompetencia(competencia: string): string {
  if (!competencia || competencia.length < 7) return competencia ?? "";
  const [ano, mes] = competencia.split("-");
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const idx = Number(mes) - 1;
  return `${meses[idx] ?? mes}/${ano}`;
}

export type FolhaFiltros = {
  competencia: string | null;
  entidade: string | null;
  poder: string | null;
};

export function queryStringFiltros(f: FolhaFiltros): string {
  const sp = new URLSearchParams();
  if (f.competencia) sp.set("competencia", f.competencia);
  if (f.entidade && f.entidade !== "all") sp.set("entidade", f.entidade);
  if (f.poder && f.poder !== "all") sp.set("poder", f.poder);
  return sp.toString();
}
