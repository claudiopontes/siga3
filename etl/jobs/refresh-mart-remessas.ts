/**
 * ETL — Refresh das tabelas mart de remessas
 *
 * Gera:
 *   mart.remessa_alertas  — alertas baseados no campo SITUACAO (fonte autoritativa)
 *   mart.remessa_resumo   — resumo por ano
 *
 * Regras de alerta (prazo_envio já incorpora prorrogações):
 *   Filtros base: status='1' (ativa) AND situacao <> 'AA' (somente mensais) AND prazo vencido
 *
 *   data_confirmacao IS NULL                          → CRITICO remessa_pendente
 *     (sem assinatura = sem envio válido, independente de data_envio)
 *   data_confirmacao IS NOT NULL AND > prazo_envio   → ALTO    remessa_confirmada_com_atraso
 *     (enviada e assinada, porém fora do prazo)
 *
 * Excluídos: situacao='C' (Confirmada dentro do prazo), situacao='AA' (remessa anual)
 *
 * Uso:
 *   cd etl && npm run mart:remessas
 */

import "dotenv/config";
import { withPgTransaction, pgQuery, closePgPool } from "../connectors/postgres";

const MODULO = "mart_remessas";

// ---------------------------------------------------------------------------
// Helpers de nome (resolução com prioridade em cascata)
// ---------------------------------------------------------------------------

const EXPR_NOME_ENTIDADE = `
  COALESCE(
    dre.nome_entidade,
    de.nome,
    dren.nome_ente,
    f.nome_entidade_confirmacao,
    'Entidade ' || f.id_entidade::text
  )
`.trim();

