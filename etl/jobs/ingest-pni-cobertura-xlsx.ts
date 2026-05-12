/**
 * ingest-pni-cobertura-xlsx.ts
 *
 * Carrega planilhas XLSX de cobertura vacinal (DPNI/DATASUS) para PostgreSQL.
 * Formato: largo (município × N imunobiológicos) → longo (1 linha por par)
 *
 * Busca arquivos em: etl/data/pni/cobertura/ (recursivamente)
 * Controla versões por hash SHA-256 — evita carga duplicada.
 * Apenas municípios do Acre (UF Residência = "AC") são carregados.
 *
 * Status de arquivo:
 *   ATIVO      — arquivo mais relevante do ano (FECHADO > PARCIAL mais recente)
 *   SUPERADO   — versão anterior do mesmo ano
 *   RETIFICADO — substituído por nova versão do mesmo tipo fechado
 *   ERRO       — falha no processamento
 *
 * Uso: cd etl && npm run pni:cobertura:ingest
 */

import "dotenv/config";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import * as XLSX from "xlsx";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

const MODULO    = "pni_cobertura_ingest";
const DATA_DIR  = path.resolve(__dirname, "../data/pni/cobertura");
const META_PCT  = 95;

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ArquivoInfo {
  caminho:       string;
  nome:          string;
  ano:           number;
  dataReferencia: string;  // ISO date
  tipoPeriodo:   "FECHADO" | "PARCIAL";
  hash:          string;
  tamanhoBytes:  number;
}

