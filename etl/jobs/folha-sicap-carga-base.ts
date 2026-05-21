/**
 * ETL — Folha SICAP / Gasto de Pessoal (Fase 17B base)
 *
 * Origem (SQL Server SICAP):
 *   - dbo.ContraCheque + dbo.CadastroUnico + dbo.PessoaFisica + dbo.Beneficiario
 *   - dbo.VerbasContraCheque + dbo.ContraCheque + dbo.Verba
 *
 * Histórico: a leitura era feita pelas views vw_folha_contracheque_base
 * (~12M linhas) e vw_folha_verbas_detalhada (~63M linhas), mas o dedup de
 * PessoaFisica nelas forçava materialização completa em cada batch. A leitura
 * direta nas tabelas base com OUTER APPLY TOP 1 para PessoaFisica é >100x
 * mais rápida e aproveita o índice ContraCheque_ano_IDX (ano, mes).
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
 *     FOLHA_COMPETENCIA           — "YYYY-MM" ou "YYYYMM" específico (precedência máxima)
 *     FOLHA_ANO_INICIAL           — ano inicial (intervalo explícito)
 *     FOLHA_ANO_FINAL             — ano final   (intervalo explícito)
 *     FOLHA_MES_INICIAL           — mês inicial (intervalo explícito)
 *     FOLHA_MES_FINAL             — mês final   (intervalo explícito)
 *     FOLHA_MAX_ANOS_RETROATIVOS  — guardrail: limite de anos retroativos (default: 1)
 *     FOLHA_PERMITIR_HISTORICO    — "1" libera carga histórica acima do guardrail
 *
 *   Padrão (sem nenhuma variável de período definida):
 *     Modo INCREMENTAL: janela rolante de N competências (FOLHA_JANELA_COMPETENCIAS,
 *     default 3) terminando no mês anterior ao corrente. Para cada (entidade, ano, mes)
 *     da janela, compara hash de assinatura da remessa (Remessa.id + dataEnvio +
 *     dataConfirmacao + tempoAtraso) com audit.folha_sicap_remessa_sync. Só reprocessa
 *     chaves novas, com hash mudado, ou que sumiram da origem (retificação). Todas as
 *     entidades disponíveis são consideradas — não há filtro por entidade.
 *
 *   Modos forçados:
 *     - FOLHA_COMPETENCIA: força reprocesso total daquela competência (ignora audit).
 *     - FOLHA_ANO_INI/FIM ou FOLHA_MES_INI/FIM: força reprocesso total do intervalo (ignora audit).
 *     - FOLHA_FORCAR_RECARGA=1: ignora audit também no modo incremental (recarga total da janela).
 *
 *   Variáveis incrementais:
 *     FOLHA_JANELA_COMPETENCIAS  — tamanho da janela rolante (default: 3 competências)
 *     FOLHA_FORCAR_RECARGA       — "1" recarrega tudo dentro da janela ignorando audit
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
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import sql from "mssql/msnodesqlv8";
import { from as copyFrom } from "pg-copy-streams";
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

const BATCH_SIZE = toPositiveInt(Number(process.env.FOLHA_BATCH_SIZE || "10000"), 10000);
const DRY_RUN = ["1", "true", "yes"].includes(String(process.env.FOLHA_DRY_RUN || "").toLowerCase());
const JANELA_COMPETENCIAS = toPositiveInt(Number(process.env.FOLHA_JANELA_COMPETENCIAS || "3"), 3);
const FORCAR_RECARGA = ["1", "true", "yes"].includes(
  String(process.env.FOLHA_FORCAR_RECARGA || "").toLowerCase(),
);

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

type SelecaoCompetencias = {
  competencias: { ano: number; mes: number; competencia: string }[];
  origem: "FOLHA_COMPETENCIA" | "INTERVALO_EXPLICITO" | "DEFAULT_INCREMENTAL";
};

function mesAnteriorAoCorrente(hoje: Date): { ano: number; mes: number } {
  // Janeiro recua para dezembro do ano anterior.
  const ano = hoje.getMonth() === 0 ? hoje.getFullYear() - 1 : hoje.getFullYear();
  const mes = hoje.getMonth() === 0 ? 12 : hoje.getMonth(); // getMonth() é 0..11; mes anterior em base 1 = getMonth().
  return { ano, mes };
}

function listarCompetenciasComOrigem(): SelecaoCompetencias {
  const compEspecifica = (process.env.FOLHA_COMPETENCIA || "").trim();
  if (compEspecifica) {
    // Aceita "YYYY-MM" e "YYYYMM".
    const m = compEspecifica.match(/^(\d{4})-?(\d{1,2})$/);
    if (!m) throw new Error(`FOLHA_COMPETENCIA inválida: "${compEspecifica}" (use YYYY-MM ou YYYYMM)`);
    const ano = parseInt(m[1], 10);
    const mes = parseInt(m[2], 10);
    if (mes < 1 || mes > 12) throw new Error(`FOLHA_COMPETENCIA com mês inválido: ${compEspecifica}`);
    return {
      competencias: [{ ano, mes, competencia: competenciaStr(ano, mes) }],
      origem: "FOLHA_COMPETENCIA",
    };
  }

  const hoje = new Date();

  // Se QUALQUER variável de intervalo for definida, entramos no modo intervalo
  // explícito. Caso contrário, padrão = apenas mês anterior ao corrente.
  const temIntervaloExplicito =
    !!process.env.FOLHA_ANO_INICIAL ||
    !!process.env.FOLHA_ANO_FINAL ||
    !!process.env.FOLHA_MES_INICIAL ||
    !!process.env.FOLHA_MES_FINAL;

  if (!temIntervaloExplicito) {
    // Modo incremental: janela rolante de JANELA_COMPETENCIAS terminando no
    // mês anterior ao corrente. Ex: maio/2026 + janela 3 = [2026-02, 2026-03, 2026-04].
    // O job vai diff contra audit.folha_sicap_remessa_sync e só reprocessar
    // chaves novas / mudadas / sumidas.
    const { ano: anoBase, mes: mesBase } = mesAnteriorAoCorrente(hoje);
    const comps: { ano: number; mes: number; competencia: string }[] = [];
    for (let k = JANELA_COMPETENCIAS - 1; k >= 0; k--) {
      // Recua k meses a partir de (anoBase, mesBase).
      let m = mesBase - k;
      let a = anoBase;
      while (m <= 0) {
        m += 12;
        a -= 1;
      }
      comps.push({ ano: a, mes: m, competencia: competenciaStr(a, m) });
    }
    return { competencias: comps, origem: "DEFAULT_INCREMENTAL" };
  }

  // Modo intervalo explícito: usa valores informados, com fallbacks conservadores.
  const anoIni = parseInt(process.env.FOLHA_ANO_INICIAL || String(hoje.getFullYear()), 10);
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
  return { competencias: out, origem: "INTERVALO_EXPLICITO" };
}

function listarCompetencias(): { ano: number; mes: number; competencia: string }[] {
  return listarCompetenciasComOrigem().competencias;
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
  // Conta direto na tabela base, usando o índice ContraCheque_ano_IDX (ano, mes).
  const rows = await sicapQuery<{ total: number }>(`
    SELECT COUNT(*) AS total
    FROM dbo.ContraCheque
    WHERE ano = ${ano} AND mes = ${mes}
  `);
  return rows[0]?.total ?? 0;
}

async function contarVerbas(ano: number, mes: number): Promise<number> {
  // VerbasContraCheque não tem ano/mes; conta via INNER JOIN com ContraCheque
  // filtrando pelo índice (ano, mes).
  const rows = await sicapQuery<{ total: number }>(`
    SELECT COUNT(*) AS total
    FROM dbo.VerbasContraCheque vcc
    INNER JOIN dbo.ContraCheque cc ON cc.id = vcc.idContraCheque
    WHERE cc.ano = ${ano} AND cc.mes = ${mes}
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
      INNER JOIN dbo.Cargo c
        ON c.id = COALESCE(cc.idCargoEfetivo, cc.idCargoAtual, cc.idCargo)
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

// ---------------------------------------------------------------------------
// COPY helpers — formato text (PostgreSQL COPY FROM STDIN default)
// ---------------------------------------------------------------------------
// Bulk-load via COPY é tipicamente 5–10× mais rápido que INSERT em lote
// porque elimina re-parse de SQL, limite de 65k parâmetros, e reduz fsyncs
// do WAL para 1 por stream em vez de 1 por chunk.
//
// Formato text:
//   - separador de colunas: TAB
//   - separador de linhas: \n
//   - NULL: \N
//   - escapes necessários em cada string: \ → \\, TAB → \t, LF → \n, CR → \r
//   - booleans: 't' / 'f'
//   - numéricos: serialização padrão JS (ponto decimal).
//
// Não há suporte a ON CONFLICT no COPY. O job garante unicidade via
// DELETE prévio escopado a (entidade, ano, mes) ou (ano, mes). Se houver
// violação de UNIQUE, será erro explícito — sinal de bug real, não silenciado.

function copyEscape(v: unknown): string {
  if (v === null || v === undefined) return "\\N";
  if (typeof v === "boolean") return v ? "t" : "f";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "\\N";
    return String(v);
  }
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  // Ordem importa: escapar barra invertida primeiro.
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function copyRow(values: unknown[]): string {
  return values.map(copyEscape).join("\t") + "\n";
}

async function executarCopy(
  copyCommand: string,
  linhas: Iterable<string>,
): Promise<void> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    const copyStream = client.query(copyFrom(copyCommand));
    const dataStream = Readable.from(linhas);
    await pipeline(dataStream, copyStream);
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

async function carregarFatoContracheque(
  ano: number,
  mes: number,
  idEntidadeCjur?: number | null,
): Promise<{ lidos: number; gravados: number }> {
  if (idEntidadeCjur != null) {
    await pgQuery(
      `DELETE FROM folha.fato_contracheque WHERE ano = $1 AND mes = $2 AND id_entidade_cjur = $3`,
      [ano, mes, idEntidadeCjur],
    );
  } else {
    await pgQuery(
      `DELETE FROM folha.fato_contracheque WHERE ano = $1 AND mes = $2`,
      [ano, mes],
    );
  }

  const pool = await getSicapPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  const pgPool = getPgPool();
  const pgClient = await pgPool.connect();

  let lidos = 0;
  let gravados = 0;

  try {
    // 1) Staging de ContraCheque da competência. Materializa filtro caro
    //    em uma única vez; clustered em id deixa o JOIN seguinte trivial.
    const filtroEntidade = idEntidadeCjur != null ? `AND idEntidadeCjur = ${idEntidadeCjur}` : "";
    const reqStaging = new sql.Request(transaction);
    await reqStaging.query(`
      IF OBJECT_ID('tempdb..#cc_periodo') IS NOT NULL DROP TABLE #cc_periodo;
      SELECT id, idEntidadeCjur, idCadastroUnico, idBeneficiario,
             COALESCE(idCargoEfetivo, idCargoAtual, idCargo) AS idCargoFinal,
             idTipoFolha, idUnidadeLotacao, idRemessa,
             totalVencimentos, totalDescontos,
             baseFgts, baseIrpf,
             basePrevidenciariaPatronal, basePrevidenciariaSegurado,
             situacaoBeneficiario,
             CAST(situacaoAtualServidor AS VARCHAR(10)) AS situacaoAtualServidor
        INTO #cc_periodo
        FROM dbo.ContraCheque
       WHERE ano = ${ano} AND mes = ${mes} ${filtroEntidade};
      CREATE CLUSTERED INDEX IX_cc_periodo ON #cc_periodo(id);
    `);

    // 2) Abre COPY stream no Postgres.
    //    nome_servidor não é coluna de fato_contracheque — só vai em dim_servidor
    //    (carregado uma vez por competência em carregarDimensoesDaCompetencia).
    //    O OUTER APPLY antigo era trabalho descartado por linha.
    const copyStream = pgClient.query(copyFrom(
      `COPY folha.fato_contracheque (
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
       ) FROM STDIN WITH (FORMAT text)`
    ));

    const competencia = competenciaStr(ano, mes);

    // 4) Stream do SQL Server. Sem TOP, sem ORDER BY — uma execução só.
    const reqStream = new sql.Request(transaction);
    reqStream.stream = true;

    const streamDone = new Promise<void>((resolve, reject) => {
      reqStream.on("row", (r: Record<string, unknown>) => {
        lidos += 1;
        const idCu = r.idCadastroUnico != null ? Number(r.idCadastroUnico) : null;
        const cpfStr = (r.cpf as string | null) ?? null;
        const totalV = num(r.totalVencimentos);
        const totalD = num(r.totalDescontos);
        const linha = copyRow([
          r.id,
          competencia,
          ano,
          mes,
          r.idEntidadeCjur ?? null,
          idCu,
          r.idBeneficiario ?? null,
          hashCpf(cpfStr),
          mascararCpf(cpfStr),
          (r.matricula as string | null) ?? null,
          r.idCargoFinal ?? null,
          r.idTipoFolha ?? null,
          r.idUnidadeLotacao ?? null,
          r.idRemessa ?? null,
          totalV,
          totalD,
          totalV !== null || totalD !== null
            ? (totalV ?? 0) - (totalD ?? 0)
            : null,
          num(r.baseFgts),
          num(r.baseIrpf),
          num(r.basePrevidenciariaPatronal),
          num(r.basePrevidenciariaSegurado),
          (r.situacaoBeneficiario as string | null) ?? null,
          (r.situacaoAtualServidor as string | null) ?? null,
          totalV !== null && totalV < 0,
          totalD !== null && totalD < 0,
          totalV !== null && totalD !== null && totalD > totalV,
          totalD !== null && totalD === 0,
          !cpfValido(cpfStr),
          r.idCargoFinal === null || r.idCargoFinal === undefined,
          r.idUnidadeLotacao === null || r.idUnidadeLotacao === undefined,
        ]);
        // Backpressure: pausa o stream do mssql se o COPY não consegue absorver.
        if (!copyStream.write(linha)) {
          reqStream.pause();
          copyStream.once("drain", () => reqStream.resume());
        }
        gravados += 1;
        if (lidos % 50000 === 0) {
          process.stdout.write(`        … fato_contracheque: ${lidos.toLocaleString("pt-BR")} streamados\n`);
        }
      });
      reqStream.on("error", reject);
      reqStream.on("done", () => resolve());
    });

    const copyDone = new Promise<void>((resolve, reject) => {
      copyStream.on("finish", resolve);
      copyStream.on("error", reject);
    });

    // CPF é o único campo fora da staging — pega de CadastroUnico via JOIN simples.
    // Matrícula vem de Beneficiario (LEFT JOIN; pode ser null).
    reqStream.query(`
      SELECT cc.id, cc.idEntidadeCjur, cc.idCadastroUnico, cc.idBeneficiario,
             cu.cpf,
             CAST(b.matricula AS VARCHAR(32)) AS matricula,
             cc.idCargoFinal, cc.idTipoFolha, cc.idUnidadeLotacao, cc.idRemessa,
             cc.totalVencimentos, cc.totalDescontos,
             cc.baseFgts, cc.baseIrpf,
             cc.basePrevidenciariaPatronal, cc.basePrevidenciariaSegurado,
             cc.situacaoBeneficiario, cc.situacaoAtualServidor
        FROM #cc_periodo cc
        LEFT JOIN dbo.CadastroUnico cu ON cu.id = cc.idCadastroUnico
        LEFT JOIN dbo.Beneficiario  b  ON b.id  = cc.idBeneficiario
    `);

    await streamDone;
    copyStream.end();
    await copyDone;

    await transaction.commit();
    return { lidos, gravados };
  } catch (error) {
    try { await transaction.rollback(); } catch { /* ignora */ }
    throw error;
  } finally {
    pgClient.release();
  }
}

