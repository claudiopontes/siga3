import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

async function main() {
  const out = (label: string, rows: unknown[]) => {
    process.stdout.write(`\n-- ${label}\n`);
    for (const r of rows) process.stdout.write(JSON.stringify(r) + "\n");
  };

  out(
    "fato_contracheque count",
    await pgQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM folha.fato_contracheque WHERE ano=2026 AND mes=5`,
    ),
  );
  out(
    "fato_verba_contracheque count",
    await pgQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM folha.fato_verba_contracheque WHERE ano=2026 AND mes=5`,
    ),
  );
  out(
    "fato_contracheque agregado",
    await pgQuery(
      `SELECT ano, mes, competencia,
              COUNT(*) AS qtd_contracheques,
              COUNT(DISTINCT cpf_hash) AS qtd_servidores,
              COUNT(DISTINCT id_entidade_cjur) AS qtd_entidades,
              SUM(total_vencimentos)::numeric(18,2) AS total_vencimentos,
              SUM(total_descontos)::numeric(18,2)  AS total_descontos,
              SUM(total_liquido)::numeric(18,2)    AS total_liquido
         FROM folha.fato_contracheque
        WHERE ano=2026 AND mes=5
        GROUP BY ano, mes, competencia`,
    ),
  );
  out(
    "fato_verba_contracheque agregado",
    await pgQuery(
      `SELECT ano, mes, competencia,
              COUNT(*) AS qtd_verbas,
              COUNT(DISTINCT id_contracheque_sicap) AS qtd_contracheques_com_verbas,
              COUNT(DISTINCT id_verba_sicap) AS qtd_verbas_distintas,
              SUM(verba_valor)::numeric(18,2) AS total_valor_verbas
         FROM folha.fato_verba_contracheque
        WHERE ano=2026 AND mes=5
        GROUP BY ano, mes, competencia`,
    ),
  );
  out(
    "verbas por natureza (C/D)",
    await pgQuery(
      `SELECT verba_natureza,
              COUNT(*) AS qtd,
              SUM(verba_valor)::numeric(18,2) AS total_valor
         FROM folha.fato_verba_contracheque
        WHERE ano=2026 AND mes=5
        GROUP BY verba_natureza
        ORDER BY verba_natureza`,
    ),
  );
  out(
    "contracheques sem entidade",
    await pgQuery(
      `SELECT COUNT(*) AS qtd
         FROM folha.fato_contracheque f
         LEFT JOIN folha.dim_entidade d ON d.id_entidade_cjur = f.id_entidade_cjur
        WHERE f.ano=2026 AND f.mes=5 AND d.id_entidade_cjur IS NULL`,
    ),
  );
  out(
    "contracheques sem servidor (por cpf_hash)",
    await pgQuery(
      `SELECT COUNT(*) AS qtd
         FROM folha.fato_contracheque f
         LEFT JOIN folha.dim_servidor d ON d.cpf_hash = f.cpf_hash
        WHERE f.ano=2026 AND f.mes=5 AND d.cpf_hash IS NULL`,
    ),
  );
  out(
    "contracheques sem servidor (por id_cadastro_unico)",
    await pgQuery(
      `SELECT COUNT(*) AS qtd
         FROM folha.fato_contracheque f
         LEFT JOIN folha.dim_servidor d ON d.id_cadastro_unico_sicap = f.id_cadastro_unico_sicap
        WHERE f.ano=2026 AND f.mes=5 AND d.id_cadastro_unico_sicap IS NULL`,
    ),
  );
  out(
    "verbas sem dim_verba",
    await pgQuery(
      `SELECT COUNT(*) AS qtd
         FROM folha.fato_verba_contracheque f
         LEFT JOIN folha.dim_verba d ON d.id_verba_sicap = f.id_verba_sicap
        WHERE f.ano=2026 AND f.mes=5 AND d.id_verba_sicap IS NULL`,
    ),
  );
  out(
    "contracheques sem dim_remessa",
    await pgQuery(
      `SELECT COUNT(*) AS qtd
         FROM folha.fato_contracheque f
         LEFT JOIN folha.dim_remessa d ON d.id_remessa_sicap = f.id_remessa_sicap
        WHERE f.ano=2026 AND f.mes=5 AND d.id_remessa_sicap IS NULL`,
    ),
  );
  out(
    "contracheques sem dim_cargo",
    await pgQuery(
      `SELECT COUNT(*) AS qtd
         FROM folha.fato_contracheque f
         LEFT JOIN folha.dim_cargo d ON d.id_cargo_sicap = f.id_cargo_sicap
        WHERE f.ano=2026 AND f.mes=5 AND f.id_cargo_sicap IS NOT NULL AND d.id_cargo_sicap IS NULL`,
    ),
  );
  await closePgPool();
}
main().catch(async (e) => {
  console.error(e.message);
  await closePgPool().catch(() => void 0);
  process.exit(1);
});
