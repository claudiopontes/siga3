/**
 * ETL — MIS Bolsa Família / BPC por município
 *
 * Fonte: arquivos XLSX exportados do MIS/MDS, um por município.
 *        Formato do nome: "{código_ibge} - {nome_municipio}.xlsx"
 *        Pasta configurável via MIS_DATA_DIR (padrão: etl/data/mis)
 *
 * Estratégia:
 *   1. Valida estrutura de cada arquivo antes de qualquer escrita
 *   2. Ignora registros onde todos os campos de dado (exceto população) são 0 ou nulos
 *   3. Upsert por (ano_mes, codigo_ibge_municipio) com hash-guard — idempotente
 *   4. Arquivos temporários do Excel (~$*) são ignorados automaticamente
 *
 * Uso:
 *   cd etl && npm run mis-bolsa-familia-bpc
 *
 * Variáveis de ambiente:
 *   MIS_DATA_DIR  — pasta com os xlsx (padrão: data/mis relativo ao diretório etl)
 *   MIS_UF        — filtrar por UF extraída do código IBGE (padrão: sem filtro)
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as XLSX from "xlsx";
import { pgQuery, closePgPool } from "../connectors/postgres";
import { registrarLogEtl } from "../lib/auditoria";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const MODULO   = "mis_bolsa_familia_bpc";
const DATA_DIR = process.env.MIS_DATA_DIR
  ? path.resolve(process.env.MIS_DATA_DIR)
  : path.resolve(__dirname, "../data/mis");

// ---------------------------------------------------------------------------
// Aliases de colunas aceitos (normaliza variações de label)
// ---------------------------------------------------------------------------

const ALIASES: Record<string, string[]> = {
  ano_mes: [
    "ano mês (aaaamm)", "ano mes (aaaamm)", "competencia", "ano_mes",
    "ano/mês", "ano/mes", "periodo", "data",
  ],
  bf_quantidade_familias: [
    "bolsa família - quantidade famílias",
    "bolsa familia - quantidade familias",
    "quantidade familias bf", "familias bf", "qtd familias bf",
    "bolsa família quantidade", "beneficiarios bf",
  ],
  bf_valor_repassado: [
    "bolsa família - valor repassado (r$)",
    "bolsa familia - valor repassado (r$)",
    "valor repassado bf", "valor bf", "vlr bf",
    "bolsa família valor", "valor repassado",
  ],
  bpc_quantidade_total: [
    "bpc por município pagador - quantidade bpc beneficiário total",
    "bpc por municipio pagador - quantidade bpc beneficiario total",
    "quantidade bpc total", "bpc total", "bpc beneficiario total",
    "qtd bpc total",
  ],
  bpc_quantidade_deficiencia: [
    "bpc por município pagador - quantidade bpc portador deficiência beneficiário",
    "bpc por municipio pagador - quantidade bpc portador deficiencia beneficiario",
    "bpc deficiencia", "bpc portador deficiencia", "qtd bpc deficiencia",
  ],
  bpc_quantidade_idoso: [
    "bpc por município pagador - quantidade bpc idoso beneficiário",
    "bpc por municipio pagador - quantidade bpc idoso beneficiario",
    "bpc idoso", "qtd bpc idoso",
  ],
  bpc_valor_deficiencia: [
    "bpc por município pagador - valor bpc portador deficiência",
    "bpc por municipio pagador - valor bpc portador deficiencia",
    "valor bpc deficiencia", "vlr bpc deficiencia",
  ],
  bpc_valor_idoso: [
    "bpc por município pagador - valor bpc idoso",
    "bpc por municipio pagador - valor bpc idoso",
    "valor bpc idoso", "vlr bpc idoso",
  ],
  bpc_valor_total: [
    "bpc por município pagador - valor bpc total",
    "bpc por municipio pagador - valor bpc total",
    "valor bpc total", "vlr bpc total",
  ],
  populacao_estimada: [
    "ibge - população estimada",
    "ibge - populacao estimada",
    "população estimada", "populacao estimada",
    "populacao", "população", "pop estimada",
  ],
};

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface ColMap {
  ibge: number;
  ano_mes: number;
  bf_quantidade_familias: number;
  bf_valor_repassado: number;
  bpc_quantidade_total: number;
  bpc_quantidade_deficiencia: number;
  bpc_quantidade_idoso: number;
  bpc_valor_deficiencia: number;
  bpc_valor_idoso: number;
  bpc_valor_total: number;
  populacao_estimada: number;
}

interface MisRow {
  ano: number;
  mes: number;
  ano_mes: string;
  codigo_ibge_municipio: string;
  nome_municipio: string;
  bf_quantidade_familias: number | null;
  bf_valor_repassado: number | null;
  bpc_quantidade_total: number | null;
  bpc_quantidade_deficiencia: number | null;
  bpc_quantidade_idoso: number | null;
  bpc_valor_deficiencia: number | null;
  bpc_valor_idoso: number | null;
  bpc_valor_total: number | null;
  populacao_estimada: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = parseFloat(String(v).replace(/,/g, "."));
  return isNaN(n) ? null : n;
}

function temDados(row: MisRow): boolean {
  return [
    row.bf_quantidade_familias,
    row.bf_valor_repassado,
    row.bpc_quantidade_total,
    row.bpc_quantidade_deficiencia,
    row.bpc_quantidade_idoso,
    row.bpc_valor_deficiencia,
    row.bpc_valor_idoso,
    row.bpc_valor_total,
  ].some((v) => v !== null && v !== 0);
}

function hashRow(row: MisRow): string {
  const payload = JSON.stringify([
    row.bf_quantidade_familias,
    row.bf_valor_repassado,
    row.bpc_quantidade_total,
    row.bpc_quantidade_deficiencia,
    row.bpc_quantidade_idoso,
    row.bpc_valor_deficiencia,
    row.bpc_valor_idoso,
    row.bpc_valor_total,
    row.populacao_estimada,
  ]);
  return crypto.createHash("md5").update(payload).digest("hex");
}

/** Converte YYYYMM → YYYY-MM. Retorna null se inválido. */
function parseAnoMes(v: unknown): { ano_mes: string; ano: number; mes: number } | null {
  const s = String(v ?? "").trim();
  const match = s.match(/^(\d{4})(\d{2})$/);
  if (!match) return null;
  const ano = parseInt(match[1], 10);
  const mes = parseInt(match[2], 10);
  if (mes < 1 || mes > 12) return null;
  return { ano_mes: `${match[1]}-${match[2]}`, ano, mes };
}