// ---------------------------------------------------------------------------
// Carga de fato_verba_contracheque (por competência, paginada por keyset)
// ---------------------------------------------------------------------------

async function carregarFatoVerbaContracheque(
  ano: number,
  mes: number,
  idEntidadeCjur?: number | null,
): Promise<{ lidos: number; gravados: number }> {
  if (idEntidadeCjur != null) {
    await pgQuery(
      `DELETE FROM folha.fato_verba_contracheque WHERE ano = $1 AND mes = $2 AND id_entidade_cjur = $3`,
      [ano, mes, idEntidadeCjur],
    );
  } else {
    await pgQuery(
      `DELETE FROM folha.fato_verba_contracheque WHERE ano = $1 AND mes = $2`,
      [ano, mes],
    );
  }

  const pool = await getSicapPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  const pgPool = getPgPool();
  const pgClient = await pgPool.connect();

  let lidos = 0;
  let gravados = 0;

  try {
    // Staging de ContraCheque da competência (somente as colunas que o JOIN final usa).
    // Clustered em id deixa o hash join com vcc trivial.
    const filtroEntidade = idEntidadeCjur != null ? `AND idEntidadeCjur = ${idEntidadeCjur}` : "";
    const reqStaging = new sql.Request(transaction);
    await reqStaging.query(`
      IF OBJECT_ID('tempdb..#cc_periodo') IS NOT NULL DROP TABLE #cc_periodo;
      SELECT id, idCadastroUnico, idBeneficiario
        INTO #cc_periodo
        FROM dbo.ContraCheque
       WHERE ano = ${ano} AND mes = ${mes} ${filtroEntidade};
      CREATE CLUSTERED INDEX IX_cc_periodo ON #cc_periodo(id);
    `);

    const copyStream = pgClient.query(copyFrom(
      `COPY folha.fato_verba_contracheque (
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
       ) FROM STDIN WITH (FORMAT text)`
    ));

    const competencia = competenciaStr(ano, mes);

    const reqStream = new sql.Request(transaction);
    reqStream.stream = true;

    const streamDone = new Promise<void>((resolve, reject) => {
      reqStream.on("row", (r: Record<string, unknown>) => {
        lidos += 1;
        const valor = num(r.valor);
        const verbaCodigo = (r.verba_codigo as string | null) ?? null;
        const verbaDescricao = (r.verba_descricao as string | null) ?? null;
        const verbaNatureza = (r.verba_natureza as string | null) ?? null;
        const verbaSubgrupo = (r.verba_subgrupo as string | null) ?? null;
        const linha = copyRow([
          r.id,
          r.idContraCheque,
          competencia,
          ano,
          mes,
          r.idEntidadeCjur ?? null,
          r.idCadastroUnico ?? null,
          r.idBeneficiario ?? null,
          hashCpf((r.cpf as string | null) ?? null),
          (r.matricula as string | null) ?? null,
          r.idVerba ?? null,
          verbaCodigo,
          verbaDescricao,
          verbaNatureza,
          (r.verba_tipoReferencia as string | null) ?? null,
          (r.verba_categoriaEconomica as string | null) ?? null,
          (r.verba_grupoNaturezaDespesa as string | null) ?? null,
          (r.verba_modalidadeAplicacao as string | null) ?? null,
          (r.verba_elementoDespesa as string | null) ?? null,
          toBoolOrNull(r.verba_compoeVencimentoPadrao),
          toBoolOrNull(r.verba_baseFGTS),
          toBoolOrNull(r.verba_baseIRPF),
          toBoolOrNull(r.verba_basePrevidencia),
          verbaSubgrupo,
          num(r.referencia),
          valor,
          r.idTipoFolha ?? null,
          r.idRemessa ?? null,
          valor !== null && valor < 0,
          !verbaCodigo,
          !verbaDescricao,
          !verbaSubgrupo,
          !verbaNatureza,
        ]);
        if (!copyStream.write(linha)) {
          reqStream.pause();
          copyStream.once("drain", () => reqStream.resume());
        }
        gravados += 1;
        if (lidos % 100000 === 0) {
          process.stdout.write(`        … fato_verba: ${lidos.toLocaleString("pt-BR")} streamados\n`);
        }
      });
      reqStream.on("error", reject);
      reqStream.on("done", () => resolve());
    });

    const copyDone = new Promise<void>((resolve, reject) => {
      copyStream.on("finish", resolve);
      copyStream.on("error", reject);
    });

    reqStream.query(`
      SELECT vcc.id, vcc.idContraCheque, vcc.idVerba, vcc.valor, vcc.referencia,
             vcc.idEntidadeCjur, vcc.idTipoFolha, vcc.idRemessa,
             cc.idCadastroUnico, cc.idBeneficiario,
             cu.cpf,
             CAST(b.matricula AS VARCHAR(32)) AS matricula,
             v.codigo                      AS verba_codigo,
             v.descricao                    AS verba_descricao,
             v.natureza                     AS verba_natureza,
             v.tipoReferencia               AS verba_tipoReferencia,
             v.categoriaEconomica           AS verba_categoriaEconomica,
             v.grupoNaturezaDespesa         AS verba_grupoNaturezaDespesa,
             v.modalidadeAplicacao          AS verba_modalidadeAplicacao,
             v.elementoDespesa              AS verba_elementoDespesa,
             v.compoeVencimentoPadrao       AS verba_compoeVencimentoPadrao,
             v.baseFGTS                     AS verba_baseFGTS,
             v.baseIRPF                     AS verba_baseIRPF,
             v.basePrevidencia              AS verba_basePrevidencia,
             v.subGrupoClassificacaoVerba   AS verba_subgrupo
        FROM dbo.VerbasContraCheque vcc
        INNER JOIN #cc_periodo cc ON cc.id = vcc.idContraCheque
        LEFT  JOIN dbo.CadastroUnico cu ON cu.id = cc.idCadastroUnico
        LEFT  JOIN dbo.Beneficiario  b  ON b.id  = cc.idBeneficiario
        LEFT  JOIN dbo.Verba         v  ON v.id  = vcc.idVerba
    `);

    await streamDone;
    copyStream.end();
    await copyDone;

    await transaction.commit();
    return { lidos, gravados };
  } catch (error) {
    try { await transaction.rollback(); } catch { /* ignora */ }
    throw error;
  } finally {
    pgClient.release();
  }
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Incremental por (entidade × ano × mês) — Fase 17B.1
// ---------------------------------------------------------------------------

type ChaveRemessa = {
  id_entidade_cjur: number;
  ano: number;
  mes: number;
  id_remessa_sicap: number;
  data_envio: string | null;
  data_confirmacao: string | null;
  tempo_atraso: number | null;
  hash: string;
};

type DiffSync = {
  novas: ChaveRemessa[];        // existe na origem, ausente no audit
  mudadas: ChaveRemessa[];      // existe em ambos, hash diferente
  iguais: ChaveRemessa[];       // existe em ambos, hash igual
  sumidas: { id_entidade_cjur: number; ano: number; mes: number; id_remessa_sicap: number }[];
};

function calcularHashAssinatura(
  idRemessa: number | string | null | undefined,
  dataEnvio: unknown,
  dataConfirmacao: unknown,
  tempoAtraso: unknown,
): string {
  const norm = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString();
    return String(v);
  };
  const assinatura = [norm(idRemessa), norm(dataEnvio), norm(dataConfirmacao), norm(tempoAtraso)].join("|");
  return crypto.createHash("sha256").update(assinatura).digest("hex");
}

