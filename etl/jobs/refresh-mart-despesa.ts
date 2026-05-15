import "dotenv/config";
import { withPgTransaction, pgQuery, closePgPool } from "../connectors/postgres";

const MODULO = "mart_despesa";

export async function executarMartDespesa(): Promise<void> {
  const inicio = Date.now();
  console.log("[mart-despesa] Iniciando refresh das tabelas mart...");

  await withPgTransaction(async (client) => {
    // despesa_resumo
    await client.query(`TRUNCATE mart.despesa_resumo`);
    await client.query(`
      INSERT INTO mart.despesa_resumo
        (ano_remessa, id_entidade, valor_empenhado_liquido, valor_liquidado, valor_pago,
         valor_a_liquidar, valor_a_pagar, qtd_empenhos, qtd_credores, percentual_pago)
      SELECT
        fe.ano_remessa,
        fe.id_entidade,
        SUM(fe.valor_empenhado_liquido),
        SUM(fe.valor_liquidado),
        SUM(fe.valor_pago),
        SUM(fe.valor_a_liquidar),
        SUM(fe.valor_a_pagar),
        COUNT(*)::integer,
        COUNT(DISTINCT fe.cpf_cnpj_credor)::integer,
        CASE WHEN SUM(fe.valor_liquidado) > 0
          THEN ROUND(SUM(fe.valor_pago) / SUM(fe.valor_liquidado) * 100, 2)
          ELSE 0
        END
      FROM public.fato_empenho fe
      GROUP BY fe.ano_remessa, fe.id_entidade
    `);
    console.log("[mart-despesa] ✓ despesa_resumo");

    // despesa_evolucao_mensal
    await client.query(`TRUNCATE mart.despesa_evolucao_mensal`);
    await client.query(`
      INSERT INTO mart.despesa_evolucao_mensal
        (ano_remessa, id_entidade, mes_empenho, valor_empenhado_liquido, valor_liquidado, valor_pago)
      SELECT
        fe.ano_remessa,
        fe.id_entidade,
        date_trunc('month', fe.data_empenho)::date,
        SUM(fe.valor_empenhado_liquido),
        SUM(fe.valor_liquidado),
        SUM(fe.valor_pago)
      FROM public.fato_empenho fe
      WHERE fe.data_empenho IS NOT NULL
      GROUP BY fe.ano_remessa, fe.id_entidade, date_trunc('month', fe.data_empenho)
    `);
    console.log("[mart-despesa] ✓ despesa_evolucao_mensal");

    // despesa_ranking_entes
    await client.query(`TRUNCATE mart.despesa_ranking_entes`);
    await client.query(`
      INSERT INTO mart.despesa_ranking_entes
        (ano_remessa, id_entidade, nome_ente, valor_empenhado_liquido, valor_liquidado, valor_pago, valor_a_pagar, qtd_empenhos)
      SELECT
        fe.ano_remessa,
        fe.id_entidade,
        de.nome,
        SUM(fe.valor_empenhado_liquido),
        SUM(fe.valor_liquidado),
        SUM(fe.valor_pago),
        SUM(fe.valor_a_pagar),
        COUNT(*)::integer
      FROM public.fato_empenho fe
      LEFT JOIN public.dim_ente de ON de.codigo = fe.id_entidade::integer
      GROUP BY fe.ano_remessa, fe.id_entidade, de.nome
    `);
    console.log("[mart-despesa] ✓ despesa_ranking_entes");

    // despesa_ranking_credores
    await client.query(`TRUNCATE mart.despesa_ranking_credores`);
    await client.query(`
      INSERT INTO mart.despesa_ranking_credores
        (ano_remessa, cpf_cnpj_credor, nome_credor, valor_empenhado_liquido, valor_pago, qtd_empenhos)
      SELECT
        fe.ano_remessa,
        fe.cpf_cnpj_credor,
        COALESCE(dc.nome, fe.cpf_cnpj_credor),
        SUM(fe.valor_empenhado_liquido),
        SUM(fe.valor_pago),
        COUNT(*)::integer
      FROM public.fato_empenho fe
      LEFT JOIN public.dim_credor dc ON dc.cnpj_cpf = fe.cpf_cnpj_credor
      WHERE fe.cpf_cnpj_credor IS NOT NULL
      GROUP BY fe.ano_remessa, fe.cpf_cnpj_credor, dc.nome
    `);
    console.log("[mart-despesa] ✓ despesa_ranking_credores");

    // despesa_composicao — garante coluna valor_liquidado
    await client.query(`ALTER TABLE mart.despesa_composicao ADD COLUMN IF NOT EXISTS valor_liquidado numeric(19,2) NOT NULL DEFAULT 0`);
    await client.query(`TRUNCATE mart.despesa_composicao`);
    await client.query(`
      INSERT INTO mart.despesa_composicao
        (ano_remessa, id_entidade, tipo_composicao, codigo, rotulo, valor_empenhado_liquido, valor_liquidado, valor_pago)
      SELECT ano_remessa, id_entidade, tipo_composicao, codigo, rotulo,
             SUM(valor_empenhado_liquido), SUM(valor_liquidado), SUM(valor_pago)
      FROM (
        SELECT fe.ano_remessa, fe.id_entidade,
          'categoria_economica' AS tipo_composicao,
          fe.numero_categoria_economica::text AS codigo,
          'Categoria ' || fe.numero_categoria_economica::text AS rotulo,
          fe.valor_empenhado_liquido, fe.valor_liquidado, fe.valor_pago
        FROM public.fato_empenho fe WHERE fe.numero_categoria_economica IS NOT NULL
        UNION ALL
        SELECT fe.ano_remessa, fe.id_entidade,
          'grupo_natureza',
          fe.numero_grupo_natureza_despesa::text,
          'Grupo ' || fe.numero_grupo_natureza_despesa::text,
          fe.valor_empenhado_liquido, fe.valor_liquidado, fe.valor_pago
        FROM public.fato_empenho fe WHERE fe.numero_grupo_natureza_despesa IS NOT NULL
        UNION ALL
        SELECT fe.ano_remessa, fe.id_entidade,
          'elemento_despesa',
          fe.numero_elemento_despesa::text,
          'Elemento ' || fe.numero_elemento_despesa::text,
          fe.valor_empenhado_liquido, fe.valor_liquidado, fe.valor_pago
        FROM public.fato_empenho fe WHERE fe.numero_elemento_despesa IS NOT NULL
        UNION ALL
        SELECT fe.ano_remessa, fe.id_entidade,
          'funcao',
          fe.numero_funcao::text,
          'Função ' || fe.numero_funcao::text,
          fe.valor_empenhado_liquido, fe.valor_liquidado, fe.valor_pago
        FROM public.fato_empenho fe WHERE fe.numero_funcao IS NOT NULL
        UNION ALL
        SELECT fe.ano_remessa, fe.id_entidade,
          'subfuncao',
          fe.numero_subfuncao::text,
          'Subfunção ' || fe.numero_subfuncao::text,
          fe.valor_empenhado_liquido, fe.valor_liquidado, fe.valor_pago
        FROM public.fato_empenho fe WHERE fe.numero_subfuncao IS NOT NULL
      ) sub
      GROUP BY ano_remessa, id_entidade, tipo_composicao, codigo, rotulo
      ON CONFLICT (ano_remessa, id_entidade, tipo_composicao, codigo) DO NOTHING
    `);
    console.log("[mart-despesa] ✓ despesa_composicao");

    // despesa_alertas
    await client.query(`TRUNCATE mart.despesa_alertas`);
    await client.query(`
      INSERT INTO mart.despesa_alertas
        (ano_remessa, id_entidade, tipo_alerta, nivel, descricao, valor_referencia)
      SELECT
        fe.ano_remessa, fe.id_entidade,
        'alto_a_pagar', 'alerta',
        COALESCE(de.nome, 'Entidade ' || fe.id_entidade::text),
        SUM(fe.valor_a_pagar)
      FROM public.fato_empenho fe
      LEFT JOIN public.dim_ente de ON de.codigo = fe.id_entidade::integer
      GROUP BY fe.ano_remessa, fe.id_entidade, de.nome
      HAVING SUM(fe.valor_a_pagar) > 0
      ON CONFLICT (ano_remessa, id_entidade, tipo_alerta) DO NOTHING
    `);
    console.log("[mart-despesa] ✓ despesa_alertas");
  });

  const duracao = Date.now() - inicio;
  await pgQuery(
    `INSERT INTO audit.etl_log (modulo, status, mensagem, duracao_ms) VALUES ($1, $2, $3, $4)`,
    [MODULO, "ok", "Refresh das tabelas mart concluído", duracao],
  );
  console.log(`[mart-despesa] Refresh concluído em ${duracao}ms.`);
}

// Execução direta: ts-node jobs/refresh-mart-despesa.ts
if (require.main === module) {
  executarMartDespesa()
    .catch((err) => {
      console.error("[mart-despesa] Erro:", (err as Error).message);
      process.exit(1);
    })
    .finally(() => closePgPool());
}
