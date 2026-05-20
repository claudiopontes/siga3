import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

async function main() {
  const out = (label: string, rows: unknown[]) => {
    process.stdout.write(`\n-- ${label}\n`);
    for (const r of rows) process.stdout.write(JSON.stringify(r) + "\n");
  };

  out("agregado fato_contracheque",
    await pgQuery(`SELECT ano, mes, competencia,
        COUNT(*) AS qtd_contracheques,
        COUNT(DISTINCT cpf_hash) AS qtd_servidores,
        COUNT(DISTINCT id_entidade_cjur) AS qtd_entidades,
        COUNT(DISTINCT id_cargo_sicap) FILTER (WHERE id_cargo_sicap IS NOT NULL) AS qtd_cargos,
        COUNT(DISTINCT id_unidade_lotacao_sicap) FILTER (WHERE id_unidade_lotacao_sicap IS NOT NULL) AS qtd_lotacoes,
        COUNT(DISTINCT id_tipo_folha_sicap) AS qtd_tipos_folha,
        COUNT(DISTINCT id_remessa_sicap) AS qtd_remessas,
        SUM(total_vencimentos)::numeric(18,2) AS total_vencimentos,
        SUM(total_descontos)::numeric(18,2)  AS total_descontos,
        SUM(total_liquido)::numeric(18,2)    AS total_liquido
      FROM folha.fato_contracheque WHERE competencia='2025-12'
      GROUP BY ano, mes, competencia`));

  out("agregado fato_verba",
    await pgQuery(`SELECT competencia,
        COUNT(*) AS qtd_verbas,
        COUNT(DISTINCT id_contracheque_sicap) AS contracheques_com_verba,
        COUNT(DISTINCT id_verba_sicap) AS verbas_distintas,
        SUM(verba_valor)::numeric(18,2) AS total_valor
      FROM folha.fato_verba_contracheque WHERE competencia='2025-12' GROUP BY competencia`));

  out("por natureza",
    await pgQuery(`SELECT verba_natureza, COUNT(*) AS qtd,
        SUM(verba_valor)::numeric(18,2) AS total_valor
      FROM folha.fato_verba_contracheque WHERE competencia='2025-12'
      GROUP BY verba_natureza ORDER BY verba_natureza`));

  out("integridade",
    await pgQuery(`SELECT
      (SELECT COUNT(*) FROM folha.fato_contracheque f
        LEFT JOIN folha.dim_entidade d ON d.id_entidade_cjur=f.id_entidade_cjur
        WHERE f.competencia='2025-12' AND d.id_entidade_cjur IS NULL)::int AS sem_entidade,
      (SELECT COUNT(*) FROM folha.fato_contracheque f
        LEFT JOIN folha.dim_servidor d ON d.cpf_hash=f.cpf_hash
        WHERE f.competencia='2025-12' AND d.cpf_hash IS NULL)::int AS sem_servidor_cpf,
      (SELECT COUNT(*) FROM folha.fato_contracheque f
        LEFT JOIN folha.dim_tipo_folha d ON d.id_tipo_folha_sicap=f.id_tipo_folha_sicap
        WHERE f.competencia='2025-12' AND d.id_tipo_folha_sicap IS NULL)::int AS sem_tipo_folha,
      (SELECT COUNT(*) FROM folha.fato_contracheque f
        LEFT JOIN folha.dim_remessa d ON d.id_remessa_sicap=f.id_remessa_sicap
        WHERE f.competencia='2025-12' AND d.id_remessa_sicap IS NULL)::int AS sem_remessa,
      (SELECT COUNT(*) FROM folha.fato_verba_contracheque f
        LEFT JOIN folha.dim_verba d ON d.id_verba_sicap=f.id_verba_sicap
        WHERE f.competencia='2025-12' AND d.id_verba_sicap IS NULL)::int AS verbas_sem_dim`));

  out("alertas qualidade contracheque",
    await pgQuery(`SELECT
      SUM(alerta_vencimento_negativo::int)         AS venc_neg,
      SUM(alerta_desconto_negativo::int)           AS desc_neg,
      SUM(alerta_desconto_maior_vencimento::int)   AS desc_maior_venc,
      SUM(alerta_sem_desconto::int)                AS sem_desconto,
      SUM(alerta_cpf_invalido::int)                AS cpf_invalido,
      SUM(alerta_cargo_ausente::int)               AS cargo_ausente,
      SUM(alerta_lotacao_ausente::int)             AS lotacao_ausente
      FROM folha.fato_contracheque WHERE competencia='2025-12'`));

  out("alertas qualidade verba",
    await pgQuery(`SELECT
      SUM(alerta_verba_valor_negativo::int)              AS valor_neg,
      SUM(alerta_verba_sem_codigo::int)                  AS sem_codigo,
      SUM(alerta_verba_sem_descricao::int)               AS sem_descricao,
      SUM(alerta_verba_sem_subgrupo_classificacao::int)  AS sem_subgrupo,
      SUM(alerta_verba_sem_natureza::int)                AS sem_natureza
      FROM folha.fato_verba_contracheque WHERE competencia='2025-12'`));

  await closePgPool();
}
main().catch(async e => { console.error(e.message); await closePgPool().catch(()=>void 0); process.exit(1); });