async function listarRemessasSicapNaJanela(
  competencias: { ano: number; mes: number }[],
): Promise<ChaveRemessa[]> {
  if (competencias.length === 0) return [];
  // Whitelist do par (ano, mes). SQL Server: OR-chain explícito.
  const filtros = competencias.map((c) => `(r.ano = ${c.ano} AND r.mes = ${c.mes})`).join(" OR ");
  const rows = await sicapQuery<{
    id_entidade_cjur: number;
    ano: number;
    mes: number;
    id_remessa_sicap: number | string;
    data_envio: Date | string | null;
    data_confirmacao: Date | string | null;
    tempo_atraso: number | null;
  }>(`
    SELECT
      r.idEntidadeCjur     AS id_entidade_cjur,
      r.ano                AS ano,
      r.mes                AS mes,
      r.id                 AS id_remessa_sicap,
      r.dataEnvio          AS data_envio,
      r.dataConfirmacao    AS data_confirmacao,
      r.tempoAtraso        AS tempo_atraso
    FROM remessa.Remessa r
    WHERE ${filtros}
  `);
  return rows.map((r) => ({
    id_entidade_cjur: Number(r.id_entidade_cjur),
    ano: Number(r.ano),
    mes: Number(r.mes),
    id_remessa_sicap: Number(r.id_remessa_sicap),
    data_envio: r.data_envio ? new Date(r.data_envio as never).toISOString() : null,
    data_confirmacao: r.data_confirmacao ? new Date(r.data_confirmacao as never).toISOString() : null,
    tempo_atraso: r.tempo_atraso ?? null,
    hash: calcularHashAssinatura(r.id_remessa_sicap, r.data_envio, r.data_confirmacao, r.tempo_atraso),
  }));
}