// ---------------------------------------------------------------------------
// Validação estrutural
// ---------------------------------------------------------------------------

interface ValidacaoResult {
  ok: boolean;
  erros: string[];
  avisos: string[];
  colMap?: ColMap;
  nomeArquivo: string;
}

function validarArquivo(filePath: string): ValidacaoResult {
  const nomeArquivo = path.basename(filePath);
  const erros: string[] = [];
  const avisos: string[] = [];

  // 1. Arquivo existe e é xlsx
  if (!fs.existsSync(filePath)) {
    return { ok: false, erros: [`Arquivo não encontrado: ${filePath}`], avisos, nomeArquivo };
  }

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.readFile(filePath);
  } catch (e) {
    return { ok: false, erros: [`Falha ao ler xlsx: ${(e as Error).message}`], avisos, nomeArquivo };
  }

  // 2. Tem pelo menos uma aba
  if (!wb.SheetNames.length) {
    return { ok: false, erros: ["Arquivo sem abas."], avisos, nomeArquivo };
  }
  if (wb.SheetNames.length > 1) {
    avisos.push(`Arquivo tem ${wb.SheetNames.length} abas — usando a primeira: "${wb.SheetNames[0]}"`);
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

  // 3. Tem cabeçalho e pelo menos 1 linha de dado
  if (raw.length < 2) {
    return { ok: false, erros: ["Arquivo vazio ou sem dados (apenas cabeçalho)."], avisos, nomeArquivo };
  }

  const header = (raw[0] as unknown[]).map((c) => norm(c));
  const primeiraLinha = raw[1] as unknown[];

  // 4. Detectar coluna IBGE por conteúdo (valor 7 dígitos iniciando com 12)
  let ibgeIdx = -1;
  for (let i = 0; i < primeiraLinha.length; i++) {
    const val = String(primeiraLinha[i] ?? "").trim();
    if (/^12\d{5}$/.test(val)) { ibgeIdx = i; break; }
  }
  if (ibgeIdx === -1) {
    erros.push(
      `Coluna de código IBGE não encontrada. ` +
      `Esperado valor de 7 dígitos iniciando com 12 na primeira linha de dados. ` +
      `Valores encontrados: ${primeiraLinha.slice(0, 5).join(" | ")}`,
    );
  }

  // 5. Mapear demais colunas por aliases
  const mapped: Partial<Record<keyof typeof ALIASES, number>> = {};
  for (const [campo, aliases] of Object.entries(ALIASES)) {
    const idx = aliases.findIndex((alias) => header.includes(norm(alias)));
    if (idx >= 0) {
      mapped[campo as keyof typeof ALIASES] = header.indexOf(norm(aliases[idx]));
    } else {
      erros.push(`Coluna obrigatória não encontrada: "${campo}". Cabeçalho: ${header.join(" | ")}`);
    }
  }

  if (erros.length > 0) {
    return { ok: false, erros, avisos, nomeArquivo };
  }

  const colMap: ColMap = {
    ibge: ibgeIdx,
    ano_mes: mapped.ano_mes!,
    bf_quantidade_familias: mapped.bf_quantidade_familias!,
    bf_valor_repassado: mapped.bf_valor_repassado!,
    bpc_quantidade_total: mapped.bpc_quantidade_total!,
    bpc_quantidade_deficiencia: mapped.bpc_quantidade_deficiencia!,
    bpc_quantidade_idoso: mapped.bpc_quantidade_idoso!,
    bpc_valor_deficiencia: mapped.bpc_valor_deficiencia!,
    bpc_valor_idoso: mapped.bpc_valor_idoso!,
    bpc_valor_total: mapped.bpc_valor_total!,
    populacao_estimada: mapped.populacao_estimada!,
  };

  return { ok: true, erros, avisos, colMap, nomeArquivo };
}

