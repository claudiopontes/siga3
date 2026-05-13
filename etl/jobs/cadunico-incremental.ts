/**
 * ETL — CadÚnico carga incremental (fonte: dados abertos / exportação manual)
 *
 * Estratégia incremental:
 *   1. Calcula competências alvo: ano atual + 2 anos anteriores (todos os meses)
 *   2. Identifica quais competências já existem em social.cadunico_municipio_mensal
 *   3. Para cada registro: upsert com comparação de hash_registro
 *      - se hash igual, nenhuma escrita ocorre (idempotente)
 *      - se hash diferente ou registro novo, insere/atualiza
 *   4. Registra cada competência em social.cadunico_controle_carga
 *   5. Grava audit.etl_log e audit.etl_carga ao final
 *
 * Fonte atual: arquivo CSV local (exportação manual do VIS DATA / CECAD / dados abertos MDS)
 *   - Defina CADUNICO_CSV_PATH apontando para o arquivo exportado
 *   - O parser aceita variações comuns de nomes de colunas (ver ALIASES_COLUNAS abaixo)
 *   - Separador: ponto-e-vírgula (;) — padrão das exportações brasileiras do MDS
 *
 * TODO: substituir leitura de CSV por chamada à API pública do MDS quando disponível.
 *       Candidatos: VIS DATA (https://aplicacoes.mds.gov.br/sagi/vis/data3/data-table.php)
 *                   ou dados abertos em dados.gov.br (CadÚnico por município).
 *
 * Uso:
 *   cd etl && npm run cadunico:incremental
 *
 * Variáveis de ambiente:
 *   CADUNICO_CSV_PATH     — caminho absoluto do CSV exportado (obrigatório para carga real)
 *   CADUNICO_CSV_SEP      — separador de campos: ";" ou "," (default: ";")
 *   CADUNICO_UF           — filtrar por UF (default: AC)
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { pgQuery, getPgPool, closePgPool } from "../connectors/postgres";
import { iniciarCargaEtl, finalizarCargaEtl, registrarLogEtl } from "../lib/auditoria";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const MODULO = "cadunico_incremental";
const FONTE  = process.env.CADUNICO_FONTE ?? "MDS/CadÚnico — exportação manual";
const UF_FILTRO = process.env.CADUNICO_UF ?? "AC";
const CSV_PATH  = process.env.CADUNICO_CSV_PATH ?? "";
const CSV_SEP   = process.env.CADUNICO_CSV_SEP  ?? ";";

// ---------------------------------------------------------------------------
// Mapeamento de aliases de colunas
// VIS DATA, CECAD e dados abertos do MDS usam nomes distintos.
// Cada lista contém variações aceitas; o primeiro match é utilizado.
// ---------------------------------------------------------------------------

const ALIASES_COLUNAS: Record<string, string[]> = {
  // Competência temporal
  ano_mes: [
    "ano_mes", "competencia", "referencia", "ref_competencia",
    "dt_referencia", "data_referencia", "periodo", "competência",
    "ano/mes", "anomes",
  ],
  // Localização
  sigla_uf: [
    "sigla_uf", "uf", "sg_uf", "estado", "uf_sigla", "co_uf",
  ],
  codigo_ibge_municipio: [
    "codigo_ibge_municipio", "cod_ibge", "codigo_ibge", "cd_ibge",
    "codigo_municipio", "cd_municipio", "co_municipio", "ibge",
    "co_municipio_ibge", "cod_municipio_ibge",
  ],
  nome_municipio: [
    "nome_municipio", "municipio", "nome", "nm_municipio",
    "no_municipio", "municipio_nome", "desc_municipio", "município",
  ],
  // Famílias e pessoas
  familias_cadastradas: [
    "familias_cadastradas", "qtd_familias_cadastradas", "total_familias",
    "familias", "qt_familias_cadastradas", "familias_total",
    "familias cadastradas", "qnt_familias_cadastradas",
  ],
  pessoas_cadastradas: [
    "pessoas_cadastradas", "qtd_pessoas_cadastradas", "total_pessoas",
    "pessoas", "qt_pessoas_cadastradas", "pessoas cadastradas",
  ],
  familias_pobreza: [
    "familias_pobreza", "familias_em_pobreza", "qtd_familias_pobreza",
    "familias_extrema_pobreza", "pobreza", "familias_pobres",
    "familias em pobreza", "qt_familias_pobreza",
  ],
  familias_baixa_renda: [
    "familias_baixa_renda", "baixa_renda", "qtd_familias_baixa_renda",
    "familias_renda_baixa", "familias baixa renda",
  ],
  familias_atualizadas: [
    "familias_atualizadas", "qtd_familias_atualizadas",
    "familias_com_cadastro_atualizado", "familias atualizadas",
    "qt_familias_atualizadas",
  ],
  familias_desatualizadas: [
    "familias_desatualizadas", "qtd_familias_desatualizadas",
    "familias_sem_atualizacao", "familias desatualizadas",
    "qt_familias_desatualizadas",
  ],
  taxa_atualizacao_cadastral: [
    "taxa_atualizacao_cadastral", "taxa_atualizacao", "perc_atualizacao",
    "pct_atualizacao", "percentual_atualizacao", "taxa de atualização",
    "indice_atualizacao", "tx_atualizacao",
  ],
  familias_unipessoais: [
    "familias_unipessoais", "qtd_familias_unipessoais",
    "familias_com_1_pessoa", "unipessoais", "familias unipessoais",
    "qt_familias_unipessoais",
  ],
  percentual_familias_unipessoais: [
    "percentual_familias_unipessoais", "pct_familias_unipessoais",
    "perc_unipessoais", "percentual unipessoais",
  ],
  // Bolsa Família
  familias_bolsa_familia: [
    "familias_bolsa_familia", "qtd_familias_bolsa_familia",
    "beneficiarios_bf", "familias_bf", "familias bolsa família",
    "qt_familias_bolsa_familia", "familias_pbf", "beneficiarios_pbf",
  ],
  valor_total_bolsa_familia: [
    "valor_total_bolsa_familia", "valor_bf", "vlr_bf",
    "valor_repasse_bf", "total_repasse", "valor bolsa família",
    "valor_repassado_bf", "vl_total_bf",
  ],
  valor_medio_bolsa_familia: [
    "valor_medio_bolsa_familia", "valor_medio_bf", "vlr_medio_bf",
    "beneficio_medio", "valor médio bf", "vl_medio_bf",
  ],
  // Benefícios complementares
  beneficiarios_bpc: [
    "beneficiarios_bpc", "bpc", "qtd_bpc", "qt_bpc",
    "beneficiários bpc",
  ],
  beneficiarios_auxilio_gas: [
    "beneficiarios_auxilio_gas", "auxilio_gas", "gas", "qtd_auxilio_gas",
    "beneficiários auxílio gás", "auxilio_gas_familias",
  ],
  // Gestão
  igdm: [
    "igdm", "igd_m", "igd", "indice_gestao_descentralizada",
    "indice_gestao", "igdm_valor", "valor_igdm",
  ],
};

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface CadunicoRow {
  ano: number;
  mes: number;
  ano_mes: string;
  sigla_uf: string;
  codigo_ibge_municipio: string;
  nome_municipio: string;
  familias_cadastradas?: number | null;
  pessoas_cadastradas?: number | null;
  familias_pobreza?: number | null;
  familias_baixa_renda?: number | null;
  familias_atualizadas?: number | null;
  familias_desatualizadas?: number | null;
  taxa_atualizacao_cadastral?: number | null;
  familias_unipessoais?: number | null;
  percentual_familias_unipessoais?: number | null;
  familias_bolsa_familia?: number | null;
  valor_total_bolsa_familia?: number | null;
  valor_medio_bolsa_familia?: number | null;
  beneficiarios_bpc?: number | null;
  beneficiarios_auxilio_gas?: number | null;
  igdm?: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Competências alvo: ano atual + 2 anos anteriores, todos os meses. */