async function listarAuditNaJanela(
  competencias: { ano: number; mes: number }[],
): Promise<Map<string, { id_remessa_sicap: number; hash: string }>> {
  if (competencias.length === 0) return new Map();
  const filtros = competencias.map((_, i) => `($${i * 2 + 1}::int, $${i * 2 + 2}::int)`).join(",");
  const params: unknown[] = [];
  for (const c of competencias) {
    params.push(c.ano, c.mes);
  }
  const rows = await pgQuery<{
    id_entidade_cjur: number;
    ano: number;
    mes: number;
    id_remessa_sicap: string;
    hash_assinatura: string;
  }>(
    `SELECT id_entidade_cjur, ano, mes, id_remessa_sicap, hash_assinatura
       FROM audit.folha_sicap_remessa_sync
      WHERE (ano, mes) IN (${filtros})`,
    params,
  );
  const map = new Map<string, { id_remessa_sicap: number; hash: string }>();
  for (const r of rows) {
    const k = `${r.id_entidade_cjur}|${r.ano}|${r.mes}`;
    map.set(k, { id_remessa_sicap: Number(r.id_remessa_sicap), hash: r.hash_assinatura });
  }
  return map;
}

function diffSync(
  origem: ChaveRemessa[],
  audit: Map<string, { id_remessa_sicap: number; hash: string }>,
): DiffSync {
  const novas: ChaveRemessa[] = [];
  const mudadas: ChaveRemessa[] = [];
  const iguais: ChaveRemessa[] = [];
  const vistas = new Set<string>();

  for (const r of origem) {
    const k = `${r.id_entidade_cjur}|${r.ano}|${r.mes}`;
    vistas.add(k);
    const a = audit.get(k);
    if (!a) novas.push(r);
    else if (a.hash !== r.hash) mudadas.push(r);
    else iguais.push(r);
  }

  const sumidas: DiffSync["sumidas"] = [];
  for (const [k, a] of audit.entries()) {
    if (vistas.has(k)) continue;
    const [eId, ano, mes] = k.split("|").map((x) => Number(x));
    sumidas.push({ id_entidade_cjur: eId, ano, mes, id_remessa_sicap: a.id_remessa_sicap });
  }

  return { novas, mudadas, iguais, sumidas };
}

