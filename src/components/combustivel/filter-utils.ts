export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCode(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  return digits.replace(/^0+/, "");
}

export type MunicipioIndexItem = {
  codigo: string;
  codigoNorm: string;
  nome: string;
  nomeNorm: string;
};

export function buildMunicipioIndex(
  municipios: Array<{ codigo: string; nome: string }> | unknown,
): MunicipioIndexItem[] {
  if (!Array.isArray(municipios)) return [];
  return municipios
    .map((m) => ({
      codigo: m.codigo,
      codigoNorm: normalizeCode(m.codigo),
      nome: m.nome,
      nomeNorm: normalizeName(m.nome),
    }))
    .sort((a, b) => b.nomeNorm.length - a.nomeNorm.length);
}

function tryMatchMunicipioByToken(token: string, index: MunicipioIndexItem[]): string | null {
  const normalizedToken = normalizeName(token);
  if (!normalizedToken) return null;

  const exact = index.find((m) => m.nomeNorm === normalizedToken);
  if (exact) return exact.codigoNorm;

  const contains = index.find(
    (m) =>
      normalizedToken.includes(m.nomeNorm) ||
      m.nomeNorm.includes(normalizedToken),
  );
  return contains?.codigoNorm ?? null;
}

export function inferMunicipioCodeFromEntidade(
  entidadeNome: string,
  municipioIndex: MunicipioIndexItem[],
): string | null {
  const normalizedEntidade = normalizeName(entidadeNome);
  if (!normalizedEntidade) return null;

  const regexes = [
    /CAMARA MUNICIPAL DE (.+)$/i,
    /PREFEITURA MUNICIPAL DE (.+)$/i,
    /MUNICIPIO DE (.+)$/i,
  ];

  for (const regex of regexes) {
    const match = normalizedEntidade.match(regex);
    if (!match) continue;
    const byToken = tryMatchMunicipioByToken(match[1], municipioIndex);
    if (byToken) return byToken;
  }

  const byContains = municipioIndex.find(
    (m) => m.nomeNorm.length >= 4 && normalizedEntidade.includes(m.nomeNorm),
  );
  return byContains?.codigoNorm ?? null;
}
