/**
 * ETL — Folha SICAP / Gasto de Pessoal (Fase 17B base)
 *
 * Origem (SQL Server SICAP):
 *   - dbo.vw_folha_contracheque_base    (~12.071.144 linhas, 1 por contracheque)
 *   - dbo.vw_folha_verbas_detalhada     (~63.466.413 linhas, 1 por verba/rubrica)
 *
 * Destino (PostgreSQL analítico — schema `folha`):
 *   Dimensões: dim_tempo, dim_entidade, dim_servidor, dim_cargo, dim_lotacao,
 *              dim_tipo_folha, dim_verba, dim_remessa
 *   Fatos:     fato_contracheque, fato_verba_contracheque
 *
 * Estratégia:
 *   - Carga por competência (ano-mês). Para cada competência selecionada:
 *       1. Carrega dimensões referenciadas (upsert por PK natural SICAP).
 *       2. Substitui fato_contracheque da competência (DELETE + INSERT em lotes).
 *       3. Substitui fato_verba_contracheque da competência (DELETE + INSERT em lotes).
 *       4. Upsert em dim_remessa e dim_tempo.
 *   - Modo dry-run não grava no Postgres: apenas conta registros e imprime plano.
 *
 * Variáveis de ambiente:
 *   Conexão SQL Server SICAP:
 *     SICAP_SQLSERVER_HOST      — host do SQL Server SICAP (default: usa SQLSERVER_HOST do connector global)
 *     SICAP_SQLSERVER_PORT      — porta (default: 1433)
 *     SICAP_SQLSERVER_DATABASE  — banco (default: SICAP)
 *     SICAP_SQLSERVER_USER      — opcional (caso não use trusted connection)
 *     SICAP_SQLSERVER_PASSWORD  — opcional
 *     SICAP_SQLSERVER_ENCRYPT   — "true"/"false" (default: false)
 *
 *   Seleção de competências:
 *     FOLHA_COMPETENCIA           — "YYYY-MM" específico (precedência máxima)
 *     FOLHA_ANO_INICIAL           — ano inicial (default: ano atual - 1)
 *     FOLHA_ANO_FINAL             — ano final   (default: ano atual)
 *     FOLHA_MES_INICIAL           — mês inicial (default: 1)
 *     FOLHA_MES_FINAL             — mês final   (default: 12)
 *     FOLHA_MAX_ANOS_RETROATIVOS  — guardrail: limite de anos retroativos (default: 1)
 *     FOLHA_PERMITIR_HISTORICO    — "1" libera carga histórica acima do guardrail
 *
 *   Execução:
 *     FOLHA_BATCH_SIZE   — tamanho do lote de insert no Postgres (default: 2000)
 *     FOLHA_DRY_RUN      — "true"/"1" para não gravar (default: false)
 *
 * Uso:
 *   cd etl
 *   npm run folha:sicap:base                       # competência única ou intervalo via env
 *   FOLHA_COMPETENCIA=2025-10 npm run folha:sicap:base
 *   FOLHA_DRY_RUN=1 npm run folha:sicap:base       # plano de execução, sem gravar
 */

import "dotenv/config";
import * as crypto from "crypto";
import sql from "mssql/msnodesqlv8";
import { pgQuery, getPgPool, closePgPool } from "../connectors/postgres";
import { iniciarCargaEtl, finalizarCargaEtl, registrarLogEtl } from "../lib/auditoria";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const MODULO = "folha_sicap_base";

const SICAP_DATABASE = process.env.SICAP_SQLSERVER_DATABASE || "SICAP";
const SICAP_HOST = process.env.SICAP_SQLSERVER_HOST || process.env.SQLSERVER_HOST || "";
const SICAP_PORT = parseInt(process.env.SICAP_SQLSERVER_PORT || "1433", 10);
const SICAP_USER = process.env.SICAP_SQLSERVER_USER || "";
const SICAP_PASSWORD = process.env.SICAP_SQLSERVER_PASSWORD || "";
const SICAP_ENCRYPT = (process.env.SICAP_SQLSERVER_ENCRYPT || "false").toLowerCase() === "true";

const BATCH_SIZE = toPositiveInt(Number(process.env.FOLHA_BATCH_SIZE || "2000"), 2000);
const DRY_RUN = ["1", "true", "yes"].includes(String(process.env.FOLHA_DRY_RUN || "").toLowerCase());

function toPositiveInt(input: number, fallback: number): number {
  if (!Number.isFinite(input) || input < 1) return fallback;
  return Math.trunc(input);
}

// ---------------------------------------------------------------------------
// Pool SQL Server SICAP (dedicado para esta carga)
// ---------------------------------------------------------------------------

let sicapPool: sql.ConnectionPool | null = null;

async function getSicapPool(): Promise<sql.ConnectionPool> {
  if (sicapPool?.connected) return sicapPool;

  const usaTrustedConnection = !SICAP_USER || !SICAP_PASSWORD;

  const config: sql.config = {
    server: SICAP_HOST,
    database: SICAP_DATABASE,
    port: SICAP_PORT,
    user: usaTrustedConnection ? undefined : SICAP_USER,
    password: usaTrustedConnection ? undefined : SICAP_PASSWORD,
    options: {
      trustedConnection: usaTrustedConnection,
      trustServerCertificate: true,
      encrypt: SICAP_ENCRYPT,
    },
    connectionTimeout: 30000,
    requestTimeout: 600000, // 10 min — volumes grandes
  };

  sicapPool = new sql.ConnectionPool(config);
  await sicapPool.connect();
  return sicapPool;
}

async function closeSicapPool(): Promise<void> {
  if (sicapPool) {
    try { await sicapPool.close(); } catch { /* ignora */ }
    sicapPool = null;
  }
}

async function sicapQuery<T>(queryStr: string): Promise<T[]> {
  const pool = await getSicapPool();
  const result = await pool.request().query(queryStr);
  return result.recordset as T[];
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function hashCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const limpo = String(cpf).replace(/\D/g, "");
  if (!limpo) return null;
  return crypto.createHash("sha256").update(limpo).digest("hex");
}

function mascararCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const limpo = String(cpf).replace(/\D/g, "");
  if (limpo.length !== 11) return null;
  return `***.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-**`;
}

function cpfValido(cpf: string | null | undefined): boolean {
  if (!cpf) return false;
  const limpo = String(cpf).replace(/\D/g, "");
  return limpo.length === 11 && !/^(\d)\1+$/.test(limpo);
}

function competenciaStr(ano: number, mes: number): string {
  return `${ano.toString().padStart(4, "0")}-${mes.toString().padStart(2, "0")}`;
}

function listarCompetencias(): { ano: number; mes: number; competencia: string }[] {
  const compEspecifica = (process.env.FOLHA_COMPETENCIA || "").trim();
  if (compEspecifica) {
    // Aceita "YYYY-MM" e "YYYYMM".
    const m = compEspecifica.match(/^(\d{4})-?(\d{1,2})$/);
    if (!m) throw new Error(`FOLHA_COMPETENCIA inválida: "${compEspecifica}" (use YYYY-MM ou YYYYMM)`);
    const ano = parseInt(m[1], 10);
    const mes = parseInt(m[2], 10);
    if (mes < 1 || mes > 12) throw new Error(`FOLHA_COMPETENCIA com mês inválido: ${compEspecifica}`);
    return [{ ano, mes, competencia: competenciaStr(ano, mes) }];
  }
  const hoje = new Date();
  // Default: ano atual e ano anterior (janela analítica de 24 meses).
  // Para histórico maior, defina FOLHA_ANO_INICIAL e FOLHA_PERMITIR_HISTORICO=1.
  const anoIni = parseInt(process.env.FOLHA_ANO_INICIAL || String(hoje.getFullYear() - 1), 10);
  const anoFim = parseInt(process.env.FOLHA_ANO_FINAL || String(hoje.getFullYear()), 10);
  const mesIni = parseInt(process.env.FOLHA_MES_INICIAL || "1", 10);
  const mesFim = parseInt(process.env.FOLHA_MES_FINAL || "12", 10);

  // Guardrail: limita janela retroativa para evitar disparos acidentais de
  // 100M+ linhas. Pode ser desativado com FOLHA_PERMITIR_HISTORICO=1.
  const maxAnosRetro = toPositiveInt(Number(process.env.FOLHA_MAX_ANOS_RETROATIVOS || "1"), 1);
  const permitirHistorico = ["1", "true", "yes"].includes(
    String(process.env.FOLHA_PERMITIR_HISTORICO || "").toLowerCase(),
  );
  const anoAtual = hoje.getFullYear();
  if (!permitirHistorico && anoAtual - anoIni > maxAnosRetro) {
    throw new Error(
      `Janela retroativa excede o limite seguro: FOLHA_ANO_INICIAL=${anoIni} ` +
        `(ano atual ${anoAtual}, máximo ${maxAnosRetro} ano(s) atrás). ` +
        `Para liberar, defina FOLHA_PERMITIR_HISTORICO=1 ou ajuste FOLHA_MAX_ANOS_RETROATIVOS.`,
    );
  }

  const out: { ano: number; mes: number; competencia: string }[] = [];
  for (let a = anoIni; a <= anoFim; a++) {
    const mIni = a === anoIni ? mesIni : 1;
    const mFim = a === anoFim ? mesFim : 12;
    for (let m = mIni; m <= mFim; m++) {
      out.push({ ano: a, mes: m, competencia: competenciaStr(a, m) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tipos (subset esperado das views — pode necessitar ajuste fino conforme
// nomes reais das colunas das views SICAP).
// ---------------------------------------------------------------------------

type ContraChequeRow = {
  id_contracheque_sicap: number | string;
  ano: number;
  mes: number;
  id_entidade_cjur: number | null;
  id_cadastro_unico_sicap: number | string | null;
  id_beneficiario_sicap: number | string | null;
  cpf: string | null;
  nome_servidor: string | null;
  matricula: string | null;
  id_cargo_sicap: number | string | null;
  id_tipo_folha_sicap: number | string | null;
  id_unidade_lotacao_sicap: number | string | null;
  id_remessa_sicap: number | string | null;
  total_vencimentos: number | null;
  total_descontos: number | null;
  total_liquido: number | null;
  base_fgts: number | null;
  base_irpf: number | null;
  base_previdenciaria_patronal: number | null;
  base_previdenciaria_segurado: number | null;
  situacao_beneficiario: string | null;
  situacao_atual_servidor: string | null;
};

type VerbaContraChequeRow = {
  id_verba_contracheque_sicap: number | string;
  id_contracheque_sicap: number | string;
  ano: number;
  mes: number;
  id_entidade_cjur: number | null;
  id_cadastro_unico_sicap: number | string | null;
  id_beneficiario_sicap: number | string | null;
  cpf: string | null;
  matricula: string | null;
  id_verba_sicap: number | string | null;
  verba_codigo: string | null;
  verba_descricao: string | null;
  verba_natureza: string | null;
  verba_tipo_referencia: string | null;
  verba_categoria_economica: string | null;
  verba_grupo_natureza_despesa: string | null;
  verba_modalidade_aplicacao: string | null;
  verba_elemento_despesa: string | null;
  verba_compoe_vencimento_padrao: boolean | number | null;
  verba_base_fgts: boolean | number | null;
  verba_base_irpf: boolean | number | null;
  verba_base_previdencia: boolean | number | null;
  verba_subgrupo_classificacao: string | null;
  verba_referencia: number | null;
  verba_valor: number | null;
  id_tipo_folha_sicap: number | string | null;
  id_remessa_sicap: number | string | null;
};

// ---------------------------------------------------------------------------
// Contagens (para plano de execução / dry-run)
// ---------------------------------------------------------------------------

async function contarContracheques(ano: number, mes: number): Promise<number> {
  const rows = await sicapQuery<{ total: number }>(`
    SELECT COUNT(*) AS total
    FROM dbo.vw_folha_contracheque_base
    WHERE ano = ${ano} AND mes = ${mes}
  `);
  return rows[0]?.total ?? 0;
}

async function contarVerbas(ano: number, mes: number): Promise<number> {
  const rows = await sicapQuery<{ total: number }>(`
    SELECT COUNT(*) AS total
    FROM dbo.vw_folha_verbas_detalhada
    WHERE ano = ${ano} AND mes = ${mes}
  `);
  return rows[0]?.total ?? 0;
}

// ---------------------------------------------------------------------------
// Carga de dimensões a partir da competência corrente
// (upsert por PK natural — só registros realmente referenciados).
// ---------------------------------------------------------------------------

async function carregarDimensoesDaCompetencia(ano: number, mes: number): Promise<{
  entidades: number;
  servidores: number;
  cargos: number;
  lotacoes: number;
  tiposFolha: number;
  verbas: number;
  remessas: number;
}> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    // dim_entidade
    const entidades = await sicapQuery<Record<string, unknown>>(`
      SELECT DISTINCT
        e.idEntidadeCjur               AS id_entidade_cjur,
        e.nome                         AS entidade_nome,
        en.NOME                        AS ente_nome,
        e.poder                        AS entidade_poder,
        e.classificacaoAdministrativa  AS entidade_classificacao_administrativa,
        e.envioSicap                   AS entidade_envio_sicap,
        en.ID_ENTE                     AS id_ente,
        en.CODIGO                      AS ente_codigo,
        en.CODIGO_IBGE                 AS ente_codigo_ibge
      FROM dbo.ContraCheque cc
      INNER JOIN dbo.Entidade e ON e.idEntidadeCjur = cc.idEntidadeCjur
      LEFT JOIN dbo.Ente en     ON en.ID_ENTE = e.cod_ente
      WHERE cc.ano = ${ano} AND cc.mes = ${mes}
    `);
    for (const r of entidades) {
      await client.query(
        `INSERT INTO folha.dim_entidade
           (id_entidade_cjur, entidade_nome, ente_nome, entidade_poder,
            entidade_classificacao_administrativa, entidade_envio_sicap,
            id_ente, ente_codigo, ente_codigo_ibge, etl_atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
         ON CONFLICT (id_entidade_cjur) DO UPDATE SET
           entidade_nome = EXCLUDED.entidade_nome,
           ente_nome = EXCLUDED.ente_nome,
           entidade_poder = EXCLUDED.entidade_poder,
           entidade_classificacao_administrativa = EXCLUDED.entidade_classificacao_administrativa,
           entidade_envio_sicap = EXCLUDED.entidade_envio_sicap,
           id_ente = EXCLUDED.id_ente,
           ente_codigo = EXCLUDED.ente_codigo,
           ente_codigo_ibge = EXCLUDED.ente_codigo_ibge,
           etl_atualizado_em = now()`,
        [
          r.id_entidade_cjur ?? null,
          r.entidade_nome ?? null,
          r.ente_nome ?? null,
          r.entidade_poder ?? null,
          r.entidade_classificacao_administrativa ?? null,
          r.entidade_envio_sicap ?? null,
          r.id_ente ?? null,
          r.ente_codigo ?? null,
          r.ente_codigo_ibge ?? null,
        ],
      );
    }

    // dim_servidor (via CadastroUnico + PessoaFisica)
    const servidores = await sicapQuery<Record<string, unknown>>(`
      SELECT DISTINCT
        cu.id              AS id_cadastro_unico_sicap,
        cu.cpf             AS cpf,
        pf.nome            AS nome_servidor,
        pf.dataNascimento  AS data_nascimento,
        pf.sexo            AS sexo,
        pf.nitPisPasep     AS nit_pis_pasep
      FROM dbo.ContraCheque cc
      INNER JOIN dbo.CadastroUnico cu ON cu.id = cc.idCadastroUnico
      LEFT JOIN dbo.PessoaFisica pf   ON pf.idCadastroUnico = cu.id
      WHERE cc.ano = ${ano} AND cc.mes = ${mes}
    `);
    for (const r of servidores) {
      const cpf = r.cpf as string | null;
      await client.query(
        `INSERT INTO folha.dim_servidor
           (id_cadastro_unico_sicap, cpf_hash, cpf_mascarado, nome_servidor,
            data_nascimento, sexo, nit_pis_pasep, etl_atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7, now())
         ON CONFLICT (id_cadastro_unico_sicap) DO UPDATE SET
           cpf_hash = EXCLUDED.cpf_hash,
           cpf_mascarado = EXCLUDED.cpf_mascarado,
           nome_servidor = EXCLUDED.nome_servidor,
           data_nascimento = EXCLUDED.data_nascimento,
           sexo = EXCLUDED.sexo,
           nit_pis_pasep = EXCLUDED.nit_pis_pasep,
           etl_atualizado_em = now()`,
        [
          r.id_cadastro_unico_sicap ?? null,
          hashCpf(cpf),
          mascararCpf(cpf),
          r.nome_servidor ?? null,
          r.data_nascimento ?? null,
          r.sexo ?? null,
          r.nit_pis_pasep ?? null,
        ],
      );
    }

    // dim_cargo
    const cargos = await sicapQuery<Record<string, unknown>>(`
      SELECT DISTINCT
        c.id                              AS id_cargo_sicap,
        c.codigo                          AS cargo_codigo,
        c.nome                            AS cargo_nome,
        c.cargaHorariaMensal              AS carga_horaria_mensal,
        c.tipo                            AS cargo_tipo,
        c.tipoAcumulavel                  AS cargo_tipo_acumulavel,
        c.classificadoSistema             AS cargo_classificado_sistema,
        c.subGrupoClassificacaoFuncional  AS cargo_subgrupo_classificacao_funcional
      FROM dbo.ContraCheque cc
      INNER JOIN dbo.Cargo c ON c.id = cc.idCargo
      WHERE cc.ano = ${ano} AND cc.mes = ${mes}
    `);
    for (const r of cargos) {
      await client.query(
        `INSERT INTO folha.dim_cargo
           (id_cargo_sicap, cargo_codigo, cargo_nome, carga_horaria_mensal,
            cargo_tipo, cargo_tipo_acumulavel, cargo_classificado_sistema,
            cargo_subgrupo_classificacao_funcional, etl_atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
         ON CONFLICT (id_cargo_sicap) DO UPDATE SET
           cargo_codigo = EXCLUDED.cargo_codigo,
           cargo_nome = EXCLUDED.cargo_nome,
           carga_horaria_mensal = EXCLUDED.carga_horaria_mensal,
           cargo_tipo = EXCLUDED.cargo_tipo,
           cargo_tipo_acumulavel = EXCLUDED.cargo_tipo_acumulavel,
           cargo_classificado_sistema = EXCLUDED.cargo_classificado_sistema,
           cargo_subgrupo_classificacao_funcional = EXCLUDED.cargo_subgrupo_classificacao_funcional,
           etl_atualizado_em = now()`,
        [
          r.id_cargo_sicap ?? null,
          r.cargo_codigo ?? null,
          r.cargo_nome ?? null,
          r.carga_horaria_mensal ?? null,
          r.cargo_tipo ?? null,
          r.cargo_tipo_acumulavel ?? null,
          r.cargo_classificado_sistema ?? null,
          r.cargo_subgrupo_classificacao_funcional ?? null,
        ],
      );
    }

    // dim_lotacao
    const lotacoes = await sicapQuery<Record<string, unknown>>(`
      SELECT DISTINCT
        ul.id           AS id_unidade_lotacao_sicap,
        ul.codigo       AS unidade_lotacao_codigo,
        ul.nome         AS unidade_lotacao_nome,
        ul.idMunicipio  AS id_municipio_lotacao,
        mu.nome         AS municipio_lotacao_nome,
        mu.codigoIbge   AS municipio_lotacao_codigo_ibge,
        uf.sigla        AS uf_lotacao_sigla
      FROM dbo.ContraCheque cc
      INNER JOIN dbo.UnidadeLotacao ul ON ul.id = cc.idUnidadeLotacao
      LEFT JOIN dbo.Municipio mu       ON mu.id = ul.idMunicipio
      LEFT JOIN dbo.Uf uf              ON uf.id = mu.idUf
      WHERE cc.ano = ${ano} AND cc.mes = ${mes}
    `);
    for (const r of lotacoes) {
      await client.query(
        `INSERT INTO folha.dim_lotacao
           (id_unidade_lotacao_sicap, unidade_lotacao_codigo, unidade_lotacao_nome,
            id_municipio_lotacao, municipio_lotacao_nome, municipio_lotacao_codigo_ibge,
            uf_lotacao_sigla, etl_atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7, now())
         ON CONFLICT (id_unidade_lotacao_sicap) DO UPDATE SET
           unidade_lotacao_codigo = EXCLUDED.unidade_lotacao_codigo,
           unidade_lotacao_nome = EXCLUDED.unidade_lotacao_nome,
           id_municipio_lotacao = EXCLUDED.id_municipio_lotacao,
           municipio_lotacao_nome = EXCLUDED.municipio_lotacao_nome,
           municipio_lotacao_codigo_ibge = EXCLUDED.municipio_lotacao_codigo_ibge,
           uf_lotacao_sigla = EXCLUDED.uf_lotacao_sigla,
           etl_atualizado_em = now()`,
        [
          r.id_unidade_lotacao_sicap ?? null,
          r.unidade_lotacao_codigo ?? null,
          r.unidade_lotacao_nome ?? null,
          r.id_municipio_lotacao ?? null,
          r.municipio_lotacao_nome ?? null,
          r.municipio_lotacao_codigo_ibge ?? null,
          r.uf_lotacao_sigla ?? null,
        ],
      );
    }

    // dim_tipo_folha
    const tiposFolha = await sicapQuery<Record<string, unknown>>(`
      SELECT DISTINCT
        tf.id        AS id_tipo_folha_sicap,
        tf.codigo    AS tipo_folha_codigo,
        tf.descricao AS tipo_folha_descricao
      FROM dbo.ContraCheque cc
      INNER JOIN dbo.TipoFolha tf ON tf.id = cc.idTipoFolha
      WHERE cc.ano = ${ano} AND cc.mes = ${mes}
    `);
    for (const r of tiposFolha) {
      await client.query(
        `INSERT INTO folha.dim_tipo_folha
           (id_tipo_folha_sicap, tipo_folha_codigo, tipo_folha_descricao, etl_atualizado_em)
         VALUES ($1,$2,$3, now())
         ON CONFLICT (id_tipo_folha_sicap) DO UPDATE SET
           tipo_folha_codigo = EXCLUDED.tipo_folha_codigo,
           tipo_folha_descricao = EXCLUDED.tipo_folha_descricao,
           etl_atualizado_em = now()`,
        [r.id_tipo_folha_sicap ?? null, r.tipo_folha_codigo ?? null, r.tipo_folha_descricao ?? null],
      );
    }

    // dim_verba
    const verbas = await sicapQuery<Record<string, unknown>>(`
      SELECT DISTINCT
        v.id                          AS id_verba_sicap,
        v.codigo                      AS verba_codigo,
        v.descricao                   AS verba_descricao,
        v.natureza                    AS verba_natureza,
        v.tipoReferencia              AS verba_tipo_referencia,
        v.categoriaEconomica          AS verba_categoria_economica,
        v.grupoNaturezaDespesa        AS verba_grupo_natureza_despesa,
        v.modalidadeAplicacao         AS verba_modalidade_aplicacao,
        v.elementoDespesa             AS verba_elemento_despesa,
        v.compoeVencimentoPadrao      AS verba_compoe_vencimento_padrao,
        v.baseFGTS                    AS verba_base_fgts,
        v.baseIRPF                    AS verba_base_irpf,
        v.basePrevidencia             AS verba_base_previdencia,
        v.subGrupoClassificacaoVerba  AS verba_subgrupo_classificacao
      FROM dbo.VerbasContraCheque vcc
      INNER JOIN dbo.Verba v        ON v.id = vcc.idVerba
      INNER JOIN dbo.ContraCheque cc ON cc.id = vcc.idContraCheque
      WHERE cc.ano = ${ano} AND cc.mes = ${mes}
    `);
    for (const r of verbas) {
      await client.query(
        `INSERT INTO folha.dim_verba
           (id_verba_sicap, verba_codigo, verba_descricao, verba_natureza,
            verba_tipo_referencia, verba_categoria_economica, verba_grupo_natureza_despesa,
            verba_modalidade_aplicacao, verba_elemento_despesa, verba_compoe_vencimento_padrao,
            verba_base_fgts, verba_base_irpf, verba_base_previdencia,
            verba_subgrupo_classificacao, etl_atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
         ON CONFLICT (id_verba_sicap) DO UPDATE SET
           verba_codigo = EXCLUDED.verba_codigo,
           verba_descricao = EXCLUDED.verba_descricao,
           verba_natureza = EXCLUDED.verba_natureza,
           verba_tipo_referencia = EXCLUDED.verba_tipo_referencia,
           verba_categoria_economica = EXCLUDED.verba_categoria_economica,
           verba_grupo_natureza_despesa = EXCLUDED.verba_grupo_natureza_despesa,
           verba_modalidade_aplicacao = EXCLUDED.verba_modalidade_aplicacao,
           verba_elemento_despesa = EXCLUDED.verba_elemento_despesa,
           verba_compoe_vencimento_padrao = EXCLUDED.verba_compoe_vencimento_padrao,
           verba_base_fgts = EXCLUDED.verba_base_fgts,
           verba_base_irpf = EXCLUDED.verba_base_irpf,
           verba_base_previdencia = EXCLUDED.verba_base_previdencia,
           verba_subgrupo_classificacao = EXCLUDED.verba_subgrupo_classificacao,
           etl_atualizado_em = now()`,
        [
          r.id_verba_sicap ?? null,
          r.verba_codigo ?? null,
          r.verba_descricao ?? null,
          r.verba_natureza ?? null,
          r.verba_tipo_referencia ?? null,
          r.verba_categoria_economica ?? null,
          r.verba_grupo_natureza_despesa ?? null,
          r.verba_modalidade_aplicacao ?? null,
          r.verba_elemento_despesa ?? null,
          toBoolOrNull(r.verba_compoe_vencimento_padrao),
          toBoolOrNull(r.verba_base_fgts),
          toBoolOrNull(r.verba_base_irpf),
          toBoolOrNull(r.verba_base_previdencia),
          r.verba_subgrupo_classificacao ?? null,
        ],
      );
    }

    // dim_remessa
    const remessas = await sicapQuery<Record<string, unknown>>(`
      SELECT DISTINCT
        r.id                       AS id_remessa_sicap,
        r.ano                      AS ano,
        r.mes                      AS mes,
        r.idEntidadeCjur           AS id_entidade_cjur,
        r.dataEnvio                AS data_envio,
        r.dataConfirmacao          AS data_confirmacao,
        r.prazoEnvio               AS prazo_envio,
        r.situacao                 AS situacao,
        r.semMovimento             AS sem_movimento,
        r.situacaoTempestividade   AS situacao_tempestividade,
        r.tempoAtraso              AS tempo_atraso
      FROM dbo.ContraCheque cc
      INNER JOIN remessa.Remessa r ON r.id = cc.idRemessa
      WHERE cc.ano = ${ano} AND cc.mes = ${mes}
    `);
    for (const r of remessas) {
      const a = r.ano as number | null;
      const m = r.mes as number | null;
      await client.query(
        `INSERT INTO folha.dim_remessa
           (id_remessa_sicap, ano, mes, competencia, id_entidade_cjur,
            data_envio, data_confirmacao, prazo_envio, situacao, sem_movimento,
            situacao_tempestividade, tempo_atraso, etl_atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
         ON CONFLICT (id_remessa_sicap) DO UPDATE SET
           ano = EXCLUDED.ano,
           mes = EXCLUDED.mes,
           competencia = EXCLUDED.competencia,
           id_entidade_cjur = EXCLUDED.id_entidade_cjur,
           data_envio = EXCLUDED.data_envio,
           data_confirmacao = EXCLUDED.data_confirmacao,
           prazo_envio = EXCLUDED.prazo_envio,
           situacao = EXCLUDED.situacao,
           sem_movimento = EXCLUDED.sem_movimento,
           situacao_tempestividade = EXCLUDED.situacao_tempestividade,
           tempo_atraso = EXCLUDED.tempo_atraso,
           etl_atualizado_em = now()`,
        [
          r.id_remessa_sicap ?? null,
          a,
          m,
          a && m ? competenciaStr(a, m) : null,
          r.id_entidade_cjur ?? null,
          r.data_envio ?? null,
          r.data_confirmacao ?? null,
          r.prazo_envio ?? null,
          r.situacao ?? null,
          toBoolOrNull(r.sem_movimento),
          r.situacao_tempestividade ?? null,
          r.tempo_atraso ?? null,
        ],
      );
    }

    return {
      entidades: entidades.length,
      servidores: servidores.length,
      cargos: cargos.length,
      lotacoes: lotacoes.length,
      tiposFolha: tiposFolha.length,
      verbas: verbas.length,
      remessas: remessas.length,
    };
  } finally {
    client.release();
  }
}

function toBoolOrNull(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).toLowerCase().trim();
  if (["1", "true", "s", "sim", "y", "yes", "t"].includes(s)) return true;
  if (["0", "false", "n", "nao", "não", "no", "f"].includes(s)) return false;
  return null;
}

// ---------------------------------------------------------------------------
// dim_tempo — gerada deterministicamente
// ---------------------------------------------------------------------------

async function garantirDimTempo(ano: number, mes: number): Promise<void> {
  const competencia = competenciaStr(ano, mes);
  const trimestre = Math.floor((mes - 1) / 3) + 1;
  const semestre = mes <= 6 ? 1 : 2;
  const primeiroDia = `${ano.toString().padStart(4, "0")}-${mes.toString().padStart(2, "0")}-01`;
  const ultimoDate = new Date(ano, mes, 0);
  const ultimoDia = `${ultimoDate.getFullYear()}-${(ultimoDate.getMonth() + 1).toString().padStart(2, "0")}-${ultimoDate.getDate().toString().padStart(2, "0")}`;

  await pgQuery(
    `INSERT INTO folha.dim_tempo (competencia, ano, mes, trimestre, semestre, primeiro_dia, ultimo_dia)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (competencia) DO NOTHING`,
    [competencia, ano, mes, trimestre, semestre, primeiroDia, ultimoDia],
  );
}

// ---------------------------------------------------------------------------
// Carga de fato_contracheque (por competência, paginada)
// ---------------------------------------------------------------------------

async function carregarFatoContracheque(ano: number, mes: number): Promise<{ lidos: number; gravados: number }> {
  // DELETE por competência (truncate/reload mais seguro do que UPSERT em massa)
  await pgQuery(
    `DELETE FROM folha.fato_contracheque WHERE ano = $1 AND mes = $2`,
    [ano, mes],
  );

  let lidos = 0;
  let gravados = 0;
  let offset = 0;

  while (true) {
    const rows = await sicapQuery<ContraChequeRow>(`
      SELECT
        id_contracheque                     AS id_contracheque_sicap,
        ano, mes,
        id_entidade_cjur,
        id_cadastro_unico                   AS id_cadastro_unico_sicap,
        id_beneficiario                     AS id_beneficiario_sicap,
        cpf,
        servidor_nome                       AS nome_servidor,
        matricula,
        id_cargo_contracheque               AS id_cargo_sicap,
        id_tipo_folha                       AS id_tipo_folha_sicap,
        id_unidade_lotacao                  AS id_unidade_lotacao_sicap,
        id_remessa                          AS id_remessa_sicap,
        totalVencimentos                    AS total_vencimentos,
        totalDescontos                      AS total_descontos,
        total_liquido,
        baseFgts                            AS base_fgts,
        baseIrpf                            AS base_irpf,
        basePrevidenciariaPatronal          AS base_previdenciaria_patronal,
        basePrevidenciariaSegurado          AS base_previdenciaria_segurado,
        situacao_beneficiario_contracheque  AS situacao_beneficiario,
        situacao_atual_servidor
      FROM dbo.vw_folha_contracheque_base
      WHERE ano = ${ano} AND mes = ${mes}
      ORDER BY id_contracheque
      OFFSET ${offset} ROWS FETCH NEXT ${BATCH_SIZE} ROWS ONLY
    `);
    if (rows.length === 0) break;
    lidos += rows.length;

    // Postgres limita 65.535 parâmetros por query (int16). Com 30 colunas o
    // teto seguro é ~2.100 linhas/INSERT; mantemos 1.500 para uniformidade
    // com fato_verba_contracheque.
    const PG_CHUNK = 1500;

    const pool = getPgPool();
    const client = await pool.connect();
    try {
      for (let chunkStart = 0; chunkStart < rows.length; chunkStart += PG_CHUNK) {
        const chunk = rows.slice(chunkStart, chunkStart + PG_CHUNK);
        const placeholders: string[] = [];
        const valores: unknown[] = [];
        let p = 1;
        for (const r of chunk) {
          const cpfStr = r.cpf ?? null;
          const totalV = num(r.total_vencimentos);
          const totalD = num(r.total_descontos);
          const alertaVencNeg = totalV !== null && totalV < 0;
          const alertaDescNeg = totalD !== null && totalD < 0;
          const alertaDescMaior = totalV !== null && totalD !== null && totalD > totalV;
          const alertaSemDesc = totalD !== null && totalD === 0;
          const alertaCpfInv = !cpfValido(cpfStr);
          const alertaCargoAusente = r.id_cargo_sicap === null || r.id_cargo_sicap === undefined;
          const alertaLotacaoAusente = r.id_unidade_lotacao_sicap === null || r.id_unidade_lotacao_sicap === undefined;

          placeholders.push(
            `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`,
          );
          valores.push(
            r.id_contracheque_sicap,
            competenciaStr(ano, mes),
            ano,
            mes,
            r.id_entidade_cjur ?? null,
            r.id_cadastro_unico_sicap ?? null,
            r.id_beneficiario_sicap ?? null,
            hashCpf(cpfStr),
            mascararCpf(cpfStr),
            r.matricula ?? null,
            r.id_cargo_sicap ?? null,
            r.id_tipo_folha_sicap ?? null,
            r.id_unidade_lotacao_sicap ?? null,
            r.id_remessa_sicap ?? null,
            totalV,
            totalD,
            num(r.total_liquido),
            num(r.base_fgts),
            num(r.base_irpf),
            num(r.base_previdenciaria_patronal),
            num(r.base_previdenciaria_segurado),
            r.situacao_beneficiario ?? null,
            r.situacao_atual_servidor ?? null,
            alertaVencNeg,
            alertaDescNeg,
            alertaDescMaior,
            alertaSemDesc,
            alertaCpfInv,
            alertaCargoAusente,
            alertaLotacaoAusente,
          );
        }

        const res = await client.query(
          `INSERT INTO folha.fato_contracheque (
             id_contracheque_sicap, competencia, ano, mes,
             id_entidade_cjur, id_cadastro_unico_sicap, id_beneficiario_sicap,
             cpf_hash, cpf_mascarado, matricula,
             id_cargo_sicap, id_tipo_folha_sicap, id_unidade_lotacao_sicap, id_remessa_sicap,
             total_vencimentos, total_descontos, total_liquido,
             base_fgts, base_irpf,
             base_previdenciaria_patronal, base_previdenciaria_segurado,
             situacao_beneficiario, situacao_atual_servidor,
             alerta_vencimento_negativo, alerta_desconto_negativo,
             alerta_desconto_maior_vencimento, alerta_sem_desconto,
             alerta_cpf_invalido, alerta_cargo_ausente, alerta_lotacao_ausente
           ) VALUES ${placeholders.join(",")}
           ON CONFLICT (id_contracheque_sicap) DO NOTHING`,
          valores,
        );
        gravados += res.rowCount ?? 0;
      }
    } finally {
      client.release();
    }

    if (rows.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return { lidos, gravados };
}

// ---------------------------------------------------------------------------
// Carga de fato_verba_contracheque (por competência, paginada)
// ---------------------------------------------------------------------------

async function carregarFatoVerbaContracheque(ano: number, mes: number): Promise<{ lidos: number; gravados: number }> {
  await pgQuery(
    `DELETE FROM folha.fato_verba_contracheque WHERE ano = $1 AND mes = $2`,
    [ano, mes],
  );

  let lidos = 0;
  let gravados = 0;
  let offset = 0;

  while (true) {
    const rows = await sicapQuery<VerbaContraChequeRow>(`
      SELECT
        id_verba_contracheque  AS id_verba_contracheque_sicap,
        id_contracheque        AS id_contracheque_sicap,
        ano, mes,
        id_entidade_cjur,
        id_cadastro_unico      AS id_cadastro_unico_sicap,
        id_beneficiario        AS id_beneficiario_sicap,
        cpf, matricula,
        id_verba               AS id_verba_sicap,
        verba_codigo, verba_descricao, verba_natureza, verba_tipo_referencia,
        verba_categoria_economica, verba_grupo_natureza_despesa, verba_modalidade_aplicacao,
        verba_elemento_despesa, verba_compoe_vencimento_padrao,
        verba_base_fgts, verba_base_irpf, verba_base_previdencia,
        verba_subgrupo_classificacao, verba_referencia, verba_valor,
        id_tipo_folha          AS id_tipo_folha_sicap,
        id_remessa             AS id_remessa_sicap
      FROM dbo.vw_folha_verbas_detalhada
      WHERE ano = ${ano} AND mes = ${mes}
      ORDER BY id_verba_contracheque
      OFFSET ${offset} ROWS FETCH NEXT ${BATCH_SIZE} ROWS ONLY
    `);
    if (rows.length === 0) break;
    lidos += rows.length;

    // Postgres limita 65.535 parâmetros por query (int16). Com 33 colunas,
    // o teto seguro é ~1.800 linhas/INSERT. Mantemos a leitura SQL Server em
    // BATCH_SIZE e flushamos em sub-lotes para o Postgres.
    const PG_CHUNK = 1500;

    const pool = getPgPool();
    const client = await pool.connect();
    try {
      for (let chunkStart = 0; chunkStart < rows.length; chunkStart += PG_CHUNK) {
        const chunk = rows.slice(chunkStart, chunkStart + PG_CHUNK);
        const placeholders: string[] = [];
        const valores: unknown[] = [];
        let p = 1;
        for (const r of chunk) {
          const valor = num(r.verba_valor);
          const alertaValorNeg = valor !== null && valor < 0;
          const alertaSemCodigo = !r.verba_codigo;
          const alertaSemDescricao = !r.verba_descricao;
          const alertaSemSubgrupo = !r.verba_subgrupo_classificacao;
          const alertaSemNatureza = !r.verba_natureza;

          placeholders.push(
            `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`,
          );
          valores.push(
            r.id_verba_contracheque_sicap,
            r.id_contracheque_sicap,
            competenciaStr(ano, mes),
            ano,
            mes,
            r.id_entidade_cjur ?? null,
            r.id_cadastro_unico_sicap ?? null,
            r.id_beneficiario_sicap ?? null,
            hashCpf(r.cpf ?? null),
            r.matricula ?? null,
            r.id_verba_sicap ?? null,
            r.verba_codigo ?? null,
            r.verba_descricao ?? null,
            r.verba_natureza ?? null,
            r.verba_tipo_referencia ?? null,
            r.verba_categoria_economica ?? null,
            r.verba_grupo_natureza_despesa ?? null,
            r.verba_modalidade_aplicacao ?? null,
            r.verba_elemento_despesa ?? null,
            toBoolOrNull(r.verba_compoe_vencimento_padrao),
            toBoolOrNull(r.verba_base_fgts),
            toBoolOrNull(r.verba_base_irpf),
            toBoolOrNull(r.verba_base_previdencia),
            r.verba_subgrupo_classificacao ?? null,
            num(r.verba_referencia),
            valor,
            r.id_tipo_folha_sicap ?? null,
            r.id_remessa_sicap ?? null,
            alertaValorNeg,
            alertaSemCodigo,
            alertaSemDescricao,
            alertaSemSubgrupo,
            alertaSemNatureza,
          );
        }

        const res = await client.query(
          `INSERT INTO folha.fato_verba_contracheque (
             id_verba_contracheque_sicap, id_contracheque_sicap, competencia, ano, mes,
             id_entidade_cjur, id_cadastro_unico_sicap, id_beneficiario_sicap,
             cpf_hash, matricula,
             id_verba_sicap, verba_codigo, verba_descricao, verba_natureza, verba_tipo_referencia,
             verba_categoria_economica, verba_grupo_natureza_despesa, verba_modalidade_aplicacao,
             verba_elemento_despesa, verba_compoe_vencimento_padrao,
             verba_base_fgts, verba_base_irpf, verba_base_previdencia,
             verba_subgrupo_classificacao, verba_referencia, verba_valor,
             id_tipo_folha_sicap, id_remessa_sicap,
             alerta_verba_valor_negativo, alerta_verba_sem_codigo, alerta_verba_sem_descricao,
             alerta_verba_sem_subgrupo_classificacao, alerta_verba_sem_natureza
           ) VALUES ${placeholders.join(",")}
           ON CONFLICT (id_verba_contracheque_sicap) DO NOTHING`,
          valores,
        );
        gravados += res.rowCount ?? 0;
      }
    } finally {
      client.release();
    }

    if (rows.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return { lidos, gravados };
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarFolhaSicapBase(): Promise<void> {
  const inicio = Date.now();
  const competencias = listarCompetencias();

  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  console.log(`  -> Fonte SQL Server: ${SICAP_HOST || "(SQLSERVER_HOST global)"} / ${SICAP_DATABASE}`);
  console.log(`  -> Destino PostgreSQL: schema folha.*`);
  console.log(`  -> Batch size: ${BATCH_SIZE}`);
  console.log(`  -> Dry-run: ${DRY_RUN ? "SIM" : "não"}`);
  console.log(`  -> Competências (${competencias.length}): ${competencias.map((c) => c.competencia).join(", ")}`);

  if (DRY_RUN) {
    console.log("\n=== PLANO DE EXECUÇÃO (dry-run) ===");
    let totalCc = 0;
    let totalVv = 0;
    for (const c of competencias) {
      const [qtdCc, qtdVv] = await Promise.all([
        contarContracheques(c.ano, c.mes),
        contarVerbas(c.ano, c.mes),
      ]);
      totalCc += qtdCc;
      totalVv += qtdVv;
      console.log(`  -> ${c.competencia}: contracheques=${qtdCc.toLocaleString("pt-BR")} | verbas=${qtdVv.toLocaleString("pt-BR")}`);
    }
    const duracao = Date.now() - inicio;
    console.log(`\n=== RESUMO (dry-run) ===`);
    console.log(`  -> Competências planejadas: ${competencias.length}`);
    console.log(`  -> Total contracheques a processar: ${totalCc.toLocaleString("pt-BR")}`);
    console.log(`  -> Total verbas a processar:        ${totalVv.toLocaleString("pt-BR")}`);
    console.log(`  -> Tempo de planejamento: ${duracao} ms`);
    console.log(`  -> Nada foi gravado no PostgreSQL (FOLHA_DRY_RUN ativo).`);
    return;
  }

  const idCarga = await iniciarCargaEtl({
    modulo: MODULO,
    modoCarga: "delete_insert_por_competencia",
    origem: `${SICAP_DATABASE}.dbo.vw_folha_contracheque_base + dbo.vw_folha_verbas_detalhada`,
    destino: "folha.fato_contracheque + folha.fato_verba_contracheque + folha.dim_*",
  });

  let totalContracheques = 0;
  let totalVerbas = 0;
  const dimsAcum = {
    entidades: 0, servidores: 0, cargos: 0, lotacoes: 0,
    tiposFolha: 0, verbas: 0, remessas: 0,
  };

  try {
    for (const c of competencias) {
      console.log(`\n--- Competência ${c.competencia} ---`);
      const tIni = Date.now();

      await garantirDimTempo(c.ano, c.mes);

      console.log("  [1/3] Carregando dimensões...");
      const dims = await carregarDimensoesDaCompetencia(c.ano, c.mes);
      console.log(`        entidades=${dims.entidades} servidores=${dims.servidores} cargos=${dims.cargos} lotacoes=${dims.lotacoes} tipos_folha=${dims.tiposFolha} verbas=${dims.verbas} remessas=${dims.remessas}`);
      dimsAcum.entidades += dims.entidades;
      dimsAcum.servidores += dims.servidores;
      dimsAcum.cargos += dims.cargos;
      dimsAcum.lotacoes += dims.lotacoes;
      dimsAcum.tiposFolha += dims.tiposFolha;
      dimsAcum.verbas += dims.verbas;
      dimsAcum.remessas += dims.remessas;

      console.log("  [2/3] Carregando fato_contracheque...");
      const cc = await carregarFatoContracheque(c.ano, c.mes);
      console.log(`        lidos=${cc.lidos} gravados=${cc.gravados}`);
      totalContracheques += cc.gravados;

      console.log("  [3/3] Carregando fato_verba_contracheque...");
      const vv = await carregarFatoVerbaContracheque(c.ano, c.mes);
      console.log(`        lidos=${vv.lidos} gravados=${vv.gravados}`);
      totalVerbas += vv.gravados;

      const dt = Date.now() - tIni;
      console.log(`  OK ${c.competencia} em ${dt} ms`);
    }

    const duracao = Date.now() - inicio;
    const totalLidos = totalContracheques + totalVerbas;
    const totalGravado = totalContracheques + totalVerbas;

    console.log(`\n=== RESUMO ETL ${MODULO} ===`);
    console.log(`  Competências processadas: ${competencias.length} (${competencias.map((c) => c.competencia).join(", ")})`);
    console.log(`  Dimensões carregadas (acumulado):`);
    console.log(`    - entidades:    ${dimsAcum.entidades}`);
    console.log(`    - servidores:   ${dimsAcum.servidores}`);
    console.log(`    - cargos:       ${dimsAcum.cargos}`);
    console.log(`    - lotações:     ${dimsAcum.lotacoes}`);
    console.log(`    - tipos folha:  ${dimsAcum.tiposFolha}`);
    console.log(`    - verbas:       ${dimsAcum.verbas}`);
    console.log(`    - remessas:     ${dimsAcum.remessas}`);
    console.log(`  Fatos carregados:`);
    console.log(`    - contracheques: ${totalContracheques.toLocaleString("pt-BR")}`);
    console.log(`    - verbas:        ${totalVerbas.toLocaleString("pt-BR")}`);
    console.log(`  Tempo total: ${duracao} ms`);

    await registrarLogEtl({ modulo: MODULO, status: "ok", registros: totalGravado, duracaoMs: duracao });
    await finalizarCargaEtl({
      idCarga,
      status: "ok",
      registrosLidos: totalLidos,
      registrosGravados: totalGravado,
    });
  } catch (error) {
    const duracao = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error(`\nERRO no ETL ${MODULO}: ${mensagem}`);
    await registrarLogEtl({ modulo: MODULO, status: "erro", registros: 0, duracaoMs: duracao, mensagem });
    await finalizarCargaEtl({
      idCarga,
      status: "erro",
      registrosLidos: totalContracheques + totalVerbas,
      registrosGravados: totalContracheques + totalVerbas,
      mensagem,
    });
    throw error;
  }
}

if (require.main === module) {
  executarFolhaSicapBase()
    .then(async () => {
      await closeSicapPool();
      await closePgPool();
    })
    .catch(async () => {
      await closeSicapPool();
      await closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