async function processarChave(
  chave: ChaveRemessa,
  idCargaEtl: number,
): Promise<{ contracheques: number; verbas: number }> {
  const cc = await carregarFatoContracheque(chave.ano, chave.mes, chave.id_entidade_cjur);
  const vv = await carregarFatoVerbaContracheque(chave.ano, chave.mes, chave.id_entidade_cjur);

  await pgQuery(
    `INSERT INTO audit.folha_sicap_remessa_sync
       (id_entidade_cjur, ano, mes, id_remessa_sicap, hash_assinatura,
        qtd_contracheques, qtd_verbas, sincronizado_em, id_carga_etl)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now(), $8)
     ON CONFLICT (id_entidade_cjur, ano, mes) DO UPDATE SET
       id_remessa_sicap = EXCLUDED.id_remessa_sicap,
       hash_assinatura  = EXCLUDED.hash_assinatura,
       qtd_contracheques = EXCLUDED.qtd_contracheques,
       qtd_verbas        = EXCLUDED.qtd_verbas,
       sincronizado_em   = now(),
       id_carga_etl      = EXCLUDED.id_carga_etl`,
    [chave.id_entidade_cjur, chave.ano, chave.mes, chave.id_remessa_sicap, chave.hash, cc.gravados, vv.gravados, idCargaEtl],
  );
  return { contracheques: cc.gravados, verbas: vv.gravados };
}