const EXPR_NOME_ENTE = `
  COALESCE(
    dren.nome_ente,
    dre.nome_ente,
    de.nome,
    NULL
  )
`.trim();

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarMartRemessas(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${new Date().toISOString()}] [mart-remessas] Iniciando refresh das tabelas mart...`);

  await withPgTransaction(async (client) => {
    // -----------------------------------------------------------------------
    // TRUNCATE alertas
    // -----------------------------------------------------------------------
    await client.query("TRUNCATE mart.remessa_alertas RESTART IDENTITY");
    console.log("[mart-remessas] -> mart.remessa_alertas truncada");

    // Fragmento SQL reutilizado nos 3 INSERTs:
    //   - status = '1'      → remessa ativa (outros valores = descartada)
    //   - situacao <> 'AA'  → exclui remessa anual (somente mensais)
    //   - prazo_envio < hoje → portão: só analisa se o prazo já venceu

    const JOIN_DIMS = `
      FROM dw.fato_remessa_contabil f
      LEFT JOIN dw.dim_remessa_entidade dre ON dre.id_entidade = f.id_entidade
      LEFT JOIN public.dim_entidade de      ON de.id_entidade  = f.id_entidade::bigint
      LEFT JOIN dw.dim_remessa_ente dren    ON dren.id_ente    = f.id_entidade_cjur::numeric
    `;

    const FILTRO_BASE = `
      f.status = '1'
      AND f.situacao <> 'AA'
      AND f.prazo_envio::date < CURRENT_DATE
    `;

    const COLS = `
      origem, id_remessa, id_entidade, id_entidade_cjur,
      nome_entidade, nome_ente,
      ano, numero, tipo_alerta, nivel, descricao,
      prazo_envio, data_envio, data_confirmacao, data_processamento,
      dias_atraso, situacao, status_publicacao, detalhe_json, atualizado_em
    `;

    const buildDetalhe = `jsonb_build_object(
      'situacao',                  f.situacao,
      'status',                    f.status,
      'tipo_liberacao',            f.tipo_liberacao,
      'status_publicacao',         f.status_publicacao,
      'protocolo_envio',           f.protocolo_envio,
      'arquivo',                   f.arquivo,
      'observacao',                f.observacao,
      'tempo_de_processamento',    f.tempo_de_processamento,
      'id_entidade_cjur',          f.id_entidade_cjur,
      'nome_usuario_enviou',       f.nome_usuario_enviou,
      'nome_entidade_confirmacao', f.nome_entidade_confirmacao
    )`;

    // -----------------------------------------------------------------------
    // 1. remessa_pendente — CRITICO
    //    Prazo vencido e data_confirmacao IS NULL.
    //    Sem assinatura = sem envio válido, qualquer que seja a situacao.
    // -----------------------------------------------------------------------
    await client.query(`
      INSERT INTO mart.remessa_alertas (${COLS})
      SELECT
        'CONTABIL', f.id_remessa, f.id_entidade, f.id_entidade_cjur,
        ${EXPR_NOME_ENTIDADE}, ${EXPR_NOME_ENTE},
        f.ano, f.numero,
        'remessa_pendente', 'CRITICO',
        'Remessa não confirmada — prazo encerrado',
        f.prazo_envio, f.data_envio, f.data_confirmacao, f.data_processamento,
        CURRENT_DATE - f.prazo_envio::date,
        f.situacao, f.status_publicacao, ${buildDetalhe}, now()
      ${JOIN_DIMS}
      WHERE ${FILTRO_BASE}
        AND f.data_confirmacao IS NULL
    `);
    console.log("[mart-remessas] -> remessa_pendente inserida (CRITICO)");

    // -----------------------------------------------------------------------
    // 2. remessa_confirmada_com_atraso — ALTO
    //    Foi assinada/confirmada, mas após o prazo_envio.
    // -----------------------------------------------------------------------
    await client.query(`
      INSERT INTO mart.remessa_alertas (${COLS})
      SELECT
        'CONTABIL', f.id_remessa, f.id_entidade, f.id_entidade_cjur,
        ${EXPR_NOME_ENTIDADE}, ${EXPR_NOME_ENTE},
        f.ano, f.numero,
        'remessa_confirmada_com_atraso', 'ALTO',
        'Remessa enviada e assinada fora do prazo',
        f.prazo_envio, f.data_envio, f.data_confirmacao, f.data_processamento,
        f.data_confirmacao::date - f.prazo_envio::date,
        f.situacao, f.status_publicacao, ${buildDetalhe}, now()
      ${JOIN_DIMS}
      WHERE ${FILTRO_BASE}
        AND f.data_confirmacao IS NOT NULL
        AND f.data_confirmacao > f.prazo_envio
    `);
    console.log("[mart-remessas] -> remessa_confirmada_com_atraso inserida (ALTO)");

    // -----------------------------------------------------------------------
    // Contar alertas gerados
    // -----------------------------------------------------------------------
    const cntAlertas = await client.query<{ total: string }>(
      "SELECT COUNT(*) AS total FROM mart.remessa_alertas WHERE origem = 'CONTABIL'",
    );
    console.log(`[mart-remessas] -> Total de alertas gerados: ${cntAlertas.rows[0].total}`);

    // -----------------------------------------------------------------------
    // mart.remessa_resumo — agrupado por ano
    // -----------------------------------------------------------------------
    await client.query(`
      INSERT INTO mart.remessa_resumo (
        origem, ano, total_remessas, total_entidades,
        total_nao_enviadas_prazo, total_enviadas_atraso,
        total_sem_confirmacao, total_sem_processamento,
        total_criticas, total_altas, total_medias, atualizado_em
      )
      SELECT
        'CONTABIL',
        ano,
        COUNT(*) AS total_remessas,
        COUNT(DISTINCT id_entidade) AS total_entidades,
        SUM(CASE WHEN tipo_alerta = 'remessa_pendente'               THEN 1 ELSE 0 END),
        SUM(CASE WHEN tipo_alerta = 'remessa_confirmada_com_atraso'  THEN 1 ELSE 0 END),
        0,
        0,
        SUM(CASE WHEN nivel = 'CRITICO' THEN 1 ELSE 0 END),
        SUM(CASE WHEN nivel = 'ALTO'    THEN 1 ELSE 0 END),
        SUM(CASE WHEN nivel = 'MEDIO'   THEN 1 ELSE 0 END),
        now()
      FROM mart.remessa_alertas
      WHERE origem = 'CONTABIL'
      GROUP BY ano
      ON CONFLICT (origem, ano) DO UPDATE SET
        total_remessas           = EXCLUDED.total_remessas,
        total_entidades          = EXCLUDED.total_entidades,
        total_nao_enviadas_prazo = EXCLUDED.total_nao_enviadas_prazo,
        total_enviadas_atraso    = EXCLUDED.total_enviadas_atraso,
        total_sem_confirmacao    = EXCLUDED.total_sem_confirmacao,
        total_sem_processamento  = EXCLUDED.total_sem_processamento,
        total_criticas           = EXCLUDED.total_criticas,
        total_altas              = EXCLUDED.total_altas,
        total_medias             = EXCLUDED.total_medias,
        atualizado_em            = EXCLUDED.atualizado_em
    `);
    console.log("[mart-remessas] -> mart.remessa_resumo atualizado");
  });

  const duracao = Date.now() - inicio;
  await pgQuery(
    `INSERT INTO audit.etl_log (modulo, status, mensagem, duracao_ms)
     VALUES ($1, $2, $3, $4)`,
    [MODULO, "ok", "Refresh das tabelas mart de remessas concluído", duracao],
  );
  console.log(`[mart-remessas] Refresh concluído em ${duracao}ms.`);
}

// Execução direta: ts-node jobs/refresh-mart-remessas.ts
if (require.main === module) {
  executarMartRemessas()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[mart-remessas] Erro:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