interface LinhaCobertura {
  regiao_ocorrencia:    string | null;
  uf_residencia:        string | null;
  macrorregiao_saude:   string | null;
  regiao_saude:         string | null;
  municipio_residencia: string | null;
  codigo_ibge:          string | null;
  nome_municipio:       string | null;
  imunobiologico:       string;
  cobertura_percentual: number | null;
  numerador:            number | null;
  denominador:          number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashArquivo(caminho: string): string {
  const buf = fs.readFileSync(caminho);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Infere ano, tipo_periodo e data_referencia pelo nome do arquivo. */
function parseNomeArquivo(nome: string): { ano: number; dataReferencia: string; tipoPeriodo: "FECHADO" | "PARCIAL" } | null {
  // "Cobertura Vacina 01-04-2026.xlsx" — parcial DD-MM-YYYY (testado primeiro)
  const matchParcial = nome.match(/(\d{2})-(\d{2})-(\d{4})\.xlsx$/i);
  if (matchParcial) {
    const [, dd, mm, yyyy] = matchParcial;
    const ano = parseInt(yyyy, 10);
    return { ano, dataReferencia: `${yyyy}-${mm}-${dd}`, tipoPeriodo: "PARCIAL" };
  }
  // "Cobertura Vacina 2025.xlsx" — fechado (apenas ano)
  const matchFechado = nome.match(/(\d{4})\.xlsx$/i);
  if (matchFechado) {
    const ano = parseInt(matchFechado[1], 10);
    return { ano, dataReferencia: `${ano}-12-31`, tipoPeriodo: "FECHADO" };
  }
  return null;
}

/** Varre recursivamente o diretório em busca de .xlsx. */
function encontrarArquivos(dir: string): ArquivoInfo[] {
  const resultado: ArquivoInfo[] = [];
  if (!fs.existsSync(dir)) return resultado;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      resultado.push(...encontrarArquivos(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".xlsx")) {
      const info = parseNomeArquivo(entry.name);
      if (!info) {
        console.warn(`[${MODULO}] Nome não reconhecido (ignorado): ${entry.name}`);
        continue;
      }
      resultado.push({
        caminho:       fullPath,
        nome:          entry.name,
        ano:           info.ano,
        dataReferencia: info.dataReferencia,
        tipoPeriodo:   info.tipoPeriodo,
        hash:          hashArquivo(fullPath),
        tamanhoBytes:  fs.statSync(fullPath).size,
      });
    }
  }
  return resultado;
}

/** Extrai codigo IBGE e nome do formato "120060 - Tarauacá" ou nome puro. */
function parseMunicipio(cell: unknown): { codigo: string | null; nome: string | null } {
  if (!cell) return { codigo: null, nome: null };
  const s = String(cell).trim();
  const m = s.match(/^(\d{6})\s*[-–]\s*(.+)$/);
  if (m) return { codigo: m[1], nome: m[2].trim() };
  // Código de 7 dígitos
  const m7 = s.match(/^(\d{7})\s*[-–]\s*(.+)$/);
  if (m7) return { codigo: m7[1].slice(0, 6), nome: m7[2].trim() };
  // Só nome
  return { codigo: null, nome: s || null };
}

/** Normaliza cobertura: se 0-1.5 → multiplica por 100; senão usa direto. */
function normalizarCobertura(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = parseFloat(String(val));
  if (isNaN(n)) return null;
  if (n >= 0 && n <= 1.5) return parseFloat((n * 100).toFixed(4));
  return parseFloat(n.toFixed(4));
}

function toInt(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

// ─── Parser de planilha ───────────────────────────────────────────────────────

function parsePlanilha(caminho: string): LinhaCobertura[] {
  const wb = XLSX.readFile(caminho);
  const ws = wb.Sheets["Sheet1"];
  if (!ws) {
    const sheets = wb.SheetNames.join(", ");
    throw new Error(`Aba "Sheet1" não encontrada. Abas disponíveis: ${sheets}`);
  }

  // Carrega como array de arrays (header: 1 = índice numérico)
  const aoa: (unknown[])[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  if (aoa.length < 3) throw new Error("Planilha com menos de 3 linhas — estrutura inesperada");

  const header0 = aoa[0] as unknown[];  // linha 1: nomes dos imunobiológicos
  const header1 = aoa[1] as unknown[];  // linha 2: métricas

  // Monta mapa de colunas de imunobiológico
  // Col 0-5: dimensões geográficas
  // Col 6+: blocos de 3 (cobertura%, numerador, denominador)
  interface ColMeta { imuno: string; metrica: "cobertura" | "numerador" | "denominador" }
  const colMeta = new Map<number, ColMeta>();

  for (let i = 6; i < header0.length; i++) {
    const imuno = header0[i] ? String(header0[i]).trim() : null;
    const metricaRaw = header1[i] ? String(header1[i]).trim() : "";
    if (!imuno) continue;

    let metrica: "cobertura" | "numerador" | "denominador";
    if (metricaRaw.toLowerCase().includes("cobertura") || metricaRaw.includes("%")) {
      metrica = "cobertura";
    } else if (metricaRaw.toLowerCase() === "numerador") {
      metrica = "numerador";
    } else if (metricaRaw.toLowerCase() === "denominador") {
      metrica = "denominador";
    } else {
      continue;
    }

    colMeta.set(i, { imuno, metrica });
  }

  const resultado: LinhaCobertura[] = [];

  // Linhas de dados: a partir da linha 2 (índice 2)
  for (let r = 2; r < aoa.length; r++) {
    const row = aoa[r] as unknown[];

    // Filtros para municípios do Acre
    const uf = row[2] ? String(row[2]).trim() : null;
    const munCell = row[5];

    if (uf !== "AC") continue;
    if (!munCell) continue;

    const { codigo, nome } = parseMunicipio(munCell);
    if (!nome) continue;
    if (/^total/i.test(nome.trim())) continue;

    // Agrega por imunobiológico
    const imunoMap = new Map<string, { cobertura: number | null; numerador: number | null; denominador: number | null }>();

    for (const [col, meta] of colMeta) {
      const val = row[col];
      if (!imunoMap.has(meta.imuno)) {
        imunoMap.set(meta.imuno, { cobertura: null, numerador: null, denominador: null });
      }
      const entry = imunoMap.get(meta.imuno)!;
      if (meta.metrica === "cobertura") entry.cobertura = normalizarCobertura(val);
      else if (meta.metrica === "numerador") entry.numerador = toInt(val);
      else if (meta.metrica === "denominador") entry.denominador = toInt(val);
    }

    for (const [imuno, dados] of imunoMap) {
      resultado.push({
        regiao_ocorrencia:    row[1] ? String(row[1]).trim() : null,
        uf_residencia:        uf,
        macrorregiao_saude:   row[3] ? String(row[3]).trim() : null,
        regiao_saude:         row[4] ? String(row[4]).trim() : null,
        municipio_residencia: String(munCell).trim(),
        codigo_ibge:          codigo,
        nome_municipio:       nome,
        imunobiologico:       imuno,
        cobertura_percentual: dados.cobertura,
        numerador:            dados.numerador,
        denominador:          dados.denominador,
      });
    }
  }

  return resultado;
}

// ─── Controle de status ───────────────────────────────────────────────────────

async function atualizarStatusArquivos(): Promise<void> {
  // Carrega todos os arquivos por ano
  const arquivos = await pgQuery<{
    id: number; ano: number; tipo_periodo: string; data_referencia: string; status_arquivo: string;
  }>(`
    SELECT id, ano, tipo_periodo, data_referencia, status_arquivo
    FROM audit.pni_cobertura_arquivo
    WHERE status_arquivo NOT IN ('ERRO')
    ORDER BY ano, tipo_periodo DESC, data_referencia DESC
  `);

  // Agrupa por ano
  const porAno = new Map<number, typeof arquivos>();
  for (const a of arquivos) {
    if (!porAno.has(a.ano)) porAno.set(a.ano, []);
    porAno.get(a.ano)!.push(a);
  }

  for (const [, lista] of porAno) {
    // O arquivo ATIVO é: FECHADO vence PARCIAL; entre PARCIAIS, maior data_referencia vence
    lista.sort((a, b) => {
      if (a.tipo_periodo === "FECHADO" && b.tipo_periodo !== "FECHADO") return -1;
      if (b.tipo_periodo === "FECHADO" && a.tipo_periodo !== "FECHADO") return 1;
      return b.data_referencia.localeCompare(a.data_referencia);
    });

    const [ativo, ...outros] = lista;

    if (ativo.status_arquivo !== "ATIVO") {
      await pgQuery(`UPDATE audit.pni_cobertura_arquivo SET status_arquivo='ATIVO', atualizado_em=now() WHERE id=$1`, [ativo.id]);
      await pgQuery(`UPDATE raw.pni_cobertura_raw       SET status_arquivo='ATIVO'  WHERE arquivo_id=$1`, [ativo.id]);
      await pgQuery(`UPDATE stage.pni_cobertura_stg     SET status_arquivo='ATIVO'  WHERE arquivo_id=$1`, [ativo.id]);
      await pgQuery(`UPDATE dw.fato_pni_cobertura        SET status_arquivo='ATIVO'  WHERE arquivo_id=$1`, [ativo.id]);
    }

    for (const outro of outros) {
      const novoStatus = outro.tipo_periodo === "FECHADO" ? "RETIFICADO" : "SUPERADO";
      if (outro.status_arquivo !== novoStatus) {
        await pgQuery(`UPDATE audit.pni_cobertura_arquivo SET status_arquivo=$1, atualizado_em=now() WHERE id=$2`, [novoStatus, outro.id]);
        await pgQuery(`UPDATE raw.pni_cobertura_raw       SET status_arquivo=$1 WHERE arquivo_id=$2`, [novoStatus, outro.id]);
        await pgQuery(`UPDATE stage.pni_cobertura_stg     SET status_arquivo=$1 WHERE arquivo_id=$2`, [novoStatus, outro.id]);
        await pgQuery(`UPDATE dw.fato_pni_cobertura        SET status_arquivo=$1 WHERE arquivo_id=$2`, [novoStatus, outro.id]);
      }
    }
  }
}

// ─── Carga de um arquivo ──────────────────────────────────────────────────────

async function carregarArquivo(arq: ArquivoInfo): Promise<void> {
  console.log(`\n[${MODULO}] Processando: ${arq.nome}`);
  console.log(`  Ano: ${arq.ano} | Tipo: ${arq.tipoPeriodo} | Ref: ${arq.dataReferencia}`);

  // Verifica se o hash já foi carregado
  const existente = await pgQuery<{ id: number; status_arquivo: string }>(
    `SELECT id, status_arquivo FROM audit.pni_cobertura_arquivo WHERE hash_arquivo=$1`, [arq.hash]
  );
  if (existente.length > 0) {
    console.log(`  ↳ Já carregado anteriormente (id=${existente[0].id}, status=${existente[0].status_arquivo}). Ignorando.`);
    return;
  }

  // Insere registro de controle (provisório, ATIVO — será ajustado no final)
  const arquivoRec = await pgQuery<{ id: number }>(`
    INSERT INTO audit.pni_cobertura_arquivo
      (arquivo, caminho_arquivo, hash_arquivo, ano, data_referencia, tipo_periodo, status_arquivo)
    VALUES ($1, $2, $3, $4, $5, $6, 'ATIVO')
    RETURNING id
  `, [arq.nome, arq.caminho, arq.hash, arq.ano, arq.dataReferencia, arq.tipoPeriodo]);
  const arquivoId = arquivoRec[0].id;

  try {
    const linhas = parsePlanilha(arq.caminho);
    console.log(`  Linhas municipais AC: ${linhas.length}`);

    // Carrega linha a linha dentro de transação
    await withPgTransaction(async (client) => {
      let nStg = 0, nDw = 0;

      for (let i = 0; i < linhas.length; i++) {
        const l = linhas[i];

        // raw
        await client.query(`
          INSERT INTO raw.pni_cobertura_raw
            (arquivo_id, arquivo, ano, data_referencia, tipo_periodo, status_arquivo, linha, payload)
          VALUES ($1,$2,$3,$4,$5,'ATIVO',$6,$7)
        `, [
          arquivoId, arq.nome, arq.ano, arq.dataReferencia, arq.tipoPeriodo,
          i + 3,  // linha real na planilha (1-indexed, offset de 2 linhas de cabeçalho)
          JSON.stringify({
            municipio: l.municipio_residencia,
            uf: l.uf_residencia,
            imunobiologico: l.imunobiologico,
            cobertura_percentual: l.cobertura_percentual,
            numerador: l.numerador,
            denominador: l.denominador,
          }),
        ]);

        // stage
        await client.query(`
          INSERT INTO stage.pni_cobertura_stg
            (arquivo_id, arquivo, ano, data_referencia, tipo_periodo, status_arquivo,
             regiao_ocorrencia, uf_residencia, macrorregiao_saude, regiao_saude,
             municipio_residencia, codigo_municipio_ibge, imunobiologico,
             cobertura_percentual, numerador, denominador)
          VALUES ($1,$2,$3,$4,$5,'ATIVO',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        `, [
          arquivoId, arq.nome, arq.ano, arq.dataReferencia, arq.tipoPeriodo,
          l.regiao_ocorrencia, l.uf_residencia, l.macrorregiao_saude, l.regiao_saude,
          l.municipio_residencia, l.codigo_ibge, l.imunobiologico,
          l.cobertura_percentual, l.numerador, l.denominador,
        ]);
        nStg++;

        // dw — idempotente por arquivo_id + nome_municipio + imunobiologico
        const abaixoMeta = l.cobertura_percentual !== null ? l.cobertura_percentual < META_PCT : null;
        const distancia  = l.cobertura_percentual !== null ? parseFloat((l.cobertura_percentual - META_PCT).toFixed(4)) : null;

        await client.query(`
          INSERT INTO dw.fato_pni_cobertura
            (arquivo_id, ano, data_referencia, tipo_periodo, status_arquivo,
             codigo_municipio_ibge, nome_municipio, uf, macrorregiao_saude, regiao_saude,
             imunobiologico, cobertura_percentual, numerador, denominador,
             meta_percentual, abaixo_meta, distancia_meta)
          VALUES ($1,$2,$3,$4,'ATIVO',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
          ON CONFLICT DO NOTHING
        `, [
          arquivoId, arq.ano, arq.dataReferencia, arq.tipoPeriodo,
          l.codigo_ibge, l.nome_municipio, l.uf_residencia,
          l.macrorregiao_saude, l.regiao_saude, l.imunobiologico,
          l.cobertura_percentual, l.numerador, l.denominador,
          META_PCT, abaixoMeta, distancia,
        ]);
        nDw++;
      }

      // Atualiza contadores no registro de controle
      await client.query(`
        UPDATE audit.pni_cobertura_arquivo
        SET total_linhas=$1, total_registros_stage=$2, total_registros_dw=$3, atualizado_em=now()
        WHERE id=$4
      `, [linhas.length, nStg, nDw, arquivoId]);

      console.log(`  ✓ raw: ${linhas.length} | stage: ${nStg} | dw: ${nDw}`);
    });

  } catch (err) {
    const msg = (err as Error).message;
    console.error(`  ✗ Erro ao processar ${arq.nome}: ${msg}`);
    await pgQuery(`
      UPDATE audit.pni_cobertura_arquivo
      SET status_arquivo='ERRO', observacao=$1, atualizado_em=now()
      WHERE id=$2
    `, [msg, arquivoId]);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function executarIngestPniCobertura(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${MODULO}] Iniciando ingestão de cobertura vacinal PNI...`);
  console.log(`[${MODULO}] Diretório: ${DATA_DIR}`);

  const arquivos = encontrarArquivos(DATA_DIR);

  if (arquivos.length === 0) {
    console.warn(`[${MODULO}] Nenhum arquivo XLSX encontrado em ${DATA_DIR}`);
    console.warn(`[${MODULO}] Coloque os arquivos em:`);
    console.warn(`  ${DATA_DIR}/2025/Cobertura Vacina 2025.xlsx`);
    console.warn(`  ${DATA_DIR}/2026/Cobertura Vacina 01-04-2026.xlsx`);
    return;
  }

  console.log(`[${MODULO}] Arquivos encontrados: ${arquivos.length}`);
  for (const a of arquivos) {
    console.log(`  - ${a.nome} (${a.ano}, ${a.tipoPeriodo}, ref: ${a.dataReferencia})`);
  }

  // Ordena por ano e data_referencia para processar em ordem cronológica
  arquivos.sort((a, b) => a.ano !== b.ano ? a.ano - b.ano : a.dataReferencia.localeCompare(b.dataReferencia));

  for (const arq of arquivos) {
    await carregarArquivo(arq);
  }

  // Atualiza status ATIVO/SUPERADO/RETIFICADO
  console.log(`\n[${MODULO}] Atualizando status de arquivos...`);
  await atualizarStatusArquivos();

  const duracao = Date.now() - inicio;
  console.log(`\n[${MODULO}] Ingestão concluída em ${duracao}ms`);

  await pgQuery(`
    INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
    VALUES ($1, 'OK', 'Ingestão cobertura vacinal PNI', $2, $3)
  `, [MODULO, arquivos.length, duracao]).catch(() => void 0);
}

if (require.main === module) {
  executarIngestPniCobertura()
    .then(() => closePgPool())
    .catch((err) => {
      console.error(`[${MODULO}] Erro fatal:`, (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
