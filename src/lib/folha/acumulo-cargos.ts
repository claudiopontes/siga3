/**
 * Classificação heurística de licitude de acumulação de cargos (CF/88 art. 37, XVI).
 * Hipóteses permitidas:
 *   a) Dois cargos de PROFESSOR;
 *   b) Um de PROFESSOR + um TÉCNICO ou CIENTÍFICO;
 *   c) Dois cargos privativos de PROFISSIONAIS DE SAÚDE com profissões regulamentadas.
 * Em todas elas, exige-se compatibilidade de horários.
 *
 * A heurística aqui é por palavras-chave no nome do cargo — NÃO substitui análise
 * jurídica caso a caso. Serve só para priorizar investigações.
 */

const PROFESSOR_KEYS = [
  "PROFESSOR",
  "MAGISTERIO",
  "DOCENTE",
];

const SAUDE_REGULAMENTADA_KEYS = [
  "MEDICO",
  "ENFERMEIRO",
  "ENFERMEIRA",
  "FARMACEUTICO",
  "ODONTOLOGO",
  "DENTISTA",
  "FISIOTERAPEUTA",
  "NUTRICIONISTA",
  "PSICOLOGO",
  "FONOAUDIOLOGO",
  "TERAPEUTA OCUPACIONAL",
  "BIOMEDICO",
  "ASSISTENTE SOCIAL",
  "BIOLOGO",
];

function normalizar(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

export type CategoriaCargo = "PROFESSOR" | "SAUDE" | "OUTRO";

export function classificarCargo(cargoNome: string | null | undefined): CategoriaCargo {
  const n = normalizar(cargoNome);
  if (!n) return "OUTRO";
  if (PROFESSOR_KEYS.some((k) => n.includes(k))) return "PROFESSOR";
  if (SAUDE_REGULAMENTADA_KEYS.some((k) => n.includes(k))) return "SAUDE";
  return "OUTRO";
}

export type ClassificacaoLicitude = "POTENCIALMENTE_LICITO" | "INVESTIGAR";

/**
 * Aplica as regras da CF/88 art. 37, XVI sobre as categorias dos vínculos.
 *  - 2x PROFESSOR              -> lícito
 *  - 1 PROFESSOR + 1 outro     -> lícito (admite-se técnico-científico não-listado)
 *  - 2x SAÚDE                  -> lícito
 *  - 3+ vínculos               -> sempre investigar (cumulação tripla é vedada)
 *  - demais combinações        -> investigar
 */
export function classificarAcumulo(categorias: CategoriaCargo[]): ClassificacaoLicitude {
  if (categorias.length > 2) return "INVESTIGAR";

  const profs = categorias.filter((c) => c === "PROFESSOR").length;
  const saude = categorias.filter((c) => c === "SAUDE").length;
  const outros = categorias.filter((c) => c === "OUTRO").length;

  if (profs === 2) return "POTENCIALMENTE_LICITO";
  if (saude === 2) return "POTENCIALMENTE_LICITO";
  if (profs === 1 && (outros === 1 || saude === 1)) return "POTENCIALMENTE_LICITO";
  return "INVESTIGAR";
}

// Limite "soft": 60h/semana × 4,33 semanas/mês ≈ 260h. Acima disso é flagrante
// indício de incompatibilidade física de horários.
export const CARGA_HORARIA_LIMITE_SOFT = 260;