async function limparChaveSumida(chave: {
  id_entidade_cjur: number;
  ano: number;
  mes: number;
}): Promise<{ contracheques: number; verbas: number }> {
  const v = await pgQuery<{ count: number }>(
    `WITH del AS (
       DELETE FROM folha.fato_verba_contracheque
        WHERE ano = $1 AND mes = $2 AND id_entidade_cjur = $3
        RETURNING 1
     ) SELECT COUNT(*)::int AS count FROM del`,
    [chave.ano, chave.mes, chave.id_entidade_cjur],
  );
  const c = await pgQuery<{ count: number }>(
    `WITH del AS (
       DELETE FROM folha.fato_contracheque
        WHERE ano = $1 AND mes = $2 AND id_entidade_cjur = $3
        RETURNING 1
     ) SELECT COUNT(*)::int AS count FROM del`,
    [chave.ano, chave.mes, chave.id_entidade_cjur],
  );
  await pgQuery(
    `DELETE FROM audit.folha_sicap_remessa_sync
      WHERE id_entidade_cjur = $1 AND ano = $2 AND mes = $3`,
    [chave.id_entidade_cjur, chave.ano, chave.mes],
  );
  return { contracheques: c[0]?.count ?? 0, verbas: v[0]?.count ?? 0 };
}