function calcularCompetenciasAlvo(): string[] {
  const anoAtual = new Date().getFullYear();
  const competencias: string[] = [];
  for (let ano = anoAtual - 2; ano <= anoAtual; ano++) {
    for (let mes = 1; mes <= 12; mes++) {
      competencias.push(`${ano}-${String(mes).padStart(2, "0")}`);
    }
  }
  return competencias;
}

/** Hash MD5 dos campos indicadores para detecção de mudança. */
function hashRow(row: CadunicoRow): string {
  const payload = JSON.stringify([
    row.familias_cadastradas,
    row.pessoas_cadastradas,
    row.familias_pobreza,
    row.familias_baixa_renda,
    row.familias_atualizadas,
    row.familias_desatualizadas,
    row.taxa_atualizacao_cadastral,
    row.familias_unipessoais,
    row.familias_bolsa_familia,
    row.valor_total_bolsa_familia,
    row.igdm,
  ]);
  return crypto.createHash("md5").update(payload).digest("hex");
}

/** Parseia número ou retorna null. Aceita vírgula como separador decimal. */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/**
 * Resolve o índice de coluna no cabeçalho normalizado usando a tabela de aliases.
 * Retorna -1 se não encontrar.
 */
function resolverColuna(cabecalhoNorm: string[], campo: keyof typeof ALIASES_COLUNAS): number {
  for (const alias of ALIASES_COLUNAS[campo]) {
    const idx = cabecalhoNorm.indexOf(alias.toLowerCase().trim());
    if (idx >= 0) return idx;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Leitura do CSV com mapeamento de aliases
// TODO: substituir por integração com API pública do MDS quando disponível.
// ---------------------------------------------------------------------------

function lerCsv(csvPath: string): { rows: CadunicoRow[]; avisos: string[] } {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Arquivo CSV não encontrado: ${csvPath}`);
  }

  const conteudo = fs.readFileSync(csvPath, "utf-8");
  // Remove BOM UTF-8 se presente
  const semBom = conteudo.replace(/^﻿/, "");
  const linhas = semBom.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (linhas.length < 2) throw new Error("CSV vazio ou sem dados.");

  const cabecalhoRaw = linhas[0].split(CSV_SEP);
  const cabecalhoNorm = cabecalhoRaw.map((c) => c.trim().toLowerCase().replace(/['"]/g, ""));

  // Resolve índices de cada campo
  const idx: Record<string, number> = {};
  const avisos: string[] = [];
  for (const campo of Object.keys(ALIASES_COLUNAS)) {
    const i = resolverColuna(cabecalhoNorm, campo as keyof typeof ALIASES_COLUNAS);
    idx[campo] = i;
    if (i < 0 && !["beneficiarios_bpc", "beneficiarios_auxilio_gas", "igdm",
                    "valor_medio_bolsa_familia", "valor_total_bolsa_familia",
                    "percentual_familias_unipessoais"].includes(campo)) {
      avisos.push(`Coluna não encontrada no CSV: "${campo}" — será carregada como NULL`);
    }
  }

  // Valida campos obrigatórios
  for (const obrig of ["ano_mes", "codigo_ibge_municipio", "nome_municipio", "sigla_uf"]) {
    if (idx[obrig] < 0) {
      throw new Error(
        `Coluna obrigatória ausente no CSV: "${obrig}". ` +
        `Cabeçalho detectado: ${cabecalhoRaw.join(" | ")}`,
      );
    }
  }

  const rows: CadunicoRow[] = [];
  const linhasValidas = linhas.slice(1);

  for (const linha of linhasValidas) {
    const campos = linha.split(CSV_SEP);

    // Normaliza UF e filtra
    const uf = (campos[idx.sigla_uf] ?? "").trim().replace(/['"]/g, "").toUpperCase();
    if (uf !== UF_FILTRO) continue;

    // Normaliza ano_mes: aceita YYYY-MM, YYYYMM, MM/YYYY, YYYY/MM
    let ano_mes = (campos[idx.ano_mes] ?? "").trim().replace(/['"]/g, "");
    // Converte YYYYMM → YYYY-MM
    if (/^\d{6}$/.test(ano_mes)) {
      ano_mes = `${ano_mes.slice(0, 4)}-${ano_mes.slice(4, 6)}`;
    }
    // Converte MM/YYYY → YYYY-MM
    if (/^\d{2}\/\d{4}$/.test(ano_mes)) {
      const [m, y] = ano_mes.split("/");
      ano_mes = `${y}-${m}`;
    }
    // Converte YYYY/MM → YYYY-MM
    if (/^\d{4}\/\d{2}$/.test(ano_mes)) {
      ano_mes = ano_mes.replace("/", "-");
    }

    const match = ano_mes.match(/^(\d{4})-(\d{2})$/);
    if (!match) continue;

    const get = (campo: string) => campos[idx[campo]] ?? "";

    rows.push({
      ano: parseInt(match[1], 10),
      mes: parseInt(match[2], 10),
      ano_mes,
      sigla_uf: uf,
      codigo_ibge_municipio: get("codigo_ibge_municipio").trim().replace(/['"]/g, ""),
      nome_municipio: get("nome_municipio").trim().replace(/['"]/g, ""),
      familias_cadastradas:            toNum(get("familias_cadastradas")),
      pessoas_cadastradas:             toNum(get("pessoas_cadastradas")),
      familias_pobreza:                toNum(get("familias_pobreza")),
      familias_baixa_renda:            toNum(get("familias_baixa_renda")),
      familias_atualizadas:            toNum(get("familias_atualizadas")),
      familias_desatualizadas:         toNum(get("familias_desatualizadas")),
      taxa_atualizacao_cadastral:      toNum(get("taxa_atualizacao_cadastral")),
      familias_unipessoais:            toNum(get("familias_unipessoais")),
      percentual_familias_unipessoais: toNum(get("percentual_familias_unipessoais")),
      familias_bolsa_familia:          toNum(get("familias_bolsa_familia")),
      valor_total_bolsa_familia:       toNum(get("valor_total_bolsa_familia")),
      valor_medio_bolsa_familia:       toNum(get("valor_medio_bolsa_familia")),
      beneficiarios_bpc:               toNum(get("beneficiarios_bpc")),
      beneficiarios_auxilio_gas:       toNum(get("beneficiarios_auxilio_gas")),
      igdm:                            toNum(get("igdm")),
    });
  }

  return { rows, avisos };
}

// ---------------------------------------------------------------------------
// Upsert idempotente por competência
//
// Usa ON CONFLICT DO UPDATE com WHERE hash IS DISTINCT FROM EXCLUDED.hash:
//   - mesmo CSV rodado duas vezes → nenhum UPDATE disparado (hash idêntico)
//   - valor alterado no CSV → UPDATE apenas no registro afetado
//   - registro novo → INSERT normal
// ---------------------------------------------------------------------------

async function upsertCompetencia(
  anoMes: string,
  rows: CadunicoRow[],
): Promise<{ inseridos: number; atualizados: number }> {
  const dadosCompetencia = rows.filter((r) => r.ano_mes === anoMes);
  if (dadosCompetencia.length === 0) return { inseridos: 0, atualizados: 0 };

  let inseridos  = 0;
  let atualizados = 0;

  for (const row of dadosCompetencia) {
    const hash = hashRow(row);

    // xmax = 0 significa que a linha foi inserida; > 0 significa que foi atualizada.
    // Usamos isso para distinguir INSERT de UPDATE sem uma query extra.
    const result = await pgQuery<{ xmax: string }>(
      `INSERT INTO social.cadunico_municipio_mensal
         (ano, mes, ano_mes, sigla_uf, codigo_ibge_municipio, nome_municipio,
          familias_cadastradas, pessoas_cadastradas, familias_pobreza,
          familias_baixa_renda, familias_atualizadas, familias_desatualizadas,
          taxa_atualizacao_cadastral, familias_unipessoais, percentual_familias_unipessoais,
          familias_bolsa_familia, valor_total_bolsa_familia, valor_medio_bolsa_familia,
          beneficiarios_bpc, beneficiarios_auxilio_gas, igdm,
          fonte, data_referencia, hash_registro)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       ON CONFLICT (ano_mes, codigo_ibge_municipio) DO UPDATE SET
         familias_cadastradas            = EXCLUDED.familias_cadastradas,
         pessoas_cadastradas             = EXCLUDED.pessoas_cadastradas,
         familias_pobreza                = EXCLUDED.familias_pobreza,
         familias_baixa_renda            = EXCLUDED.familias_baixa_renda,
         familias_atualizadas            = EXCLUDED.familias_atualizadas,
         familias_desatualizadas         = EXCLUDED.familias_desatualizadas,
         taxa_atualizacao_cadastral      = EXCLUDED.taxa_atualizacao_cadastral,
         familias_unipessoais            = EXCLUDED.familias_unipessoais,
         percentual_familias_unipessoais = EXCLUDED.percentual_familias_unipessoais,
         familias_bolsa_familia          = EXCLUDED.familias_bolsa_familia,
         valor_total_bolsa_familia       = EXCLUDED.valor_total_bolsa_familia,
         valor_medio_bolsa_familia       = EXCLUDED.valor_medio_bolsa_familia,
         beneficiarios_bpc               = EXCLUDED.beneficiarios_bpc,
         beneficiarios_auxilio_gas       = EXCLUDED.beneficiarios_auxilio_gas,
         igdm                            = EXCLUDED.igdm,
         fonte                           = EXCLUDED.fonte,
         data_carga                      = now(),
         hash_registro                   = EXCLUDED.hash_registro,
         atualizado_em                   = now()
       WHERE social.cadunico_municipio_mensal.hash_registro IS DISTINCT FROM EXCLUDED.hash_registro
       RETURNING xmax::text`,
      [
        row.ano, row.mes, row.ano_mes, row.sigla_uf,
        row.codigo_ibge_municipio, row.nome_municipio,
        row.familias_cadastradas,   row.pessoas_cadastradas,
        row.familias_pobreza,       row.familias_baixa_renda,
        row.familias_atualizadas,   row.familias_desatualizadas,
        row.taxa_atualizacao_cadastral,
        row.familias_unipessoais,   row.percentual_familias_unipessoais,
        row.familias_bolsa_familia, row.valor_total_bolsa_familia,
        row.valor_medio_bolsa_familia,
        row.beneficiarios_bpc,      row.beneficiarios_auxilio_gas,
        row.igdm,
        FONTE,
        `${row.ano}-${String(row.mes).padStart(2, "0")}-01`,
        hash,
      ],
    );

    if (result.length > 0) {
      // xmax === "0" → linha recém inserida; xmax > 0 → linha atualizada
      if (result[0].xmax === "0") inseridos++;
      else atualizados++;
    }
    // resultado vazio = hash idêntico, nenhuma escrita (idempotente)
  }

  return { inseridos, atualizados };
}

// ---------------------------------------------------------------------------
// Job principal
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${MODULO}] Iniciando carga incremental — UF: ${UF_FILTRO}`);

  const idCarga = await iniciarCargaEtl({
    modulo: MODULO,
    modoCarga: "incremental",
    origem: FONTE,
    destino: "social.cadunico_municipio_mensal",
  });

  let totalInseridos  = 0;
  let totalAtualizados = 0;
  let totalLidos       = 0;

  try {
    await getPgPool();

    if (!CSV_PATH) {
      // TODO: quando a API pública do MDS estiver disponível, implementar aqui a
      //       chamada HTTP para buscar dados sem necessidade de exportação manual.
      console.warn(
        `[${MODULO}] CADUNICO_CSV_PATH não definido. ` +
        `Configure a variável de ambiente apontando para o arquivo exportado do VIS DATA/CECAD. ` +
        `Encerrando sem carga de dados.`,
      );
      await finalizarCargaEtl({
        idCarga,
        status: "ok",
        mensagem: "CSV não configurado. Defina CADUNICO_CSV_PATH para carregar dados.",
      });
      return;
    }

    console.log(`[${MODULO}] Lendo CSV: ${CSV_PATH}`);
    const { rows, avisos } = lerCsv(path.resolve(CSV_PATH));
    totalLidos = rows.length;

    if (avisos.length > 0) {
      console.warn(`[${MODULO}] Avisos de mapeamento de colunas:`);
      avisos.forEach((a) => console.warn(`  ⚠ ${a}`));
    }

    console.log(`[${MODULO}] ${totalLidos} registros lidos (UF=${UF_FILTRO})`);

    if (totalLidos === 0) {
      console.warn(`[${MODULO}] Nenhum registro para UF=${UF_FILTRO}. Verifique o CSV e a variável CADUNICO_UF.`);
      await finalizarCargaEtl({ idCarga, status: "ok", mensagem: "Nenhum registro para a UF configurada." });
      return;
    }

    const competenciasAlvo = calcularCompetenciasAlvo();
    console.log(`[${MODULO}] Competências alvo: ${competenciasAlvo.length}`);

    for (const anoMes of competenciasAlvo) {
      const registrosCompetencia = rows.filter((r) => r.ano_mes === anoMes).length;
      if (registrosCompetencia === 0) continue; // sem dados para esta competência no CSV

      const idControle = await pgQuery<{ id: number }>(
        `INSERT INTO social.cadunico_controle_carga (fonte, ano_mes, status, registros_lidos)
         VALUES ($1, $2, 'EXECUTANDO', $3) RETURNING id`,
        [FONTE, anoMes, registrosCompetencia],
      );
      const controleId = idControle[0]?.id;

      try {
        const { inseridos, atualizados } = await upsertCompetencia(anoMes, rows);

        totalInseridos  += inseridos;
        totalAtualizados += atualizados;

        const status = inseridos + atualizados > 0 ? "SUCESSO" : "IGNORADO";
        console.log(
          `[${MODULO}] ${anoMes} → ${status} ` +
          `(inseridos=${inseridos}, atualizados=${atualizados}, sem_mudança=${registrosCompetencia - inseridos - atualizados})`,
        );

        await pgQuery(
          `UPDATE social.cadunico_controle_carga
           SET status = $1, registros_inseridos = $2, registros_atualizados = $3, finalizado_em = now()
           WHERE id = $4`,
          [status, inseridos, atualizados, controleId],
        );
      } catch (err) {
        const mensagem = err instanceof Error ? err.message : String(err);
        console.error(`[${MODULO}] Erro na competência ${anoMes}:`, mensagem);
        await pgQuery(
          `UPDATE social.cadunico_controle_carga
           SET status = 'ERRO', mensagem = $1, finalizado_em = now()
           WHERE id = $2`,
          [mensagem, controleId],
        );
      }
    }

    const duracao = Date.now() - inicio;
    console.log(
      `[${MODULO}] Concluído em ${duracao}ms — ` +
      `inseridos=${totalInseridos}, atualizados=${totalAtualizados}`,
    );

    await finalizarCargaEtl({
      idCarga,
      status: "sucesso",
      registrosLidos:   totalLidos,
      registrosGravados: totalInseridos + totalAtualizados,
      mensagem: `inseridos=${totalInseridos} atualizados=${totalAtualizados}`,
    });

    await registrarLogEtl({
      modulo: MODULO,
      status: "sucesso",
      registros:  totalInseridos + totalAtualizados,
      duracaoMs: Date.now() - inicio,
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    console.error(`[${MODULO}] Erro fatal:`, mensagem);
    await finalizarCargaEtl({ idCarga, status: "erro", mensagem });
    await registrarLogEtl({ modulo: MODULO, status: "erro", mensagem });
  } finally {
    await closePgPool();
  }
}

main().catch(console.error);
