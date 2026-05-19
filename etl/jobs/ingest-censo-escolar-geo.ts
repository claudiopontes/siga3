/**
 * ingest-censo-escolar-geo.ts
 *
 * Fase 17D — Extrai apenas o CSV `escolas.csv` (ou equivalente) do microdado
 * do Censo Escolar do INEP, filtra UF=AC e popula public.dim_escola_inep
 * com nome, dependência, localização e coordenadas. Microdado bruto NÃO
 * é persistido.
 *
 * Estrutura de pastas variando por ano:
 *   2023: microdados_ed_basica_2023.csv ou dados/*.csv (separados)
 *   2022 e anteriores: dados/ESCOLAS.CSV (todo maiúsculo) + outras
 *
 * Este job tolera ambos os layouts: lista CSVs do ZIP e escolhe o que
 * tem "escola" no nome OU é o maior (microdados unificados).
 *
 * Variáveis de ambiente:
 *   INEP_CENSO_DIR — diretório dos ZIPs (padrão: ./data/inep/censo)
 *   INEP_UF        — filtro UF (padrão: AC; "ALL" para tudo)
 *
 * Uso: cd etl && npx ts-node jobs/ingest-censo-escolar-geo.ts
 */

import "dotenv/config";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import { spawnSync } from "child_process";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

const CENSO_DIR = process.env.INEP_CENSO_DIR || path.resolve(__dirname, "../data/inep/censo");
const UF_FILTRO = (process.env.INEP_UF || "AC").toUpperCase();
const FILTRAR_UF = UF_FILTRO !== "ALL";

// ---------------------------------------------------------------------------
// Helpers de ZIP/CSV
// ---------------------------------------------------------------------------

function extrairZipParaTmp(zipPath: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "inep-censo-"));
  const r = spawnSync("tar", ["-xf", zipPath, "-C", tmpDir], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`Falha ao extrair ${zipPath}: ${r.stderr || r.stdout}`);
  return tmpDir;
}

interface CsvCandidato { caminho: string; nome: string; tamanho: number }

function listarCsvs(dir: string): CsvCandidato[] {
  const out: CsvCandidato[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && /\.csv$/i.test(entry.name)) {
      const st = fs.statSync(full);
      out.push({ caminho: full, nome: entry.name, tamanho: st.size });
    } else if (entry.isDirectory()) {
      out.push(...listarCsvs(full));
    }
  }
  return out;
}

function escolherCsvEscolas(csvs: CsvCandidato[]): CsvCandidato | null {
  // Prioridade 1: nome contém "escola" e não contém "matricula"/"turma"/"docente"
  const prio1 = csvs.filter((c) => /escola/i.test(c.nome) && !/matricula|turma|docente/i.test(c.nome));
  if (prio1.length) return prio1.sort((a, b) => b.tamanho - a.tamanho)[0];

  // Prioridade 2: nome contém "ed_basica" (Censo unificado 2023+)
  const prio2 = csvs.filter((c) => /ed_basica|ed[-_ ]basica/i.test(c.nome));
  if (prio2.length) return prio2.sort((a, b) => b.tamanho - a.tamanho)[0];

  // Prioridade 3: maior CSV
  if (csvs.length) return csvs.sort((a, b) => b.tamanho - a.tamanho)[0];

  return null;
}

