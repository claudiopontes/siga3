/**
 * ETL - CAUC (Cadastro Único de Convênios) — Tesouro Transparente / CKAN
 *
 * Fonte: CSV público do Tesouro Transparente com situação dos requisitos CAUC
 *        para municípios brasileiros.
 *
 * ATENÇÃO: Este dado é gerencial, para fins de alerta interno nos gabinetes
 *          do TCE/AC. Não substitui o extrato oficial diário do CAUC nem deve
 *          ser apresentado como certidão.
 *
 * Destinos:
 *   - cauc_carga         : registro de controle de cada execução
 *   - cauc_situacao_raw  : situação dos requisitos por ente (formato longo)
 */

import "dotenv/config";
import { createHash } from "crypto";
import { getSupabase } from "../connectors/supabase";

// ─── Configuração ─────────────────────────────────────────────────────────────

const MODULO = "cauc";
const supabase = getSupabase();

const CSV_URL_PADRAO =
  "https://www.tesourotransparente.gov.br/ckan/dataset/72b5f371-0c35-4613-8076-c99c821a6410/resource/07af297a-5e59-494a-a88a-55ddfd2f4b01/download/relatorio-situacao-de-varios-entes---municipios---uf-todas---abrangencia-1.csv";

const CAUC_MUNICIPIOS_CSV_URL = process.env.CAUC_MUNICIPIOS_CSV_URL || CSV_URL_PADRAO;
const CAUC_ONLY_UF = (process.env.CAUC_ONLY_UF || "AC").toUpperCase();
const SUPABASE_BATCH = 500;
const DRY_RUN = process.argv.includes("--dry-run");

// ─── Tipos ───────────────────────────────────────────────────────────────────