// ---------------------------------------------------------------------------
// Leitura e parseamento das linhas
// ---------------------------------------------------------------------------

function lerArquivo(filePath: string, colMap: ColMap): MisRow[] {
  const nomeArquivo = path.basename(filePath);
  // Extrai nome do município do nome do arquivo: "{ibge} - {nome}.xlsx"
  const nomeMunicipio = nomeArquivo.replace(/^\d+\s*-\s*/, "").replace(/\.xlsx$/i, "").trim();

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

  const rows: MisRow[] = [];

  for (let i = 1; i < raw.length; i++) {
    const cols = raw[i] as unknown[];

    const ibge = String(cols[colMap.ibge] ?? "").trim();
    if (!/^12\d{5}$/.test(ibge)) continue; // pula linhas sem IBGE válido (rodapés, etc.)

    const competencia = parseAnoMes(cols[colMap.ano_mes]);
    if (!competencia) continue;

    const row: MisRow = {
      ...competencia,
      codigo_ibge_municipio: ibge,
      nome_municipio: nomeMunicipio,
      bf_quantidade_familias:    toNum(cols[colMap.bf_quantidade_familias]),
      bf_valor_repassado:        toNum(cols[colMap.bf_valor_repassado]),
      bpc_quantidade_total:      toNum(cols[colMap.bpc_quantidade_total]),
      bpc_quantidade_deficiencia: toNum(cols[colMap.bpc_quantidade_deficiencia]),
      bpc_quantidade_idoso:      toNum(cols[colMap.bpc_quantidade_idoso]),
      bpc_valor_deficiencia:     toNum(cols[colMap.bpc_valor_deficiencia]),
      bpc_valor_idoso:           toNum(cols[colMap.bpc_valor_idoso]),
      bpc_valor_total:           toNum(cols[colMap.bpc_valor_total]),
      populacao_estimada:        toNum(cols[colMap.populacao_estimada]),
    };

    if (!temDados(row)) continue; // ignora registros sem dados reais

    rows.push(row);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Upsert com hash-guard
// ---------------------------------------------------------------------------

async function upsertRows(
  rows: MisRow[],
  fonte: string,
): Promise<{ inseridos: number; atualizados: number; ignorados: number }> {
  let inseridos = 0;
  let atualizados = 0;
  let ignorados = 0;

  for (const row of rows) {
    const hash = hashRow(row);
    const result = await pgQuery<{ xmax: string }>(
      `INSERT INTO social.mis_bolsa_familia_bpc (
         ano, mes, ano_mes, codigo_ibge_municipio, nome_municipio,
         bf_quantidade_familias, bf_valor_repassado,
         bpc_quantidade_total, bpc_quantidade_deficiencia, bpc_quantidade_idoso,
         bpc_valor_deficiencia, bpc_valor_idoso, bpc_valor_total,
         populacao_estimada, fonte, hash_registro
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (ano_mes, codigo_ibge_municipio) DO UPDATE SET
         bf_quantidade_familias     = EXCLUDED.bf_quantidade_familias,
         bf_valor_repassado         = EXCLUDED.bf_valor_repassado,
         bpc_quantidade_total       = EXCLUDED.bpc_quantidade_total,
         bpc_quantidade_deficiencia = EXCLUDED.bpc_quantidade_deficiencia,
         bpc_quantidade_idoso       = EXCLUDED.bpc_quantidade_idoso,
         bpc_valor_deficiencia      = EXCLUDED.bpc_valor_deficiencia,
         bpc_valor_idoso            = EXCLUDED.bpc_valor_idoso,
         bpc_valor_total            = EXCLUDED.bpc_valor_total,
         populacao_estimada         = EXCLUDED.populacao_estimada,
         nome_municipio             = EXCLUDED.nome_municipio,
         fonte                      = EXCLUDED.fonte,
         hash_registro              = EXCLUDED.hash_registro,
         data_carga                 = now(),
         atualizado_em              = now()
       WHERE social.mis_bolsa_familia_bpc.hash_registro IS DISTINCT FROM EXCLUDED.hash_registro
       RETURNING xmax::text`,
      [
        row.ano, row.mes, row.ano_mes, row.codigo_ibge_municipio, row.nome_municipio,
        row.bf_quantidade_familias, row.bf_valor_repassado,
        row.bpc_quantidade_total, row.bpc_quantidade_deficiencia, row.bpc_quantidade_idoso,
        row.bpc_valor_deficiencia, row.bpc_valor_idoso, row.bpc_valor_total,
        row.populacao_estimada, fonte, hash,
      ],
    );

    if (result.length === 0) ignorados++;         // hash idêntico — nenhuma escrita
    else if (result[0].xmax === "0") inseridos++;  // novo registro
    else atualizados++;                            // registro atualizado
  }

  return { inseridos, atualizados, ignorados };
}

// ---------------------------------------------------------------------------
// Job principal
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${MODULO}] Iniciando — pasta: ${DATA_DIR}`);

  // Lista arquivos xlsx, ignorando temporários do Excel (~$*)
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`[${MODULO}] Pasta não encontrada: ${DATA_DIR}`);
    process.exit(1);
  }

  const arquivos = fs.readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".xlsx") && !f.startsWith("~$"))
    .map((f) => path.join(DATA_DIR, f))
    .sort();

  if (arquivos.length === 0) {
    console.warn(`[${MODULO}] Nenhum arquivo xlsx encontrado em ${DATA_DIR}`);
    await registrarLogEtl({ modulo: MODULO, status: "erro", mensagem: "Nenhum arquivo xlsx encontrado." });
    return;
  }

  console.log(`[${MODULO}] ${arquivos.length} arquivo(s) encontrado(s)`);

  // Fase 1: validação estrutural de todos os arquivos antes de qualquer escrita
  console.log(`\n[${MODULO}] ── Fase 1: Validação estrutural ──`);
  const validacoes = arquivos.map(validarArquivo);
  const invalidos  = validacoes.filter((v) => !v.ok);

  for (const v of validacoes) {
    if (v.avisos.length) v.avisos.forEach((a) => console.warn(`  ⚠  ${v.nomeArquivo}: ${a}`));
    if (!v.ok)           v.erros.forEach((e)  => console.error(`  ✗  ${v.nomeArquivo}: ${e}`));
    else                 console.log(`  ✓  ${v.nomeArquivo}`);
  }

  if (invalidos.length > 0) {
    const msg = `${invalidos.length} arquivo(s) com estrutura inválida — carga abortada. Corrija os erros acima.`;
    console.error(`\n[${MODULO}] ABORTADO: ${msg}`);
    await registrarLogEtl({ modulo: MODULO, status: "erro", mensagem: msg });
    return;
  }

  console.log(`[${MODULO}] Validação OK — todos os arquivos aprovados\n`);

  // Fase 2: carga
  console.log(`[${MODULO}] ── Fase 2: Carga ──`);
  let totalInseridos  = 0;
  let totalAtualizados = 0;
  let totalIgnorados  = 0;
  let totalLidos      = 0;
  const errosCarga: string[] = [];

  for (const val of validacoes) {
    const rows = lerArquivo(val.nomeArquivo.startsWith(path.sep) ? val.nomeArquivo : path.join(DATA_DIR, val.nomeArquivo), val.colMap!);
    totalLidos += rows.length;

    try {
      const { inseridos, atualizados, ignorados } = await upsertRows(rows, `MIS/${val.nomeArquivo}`);
      totalInseridos   += inseridos;
      totalAtualizados += atualizados;
      totalIgnorados   += ignorados;
      console.log(
        `  ${val.nomeArquivo}: ${rows.length} reg → ` +
        `inseridos=${inseridos} atualizados=${atualizados} sem_mudança=${ignorados}`,
      );
    } catch (err) {
      const msg = `${val.nomeArquivo}: ${(err as Error).message}`;
      console.error(`  ERRO ${msg}`);
      errosCarga.push(msg);
    }
  }

  const duracao = Date.now() - inicio;
  const status  = errosCarga.length > 0 ? "erro" : "sucesso";
  const mensagem = errosCarga.length > 0
    ? `Erros em ${errosCarga.length} arquivo(s): ${errosCarga.join("; ")}`
    : `inseridos=${totalInseridos} atualizados=${totalAtualizados} sem_mudança=${totalIgnorados}`;

  console.log(
    `\n[${MODULO}] Concluído em ${duracao}ms — ` +
    `lidos=${totalLidos} inseridos=${totalInseridos} atualizados=${totalAtualizados} sem_mudança=${totalIgnorados}`,
  );

  await registrarLogEtl({
    modulo: MODULO,
    status,
    registros: totalInseridos + totalAtualizados,
    duracaoMs: duracao,
    mensagem,
  });
}

main().catch((err) => {
  console.error(`[${MODULO}] Erro fatal:`, (err as Error).message);
  process.exit(1);
}).finally(() => closePgPool());
