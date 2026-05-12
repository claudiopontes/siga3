/**
 * ingest-sim-csv.ts
 *
 * Carga SIM a partir de arquivos CSV locais (formato DATASUS OPEN).
 * Arquivos esperados em etl/data/sim/:
 *   DO22OPEN.csv, DO23OPEN.csv, DO24OPEN.csv, DO25OPEN.csv
 *
 * Separador: ;  Encoding: latin1  Filtro: CODMUNRES começando com '12' (Acre)
 * Idempotente: apaga registros do ano/fonte antes de reinserir.
 *
 * Uso: cd etl && npm run sim:csv:ingest
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { withPgTransaction, closePgPool, pgQuery } from "../connectors/postgres";

// ─── Configuração ─────────────────────────────────────────────────────────────

const MODULO    = "sim_csv_ingest";
const DATA_DIR  = path.resolve(__dirname, "../data/sim");
const UF_PREFIX = process.env.SIM_UF_PREFIX ?? "12";  // CODMUNRES do Acre começa com 12
const BATCH_SIZE = 200;
const FONTE     = "SIM_CSV_OPEN";

// Mapeia nome do arquivo para ano
function anoDoArquivo(nome: string): number | null {
  const m = nome.match(/DO(\d{2})OPEN\.csv$/i);
  if (!m) return null;
  const yy = parseInt(m[1], 10);
  return yy >= 90 ? 1900 + yy : 2000 + yy;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toStr(v: string): string | null {
  const s = v.trim().replace(/^"|"$/g, "");
  return s === "" ? null : s;
}

function toInt(v: string): number | null {
  const s = toStr(v);
  if (!s) return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

// DTOBITO vem como DDMMYYYY (ex: "21042022")
function parseDataObito(v: string): string | null {
  const s = toStr(v);
  if (!s || s.length !== 8) return null;
  const d = s.slice(0, 2), m = s.slice(2, 4), y = s.slice(4, 8);
  const dt = `${y}-${m}-${d}`;
  return isNaN(Date.parse(dt)) ? null : dt;
}

// Campo IDADE do SIM: 1º dígito = unidade, 2 últimos = quantidade
function parseIdade(v: string): {
  idade_dias: number | null;
  idade_anos: number | null;
  faixa_etaria: string;
  is_ignorada: boolean;
  is_infantil: boolean;
  is_neonatal: boolean;
  is_pos_neonatal: boolean;
} {
  const vazio = { idade_dias: null, idade_anos: null, faixa_etaria: "Ignorado",
    is_ignorada: true, is_infantil: false, is_neonatal: false, is_pos_neonatal: false };
  const s = toStr(v);
  if (!s) return vazio;
  const padded = s.padStart(3, "0");
  const unidade = padded[0];
  const qtd = parseInt(padded.slice(1), 10);
  if (isNaN(qtd) || unidade === "9") return vazio;

  let dias: number | null = null;
  let anos: number | null = null;

  if (unidade === "1") { dias = 0; }                        // minutos
  else if (unidade === "2") { dias = 0; }                   // horas
  else if (unidade === "3") { dias = qtd * 30; }            // meses (aprox)
  else if (unidade === "4") { anos = qtd; dias = qtd * 365; }
  else if (unidade === "5") { anos = 100 + qtd; dias = anos * 365; }

  const infantil    = dias !== null && anos === null;        // < 1 ano
  const neonatal    = dias !== null && dias < 28;
  const posNeonatal = infantil && !neonatal;

  let faixa = "≥ 1 ano";
  if (neonatal)    faixa = "Neonatal (< 28 dias)";
  else if (posNeonatal) faixa = "Pós-neonatal (28–364 dias)";
  else if (anos !== null) {
    if (anos < 5)        faixa = "1–4 anos";
    else if (anos < 15)  faixa = "5–14 anos";
    else if (anos < 30)  faixa = "15–29 anos";
    else if (anos < 50)  faixa = "30–49 anos";
    else if (anos < 70)  faixa = "50–69 anos";
    else                 faixa = "≥ 70 anos";
  }

  return { idade_dias: dias, idade_anos: anos, faixa_etaria: faixa,
    is_ignorada: false, is_infantil: infantil, is_neonatal: neonatal, is_pos_neonatal: posNeonatal };
}

// TPMORTEOCO: 1–4 = óbito materno, 5 = materno tardio
function parseTpMorteoco(v: string): {
  tpmorteoco: string | null;
  is_materno: boolean;
  is_materno_tardio: boolean;
  morte_relacao_gravidez: string | null;
} {
  const s = toStr(v);
  const cod = s ? parseInt(s, 10) : NaN;
  const labels: Record<number, string> = {
    1: "Na gravidez", 2: "No parto", 3: "No abortamento",
    4: "Até 42 dias após parto", 5: "43 dias a 1 ano após gestação",
    8: "Não ocorreu", 9: "Ignorado",
  };
  return {
    tpmorteoco: s,
    is_materno: !isNaN(cod) && [1, 2, 3, 4].includes(cod),
    is_materno_tardio: cod === 5,
    morte_relacao_gravidez: !isNaN(cod) ? (labels[cod] ?? null) : null,
  };
}

// ─── Processamento de linha ────────────────────────────────────────────────────

interface CamposSIM {
  // índice baseado no cabeçalho observado
  ORIGEM: 0; TIPOBITO: 1; DTOBITO: 2; HORAOBITO: 3; NATURAL: 4;
  CODMUNNATU: 5; DTNASC: 6; IDADE: 7; SEXO: 8; RACACOR: 9;
  ESTCIV: 10; ESC: 11; ESC2010: 12; SERIESCFAL: 13; OCUP: 14;
  CODMUNRES: 15; LOCOCOR: 16; CODESTAB: 17; ESTABDESCR: 18;
  CODMUNOCOR: 19; IDADEMAE: 20; ESCMAE: 21; ESCMAE2010: 22;
  SERIESCMAE: 23; OCUPMAE: 24; QTDFILVIVO: 25; QTDFILMORT: 26;
  GRAVIDEZ: 27; SEMAGESTAC: 28; GESTACAO: 29; PARTO: 30;
  OBITOPARTO: 31; PESO: 32; TPMORTEOCO: 33; OBITOGRAV: 34;
  OBITOPUERP: 35; ASSISTMED: 36; EXAME: 37; CIRURGIA: 38;
  NECROPSIA: 39; LINHAA: 40; LINHAB: 41; LINHAC: 42; LINHAD: 43;
  LINHAII: 44; CAUSABAS: 45;
}

type ColIdx = Record<string, number>;

function normalizarLinha(fields: string[], idx: ColIdx, anoArquivo: number, dataObito: string | null) {
  const g  = (col: string) => fields[idx[col] ?? -1] ?? "";

  const codMunRes = toStr(g("CODMUNRES"));
  const tipobito  = toStr(g("TIPOBITO"));
  const isFetal   = tipobito === "1";

  const idadeParsed = parseIdade(g("IDADE"));
  const { tpmorteoco, is_materno, is_materno_tardio, morte_relacao_gravidez } = parseTpMorteoco(g("TPMORTEOCO"));

  const pesoRaw = toInt(g("PESO"));
  const isBaixoPeso = pesoRaw !== null && pesoRaw > 0 && pesoRaw < 2500;

  const assistmed = toStr(g("ASSISTMED"));

  return {
    ano_obito:                    dataObito ? parseInt(dataObito.slice(0, 4), 10) : anoArquivo,
    data_obito:                   dataObito,
    tipo_obito:                   isFetal ? "fetal" : "nao_fetal",
    codigo_municipio_residencia:  codMunRes ? codMunRes.slice(0, 6) : null,
    uf_residencia:                codMunRes?.startsWith("12") ? "AC" : null,
    codigo_municipio_ocorrencia:  toStr(g("CODMUNOCOR"))?.slice(0, 6) ?? null,
    uf_ocorrencia:                null as string | null,
    local_ocorrencia:             toStr(g("LOCOCOR")),
    cnes_ocorrencia:              toStr(g("CODESTAB")),
    idade_dias:                   idadeParsed.idade_dias,
    idade_anos:                   idadeParsed.idade_anos,
    faixa_etaria:                 idadeParsed.faixa_etaria,
    is_obito_infantil:            idadeParsed.is_infantil,
    is_obito_neonatal:            idadeParsed.is_neonatal,
    is_obito_pos_neonatal:        idadeParsed.is_pos_neonatal,
    sexo:                         toStr(g("SEXO")),
    raca_cor:                     toStr(g("RACACOR")),
    idade_mae:                    toInt(g("IDADEMAE")),
    semanas_gestacao:             toInt(g("SEMAGESTAC")),
    tipo_gravidez:                toStr(g("GRAVIDEZ")),
    tipo_parto:                   toStr(g("PARTO")),
    peso_gramas:                  pesoRaw,
    is_baixo_peso:                isBaixoPeso,
    is_obito_materno:             is_materno,
    is_obito_materno_tardio:      is_materno_tardio,
    tpmorteoco,
    morte_relacao_gravidez_parto: morte_relacao_gravidez,
    assistencia_medica:           assistmed,
    necropsia:                    toStr(g("NECROPSIA")),
    causa_basica:                 toStr(g("CAUSABAS")),
    cid:                          toStr(g("CAUSABAS")),
    fonte_dado:                   FONTE,
    ano_fonte:                    anoArquivo,
    api_endpoint:                 null as string | null,
    carregado_via:                "CSV_DATASUS_OPEN",
  };
}

// ─── Ingestão de um arquivo ───────────────────────────────────────────────────

async function ingerirArquivo(caminho: string, ano: number): Promise<number> {
  console.log(`\n[${MODULO}] ── ${path.basename(caminho)} (${ano}) ──`);

  // Idempotência: remove dados anteriores deste ano/fonte
  await withPgTransaction(async (client) => {
    const { rowCount } = await client.query(
      `DELETE FROM dw.fato_sim_obito WHERE ano_obito = $1 AND fonte_dado = $2`,
      [ano, FONTE]
    );
    if (rowCount && rowCount > 0) {
      console.log(`[${MODULO}]   Removidos ${rowCount} registros anteriores do ano ${ano}`);
    }
  });

  const fileStream = fs.createReadStream(caminho);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headerLine: string | null = null;
  let idx: ColIdx = {};
  let batch: ReturnType<typeof normalizarLinha>[] = [];
  let totalLido = 0;
  let totalAC = 0;
  let totalInserido = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    await withPgTransaction(async (client) => {
      for (const r of batch) {
        await client.query(`
          INSERT INTO dw.fato_sim_obito (
            ano_obito, data_obito, tipo_obito,
            codigo_municipio_residencia, uf_residencia,
            codigo_municipio_ocorrencia, uf_ocorrencia,
            local_ocorrencia, cnes_ocorrencia,
            idade_dias, idade_anos, faixa_etaria,
            is_obito_infantil, is_obito_neonatal, is_obito_pos_neonatal,
            sexo, raca_cor, idade_mae, semanas_gestacao,
            tipo_gravidez, tipo_parto, peso_gramas, is_baixo_peso,
            is_obito_materno, is_obito_materno_tardio,
            tpmorteoco, morte_relacao_gravidez_parto,
            assistencia_medica, necropsia, causa_basica, cid,
            fonte_dado, ano_fonte, carregado_via
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
            $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34
          )
        `, [
          r.ano_obito, r.data_obito, r.tipo_obito,
          r.codigo_municipio_residencia, r.uf_residencia,
          r.codigo_municipio_ocorrencia, r.uf_ocorrencia,
          r.local_ocorrencia, r.cnes_ocorrencia,
          r.idade_dias, r.idade_anos, r.faixa_etaria,
          r.is_obito_infantil, r.is_obito_neonatal, r.is_obito_pos_neonatal,
          r.sexo, r.raca_cor, r.idade_mae, r.semanas_gestacao,
          r.tipo_gravidez, r.tipo_parto, r.peso_gramas, r.is_baixo_peso,
          r.is_obito_materno, r.is_obito_materno_tardio,
          r.tpmorteoco, r.morte_relacao_gravidez_parto,
          r.assistencia_medica, r.necropsia, r.causa_basica, r.cid,
          r.fonte_dado, r.ano_fonte, r.carregado_via,
        ]);
      }
    });
    totalInserido += batch.length;
    batch = [];
  };

  for await (const rawLine of rl) {
    // Decodifica latin1 → utf8 (Node lê como binary se não especificado)
    const line = Buffer.from(rawLine, "binary").toString("latin1");

    if (!headerLine) {
      headerLine = line;
      const cols = headerLine.split(";").map(c => c.trim().replace(/^"|"$/g, ""));
      cols.forEach((col, i) => { idx[col] = i; });
      console.log(`[${MODULO}]   Colunas detectadas: ${cols.length}`);
      continue;
    }

    totalLido++;
    const fields = line.split(";");
    const codMunRes = (fields[idx["CODMUNRES"] ?? 15] ?? "").trim().replace(/^"|"$/g, "");

    if (!codMunRes.startsWith(UF_PREFIX)) continue;

    totalAC++;
    const dtObito = parseDataObito((fields[idx["DTOBITO"] ?? 2] ?? "").replace(/^"|"$/g, ""));
    const norm = normalizarLinha(fields, idx, ano, dtObito);

    batch.push(norm);
    if (batch.length >= BATCH_SIZE) {
      await flush();
      if (totalInserido % 1000 === 0) {
        process.stdout.write(`\r[${MODULO}]   Inseridos: ${totalInserido} / AC lidos: ${totalAC}`);
      }
    }
  }

  await flush();
  console.log(`\n[${MODULO}]   ✓ Ano ${ano}: ${totalLido} linhas lidas, ${totalAC} AC encontradas, ${totalInserido} inseridas`);
  return totalInserido;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function executarETL(): Promise<void> {
  const inicio = Date.now();
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  SIM — Ingestão CSV DATASUS OPEN                     ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`Diretório: ${DATA_DIR}`);
  console.log(`Filtro UF: CODMUNRES starts with '${UF_PREFIX}'`);

  const arquivos = fs.readdirSync(DATA_DIR)
    .filter(f => /^DO\d{2}OPEN\.csv$/i.test(f))
    .sort();

  if (arquivos.length === 0) {
    console.error(`Nenhum arquivo DO??OPEN.csv encontrado em ${DATA_DIR}`);
    process.exit(1);
  }

  console.log(`Arquivos encontrados: ${arquivos.join(", ")}`);

  let totalGeral = 0;
  for (const arq of arquivos) {
    const ano = anoDoArquivo(arq);
    if (!ano) { console.log(`Ignorando ${arq} — não foi possível extrair o ano`); continue; }
    const caminho = path.join(DATA_DIR, arq);
    totalGeral += await ingerirArquivo(caminho, ano);
  }

  const duracao = Math.round((Date.now() - inicio) / 1000);
  console.log(`\n✅ Carga concluída: ${totalGeral} registros em ${duracao}s`);

  await pgQuery(
    `INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
     VALUES ($1, 'OK', $2, $3, $4)`,
    [MODULO, `SIM CSV OPEN — AC ${arquivos.join(",")}`, totalGeral, duracao * 1000]
  );
}

if (require.main === module) {
  executarETL()
    .then(() => closePgPool())
    .catch((err) => {
      console.error(`[${MODULO}] Erro fatal:`, (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