type SituacaoRow = {
  tipo_ente: string;
  uf: string | null;
  codigo_ibge: string | null;
  cnpj: string | null;
  nome_ente: string | null;
  item_codigo: string | null;
  item_descricao: string | null;
  grupo: string | null;
  situacao: string | null;
  situacao_normalizada: string;
  dados: Record<string, string> | null;
  hash_registro: string;
  carga_id: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function gravarLog(
  status: "sucesso" | "erro",
  registros: number,
  duracao: number,
  mensagem?: string,
) {
  await supabase.from("etl_log").insert({
    modulo: MODULO,
    status,
    mensagem: mensagem ?? null,
    registros,
    duracao_ms: duracao,
  });
}

function normalizarHeader(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function pick(row: Record<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    if (alias in row && row[alias] !== undefined && row[alias] !== "") {
      return row[alias];
    }
  }
  return null;
}

function normalizarSituacao(value: string | null | undefined): string {
  if (!value || value.trim() === "") return "nao_informado";
  const v = value.trim().toLowerCase();

  // Formato CAUC do Tesouro Transparente:
  // "!" = item pendente/irregular
  if (v === "!") return "nao_atendido";
  // "Desabilitado" = não se aplica ao ente
  if (v === "desabilitado") return "nao_aplicavel";
  // Data dd/mm/aa ou dd/mm/aaaa = válido até essa data (atendido)
  if (/^\d{2}\/\d{2}\/\d{2,4}$/.test(v)) return "atendido";

  // Demais padrões textuais genéricos
  if (v === "n/a" || v.includes("nao se aplica") || v.includes("não se aplica")) return "nao_aplicavel";
  // avaliar negativo ANTES de "atendido" para não classificar "não atendido" como atendido
  if (
    v.includes("nao atendido") || v.includes("não atendido") ||
    v.includes("pendente") || v.includes("irregular") ||
    v.includes("nao comprovado") || v.includes("não comprovado")
  ) return "nao_atendido";
  if (v === "nao" || v === "não" || v === "n") return "nao_atendido";
  if (
    v.includes("atendido") || v.includes("regular") ||
    v.includes("comprovado") || v.includes("adimplente")
  ) return "atendido";
  if (v === "sim" || v === "s") return "atendido";
  return "outro";
}

function gerarHash(campos: (string | null | undefined)[]): string {
  return createHash("sha256")
    .update(campos.map((c) => c ?? "").join("|"))
    .digest("hex");
}

// ─── Download do CSV ──────────────────────────────────────────────────────────

async function baixarCSV(url: string): Promise<Buffer> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download do CSV falhou: HTTP ${resp.status} — ${url}`);
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

// ─── Encoding ─────────────────────────────────────────────────────────────────

function detectarEncoding(buf: Buffer): "utf8" | "latin1" {
  const utf8 = buf.toString("utf8");
  if (utf8.includes("�")) return "latin1";
  return "utf8";
}

// ─── Detecção de delimitador ──────────────────────────────────────────────────

function detectarDelimitador(primeirasLinhas: string): string {
  const contagens: Record<string, number> = { ";": 0, ",": 0, "\t": 0, "|": 0 };
  for (const delim of Object.keys(contagens)) {
    contagens[delim] = (primeirasLinhas.match(new RegExp(delim === "\t" ? "\t" : `\\${delim}`, "g")) || []).length;
  }
  return Object.entries(contagens).sort((a, b) => b[1] - a[1])[0][0];
}

// ─── Parser CSV robusto ───────────────────────────────────────────────────────
// Suporta aspas, quebra de linha dentro de aspas, separador dentro de aspas,
// campos vazios.

function parsearCSV(texto: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let dentroAspas = false;
  let i = 0;

  while (i < texto.length) {
    const ch = texto[i];

    if (dentroAspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          // aspas escapadas
          field += '"';
          i += 2;
          continue;
        }
        dentroAspas = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        dentroAspas = true;
      } else if (ch === delim || (delim === "\t" && ch === "\t")) {
        row.push(field.trim());
        field = "";
        i++;
        continue;
      } else if (ch === "\r") {
        if (texto[i + 1] === "\n") i++;
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = "";
        i++;
        continue;
      } else if (ch === "\n") {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = "";
        i++;
        continue;
      } else {
        field += ch;
      }
    }
    i++;
  }

  if (field !== "" || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c !== ""));
}

// ─── Aliases de campos ────────────────────────────────────────────────────────

const ALIASES: Record<string, string[]> = {
  uf:             ["uf", "sigla_uf", "uf_ente"],
  codigo_ibge:    ["codigo_ibge", "cod_ibge", "ibge", "codigo_municipio", "co_municipio", "cod_municipio"],
  cnpj:           ["cnpj", "cnpj_ente", "cnpj_principal"],
  nome_ente:      ["nome_ente", "ente", "municipio", "nome_municipio", "nome", "nome_do_ente_federado", "nome_ente_federado"],
  item_codigo:    ["item_codigo", "codigo_item", "cod_item", "item", "codigo_requisito"],
  item_descricao: ["item_descricao", "descricao_item", "requisito", "descricao_requisito", "descricao"],
  grupo:          ["grupo", "grupo_requisito", "categoria", "tipo_requisito"],
  situacao:       ["situacao", "status", "resultado", "cumprimento", "situacao_requisito"],
};

// ─── Campos base do ente (para detecção de formato largo) ────────────────────
// Inclui metadados do ente que NÃO devem ser tratados como requisitos.

const CAMPOS_BASE = new Set([
  ...ALIASES.uf,
  ...ALIASES.codigo_ibge,
  ...ALIASES.cnpj,
  ...ALIASES.nome_ente,
  ...ALIASES.item_codigo,
  ...ALIASES.item_descricao,
  ...ALIASES.grupo,
  ...ALIASES.situacao,
  // metadados adicionais comuns nos CSVs do Tesouro Transparente
  "codigo_siafi", "cod_siafi", "siafi",
  "regiao", "regiao_geografica", "macrorregiao",
  "populacao", "populacao_estimada", "pop",
  "fonte", "fonte_dado", "fonte_informacao",
  "data", "data_referencia", "data_pesquisa", "data_da_pesquisa",
  "abrangencia", "esfera",
]);

// ─── Localiza linha de cabeçalho real ────────────────────────────────────────
// CSVs do governo brasileiro frequentemente têm linhas de metadados antes dos
// cabeçalhos reais. A primeira linha com múltiplas colunas é o cabeçalho.

function encontrarHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i].length > 1) return i;
  }
  return 0;
}

// ─── Normalização de registros ────────────────────────────────────────────────

function normalizarRegistros(
  rows: string[][],
  dataReferencia: string,
  cargaId: number,
): SituacaoRow[] {
  if (rows.length < 2) return [];

  const headerOriginal = rows[0];
  const headerNorm = headerOriginal.map(normalizarHeader);

  // Detecta formato: longo = existem colunas de item_codigo/item_descricao e situacao
  const temItemCodigo = ALIASES.item_codigo.some((a) => headerNorm.includes(a));
  const temItemDescricao = ALIASES.item_descricao.some((a) => headerNorm.includes(a));
  const temSituacao = ALIASES.situacao.some((a) => headerNorm.includes(a));
  const formatoLongo = (temItemCodigo || temItemDescricao) && temSituacao;

  const resultado: SituacaoRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const raw = rows[i];
    if (!raw || raw.every((c) => c === "")) continue;

    const rowObj: Record<string, string> = {};
    for (let j = 0; j < headerNorm.length; j++) {
      rowObj[headerNorm[j]] = raw[j] ?? "";
    }

    const uf = pick(rowObj, ALIASES.uf);
    const codigo_ibge = pick(rowObj, ALIASES.codigo_ibge);
    const cnpj = pick(rowObj, ALIASES.cnpj);
    const nome_ente = pick(rowObj, ALIASES.nome_ente);

    if (formatoLongo) {
      const item_codigo = pick(rowObj, ALIASES.item_codigo);
      const item_descricao = pick(rowObj, ALIASES.item_descricao);
      const grupo = pick(rowObj, ALIASES.grupo);
      const situacao = pick(rowObj, ALIASES.situacao);
      const situacao_normalizada = normalizarSituacao(situacao);
      const hash = gerarHash([
        "municipio", uf, codigo_ibge, cnpj, nome_ente, item_codigo, item_descricao, situacao, dataReferencia,
      ]);

      resultado.push({
        tipo_ente: "municipio",
        uf,
        codigo_ibge,
        cnpj,
        nome_ente,
        item_codigo,
        item_descricao,
        grupo,
        situacao,
        situacao_normalizada,
        dados: rowObj,
        hash_registro: hash,
        carga_id: cargaId,
      });
    } else {
      // Formato largo: cada coluna não-base é um requisito
      const colunasRequisito = headerNorm.filter((h) => !CAMPOS_BASE.has(h));
      for (let k = 0; k < colunasRequisito.length; k++) {
        const colNorm = colunasRequisito[k];
        const colOriginal = headerOriginal[headerNorm.indexOf(colNorm)] ?? colNorm;
        const situacao = rowObj[colNorm] ?? null;
        const situacao_normalizada = normalizarSituacao(situacao);
        const hash = gerarHash([
          "municipio", uf, codigo_ibge, cnpj, nome_ente, colNorm, colOriginal, situacao, dataReferencia,
        ]);

        resultado.push({
          tipo_ente: "municipio",
          uf,
          codigo_ibge,
          cnpj,
          nome_ente,
          item_codigo: colNorm,
          item_descricao: colOriginal,
          grupo: null,
          situacao,
          situacao_normalizada,
          dados: rowObj,
          hash_registro: hash,
          carga_id: cargaId,
        });
      }
    }
  }

  return resultado;
}

// ─── Inserção em lotes ───────────────────────────────────────────────────────

async function inserirLotes(registros: SituacaoRow[]): Promise<number> {
  let inseridos = 0;
  for (let i = 0; i < registros.length; i += SUPABASE_BATCH) {
    const chunk = registros.slice(i, i + SUPABASE_BATCH);
    const { error } = await supabase.from("cauc_situacao_raw").insert(chunk);
    if (error) throw new Error(`Erro ao inserir cauc_situacao_raw (lote ${i / SUPABASE_BATCH + 1}): ${error.message}`);
    inseridos += chunk.length;
  }
  return inseridos;
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

export async function executarCargaCauc(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  if (DRY_RUN) console.log("  -> Modo dry-run ativo. Nenhum dado será gravado.");

  const dataReferencia = new Date().toISOString().slice(0, 10);
  let cargaId: number | null = null;
  let inseridos = 0;

  try {
    // 1. Registra carga (somente fora do dry-run)
    if (!DRY_RUN) {
      const { data: cargaData, error: cargaErr } = await supabase
        .from("cauc_carga")
        .insert({
          fonte: "tesouro_transparente_ckan",
          tipo_ente: "municipio",
          url_origem: CAUC_MUNICIPIOS_CSV_URL,
          data_referencia: dataReferencia,
          status: "iniciada",
        })
        .select("id")
        .single();

      if (cargaErr) throw new Error(`Erro ao criar cauc_carga: ${cargaErr.message}`);
      cargaId = (cargaData as { id: number }).id;
      console.log(`  -> Carga registrada: id=${cargaId}`);
    }

    // 2. Download do CSV
    console.log(`  -> Baixando CSV: ${CAUC_MUNICIPIOS_CSV_URL}`);
    const buffer = await baixarCSV(CAUC_MUNICIPIOS_CSV_URL);
    console.log(`     ${(buffer.length / 1024).toFixed(1)} KB recebidos`);

    // 3. Encoding
    const encoding = detectarEncoding(buffer);
    const texto = buffer.toString(encoding);
    console.log(`  -> Encoding detectado: ${encoding}`);

    // 4. Delimitador
    const amostra = texto.slice(0, 2000);
    const delim = detectarDelimitador(amostra);
    const delimNome = delim === "\t" ? "tab" : delim;
    console.log(`  -> Delimitador detectado: "${delimNome}"`);

    // 5. Parser CSV
    const rows = parsearCSV(texto, delim);
    console.log(`  -> Linhas CSV (incluindo cabeçalho): ${rows.length}`);

    if (rows.length < 2) throw new Error("CSV vazio ou sem dados após o cabeçalho.");

    const headerIdx = encontrarHeaderRow(rows);
    if (headerIdx > 0) {
      console.log(`  -> Linhas de metadados ignoradas: ${headerIdx} (cabeçalho real na linha ${headerIdx + 1})`);
    }
    const rowsSemMeta = rows.slice(headerIdx);
    const headers = rowsSemMeta[0].map(normalizarHeader);

    // 6. Normaliza registros
    const registrosTodos = normalizarRegistros(rowsSemMeta, dataReferencia, cargaId ?? 0);
    console.log(`  -> Registros normalizados (todos os UF): ${registrosTodos.length}`);

    // 7. Filtra por UF
    const registrosFiltrados =
      CAUC_ONLY_UF === "ALL"
        ? registrosTodos
        : registrosTodos.filter((r) => (r.uf ?? "").toUpperCase() === CAUC_ONLY_UF);
    console.log(`  -> Registros filtrados (${CAUC_ONLY_UF}): ${registrosFiltrados.length}`);

    if (DRY_RUN) {
      console.log("\n--- DRY-RUN: Resumo ---");
      console.log(`  URL:                  ${CAUC_MUNICIPIOS_CSV_URL}`);
      console.log(`  Delimitador:          "${delimNome}"`);
      console.log(`  Linhas CSV:           ${rowsSemMeta.length - 1} (dados)`);
      console.log(`  Registros totais:     ${registrosTodos.length}`);
      console.log(`  Registros para ${CAUC_ONLY_UF}:     ${registrosFiltrados.length}`);
      console.log(`  Cabeçalhos (${headers.length}): ${headers.join(", ")}`);
      console.log("\n  Exemplos (até 5):");
      registrosFiltrados.slice(0, 5).forEach((r, i) => {
        console.log(`  [${i + 1}] ${r.nome_ente} | ${r.item_descricao} | ${r.situacao} → ${r.situacao_normalizada}`);
      });
      console.log("--- Fim dry-run ---\n");
      return;
    }

    // 8. Insere em lotes
    console.log(`  -> Inserindo ${registrosFiltrados.length} registros em lotes de ${SUPABASE_BATCH}...`);
    inseridos = await inserirLotes(registrosFiltrados);
    console.log(`     ${inseridos} registros inseridos`);

    // 9. Atualiza carga com sucesso
    await supabase
      .from("cauc_carga")
      .update({
        status: "sucesso",
        finalizado_em: new Date().toISOString(),
        registros: inseridos,
        mensagem: null,
      })
      .eq("id", cargaId!);

    const duracao = Date.now() - inicio;
    console.log(`  OK - ETL concluído em ${duracao}ms`);
    await gravarLog("sucesso", inseridos, duracao);
  } catch (error) {
    const duracao = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error(`  ERRO - ${mensagem}`);

    if (cargaId !== null) {
      await supabase
        .from("cauc_carga")
        .update({
          status: "erro",
          finalizado_em: new Date().toISOString(),
          registros: inseridos,
          mensagem,
        })
        .eq("id", cargaId);
    }

    await gravarLog("erro", inseridos, duracao, mensagem);
    throw error;
  }
}

if (require.main === module) {
  executarCargaCauc().catch(() => process.exit(1));
}