function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === sep) { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function detectarSeparador(linha: string): string {
  const candidatos = [";", "|", ",", "\t"];
  let melhor = ",";
  let maior = 0;
  for (const s of candidatos) {
    const n = linha.split(s).length;
    if (n > maior) { maior = n; melhor = s; }
  }
  return melhor;
}

// ---------------------------------------------------------------------------
// Mapeamento de colunas (Censo Escolar)
// ---------------------------------------------------------------------------

function num(v: string | undefined): number | null {
  if (!v) return null;
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function int(v: string | undefined): number | null {
  if (!v) return null;
  const t = v.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

/** Microdado INEP usa "0"/"1" para flags binárias. Vazio = desconhecido. */
function bool(v: string | undefined): boolean | null {
  if (!v) return null;
  const t = v.trim();
  if (t === "1") return true;
  if (t === "0") return false;
  return null;
}

function txt(v: string | undefined): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/** Lê coluna do CSV pela primeira variante de nome que existir. */
function pick(cols: string[], idxCol: Map<string, number>, ...nomes: string[]): string | undefined {
  for (const n of nomes) {
    const i = idxCol.get(n);
    if (i !== undefined && i >= 0) return cols[i];
  }
  return undefined;
}

function dependenciaPorCodigo(co: string | undefined): string | null {
  switch ((co ?? "").trim()) {
    case "1": return "Federal";
    case "2": return "Estadual";
    case "3": return "Municipal";
    case "4": return "Privada";
    default:  return null;
  }
}

function localizacaoPorCodigo(co: string | undefined): string | null {
  switch ((co ?? "").trim()) {
    case "1": return "Urbana";
    case "2": return "Rural";
    default:  return null;
  }
}

function situacaoPorCodigo(co: string | undefined): string | null {
  switch ((co ?? "").trim()) {
    case "1": return "Em atividade";
    case "2": return "Paralisada";
    case "3": return "Extinta";
    case "4": return "Extinta em anos anteriores";
    default:  return null;
  }
}

// ---------------------------------------------------------------------------
// Processamento principal
// ---------------------------------------------------------------------------

interface Resultado {
  arquivo: string;
  ano_censo: number;
  linhas_lidas: number;
  escolas_filtradas: number;
  escolas_persistidas: number;
  com_geo: number;
  erro: string | null;
}

function anoDoNome(zipName: string): number | null {
  const m = zipName.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

async function processarZip(zipPath: string): Promise<Resultado> {
  const arquivo = path.basename(zipPath);
  const ano = anoDoNome(arquivo) ?? new Date().getFullYear();
  const r: Resultado = {
    arquivo, ano_censo: ano,
    linhas_lidas: 0, escolas_filtradas: 0, escolas_persistidas: 0, com_geo: 0, erro: null,
  };

  let tmpDir: string | null = null;
  try {
    console.log(`  Extraindo ZIP (~600MB pode levar ~30s)…`);
    tmpDir = extrairZipParaTmp(zipPath);
    const csvs = listarCsvs(tmpDir);
    if (!csvs.length) { r.erro = "Nenhum CSV encontrado no ZIP"; return r; }
    console.log(`  ${csvs.length} CSV(s) encontrados, escolhendo o de escolas…`);
    const escolhido = escolherCsvEscolas(csvs);
    if (!escolhido) { r.erro = "CSV de escolas não localizado"; return r; }
    console.log(`  Arquivo escolhido: ${path.basename(escolhido.caminho)} (${(escolhido.tamanho / 1024 / 1024).toFixed(1)}MB)`);

    // Leitura streaming linha a linha
    const inFile = fs.createReadStream(escolhido.caminho, { encoding: "latin1" }); // INEP usa ISO-8859-1
    const rl = readline.createInterface({ input: inFile, crlfDelay: Infinity });

    let header: string[] | null = null;
    let sep = ";";
    const idxCol = new Map<string, number>();
    const bufferInsert: Array<Record<string, unknown>> = [];
    const BATCH = 500;

    const flush = async () => {
      if (!bufferInsert.length) return;
      await withPgTransaction(async (client) => {
        for (const row of bufferInsert) {
          await client.query(`
            INSERT INTO public.dim_escola_inep
              (cod_escola, no_escola, cod_municipio, no_municipio, sg_uf,
               dependencia, localizacao, porte, etapas_atendidas, situacao,
               latitude, longitude, endereco, ano_censo, payload,
               qt_mat_bas, qt_mat_inf, qt_mat_fund, qt_mat_med, qt_mat_prof, qt_mat_eja, qt_mat_esp,
               qt_doc_bas, qt_doc_inf, qt_doc_fund, qt_doc_med, qt_doc_prof,
               infra_agua_potavel, infra_energia_eletrica, infra_esgoto, infra_lixo_coletado,
               infra_internet, infra_internet_alunos, infra_biblioteca,
               infra_lab_informatica, infra_lab_ciencias, infra_quadra_esportes,
               infra_alimentacao, infra_acessibilidade,
               atualizado_em)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
                    $16,$17,$18,$19,$20,$21,$22,
                    $23,$24,$25,$26,$27,
                    $28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,
                    now())
            ON CONFLICT (cod_escola) DO UPDATE SET
              no_escola         = COALESCE(EXCLUDED.no_escola, public.dim_escola_inep.no_escola),
              cod_municipio     = COALESCE(EXCLUDED.cod_municipio, public.dim_escola_inep.cod_municipio),
              no_municipio      = COALESCE(EXCLUDED.no_municipio, public.dim_escola_inep.no_municipio),
              sg_uf             = COALESCE(EXCLUDED.sg_uf, public.dim_escola_inep.sg_uf),
              dependencia       = COALESCE(EXCLUDED.dependencia, public.dim_escola_inep.dependencia),
              localizacao       = COALESCE(EXCLUDED.localizacao, public.dim_escola_inep.localizacao),
              porte             = COALESCE(EXCLUDED.porte, public.dim_escola_inep.porte),
              etapas_atendidas  = COALESCE(EXCLUDED.etapas_atendidas, public.dim_escola_inep.etapas_atendidas),
              situacao          = COALESCE(EXCLUDED.situacao, public.dim_escola_inep.situacao),
              latitude          = COALESCE(EXCLUDED.latitude, public.dim_escola_inep.latitude),
              longitude         = COALESCE(EXCLUDED.longitude, public.dim_escola_inep.longitude),
              endereco          = COALESCE(EXCLUDED.endereco, public.dim_escola_inep.endereco),
              ano_censo         = EXCLUDED.ano_censo,
              payload           = EXCLUDED.payload,
              qt_mat_bas        = COALESCE(EXCLUDED.qt_mat_bas, public.dim_escola_inep.qt_mat_bas),
              qt_mat_inf        = COALESCE(EXCLUDED.qt_mat_inf, public.dim_escola_inep.qt_mat_inf),
              qt_mat_fund       = COALESCE(EXCLUDED.qt_mat_fund, public.dim_escola_inep.qt_mat_fund),
              qt_mat_med        = COALESCE(EXCLUDED.qt_mat_med, public.dim_escola_inep.qt_mat_med),
              qt_mat_prof       = COALESCE(EXCLUDED.qt_mat_prof, public.dim_escola_inep.qt_mat_prof),
              qt_mat_eja        = COALESCE(EXCLUDED.qt_mat_eja, public.dim_escola_inep.qt_mat_eja),
              qt_mat_esp        = COALESCE(EXCLUDED.qt_mat_esp, public.dim_escola_inep.qt_mat_esp),
              qt_doc_bas        = COALESCE(EXCLUDED.qt_doc_bas, public.dim_escola_inep.qt_doc_bas),
              qt_doc_inf        = COALESCE(EXCLUDED.qt_doc_inf, public.dim_escola_inep.qt_doc_inf),
              qt_doc_fund       = COALESCE(EXCLUDED.qt_doc_fund, public.dim_escola_inep.qt_doc_fund),
              qt_doc_med        = COALESCE(EXCLUDED.qt_doc_med, public.dim_escola_inep.qt_doc_med),
              qt_doc_prof       = COALESCE(EXCLUDED.qt_doc_prof, public.dim_escola_inep.qt_doc_prof),
              infra_agua_potavel     = COALESCE(EXCLUDED.infra_agua_potavel, public.dim_escola_inep.infra_agua_potavel),
              infra_energia_eletrica = COALESCE(EXCLUDED.infra_energia_eletrica, public.dim_escola_inep.infra_energia_eletrica),
              infra_esgoto           = COALESCE(EXCLUDED.infra_esgoto, public.dim_escola_inep.infra_esgoto),
              infra_lixo_coletado    = COALESCE(EXCLUDED.infra_lixo_coletado, public.dim_escola_inep.infra_lixo_coletado),
              infra_internet         = COALESCE(EXCLUDED.infra_internet, public.dim_escola_inep.infra_internet),
              infra_internet_alunos  = COALESCE(EXCLUDED.infra_internet_alunos, public.dim_escola_inep.infra_internet_alunos),
              infra_biblioteca       = COALESCE(EXCLUDED.infra_biblioteca, public.dim_escola_inep.infra_biblioteca),
              infra_lab_informatica  = COALESCE(EXCLUDED.infra_lab_informatica, public.dim_escola_inep.infra_lab_informatica),
              infra_lab_ciencias     = COALESCE(EXCLUDED.infra_lab_ciencias, public.dim_escola_inep.infra_lab_ciencias),
              infra_quadra_esportes  = COALESCE(EXCLUDED.infra_quadra_esportes, public.dim_escola_inep.infra_quadra_esportes),
              infra_alimentacao      = COALESCE(EXCLUDED.infra_alimentacao, public.dim_escola_inep.infra_alimentacao),
              infra_acessibilidade   = COALESCE(EXCLUDED.infra_acessibilidade, public.dim_escola_inep.infra_acessibilidade),
              atualizado_em     = now()
          `, [
            row.cod_escola, row.no_escola, row.cod_municipio, row.no_municipio, row.sg_uf,
            row.dependencia, row.localizacao, row.porte, row.etapas_atendidas, row.situacao,
            row.latitude, row.longitude, row.endereco, row.ano_censo, row.payload,
            row.qt_mat_bas, row.qt_mat_inf, row.qt_mat_fund, row.qt_mat_med, row.qt_mat_prof, row.qt_mat_eja, row.qt_mat_esp,
            row.qt_doc_bas, row.qt_doc_inf, row.qt_doc_fund, row.qt_doc_med, row.qt_doc_prof,
            row.infra_agua_potavel, row.infra_energia_eletrica, row.infra_esgoto, row.infra_lixo_coletado,
            row.infra_internet, row.infra_internet_alunos, row.infra_biblioteca,
            row.infra_lab_informatica, row.infra_lab_ciencias, row.infra_quadra_esportes,
            row.infra_alimentacao, row.infra_acessibilidade,
          ]);
        }
      });
      bufferInsert.length = 0;
    };

    for await (const line of rl) {
      if (!line.trim()) continue;

      if (!header) {
        sep = detectarSeparador(line);
        header = parseCsvLine(line, sep).map((h) => h.trim().toUpperCase());
        header.forEach((h, i) => idxCol.set(h, i));
        continue;
      }

      r.linhas_lidas++;

      const cols = parseCsvLine(line, sep);
      const sg_uf = txt(cols[idxCol.get("SG_UF") ?? -1]);
      if (FILTRAR_UF && sg_uf !== UF_FILTRO) continue;

      const cod_escolaStr = txt(cols[idxCol.get("CO_ENTIDADE") ?? idxCol.get("CO_ESCOLA") ?? -1]);
      const cod_escola = cod_escolaStr ? parseInt(cod_escolaStr, 10) : null;
      if (!cod_escola || !Number.isFinite(cod_escola)) continue;

      r.escolas_filtradas++;

      // INEP variou o nome ao longo dos anos: 2022 usa LATITUDE/LONGITUDE sem prefixo.
      // 2023 unificado removeu geo (resultará null aqui, o que é OK — UPSERT preserva valor anterior).
      const idxLat = idxCol.get("NU_LATITUDE")  ?? idxCol.get("CO_LATITUDE")  ?? idxCol.get("LATITUDE")  ?? -1;
      const idxLng = idxCol.get("NU_LONGITUDE") ?? idxCol.get("CO_LONGITUDE") ?? idxCol.get("LONGITUDE") ?? -1;
      const lat = num(cols[idxLat]);
      const lng = num(cols[idxLng]);
      if (lat !== null && lng !== null) r.com_geo++;

      // Etapas atendidas — concatena flags IN_REGULAR_INFANTIL/FUNDAMENTAL/MEDIO etc. quando presentes
      const etapasFlags: string[] = [];
      if ((cols[idxCol.get("IN_REGULAR_INFANTIL") ?? -1] ?? "") === "1")    etapasFlags.push("EI");
      if ((cols[idxCol.get("IN_REGULAR_FUNDAMENTAL") ?? -1] ?? "") === "1") etapasFlags.push("EF");
      if ((cols[idxCol.get("IN_REGULAR_MEDIO") ?? -1] ?? "") === "1")       etapasFlags.push("EM");
      // Fallback comum: TP_ETAPA_ENSINO ou IN_OFERTA_*
      const etapasAtendidas = etapasFlags.length ? etapasFlags.join(",") : null;

      // Payload com colunas-chave (não guarda tudo do microdado para não explodir DB)
      const payload: Record<string, string | null> = {
        CO_ENTIDADE:    cod_escolaStr,
        NO_ENTIDADE:    txt(cols[idxCol.get("NO_ENTIDADE") ?? -1]),
        TP_DEPENDENCIA: txt(cols[idxCol.get("TP_DEPENDENCIA") ?? -1]),
        TP_LOCALIZACAO: txt(cols[idxCol.get("TP_LOCALIZACAO") ?? -1]),
        TP_SITUACAO_FUNCIONAMENTO: txt(cols[idxCol.get("TP_SITUACAO_FUNCIONAMENTO") ?? -1]),
        DS_ENDERECO:    txt(cols[idxCol.get("DS_ENDERECO") ?? -1]),
      };

      // Matrículas (variações de nome ao longo dos anos)
      const qt_mat_bas  = int(pick(cols, idxCol, "QT_MAT_BAS", "QT_MATRICULAS"));
      const qt_mat_inf  = int(pick(cols, idxCol, "QT_MAT_INF",  "QT_MAT_EI"));
      const qt_mat_fund = int(pick(cols, idxCol, "QT_MAT_FUND"));
      const qt_mat_med  = int(pick(cols, idxCol, "QT_MAT_MED"));
      const qt_mat_prof = int(pick(cols, idxCol, "QT_MAT_PROF", "QT_MAT_EP"));
      const qt_mat_eja  = int(pick(cols, idxCol, "QT_MAT_EJA"));
      const qt_mat_esp  = int(pick(cols, idxCol, "QT_MAT_ESP"));

      // Docentes
      const qt_doc_bas  = int(pick(cols, idxCol, "QT_DOC_BAS",  "QT_DOCENTES"));
      const qt_doc_inf  = int(pick(cols, idxCol, "QT_DOC_INF",  "QT_DOC_EI"));
      const qt_doc_fund = int(pick(cols, idxCol, "QT_DOC_FUND"));
      const qt_doc_med  = int(pick(cols, idxCol, "QT_DOC_MED"));
      const qt_doc_prof = int(pick(cols, idxCol, "QT_DOC_PROF", "QT_DOC_EP"));

      // Infraestrutura (flags 0/1) — pares com fallback comum.
      // Para água/energia/esgoto/lixo, o INEP usa colunas "INEXISTENTE" (true = NÃO TEM!).
      // Invertemos para semantica positiva ("tem água" = !INEXISTENTE).
      const aguaIxn   = bool(pick(cols, idxCol, "IN_AGUA_INEXISTENTE"));
      const energiaIx = bool(pick(cols, idxCol, "IN_ENERGIA_INEXISTENTE"));
      const esgotoIx  = bool(pick(cols, idxCol, "IN_ESGOTO_INEXISTENTE"));
      const lixoIx    = bool(pick(cols, idxCol, "IN_LIXO_SERVICO_COLETA")); // 1 = tem coleta

      const infra_agua_potavel     = aguaIxn === null ? bool(pick(cols, idxCol, "IN_AGUA_POTAVEL", "IN_AGUA_FILTRADA")) : !aguaIxn;
      const infra_energia_eletrica = energiaIx === null ? bool(pick(cols, idxCol, "IN_ENERGIA_REDE_PUBLICA")) : !energiaIx;
      const infra_esgoto           = esgotoIx === null ? bool(pick(cols, idxCol, "IN_ESGOTO_REDE_PUBLICA", "IN_ESGOTO_FOSSA")) : !esgotoIx;
      const infra_lixo_coletado    = lixoIx;

      const infra_internet         = bool(pick(cols, idxCol, "IN_INTERNET"));
      const infra_internet_alunos  = bool(pick(cols, idxCol, "IN_INTERNET_ALUNOS"));
      const infra_biblioteca       = bool(pick(cols, idxCol, "IN_BIBLIOTECA", "IN_BIBLIOTECA_SALA_LEITURA"));
      const infra_lab_informatica  = bool(pick(cols, idxCol, "IN_LABORATORIO_INFORMATICA"));
      const infra_lab_ciencias     = bool(pick(cols, idxCol, "IN_LABORATORIO_CIENCIAS"));
      const infra_quadra_esportes  = bool(pick(cols, idxCol, "IN_QUADRA_ESPORTES"));
      const infra_alimentacao      = bool(pick(cols, idxCol, "IN_ALIMENTACAO"));
      const infra_acessibilidade   = bool(pick(cols, idxCol, "IN_ACESSIBILIDADE_RAMPAS", "IN_ACESSIBILIDADE_CORRIMAO"));

      bufferInsert.push({
        cod_escola,
        no_escola:    txt(cols[idxCol.get("NO_ENTIDADE") ?? idxCol.get("NO_ESCOLA") ?? -1]),
        cod_municipio: (() => {
          const s = txt(cols[idxCol.get("CO_MUNICIPIO") ?? -1]);
          if (!s) return null;
          const n = parseInt(s, 10);
          return Number.isFinite(n) ? n : null;
        })(),
        no_municipio: txt(cols[idxCol.get("NO_MUNICIPIO") ?? -1]),
        sg_uf,
        dependencia:  dependenciaPorCodigo(cols[idxCol.get("TP_DEPENDENCIA") ?? -1]),
        localizacao:  localizacaoPorCodigo(cols[idxCol.get("TP_LOCALIZACAO") ?? -1]),
        porte:        txt(cols[idxCol.get("TP_PORTE_ESCOLA") ?? -1]),
        etapas_atendidas: etapasAtendidas,
        situacao:     situacaoPorCodigo(cols[idxCol.get("TP_SITUACAO_FUNCIONAMENTO") ?? -1]),
        latitude:     lat,
        longitude:    lng,
        endereco:     txt(cols[idxCol.get("DS_ENDERECO") ?? -1]),
        ano_censo:    ano,
        payload:      JSON.stringify(payload),
        qt_mat_bas, qt_mat_inf, qt_mat_fund, qt_mat_med, qt_mat_prof, qt_mat_eja, qt_mat_esp,
        qt_doc_bas, qt_doc_inf, qt_doc_fund, qt_doc_med, qt_doc_prof,
        infra_agua_potavel, infra_energia_eletrica, infra_esgoto, infra_lixo_coletado,
        infra_internet, infra_internet_alunos, infra_biblioteca,
        infra_lab_informatica, infra_lab_ciencias, infra_quadra_esportes,
        infra_alimentacao, infra_acessibilidade,
      });

      if (bufferInsert.length >= BATCH) {
        await flush();
        r.escolas_persistidas = r.escolas_filtradas;
      }
    }
    await flush();
    r.escolas_persistidas = r.escolas_filtradas;

  } catch (err) {
    r.erro = (err as Error).message;
  } finally {
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
  return r;
}

async function main() {
  const inicio = Date.now();
  console.log("[inep-censo-geo] Extração de coordenadas e metadados de escolas (Censo Escolar)");
  console.log(`  Diretório : ${CENSO_DIR}`);
  console.log(`  Filtro UF : ${FILTRAR_UF ? UF_FILTRO : "(sem filtro)"}\n`);

  if (!fs.existsSync(CENSO_DIR)) {
    console.error(`[inep-censo-geo] Diretório não existe: ${CENSO_DIR}`);
    await registrarAuditoria("ERRO", `Diretório não existe: ${CENSO_DIR}`, 0, Date.now() - inicio);
    process.exit(1);
  }

  const zips = fs.readdirSync(CENSO_DIR).filter((f) => /\.zip$/i.test(f));
  if (!zips.length) {
    console.error(`[inep-censo-geo] Nenhum ZIP encontrado em ${CENSO_DIR}`);
    await registrarAuditoria("ERRO", `Nenhum ZIP em ${CENSO_DIR}`, 0, Date.now() - inicio);
    process.exit(1);
  }

  // Processa TODOS os ZIPs em ordem cronológica ASC (2022 → 2023 → ...).
  // O UPSERT usa COALESCE: anos posteriores atualizam metadados, mas
  // preservam lat/lng do ano anterior quando o microdado novo não trouxer.
  // Isso é necessário porque o INEP removeu geo do microdado 2023 — usamos 2022.
  const zipsOrdenados = zips.sort();
  console.log(`  ${zipsOrdenados.length} ZIP(s) encontrados, processando em ordem cronológica:`);
  for (const z of zipsOrdenados) console.log(`    • ${z}`);
  console.log();

  const resultados: Resultado[] = [];
  for (const z of zipsOrdenados) {
    console.log(`──── Processando ${z} ────`);
    const r = await processarZip(path.join(CENSO_DIR, z));
    resultados.push(r);
    if (r.erro) console.log(`  ✗ ERRO: ${r.erro}`);
    else        console.log(`  ✓ ano=${r.ano_censo} linhas=${r.linhas_lidas} UF=${UF_FILTRO}=${r.escolas_filtradas} com_geo=${r.com_geo}`);
  }

  // Resumo consolidado
  console.log("\n══════ Resumo Censo Escolar ══════");
  for (const r of resultados) {
    console.log(`  [${r.ano_censo}] ${r.arquivo}`);
    console.log(`     escolas ${UF_FILTRO} : ${r.escolas_filtradas}`);
    console.log(`     com lat/lng    : ${r.com_geo}`);
    if (r.erro) console.log(`     ✗ ERRO: ${r.erro}`);
  }

  // Pós-processamento: contar quantas escolas no DW finalmente têm geo
  const [comGeoFinal] = await pgQuery<{ n: string }>(`
    SELECT COUNT(*)::text AS n FROM public.dim_escola_inep
    WHERE sg_uf = '${UF_FILTRO}' AND latitude IS NOT NULL AND longitude IS NOT NULL
  `);
  const [totalDim] = await pgQuery<{ n: string }>(`
    SELECT COUNT(*)::text AS n FROM public.dim_escola_inep WHERE sg_uf = '${UF_FILTRO}'
  `);
  console.log(`\n  Resultado consolidado em dim_escola_inep:`);
  console.log(`     ${totalDim?.n ?? 0} escolas no DW`);
  console.log(`     ${comGeoFinal?.n ?? 0} com lat/lng (geo válida no mapa)`);

  const totalErros = resultados.filter((r) => r.erro).length;
  const totalGeo   = parseInt(comGeoFinal?.n ?? "0", 10);
  const status     = totalErros > 0 ? "PARCIAL" : totalGeo > 0 ? "OK" : "PARCIAL";
  await registrarAuditoria(
    status,
    `${resultados.length} ZIP(s) · ${totalDim?.n ?? 0} escolas · ${totalGeo} com geo (UF=${UF_FILTRO})`,
    totalGeo,
    Date.now() - inicio,
  );
}

async function registrarAuditoria(status: string, mensagem: string, registros: number, duracaoMs: number) {
  try {
    await pgQuery(
      `INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
       VALUES ('inep_censo_geo', $1, $2, $3, $4)`,
      [status, mensagem, registros, duracaoMs],
    );
  } catch { /* audit.etl_log pode não existir — silencioso */ }
}

if (require.main === module) {
  main()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[inep-censo-geo] Erro fatal:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
