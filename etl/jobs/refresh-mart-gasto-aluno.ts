/**
 * refresh-mart-gasto-aluno.ts
 *
 * Fase 16C.2 revisitada — Calcula `gasto MDE por aluno` cruzando:
 *   mart.siope_risco_educacao_basico (MDE + Despesa Educação)
 *   public.dim_escola_inep (matrículas Censo)
 *
 * Resultado em mart.gasto_aluno_municipio: gasto_aluno_mde, gasto_aluno_educacao.
 *
 * Dependência: tanto SICONFI quanto Censo precisam estar carregados.
 *
 * Uso: cd etl && npx ts-node jobs/refresh-mart-gasto-aluno.ts
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

async function executar() {
  const inicio = Date.now();
  console.log("[mart-gasto-aluno] Reconstruindo mart.gasto_aluno_municipio…");

  // Última fotografia Censo
  const [maxCenso] = await pgQuery<{ ano_censo: number | null }>(`
    SELECT MAX(ano_censo) AS ano_censo FROM public.dim_escola_inep
    WHERE sg_uf = 'AC' AND ano_censo IS NOT NULL
  `);
  const anoCenso = maxCenso?.ano_censo ?? null;
  console.log(`  Últ. Censo   : ${anoCenso ?? "—"}`);

  if (!anoCenso) {
    console.log("  ⚠ Censo vazio — mart não pode ser calculado ainda.");
    console.log("    Rode `npm run inep-censo-geo:ingest`");
    await registrarAuditoria("PARCIAL", "Censo vazio", 0, Date.now() - inicio);
    return;
  }

  // Existe alguma carga SICONFI?
  const [siconfiCheck] = await pgQuery<{ n: string }>(`
    SELECT COUNT(*)::text AS n FROM mart.siope_risco_educacao_basico
    WHERE LEFT(id_ente, 2) = '12'
  `).catch(() => [{ n: "0" }]);
  const temSiconfi = parseInt(siconfiCheck?.n ?? "0", 10) > 0;
  console.log(`  SICONFI      : ${temSiconfi ? `${siconfiCheck.n} linhas` : "vazio"}`);

  if (!temSiconfi) {
    console.log("  ⚠ SICONFI vazio. Rode siope-rreo-anexo8-incremental-postgres.ts antes.");
    await registrarAuditoria("PARCIAL", "SICONFI vazio", 0, Date.now() - inicio);
    return;
  }

  // Foco: 2 últimos exercícios (atual + anterior)
  const anoAtual = new Date().getFullYear();
  const anoAnterior = anoAtual - 1;
  console.log(`  Exercícios TCE: ${anoAnterior}, ${anoAtual}`);

  await withPgTransaction(async (client) => {
    await client.query(`TRUNCATE mart.gasto_aluno_municipio`);

    // Para cada exercício foco (anoAnterior e anoAtual), insere:
    //  (a) uma linha por município (esfera 'M'): SICONFI municipal + matrículas da rede municipal (Censo) + TCE empenho municipal
    //  (b) uma linha do estado AC      (esfera 'E'): SICONFI estado (id_ente='12') + matrículas da rede estadual (Censo) + TCE empenho estadual
    for (const anoFoco of [anoAnterior, anoAtual]) {
      // (a) Municípios — matrículas da rede MUNICIPAL
      await client.query(`
        INSERT INTO mart.gasto_aluno_municipio (
          cod_municipio, no_municipio, sg_uf, esfera,
          an_exercicio, nr_periodo,
          total_mde, total_despesa_educacao,
          ano_censo, total_matriculas_bas,
          gasto_aluno_mde, gasto_aluno_educacao,
          ano_referencia_tce,
          atualizado_em
        )
        SELECT
          m.cod_municipio, d.no_municipio, 'AC', 'M',
          $2, s.nr_periodo,
          s.total_mde, s.total_despesa_educacao,
          $1, m.total_matriculas,
          CASE WHEN m.total_matriculas > 0 AND s.total_mde IS NOT NULL AND s.total_mde > 0
               THEN s.total_mde / m.total_matriculas END,
          CASE WHEN m.total_matriculas > 0 AND s.total_despesa_educacao IS NOT NULL AND s.total_despesa_educacao > 0
               THEN s.total_despesa_educacao / m.total_matriculas END,
          $2,
          now()
        FROM (
          SELECT cod_municipio, SUM(qt_mat_bas) AS total_matriculas
          FROM public.dim_escola_inep
          WHERE sg_uf = 'AC' AND ano_censo = $1
            AND dependencia = 'Municipal'
            AND qt_mat_bas IS NOT NULL
          GROUP BY cod_municipio
        ) m
        LEFT JOIN LATERAL (
          SELECT MAX(no_municipio) AS no_municipio
          FROM public.dim_escola_inep WHERE cod_municipio = m.cod_municipio
        ) d ON true
        LEFT JOIN LATERAL (
          SELECT s2.nr_periodo, s2.total_mde, s2.total_despesa_educacao
          FROM mart.siope_risco_educacao_basico s2
          WHERE s2.id_ente = m.cod_municipio::text
            AND s2.an_exercicio = $2
            AND (s2.total_mde IS NOT NULL OR s2.total_despesa_educacao IS NOT NULL)
          ORDER BY s2.nr_periodo DESC
          LIMIT 1
        ) s ON true
      `, [anoCenso, anoFoco]);

      // (b) Estado AC — matrículas da rede ESTADUAL
      await client.query(`
        INSERT INTO mart.gasto_aluno_municipio (
          cod_municipio, no_municipio, sg_uf, esfera,
          an_exercicio, nr_periodo,
          total_mde, total_despesa_educacao,
          ano_censo, total_matriculas_bas,
          gasto_aluno_mde, gasto_aluno_educacao,
          ano_referencia_tce,
          atualizado_em
        )
        SELECT
          12, 'Estado do Acre', 'AC', 'E',
          $2, s.nr_periodo,
          s.total_mde, s.total_despesa_educacao,
          $1, m.total_matriculas,
          CASE WHEN m.total_matriculas > 0 AND s.total_mde IS NOT NULL AND s.total_mde > 0
               THEN s.total_mde / m.total_matriculas END,
          CASE WHEN m.total_matriculas > 0 AND s.total_despesa_educacao IS NOT NULL AND s.total_despesa_educacao > 0
               THEN s.total_despesa_educacao / m.total_matriculas END,
          $2,
          now()
        FROM (
          SELECT SUM(qt_mat_bas) AS total_matriculas
          FROM public.dim_escola_inep
          WHERE sg_uf = 'AC' AND ano_censo = $1
            AND dependencia = 'Estadual'
            AND qt_mat_bas IS NOT NULL
        ) m
        LEFT JOIN LATERAL (
          SELECT s2.nr_periodo, s2.total_mde, s2.total_despesa_educacao
          FROM mart.siope_risco_educacao_basico s2
          WHERE s2.id_ente = '12'
            AND s2.an_exercicio = $2
            AND (s2.total_mde IS NOT NULL OR s2.total_despesa_educacao IS NOT NULL)
          ORDER BY s2.nr_periodo DESC
          LIMIT 1
        ) s ON true
      `, [anoCenso, anoFoco]);
    }

    // UPDATE com "Custo Total com Educação" do TCE (fato_empenho função 12),
    // por (município/estado, ano). Compara sempre no mesmo exercício do SICONFI.
    // Inclui municípios (cod_ibge 13..807) e o Estado AC (cod_ibge = 12).
    await client.query(`
      WITH despesa_tce AS (
        SELECT
          de.cod_municipio,
          emp.ano_empenho                                            AS ano_ref,
          SUM(emp.valor_liquidado)                                   AS despesa_educacao_total
        FROM public.fato_empenho emp
        JOIN public.dim_entidade dim_e ON dim_e.id_entidade = emp.id_entidade
        JOIN public.dim_ente     de    ON de.id_ente        = dim_e.id_ente
        WHERE emp.numero_funcao = 12
          AND emp.ano_empenho IN ($1, $2)
          AND emp.valor_liquidado IS NOT NULL
          AND (de.cod_ibge = 12 OR de.cod_ibge BETWEEN 13 AND 807)
        GROUP BY de.cod_municipio, emp.ano_empenho
      )
      UPDATE mart.gasto_aluno_municipio g
      SET
        total_despesa_educacao_tce = d.despesa_educacao_total,
        gasto_aluno_educacao_tce   = CASE
          WHEN g.total_matriculas_bas IS NOT NULL AND g.total_matriculas_bas > 0
            AND d.despesa_educacao_total IS NOT NULL AND d.despesa_educacao_total > 0
          THEN d.despesa_educacao_total / g.total_matriculas_bas
        END,
        ano_referencia_tce         = d.ano_ref,
        atualizado_em              = now()
      FROM despesa_tce d
      WHERE g.cod_municipio::text = d.cod_municipio
        AND d.ano_ref = g.an_exercicio;
    `, [anoAnterior, anoAtual]);
  });

  const [linhas]   = await pgQuery<{ n: string }>(`SELECT COUNT(*)::text AS n FROM mart.gasto_aluno_municipio`);
  const [linhasPorAno] = await pgQuery<{ n: string }>(
    `SELECT string_agg(an_exercicio || ':' || c, ', ' ORDER BY an_exercicio) AS n
     FROM (SELECT an_exercicio, COUNT(*)::text AS c FROM mart.gasto_aluno_municipio GROUP BY an_exercicio) t`,
  );
  const [comGastoSiconfi] = await pgQuery<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM mart.gasto_aluno_municipio WHERE gasto_aluno_mde IS NOT NULL`,
  );
  const [comGastoTce] = await pgQuery<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM mart.gasto_aluno_municipio WHERE gasto_aluno_educacao_tce IS NOT NULL`,
  );
  console.log(`  ✓ mart.gasto_aluno_municipio: ${linhas?.n ?? 0} linhas (${linhasPorAno?.n ?? "—"})`);
  console.log(`     com gasto MDE/aluno SICONFI : ${comGastoSiconfi?.n ?? 0}`);
  console.log(`     com gasto Educ/aluno TCE    : ${comGastoTce?.n ?? 0}`);

  await registrarAuditoria(
    parseInt(comGastoTce?.n ?? "0", 10) > 0 ? "OK" : "PARCIAL",
    `${linhas?.n ?? 0} linhas (${linhasPorAno?.n ?? "—"}) · SICONFI=${comGastoSiconfi?.n ?? 0} · TCE=${comGastoTce?.n ?? 0} · Censo ${anoCenso} · TCE ${anoAnterior}-${anoAtual}`,
    parseInt(comGastoTce?.n ?? "0", 10),
    Date.now() - inicio,
  );
}

async function registrarAuditoria(status: string, mensagem: string, registros: number, duracaoMs: number) {
  try {
    await pgQuery(
      `INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
       VALUES ('mart_gasto_aluno', $1, $2, $3, $4)`,
      [status, mensagem, registros, duracaoMs],
    );
  } catch { /* audit.etl_log pode não existir */ }
}

if (require.main === module) {
  executar()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[mart-gasto-aluno] Erro fatal:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}

export { executar as executarRefreshMartGastoAluno };
