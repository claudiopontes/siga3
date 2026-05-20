import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

async function main() {
  const out = (label: string, rows: unknown[]) => {
    process.stdout.write(`\n-- ${label}\n`);
    if (rows.length === 0) process.stdout.write("(vazio)\n");
    for (const r of rows) process.stdout.write(JSON.stringify(r) + "\n");
  };

  out("ultimas execuções de cada módulo da cadeia remessas (etl_log)",
    await pgQuery(`SELECT DISTINCT ON (modulo)
        modulo, status, registros, duracao_ms,
        substring(mensagem, 1, 120) AS mensagem,
        criado_em::text AS executado_em
      FROM audit.etl_log
      WHERE modulo IN ('remessas_full_postgres','remessas_dimensoes_postgres','mart_remessas')
      ORDER BY modulo, criado_em DESC`));

  out("ultimas cargas (etl_carga)",
    await pgQuery(`SELECT DISTINCT ON (modulo)
        modulo, status, registros_lidos, registros_gravados,
        iniciado_em::text AS iniciado_em,
        finalizado_em::text AS finalizado_em,
        substring(mensagem, 1, 120) AS mensagem
      FROM audit.etl_carga
      WHERE modulo IN ('remessas_full_postgres','remessas_dimensoes_postgres','mart_remessas')
      ORDER BY modulo, iniciado_em DESC`));

  out("contagem de linhas atuais nos destinos",
    await pgQuery(`SELECT
      (SELECT COUNT(*) FROM public.fato_remessa)::int AS fato_remessa,
      (SELECT COUNT(*) FROM public.dim_remessa_entidade)::int AS dim_remessa_entidade,
      (SELECT COUNT(*) FROM mart.remessa_alertas)::int AS mart_remessa_alertas,
      (SELECT COUNT(*) FROM mart.remessa_resumo)::int AS mart_remessa_resumo`));

  await closePgPool();
}
main().catch(async e => { console.error(e.message); await closePgPool().catch(()=>void 0); process.exit(1); });
