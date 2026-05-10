/**
 * refresh-mart-credor-despesa.ts
 *
 * Reconstrói todas as marts de credores:
 *   - mart.credor_resumo
 *   - mart.credor_evolucao_mensal
 *   - mart.credor_entidades
 *   - mart.credor_empenhos_relevantes
 *   - mart.credor_pesquisa
 *
 * Fontes: public.fato_empenho, public.dim_credor, dw.dim_credor_enriquecido,
 *         public.dim_entidade, public.dim_ente.
 *
 * Uso: cd etl && npm run mart:credor-despesa
 */

import "dotenv/config";
import { withPgTransaction, pgQuery, closePgPool } from "../connectors/postgres";

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function formatarCPF(d: string): string {
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatarCNPJ(d: string): string {
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// -------------------------------------------------------
// SQL de suporte: expressão nome_exibicao
// -------------------------------------------------------
// Prioridade: enriquecido > dim_credor > CPF/CNPJ formatado
const NOME_EXIBICAO_EXPR = `
  COALESCE(
    enr.nome_exibicao,
    dc.nome,
    CASE
      WHEN length(fe.cpf_cnpj_credor) = 11
        THEN substring(fe.cpf_cnpj_credor,1,3)||'.'||substring(fe.cpf_cnpj_credor,4,3)||'.'||substring(fe.cpf_cnpj_credor,7,3)||'-'||substring(fe.cpf_cnpj_credor,10,2)
      WHEN length(fe.cpf_cnpj_credor) = 14
        THEN substring(fe.cpf_cnpj_credor,1,2)||'.'||substring(fe.cpf_cnpj_credor,3,3)||'.'||substring(fe.cpf_cnpj_credor,6,3)||'/'||substring(fe.cpf_cnpj_credor,9,4)||'-'||substring(fe.cpf_cnpj_credor,13,2)
      ELSE fe.cpf_cnpj_credor
    END
  )
`.trim();

// -------------------------------------------------------
// Main
// -------------------------------------------------------

async function main() {
  const inicio = Date.now();
  console.log("[mart:credor-despesa] Iniciando refresh das marts de credores...");

  await withPgTransaction(async (client) => {

    // -------------------------------------------------------
    // 1. credor_resumo
    // -------------------------------------------------------
    await client.query(`TRUNCATE mart.credor_resumo`);
    await client.query(`
      INSERT INTO mart.credor_resumo (
        cpf_cnpj_credor, nome_credor, nome_exibicao, tipo_documento,
        fonte_enriquecimento, data_consulta, status_consulta,
        valor_empenhado_liquido, valor_liquidado, valor_pago,
        valor_a_liquidar, valor_a_pagar,
        qtd_empenhos, qtd_entidades, primeiro_empenho, ultimo_empenho,
        atualizado_em
      )
      SELECT
        fe.cpf_cnpj_credor,
        max(dc.nome)                        AS nome_credor,
        max(${NOME_EXIBICAO_EXPR})          AS nome_exibicao,
        max(enr.tipo_documento)             AS tipo_documento,
        max(enr.fonte_enriquecimento)       AS fonte_enriquecimento,
        max(enr.data_consulta)              AS data_consulta,
        max(enr.status_consulta)            AS status_consulta,
        sum(fe.valor_empenhado_liquido)     AS valor_empenhado_liquido,
        sum(fe.valor_liquidado)             AS valor_liquidado,
        sum(fe.valor_pago)                  AS valor_pago,
        sum(fe.valor_a_liquidar)            AS valor_a_liquidar,
        sum(fe.valor_a_pagar)               AS valor_a_pagar,
        count(*)::integer                   AS qtd_empenhos,
        count(DISTINCT fe.id_entidade)::integer AS qtd_entidades,
        min(fe.data_empenho)::date          AS primeiro_empenho,
        max(fe.data_empenho)::date          AS ultimo_empenho,
        now()                               AS atualizado_em
      FROM public.fato_empenho fe
      LEFT JOIN public.dim_credor          dc  ON dc.cnpj_cpf  = fe.cpf_cnpj_credor
      LEFT JOIN dw.dim_credor_enriquecido  enr ON enr.cpf_cnpj = fe.cpf_cnpj_credor
      WHERE fe.cpf_cnpj_credor IS NOT NULL
        AND trim(fe.cpf_cnpj_credor) <> ''
      GROUP BY fe.cpf_cnpj_credor
      ON CONFLICT (cpf_cnpj_credor) DO UPDATE SET
        nome_credor             = EXCLUDED.nome_credor,
        nome_exibicao           = EXCLUDED.nome_exibicao,
        tipo_documento          = EXCLUDED.tipo_documento,
        fonte_enriquecimento    = EXCLUDED.fonte_enriquecimento,
        data_consulta           = EXCLUDED.data_consulta,
        status_consulta         = EXCLUDED.status_consulta,
        valor_empenhado_liquido = EXCLUDED.valor_empenhado_liquido,
        valor_liquidado         = EXCLUDED.valor_liquidado,
        valor_pago              = EXCLUDED.valor_pago,
        valor_a_liquidar        = EXCLUDED.valor_a_liquidar,
        valor_a_pagar           = EXCLUDED.valor_a_pagar,
        qtd_empenhos            = EXCLUDED.qtd_empenhos,
        qtd_entidades           = EXCLUDED.qtd_entidades,
        primeiro_empenho        = EXCLUDED.primeiro_empenho,
        ultimo_empenho          = EXCLUDED.ultimo_empenho,
        atualizado_em           = now()
    `);
    console.log("[mart:credor-despesa] ✓ credor_resumo");

    // -------------------------------------------------------
    // 2. credor_evolucao_mensal
    // -------------------------------------------------------
    await client.query(`TRUNCATE mart.credor_evolucao_mensal`);
    await client.query(`
      INSERT INTO mart.credor_evolucao_mensal (
        cpf_cnpj_credor, ano_remessa, mes_empenho,
        valor_empenhado_liquido, valor_liquidado, valor_pago,
        atualizado_em
      )
      SELECT
        fe.cpf_cnpj_credor,
        max(fe.ano_remessa)                        AS ano_remessa,
        date_trunc('month', fe.data_empenho)::date AS mes_empenho,
        sum(fe.valor_empenhado_liquido),
        sum(fe.valor_liquidado),
        sum(fe.valor_pago),
        now()
      FROM public.fato_empenho fe
      WHERE fe.cpf_cnpj_credor IS NOT NULL
        AND trim(fe.cpf_cnpj_credor) <> ''
        AND fe.data_empenho IS NOT NULL
      GROUP BY fe.cpf_cnpj_credor, date_trunc('month', fe.data_empenho)
      ON CONFLICT (cpf_cnpj_credor, mes_empenho) DO UPDATE SET
        ano_remessa             = EXCLUDED.ano_remessa,
        valor_empenhado_liquido = EXCLUDED.valor_empenhado_liquido,
        valor_liquidado         = EXCLUDED.valor_liquidado,
        valor_pago              = EXCLUDED.valor_pago,
        atualizado_em           = now()
    `);
    console.log("[mart:credor-despesa] ✓ credor_evolucao_mensal");

    // -------------------------------------------------------
    // 3. credor_entidades
    // -------------------------------------------------------
    await client.query(`TRUNCATE mart.credor_entidades`);
    await client.query(`
      INSERT INTO mart.credor_entidades (
        cpf_cnpj_credor, id_entidade, nome_entidade,
        valor_empenhado_liquido, valor_liquidado, valor_pago, valor_a_pagar,
        qtd_empenhos, atualizado_em
      )
      SELECT
        fe.cpf_cnpj_credor,
        fe.id_entidade,
        max(COALESCE(de.nome, dent.nome, 'Entidade ' || fe.id_entidade::text)) AS nome_entidade,
        sum(fe.valor_empenhado_liquido),
        sum(fe.valor_liquidado),
        sum(fe.valor_pago),
        sum(fe.valor_a_pagar),
        count(*)::integer,
        now()
      FROM public.fato_empenho fe
      LEFT JOIN public.dim_entidade de   ON de.id_entidade = fe.id_entidade::bigint
      LEFT JOIN public.dim_ente     dent ON dent.codigo    = fe.id_entidade
      WHERE fe.cpf_cnpj_credor IS NOT NULL
        AND trim(fe.cpf_cnpj_credor) <> ''
      GROUP BY fe.cpf_cnpj_credor, fe.id_entidade
      ON CONFLICT (cpf_cnpj_credor, id_entidade) DO UPDATE SET
        nome_entidade           = EXCLUDED.nome_entidade,
        valor_empenhado_liquido = EXCLUDED.valor_empenhado_liquido,
        valor_liquidado         = EXCLUDED.valor_liquidado,
        valor_pago              = EXCLUDED.valor_pago,
        valor_a_pagar           = EXCLUDED.valor_a_pagar,
        qtd_empenhos            = EXCLUDED.qtd_empenhos,
        atualizado_em           = now()
    `);
    console.log("[mart:credor-despesa] ✓ credor_entidades");

    // -------------------------------------------------------
    // 4. credor_empenhos_relevantes (top 500 por credor — valor desc)
    // -------------------------------------------------------
    await client.query(`TRUNCATE mart.credor_empenhos_relevantes`);
    await client.query(`
      INSERT INTO mart.credor_empenhos_relevantes (
        cpf_cnpj_credor, id_despesa, id_entidade, nome_entidade,
        ano_remessa, numero_remessa, ano_empenho, numero_empenho,
        data_empenho, historico_empenho,
        valor_empenhado_liquido, valor_liquidado, valor_pago, valor_a_pagar,
        atualizado_em
      )
      SELECT
        fe.cpf_cnpj_credor,
        fe.id_despesa,
        fe.id_entidade,
        max(COALESCE(de.nome, dent.nome, 'Entidade ' || fe.id_entidade::text)) AS nome_entidade,
        max(fe.ano_remessa)                  AS ano_remessa,
        max(fe.numero_remessa)               AS numero_remessa,
        max(fe.ano_empenho)                  AS ano_empenho,
        max(fe.numero_empenho)               AS numero_empenho,
        max(fe.data_empenho)::date           AS data_empenho,
        max(left(fe.historico_empenho, 500)) AS historico_empenho,
        max(fe.valor_empenhado_liquido)      AS valor_empenhado_liquido,
        max(fe.valor_liquidado)              AS valor_liquidado,
        max(fe.valor_pago)                   AS valor_pago,
        max(fe.valor_a_pagar)                AS valor_a_pagar,
        now()
      FROM (
        SELECT *,
          row_number() OVER (
            PARTITION BY cpf_cnpj_credor
            ORDER BY valor_empenhado_liquido DESC NULLS LAST
          ) AS rn
        FROM public.fato_empenho
        WHERE cpf_cnpj_credor IS NOT NULL AND trim(cpf_cnpj_credor) <> ''
      ) fe
      LEFT JOIN public.dim_entidade de   ON de.id_entidade = fe.id_entidade::bigint
      LEFT JOIN public.dim_ente     dent ON dent.codigo    = fe.id_entidade
      WHERE fe.rn <= 500
      GROUP BY fe.cpf_cnpj_credor, fe.id_despesa, fe.id_entidade
      ON CONFLICT (cpf_cnpj_credor, id_despesa) DO UPDATE SET
        nome_entidade           = EXCLUDED.nome_entidade,
        valor_empenhado_liquido = EXCLUDED.valor_empenhado_liquido,
        valor_liquidado         = EXCLUDED.valor_liquidado,
        valor_pago              = EXCLUDED.valor_pago,
        valor_a_pagar           = EXCLUDED.valor_a_pagar,
        atualizado_em           = now()
    `);
    console.log("[mart:credor-despesa] ✓ credor_empenhos_relevantes");

    // -------------------------------------------------------
    // 5. credor_pesquisa (com termo_pesquisa concatenado)
    // -------------------------------------------------------
    await client.query(`TRUNCATE mart.credor_pesquisa`);
    await client.query(`
      INSERT INTO mart.credor_pesquisa (
        cpf_cnpj_credor, nome_exibicao, nome_original, nome_enriquecido,
        tipo_documento, fonte_enriquecimento, status_consulta,
        municipio, uf,
        valor_empenhado_liquido, valor_liquidado, valor_pago, valor_a_pagar,
        qtd_empenhos, qtd_entidades, primeiro_empenho, ultimo_empenho,
        termo_pesquisa, atualizado_em
      )
      SELECT
        r.cpf_cnpj_credor,
        r.nome_exibicao,
        enr.nome_original,
        enr.nome_enriquecido,
        r.tipo_documento,
        r.fonte_enriquecimento,
        r.status_consulta,
        enr.municipio,
        enr.uf,
        r.valor_empenhado_liquido,
        r.valor_liquidado,
        r.valor_pago,
        r.valor_a_pagar,
        r.qtd_empenhos,
        r.qtd_entidades,
        r.primeiro_empenho,
        r.ultimo_empenho,
        lower(trim(concat_ws(' ',
          r.cpf_cnpj_credor,
          CASE
            WHEN length(r.cpf_cnpj_credor) = 11
              THEN substring(r.cpf_cnpj_credor,1,3)||'.'||substring(r.cpf_cnpj_credor,4,3)||'.'||substring(r.cpf_cnpj_credor,7,3)||'-'||substring(r.cpf_cnpj_credor,10,2)
            WHEN length(r.cpf_cnpj_credor) = 14
              THEN substring(r.cpf_cnpj_credor,1,2)||'.'||substring(r.cpf_cnpj_credor,3,3)||'.'||substring(r.cpf_cnpj_credor,6,3)||'/'||substring(r.cpf_cnpj_credor,9,4)||'-'||substring(r.cpf_cnpj_credor,13,2)
            ELSE ''
          END,
          r.nome_exibicao,
          r.nome_credor,
          enr.nome_enriquecido,
          enr.municipio,
          enr.uf
        ))) AS termo_pesquisa,
        now()
      FROM mart.credor_resumo r
      LEFT JOIN dw.dim_credor_enriquecido enr ON enr.cpf_cnpj = r.cpf_cnpj_credor
      ON CONFLICT (cpf_cnpj_credor) DO UPDATE SET
        nome_exibicao           = EXCLUDED.nome_exibicao,
        nome_original           = EXCLUDED.nome_original,
        nome_enriquecido        = EXCLUDED.nome_enriquecido,
        tipo_documento          = EXCLUDED.tipo_documento,
        fonte_enriquecimento    = EXCLUDED.fonte_enriquecimento,
        status_consulta         = EXCLUDED.status_consulta,
        municipio               = EXCLUDED.municipio,
        uf                      = EXCLUDED.uf,
        valor_empenhado_liquido = EXCLUDED.valor_empenhado_liquido,
        valor_liquidado         = EXCLUDED.valor_liquidado,
        valor_pago              = EXCLUDED.valor_pago,
        valor_a_pagar           = EXCLUDED.valor_a_pagar,
        qtd_empenhos            = EXCLUDED.qtd_empenhos,
        qtd_entidades           = EXCLUDED.qtd_entidades,
        primeiro_empenho        = EXCLUDED.primeiro_empenho,
        ultimo_empenho          = EXCLUDED.ultimo_empenho,
        termo_pesquisa          = EXCLUDED.termo_pesquisa,
        atualizado_em           = now()
    `);
    console.log("[mart:credor-despesa] ✓ credor_pesquisa");
  });

  const duracao = Date.now() - inicio;
  console.log(`[mart:credor-despesa] Refresh concluído em ${duracao}ms.`);

  await pgQuery(`
    INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
    VALUES ('mart:credor-despesa', 'OK', 'Refresh completo das marts de credores', 0, $1)
  `, [duracao]);
}

main()
  .then(() => closePgPool())
  .catch((err) => {
    console.error("[mart:credor-despesa] Erro:", (err as Error).message);
    closePgPool().catch(() => void 0);
    process.exit(1);
  });
