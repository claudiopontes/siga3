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

    // Insere a base SICONFI + Censo (como já fazíamos)
    await client.query(`
      INSERT INTO mart.gasto_aluno_municipio (
        cod_municipio, no_municipio, sg_uf,
        an_exercicio, nr_periodo,
        total_mde, total_despesa_educacao,
        ano_censo, total_matriculas_bas,
        gasto_aluno_mde, gasto_aluno_educacao,
        ano_referencia_tce,
        atualizado_em
      )
      SELECT
        m.cod_municipio, d.no_municipio, 'AC',
        s.an_exercicio, s.nr_periodo,
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
        WHERE sg_uf = 'AC' AND ano_censo = $1 AND qt_mat_bas IS NOT NULL
        GROUP BY cod_municipio
      ) m
      LEFT JOIN LATERAL (
        SELECT MAX(no_municipio) AS no_municipio
        FROM public.dim_escola_inep WHERE cod_municipio = m.cod_municipio
      ) d ON true
      LEFT JOIN LATERAL (
        SELECT s2.an_exercicio, s2.nr_periodo, s2.total_mde, s2.total_despesa_educacao
        FROM mart.siope_risco_educacao_basico s2
        WHERE s2.id_ente = m.cod_municipio::text
          AND (s2.total_mde IS NOT NULL OR s2.total_despesa_educacao IS NOT NULL)
        ORDER BY s2.an_exercicio DESC, s2.nr_periodo DESC
        LIMIT 1
      ) s ON true
    `, [anoCenso, anoAtual]);

    // UPDATE com valores calculados pelo TCE-AC (despesa via fato_empenho + receita base MDE)
    // O JOIN é: fato_empenho.id_entidade → dim_entidade.id_ente → dim_ente.cod_municipio
    await client.query(`
      WITH despesa_tce AS (
        SELECT
          de.cod_municipio,
          -- Despesa em educação total (função 12)
          SUM(emp.valor_liquidado)                                  AS despesa_educacao_total,
          -- Despesa MDE (função 12 excluindo sub-funções fora do MDE)
          SUM(emp.valor_liquidado) FILTER (
            WHERE emp.numero_subfuncao NOT IN (122, 367, 392)
          )                                                          AS despesa_mde
        FROM public.fato_empenho emp
        JOIN public.dim_entidade dim_e ON dim_e.id_entidade = emp.id_entidade
        JOIN public.dim_ente     de    ON de.id_ente        = dim_e.id_ente
        WHERE emp.numero_funcao = 12
          AND emp.ano_empenho IN ($1, $2)
          AND emp.valor_liquidado IS NOT NULL
          AND de.cod_ibge BETWEEN 13 AND 807   -- somente municípios do AC (cod_ibge 7 sem prefixo 12)
        GROUP BY de.cod_municipio
      ),
      receita_tce AS (
        SELECT
          de.cod_municipio,
          SUM(r.receita_realizada) FILTER (
            WHERE r.natureza_codigo LIKE '11%'         -- impostos próprios
               OR r.natureza_codigo LIKE '172%'        -- cota-parte estaduais (ICMS, IPVA, IPI-Exp)
               OR (r.natureza_codigo LIKE '171%'       -- cota-parte federais (FPM, FPE, IPI-Exp, ITR)
                   AND r.natureza_codigo NOT LIKE '1713%')  -- exclui transferências saúde
          )                                                       AS receita_base_mde
        FROM public.receita_publica_categoria_mensal r
        JOIN public.dim_entidade dim_e ON dim_e.id_entidade = r.id_entidade
        JOIN public.dim_ente     de    ON de.id_ente        = dim_e.id_ente
        WHERE r.ano IN ($1, $2)
          AND r.receita_realizada IS NOT NULL
          AND de.cod_ibge BETWEEN 13 AND 807
        GROUP BY de.cod_municipio
      )
      UPDATE mart.gasto_aluno_municipio g
      SET
        total_despesa_educacao_tce = d.despesa_educacao_total,
        total_mde_tce              = d.despesa_mde,
        receita_base_mde_tce       = r.receita_base_mde,
        pct_aplicado_mde_tce       = CASE
          WHEN r.receita_base_mde IS NOT NULL AND r.receita_base_mde > 0 AND d.despesa_mde IS NOT NULL
          THEN (d.despesa_mde / r.receita_base_mde) * 100
        END,
        gasto_aluno_mde_tce        = CASE
          WHEN g.total_matriculas_bas IS NOT NULL AND g.total_matriculas_bas > 0
            AND d.despesa_mde IS NOT NULL AND d.despesa_mde > 0
          THEN d.despesa_mde / g.total_matriculas_bas
        END,
        ano_referencia_tce         = $2,
        atualizado_em              = now()
      FROM despesa_tce d
      LEFT JOIN receita_tce r ON r.cod_municipio = d.cod_municipio
      WHERE g.cod_municipio::text = d.cod_municipio;
    `, [anoAnterior, anoAtual]);

    // Calcular divergência SICONFI × TCE (em pontos percentuais)
    // Aproxima o pct SICONFI usando total_mde / total_despesa_educacao
    // (se ambos disponíveis); a métrica exata vem direto da fórmula constitucional,
    // mas como o SICONFI já reporta % aplicado, podemos só comparar valores absolutos.
    await client.query(`
      UPDATE mart.gasto_aluno_municipio
      SET divergencia_mde_pct = CASE
        WHEN total_mde IS NOT NULL AND total_mde > 0 AND total_mde_tce IS NOT NULL
        THEN ((total_mde_tce - total_mde) / total_mde) * 100
      END
      WHERE sg_uf = 'AC'
    `);
  });

  const [linhas]   = await pgQuery<{ n: string }>(`SELECT COUNT(*)::text AS n FROM mart.gasto_aluno_municipio`);
  const [comGastoSiconfi] = await pgQuery<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM mart.gasto_aluno_municipio WHERE gasto_aluno_mde IS NOT NULL`,
  );
  const [comGastoTce] = await pgQuery<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM mart.gasto_aluno_municipio WHERE gasto_aluno_mde_tce IS NOT NULL`,
  );
  const [comPctTce] = await pgQuery<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM mart.gasto_aluno_municipio WHERE pct_aplicado_mde_tce IS NOT NULL`,
  );
  console.log(`  ✓ mart.gasto_aluno_municipio: ${linhas?.n ?? 0} municípios`);
  console.log(`     com gasto MDE/aluno SICONFI: ${comGastoSiconfi?.n ?? 0}`);
  console.log(`     com gasto MDE/aluno TCE    : ${comGastoTce?.n ?? 0}`);
  console.log(`     com % MDE TCE              : ${comPctTce?.n ?? 0}`);

  await registrarAuditoria(
    parseInt(comGastoTce?.n ?? "0", 10) > 0 ? "OK" : "PARCIAL",
    `${linhas?.n ?? 0} municípios · SICONFI=${comGastoSiconfi?.n ?? 0} · TCE=${comGastoTce?.n ?? 0} · Censo ${anoCenso} · TCE ${anoAnterior}-${anoAtual}`,
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