async function sincronizarAuditCompetencia(ano: number, mes: number, idCarga: number): Promise<void> {
  // Após recarga total da competência, espelha audit com o estado real.
  const remessas = await listarRemessasSicapNaJanela([{ ano, mes }]);
  if (remessas.length === 0) return;

  const contagensCC = await pgQuery<{ id_entidade_cjur: number; qtd: number }>(
    `SELECT id_entidade_cjur, COUNT(*)::int AS qtd
       FROM folha.fato_contracheque
      WHERE ano = $1 AND mes = $2
      GROUP BY id_entidade_cjur`,
    [ano, mes],
  );
  const contagensVV = await pgQuery<{ id_entidade_cjur: number; qtd: number }>(
    `SELECT id_entidade_cjur, COUNT(*)::int AS qtd
       FROM folha.fato_verba_contracheque
      WHERE ano = $1 AND mes = $2
      GROUP BY id_entidade_cjur`,
    [ano, mes],
  );
  const mapaCC = new Map(contagensCC.map((r) => [Number(r.id_entidade_cjur), r.qtd]));
  const mapaVV = new Map(contagensVV.map((r) => [Number(r.id_entidade_cjur), r.qtd]));

  for (const r of remessas) {
    await pgQuery(
      `INSERT INTO audit.folha_sicap_remessa_sync
         (id_entidade_cjur, ano, mes, id_remessa_sicap, hash_assinatura,
          qtd_contracheques, qtd_verbas, sincronizado_em, id_carga_etl)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now(), $8)
       ON CONFLICT (id_entidade_cjur, ano, mes) DO UPDATE SET
         id_remessa_sicap = EXCLUDED.id_remessa_sicap,
         hash_assinatura  = EXCLUDED.hash_assinatura,
         qtd_contracheques = EXCLUDED.qtd_contracheques,
         qtd_verbas        = EXCLUDED.qtd_verbas,
         sincronizado_em   = now(),
         id_carga_etl      = EXCLUDED.id_carga_etl`,
      [
        r.id_entidade_cjur, r.ano, r.mes, r.id_remessa_sicap, r.hash,
        mapaCC.get(r.id_entidade_cjur) ?? 0,
        mapaVV.get(r.id_entidade_cjur) ?? 0,
        idCarga,
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarFolhaSicapBase(): Promise<void> {
  const inicio = Date.now();
  const selecao = listarCompetenciasComOrigem();
  const competencias = selecao.competencias;

  const descricaoOrigem: Record<typeof selecao.origem, string> = {
    FOLHA_COMPETENCIA: "FOLHA_COMPETENCIA (competência explícita, recarga total)",
    INTERVALO_EXPLICITO: "FOLHA_ANO_*/FOLHA_MES_* (intervalo explícito, recarga total)",
    DEFAULT_INCREMENTAL: `DEFAULT (janela rolante de ${JANELA_COMPETENCIAS} competências, incremental por remessa)`,
  };

  const modoIncremental = selecao.origem === "DEFAULT_INCREMENTAL" && !FORCAR_RECARGA;

  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  console.log(`  -> Fonte SQL Server: ${SICAP_HOST || "(SQLSERVER_HOST global)"} / ${SICAP_DATABASE}`);
  console.log(`  -> Destino PostgreSQL: schema folha.*`);
  console.log(`  -> Batch size: ${BATCH_SIZE}`);
  console.log(`  -> Dry-run: ${DRY_RUN ? "SIM" : "não"}`);
  console.log(`  -> Origem do período: ${descricaoOrigem[selecao.origem]}`);
  console.log(`  -> Modo de carga: ${modoIncremental ? "INCREMENTAL (diff por remessa)" : "RECARGA TOTAL por competência"}`);
  if (FORCAR_RECARGA) console.log(`  -> FOLHA_FORCAR_RECARGA=1: audit será ignorado e janela será recarregada por inteiro.`);
  console.log(`  -> Competências (${competencias.length}): ${competencias.map((c) => c.competencia).join(", ")}`);
  console.log(`  -> Escopo de entidades: TODAS as entidades presentes na(s) competência(s) — sem filtro de entidade/ente/poder.`);

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
    origem: `${SICAP_DATABASE}.dbo.ContraCheque + dbo.VerbasContraCheque (+ CadastroUnico/PessoaFisica/Beneficiario/Verba)`,
    destino: "folha.fato_contracheque + folha.fato_verba_contracheque + folha.dim_*",
  });

  let totalContracheques = 0;
  let totalVerbas = 0;
  const dimsAcum = {
    entidades: 0, servidores: 0, cargos: 0, lotacoes: 0,
    tiposFolha: 0, verbas: 0, remessas: 0,
  };

  let chavesProcessadas = 0;
  let chavesPuladas = 0;
  let chavesLimpas = 0;

  try {
    if (modoIncremental) {
      // =========================================================
      // FLUXO INCREMENTAL — diff por (entidade × ano × mês)
      // =========================================================
      console.log(`\n[Incremental] Listando remessas no SICAP na janela...`);
      const remessasSicap = await listarRemessasSicapNaJanela(competencias);
      console.log(`  -> ${remessasSicap.length} remessas na origem (todas situação=CO).`);

      console.log(`[Incremental] Consultando audit.folha_sicap_remessa_sync...`);
      const audit = await listarAuditNaJanela(competencias);
      console.log(`  -> ${audit.size} chaves já sincronizadas anteriormente.`);

      const diff = diffSync(remessasSicap, audit);
      console.log(`\n[Incremental] Diff:`);
      console.log(`  -> novas:   ${diff.novas.length}   (chaves novas a processar)`);
      console.log(`  -> mudadas: ${diff.mudadas.length}   (hash diferente — retificação)`);
      console.log(`  -> iguais:  ${diff.iguais.length}   (skip — sem mudança)`);
      console.log(`  -> sumidas: ${diff.sumidas.length}   (no audit, ausentes na origem — limpar)`);
      chavesPuladas = diff.iguais.length;

      // Dimensões: carrega apenas das competências realmente afetadas.
      const compsAfetadas = new Map<string, { ano: number; mes: number }>();
      for (const c of [...diff.novas, ...diff.mudadas]) {
        compsAfetadas.set(`${c.ano}-${c.mes}`, { ano: c.ano, mes: c.mes });
      }
      if (compsAfetadas.size > 0) {
        console.log(`\n[Incremental] Carregando dimensões das ${compsAfetadas.size} competência(s) afetada(s)...`);
        for (const c of compsAfetadas.values()) {
          await garantirDimTempo(c.ano, c.mes);
          const dims = await carregarDimensoesDaCompetencia(c.ano, c.mes);
          console.log(`  [dims ${competenciaStr(c.ano, c.mes)}] entidades=${dims.entidades} servidores=${dims.servidores} cargos=${dims.cargos} lotacoes=${dims.lotacoes} verbas=${dims.verbas} remessas=${dims.remessas}`);
          dimsAcum.entidades += dims.entidades;
          dimsAcum.servidores += dims.servidores;
          dimsAcum.cargos += dims.cargos;
          dimsAcum.lotacoes += dims.lotacoes;
          dimsAcum.tiposFolha += dims.tiposFolha;
          dimsAcum.verbas += dims.verbas;
          dimsAcum.remessas += dims.remessas;
        }
      }

      // Processa novas + mudadas.
      const aProcessar = [...diff.novas, ...diff.mudadas];
      if (aProcessar.length > 0) console.log(`\n[Incremental] Processando ${aProcessar.length} chave(s)...`);
      for (const k of aProcessar) {
        const tIni = Date.now();
        const tipo = audit.has(`${k.id_entidade_cjur}|${k.ano}|${k.mes}`) ? "MUDADA " : "NOVA   ";
        const r = await processarChave(k, idCarga);
        totalContracheques += r.contracheques;
        totalVerbas += r.verbas;
        chavesProcessadas += 1;
        console.log(`  ${tipo} entidade=${k.id_entidade_cjur} ${competenciaStr(k.ano, k.mes)} remessa=${k.id_remessa_sicap} -> cc=${r.contracheques} verbas=${r.verbas} (${Date.now() - tIni} ms)`);
      }

      // Limpa sumidas.
      if (diff.sumidas.length > 0) console.log(`\n[Incremental] Limpando ${diff.sumidas.length} chave(s) sumida(s) da origem...`);
      for (const s of diff.sumidas) {
        const r = await limparChaveSumida(s);
        chavesLimpas += 1;
        console.log(`  SUMIDA entidade=${s.id_entidade_cjur} ${competenciaStr(s.ano, s.mes)} (antes apontava remessa ${s.id_remessa_sicap}) -> removeu cc=${r.contracheques} verbas=${r.verbas}`);
      }
    } else {
      // =========================================================
      // FLUXO RECARGA TOTAL — FOLHA_COMPETENCIA / INTERVALO / FORCAR_RECARGA
      // =========================================================
      for (const c of competencias) {
        console.log(`\n--- Competência ${c.competencia} ---`);
        const tIni = Date.now();

        await garantirDimTempo(c.ano, c.mes);

        console.log("  [1/4] Carregando dimensões...");
        const dims = await carregarDimensoesDaCompetencia(c.ano, c.mes);
        console.log(`        entidades=${dims.entidades} servidores=${dims.servidores} cargos=${dims.cargos} lotacoes=${dims.lotacoes} tipos_folha=${dims.tiposFolha} verbas=${dims.verbas} remessas=${dims.remessas}`);
        dimsAcum.entidades += dims.entidades;
        dimsAcum.servidores += dims.servidores;
        dimsAcum.cargos += dims.cargos;
        dimsAcum.lotacoes += dims.lotacoes;
        dimsAcum.tiposFolha += dims.tiposFolha;
        dimsAcum.verbas += dims.verbas;
        dimsAcum.remessas += dims.remessas;

        console.log("  [2/4] Carregando fato_contracheque (recarga total)...");
        const cc = await carregarFatoContracheque(c.ano, c.mes);
        console.log(`        lidos=${cc.lidos} gravados=${cc.gravados}`);
        totalContracheques += cc.gravados;

        console.log("  [3/4] Carregando fato_verba_contracheque (recarga total)...");
        const vv = await carregarFatoVerbaContracheque(c.ano, c.mes);
        console.log(`        lidos=${vv.lidos} gravados=${vv.gravados}`);
        totalVerbas += vv.gravados;

        console.log("  [4/4] Sincronizando audit.folha_sicap_remessa_sync...");
        await sincronizarAuditCompetencia(c.ano, c.mes, idCarga);

        const dt = Date.now() - tIni;
        console.log(`  OK ${c.competencia} em ${dt} ms`);
      }
    }

    const duracao = Date.now() - inicio;
    const totalLidos = totalContracheques + totalVerbas;
    const totalGravado = totalContracheques + totalVerbas;

    console.log(`\n=== RESUMO ETL ${MODULO} ===`);
    console.log(`  Modo: ${modoIncremental ? "INCREMENTAL" : "RECARGA TOTAL"}`);
    console.log(`  Competências na janela: ${competencias.length} (${competencias.map((c) => c.competencia).join(", ")})`);
    if (modoIncremental) {
      console.log(`  Chaves processadas: ${chavesProcessadas}`);
      console.log(`  Chaves puladas (sem mudança): ${chavesPuladas}`);
      console.log(`  Chaves limpas (sumidas): ${chavesLimpas}`);
    }
    console.log(`  Dimensões carregadas (acumulado):`);
    console.log(`    - entidades:    ${dimsAcum.entidades}`);
    console.log(`    - servidores:   ${dimsAcum.servidores}`);
    console.log(`    - cargos:       ${dimsAcum.cargos}`);
    console.log(`    - lotações:     ${dimsAcum.lotacoes}`);
    console.log(`    - tipos folha:  ${dimsAcum.tiposFolha}`);
    console.log(`    - verbas:       ${dimsAcum.verbas}`);
    console.log(`    - remessas:     ${dimsAcum.remessas}`);
    console.log(`  Fatos gravados:`);
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
