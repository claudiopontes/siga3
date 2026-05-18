/**
 * siconfi-rgf-inspecionar-contas.ts
 *
 * Script de inspeção somente-leitura para mapear os dados disponíveis
 * necessários a um futuro alerta rgf_despesa_pessoal (LRF Art. 19-20).
 *
 * Investiga:
 *   1. Disponibilidade nas tabelas raw/dw/mart do RGF
 *   2. Dados de entrega via extrato_entregas
 *   3. Dados RREO disponíveis: RCL (Anexo 03) e Despesa com Pessoal (Anexo 01)
 *   4. Campos críticos ausentes no DW (instituicao, cod_conta) via raw
 *   5. Cobertura por município (22 do Acre)
 *   6. Recomendação técnica sobre viabilidade do alerta
 *
 * NÃO altera nenhuma tabela. NÃO cria alertas. Apenas consulta e imprime.
 *
 * Uso: cd etl && npm run siconfi-rgf:inspecionar-contas
 */

import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sep(titulo: string) {
  const linha = "═".repeat(70);
  console.log(`\n${linha}`);
  console.log(`  ${titulo}`);
  console.log(linha);
}

function sub(titulo: string) {
  console.log(`\n── ${titulo} ──`);
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "null";
  return n.toLocaleString("pt-BR");
}

function pct(num: number, den: number): string {
  if (den === 0) return "—";
  return `${((num / den) * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=================================================================");
  console.log("  INSPEÇÃO: Dados para alerta rgf_despesa_pessoal (LRF Art. 19)");
  console.log("=================================================================");
  console.log(`  Executado em: ${new Date().toLocaleString("pt-BR")}`);
  console.log("  Modo: somente-leitura — nenhuma tabela é alterada");

  // =========================================================================
  // 1. STATUS DAS TABELAS RGF
  // =========================================================================
  sep("1. STATUS DAS TABELAS RGF");

  const contagens = await pgQuery<{ tabela: string; linhas: number }>(`
    SELECT 'raw.siconfi_rgf_raw'                AS tabela, COUNT(*)::int AS linhas FROM raw.siconfi_rgf_raw
    UNION ALL
    SELECT 'dw.fato_siconfi_rgf',               COUNT(*)::int FROM dw.fato_siconfi_rgf
    UNION ALL
    SELECT 'dw.fato_siconfi_extrato_entregas (RGF)',
      COUNT(*)::int FROM dw.fato_siconfi_extrato_entregas WHERE co_entregavel = 'RGF'
    UNION ALL
    SELECT 'mart.siconfi_rgf_resumo_municipio',  COUNT(*)::int FROM mart.siconfi_rgf_resumo_municipio
    UNION ALL
    SELECT 'mart.siconfi_rgf_alertas',           COUNT(*)::int FROM mart.siconfi_rgf_alertas
  `);

  for (const r of contagens) {
    const status = r.linhas === 0 ? "⚠ VAZIO" : `✓ ${fmt(r.linhas)} linhas`;
    console.log(`  ${r.tabela.padEnd(48)} ${status}`);
  }

  // Nota sobre raw/dw vazio
  console.log("\n  NOTA: raw.siconfi_rgf_raw e dw.fato_siconfi_rgf estão vazios porque");
  console.log("  o endpoint /rgf do DataLake retorna HTTP 200 com 0 itens.");
  console.log("  A fonte utilizada é /extrato_entregas (co_entregavel='RGF').");

  // =========================================================================
  // 2. ENTREGAS RGF POR PERÍODO
  // =========================================================================
  sep("2. ENTREGAS RGF POR PERÍODO (extrato_entregas)");

  const periodos = await pgQuery<{
    exercicio: number;
    periodo: number;
    total: number;
    com_entrega: number;
    status_ho: number;
    status_re: number;
  }>(`
    SELECT
      exercicio,
      periodo,
      COUNT(DISTINCT id_ente)::int                                          AS total,
      COUNT(DISTINCT id_ente) FILTER (WHERE status_relatorio IN ('HO','RE'))::int AS com_entrega,
      COUNT(*) FILTER (WHERE status_relatorio = 'HO')::int                  AS status_ho,
      COUNT(*) FILTER (WHERE status_relatorio = 'RE')::int                  AS status_re
    FROM dw.fato_siconfi_extrato_entregas
    WHERE co_entregavel = 'RGF'
    GROUP BY exercicio, periodo
    ORDER BY exercicio DESC, periodo DESC
  `);

  console.log(`  ${"Ano/Per".padEnd(10)} ${"Entes".padEnd(8)} ${"Com entrega".padEnd(14)} ${"HO".padEnd(6)} ${"RE".padEnd(6)}`);
  console.log(`  ${"-".repeat(50)}`);
  for (const p of periodos) {
    console.log(
      `  ${`${p.exercicio}/${p.periodo}`.padEnd(10)}` +
      `  ${String(p.total).padEnd(6)}` +
      `  ${String(p.com_entrega).padEnd(12)}` +
      `  ${String(p.status_ho).padEnd(4)}` +
      `  ${String(p.status_re).padEnd(4)}`
    );
  }

  // =========================================================================
  // 3. RESUMO MART MAIS RECENTE
  // =========================================================================
  sep("3. RESUMO MART — PERÍODO MAIS RECENTE");

  const home = await pgQuery<{
    an_exercicio: number; nr_periodo: number;
    municipios_com_dado: number; municipios_sem_dado: number;
    total_municipios: number; total_alertas: number;
    alertas_criticos: number; alertas_altos: number;
  }>(`SELECT * FROM mart.siconfi_rgf_resumo_home ORDER BY an_exercicio DESC, nr_periodo DESC LIMIT 1`);

  if (home.length > 0) {
    const h = home[0];
    console.log(`  Período: ${h.an_exercicio}/${h.nr_periodo}`);
    console.log(`  Com dado: ${h.municipios_com_dado}/${h.total_municipios} municípios`);
    console.log(`  Sem dado: ${h.municipios_sem_dado}`);
    console.log(`  Alertas críticos: ${h.alertas_criticos}`);
  }

  // =========================================================================
  // 4. DISPONIBILIDADE RREO
  // =========================================================================
  sep("4. DISPONIBILIDADE RREO (fonte para cálculo LRF)");

  const rreoTotal = await pgQuery<{ total: number; municipios: number; periodos: number }>(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(DISTINCT id_municipio)::int AS municipios,
      COUNT(DISTINCT (an_exercicio, nr_periodo))::int AS periodos
    FROM dw.fato_siconfi_rreo
  `);
  console.log(`  Total de linhas RREO: ${fmt(rreoTotal[0]?.total)}`);
  console.log(`  Municípios distintos: ${rreoTotal[0]?.municipios}`);
  console.log(`  Períodos distintos: ${rreoTotal[0]?.periodos}`);

  const anexos = await pgQuery<{ no_anexo: string; linhas: number; municipios: number }>(`
    SELECT
      no_anexo,
      COUNT(*)::int AS linhas,
      COUNT(DISTINCT id_municipio)::int AS municipios
    FROM dw.fato_siconfi_rreo
    GROUP BY no_anexo
    ORDER BY linhas DESC
  `);

  sub("Anexos disponíveis no DW");
  for (const a of anexos) {
    console.log(`    ${a.no_anexo.padEnd(30)} ${fmt(a.linhas).padStart(10)} linhas  |  ${a.municipios} municípios`);
  }

  // =========================================================================
  // 5. RCL — ANEXO 03
  // =========================================================================
  sep("5. RCL — RREO-Anexo 03 (denominador do limite LRF)");

  const rclContas = await pgQuery<{ conta: string; colunas: string; municipios: number; periodos: number }>(`
    SELECT
      conta,
      string_agg(DISTINCT coluna, ' | ' ORDER BY coluna) AS colunas,
      COUNT(DISTINCT id_municipio)::int AS municipios,
      COUNT(DISTINCT (an_exercicio, nr_periodo))::int AS periodos
    FROM dw.fato_siconfi_rreo
    WHERE no_anexo = 'RREO-Anexo 03'
      AND conta ILIKE '%RECEITA CORRENTE L%QUIDA%'
    GROUP BY conta
    ORDER BY municipios DESC
    LIMIT 10
  `);

  if (rclContas.length === 0) {
    console.log("  ⚠ Nenhuma conta encontrada com 'RECEITA CORRENTE LÍQUIDA' no Anexo 03");
  } else {
    console.log("  Contas candidatas (RCL):");
    for (const c of rclContas) {
      console.log(`\n  CONTA: ${c.conta}`);
      console.log(`  Municípios: ${c.municipios}  |  Períodos: ${c.periodos}`);
      const cols = c.colunas.split(" | ");
      console.log(`  Colunas (${cols.length}): ${cols.slice(0, 4).join(" · ")}${cols.length > 4 ? ` ... +${cols.length - 4}` : ""}`);
    }
  }

  // Exemplo de valor — Rio Branco, período mais recente
  sub("Exemplo de valor RCL — Rio Branco, período mais recente");
  const rclExemplo = await pgQuery<{ an_exercicio: number; nr_periodo: number; conta: string; coluna: string; valor: number }>(`
    SELECT r.an_exercicio, r.nr_periodo, r.conta, r.coluna, r.valor
    FROM dw.fato_siconfi_rreo r
    WHERE r.no_anexo = 'RREO-Anexo 03'
      AND r.conta ILIKE '%RECEITA CORRENTE L%QUIDA AJUSTADA%IX%'
      AND r.coluna ILIKE '%TOTAL%12 MESES%'
      AND r.id_municipio = 1200401  -- Rio Branco
    ORDER BY r.an_exercicio DESC, r.nr_periodo DESC
    LIMIT 3
  `);

  if (rclExemplo.length > 0) {
    for (const e of rclExemplo) {
      console.log(`  ${e.an_exercicio}/${e.nr_periodo}  |  ${e.coluna}  |  R$ ${fmt(e.valor)}`);
    }
  } else {
    console.log("  (sem dados para a conta ajustada — tentando conta básica)");
    const rclAlt = await pgQuery<{ an_exercicio: number; nr_periodo: number; conta: string; coluna: string; valor: number }>(`
      SELECT r.an_exercicio, r.nr_periodo, r.conta, r.coluna, r.valor
      FROM dw.fato_siconfi_rreo r
      WHERE r.no_anexo = 'RREO-Anexo 03'
        AND r.conta ILIKE '%RECEITA CORRENTE L%QUIDA%'
        AND r.coluna ILIKE '%TOTAL%12 MESES%'
        AND r.id_municipio = 1200401
      ORDER BY r.an_exercicio DESC, r.nr_periodo DESC
      LIMIT 5
    `);
    for (const e of rclAlt) {
      console.log(`  ${e.an_exercicio}/${e.nr_periodo}  |  ${e.conta.substring(0, 60)}...`);
      console.log(`    ${e.coluna}  |  R$ ${fmt(e.valor)}`);
    }
  }

  // =========================================================================
  // 6. DESPESA COM PESSOAL — ANEXO 01
  // =========================================================================
  sep("6. DESPESA COM PESSOAL — RREO-Anexo 01");

  const pessoalContas = await pgQuery<{ conta: string; colunas: string; municipios: number; linhas: number }>(`
    SELECT
      conta,
      string_agg(DISTINCT coluna, ' | ' ORDER BY coluna) AS colunas,
      COUNT(DISTINCT id_municipio)::int AS municipios,
      COUNT(*)::int AS linhas
    FROM dw.fato_siconfi_rreo
    WHERE no_anexo = 'RREO-Anexo 01'
      AND conta ILIKE '%PESSOAL%ENCARGOS%'
    GROUP BY conta
    ORDER BY municipios DESC
    LIMIT 10
  `);

  if (pessoalContas.length === 0) {
    console.log("  ⚠ Nenhuma conta encontrada com 'PESSOAL E ENCARGOS' no Anexo 01");
  } else {
    console.log("  Contas candidatas (Pessoal):");
    for (const c of pessoalContas) {
      console.log(`\n  CONTA: ${c.conta}`);
      console.log(`  Municípios: ${c.municipios}  |  Linhas: ${fmt(c.linhas)}`);
      const cols = c.colunas.split(" | ");
      console.log(`  Colunas: ${cols.slice(0, 5).join(" · ")}${cols.length > 5 ? ` ... +${cols.length - 5}` : ""}`);
    }
  }

  // Exemplo — Rio Branco, período mais recente
  sub("Exemplo — Rio Branco, período mais recente");
  const pessoalExemplo = await pgQuery<{ an_exercicio: number; nr_periodo: number; conta: string; coluna: string; valor: number; linhas: number }>(`
    SELECT an_exercicio, nr_periodo, conta, coluna, SUM(valor) AS valor, COUNT(*)::int AS linhas
    FROM dw.fato_siconfi_rreo
    WHERE no_anexo = 'RREO-Anexo 01'
      AND conta ILIKE '%PESSOAL%ENCARGOS%'
      AND coluna ILIKE '%LIQUIDADAS%BIMESTRE%'
      AND id_municipio = 1200401
    GROUP BY an_exercicio, nr_periodo, conta, coluna
    ORDER BY an_exercicio DESC, nr_periodo DESC
    LIMIT 3
  `);

  if (pessoalExemplo.length > 0) {
    for (const e of pessoalExemplo) {
      console.log(`  ${e.an_exercicio}/${e.nr_periodo}  |  ${e.coluna}  |  R$ ${fmt(e.valor)}`);
      if (e.linhas > 1) {
        console.log(`  ⚠  ${e.linhas} linhas somadas — pode incluir Executivo + Legislativo combinados`);
      }
    }
  }

  // Verificar se há duplicidade no período mais recente
  sub("Duplicidade Executivo/Legislativo no DW (problema crítico)");
  const duplicidade = await pgQuery<{ an_exercicio: number; nr_periodo: number; id_municipio: number; no_municipio: string; cnt: number }>(`
    SELECT an_exercicio, nr_periodo, id_municipio, no_municipio, COUNT(*)::int AS cnt
    FROM dw.fato_siconfi_rreo
    WHERE no_anexo = 'RREO-Anexo 01'
      AND conta ILIKE '%PESSOAL%ENCARGOS%'
      AND coluna ILIKE '%LIQUIDADAS%BIMESTRE%'
    GROUP BY an_exercicio, nr_periodo, id_municipio, no_municipio
    HAVING COUNT(*) > 1
    ORDER BY an_exercicio DESC, nr_periodo DESC, no_municipio
    LIMIT 10
  `);

  if (duplicidade.length > 0) {
    console.log(`  ⚠ CONFIRMADO: há municípios com MÚLTIPLAS linhas para a mesma conta/coluna no DW`);
    console.log(`  (provavelmente uma linha por poder: Prefeitura + Câmara)`);
    console.log();
    for (const d of duplicidade.slice(0, 5)) {
      console.log(`    ${d.an_exercicio}/${d.nr_periodo}  ${d.no_municipio?.padEnd(25)}  ${d.cnt} linhas`);
    }
    if (duplicidade.length > 5) console.log(`    ... e mais ${duplicidade.length - 5}`);
  } else {
    console.log("  Não foi detectada duplicidade — verificar se a separação por poder existe");
  }

  // =========================================================================
  // 7. CAMPOS AUSENTES NO DW — INVESTIGAÇÃO VIA RAW
  // =========================================================================
  sep("7. CAMPOS AUSENTES NO DW — INVESTIGAÇÃO VIA raw.siconfi_rreo_raw");

  const rawCount = await pgQuery<{ total: number }>(`SELECT COUNT(*)::int AS total FROM raw.siconfi_rreo_raw`);
  console.log(`  Total de payloads em raw.siconfi_rreo_raw: ${fmt(rawCount[0]?.total)}`);

  if ((rawCount[0]?.total ?? 0) > 0) {
    // Verificar campos do payload JSON
    const campos = await pgQuery<{ campo: string; presente: number }>(`
      SELECT
        unnest(ARRAY['instituicao','cod_conta','esfera','rotulo','uf']) AS campo,
        COUNT(*)::int AS presente
      FROM raw.siconfi_rreo_raw r
      WHERE (r.payload -> 'items' -> 0) IS NOT NULL
        AND (r.payload -> 'items' -> 0) ? unnest(ARRAY['instituicao','cod_conta','esfera','rotulo','uf'])
      LIMIT 1
    `).catch(() => [] as { campo: string; presente: number }[]);

    if (campos.length === 0) {
      // Fallback: inspecionar um payload diretamente
      const amostra = await pgQuery<{ campos: string }>(`
        SELECT jsonb_object_keys(payload -> 'items' -> 0) AS campos
        FROM raw.siconfi_rreo_raw
        WHERE (payload -> 'items' -> 0) IS NOT NULL
        LIMIT 1
      `).catch(() => [] as { campos: string }[]);

      if (amostra.length > 0) {
        const todosOsCampos = amostra.map((r) => r.campos);
        console.log(`  Campos do payload raw (item[0]): ${todosOsCampos.join(", ")}`);

        const temInstituicao = todosOsCampos.includes("instituicao");
        const temCodConta    = todosOsCampos.includes("cod_conta");
        console.log(`\n  instituicao em raw: ${temInstituicao ? "✓ PRESENTE" : "⚠ AUSENTE"}`);
        console.log(`  cod_conta em raw:   ${temCodConta    ? "✓ PRESENTE" : "⚠ AUSENTE"}`);
      }
    } else {
      for (const c of campos) {
        console.log(`  ${c.campo.padEnd(15)}: ${c.presente > 0 ? "✓ PRESENTE no raw" : "⚠ AUSENTE no raw"}`);
      }
    }

    // Exemplo de instituicao a partir do raw
    sub("Exemplo: campo 'instituicao' no raw (Rio Branco, Pessoal)");
    const rawExemplo = await pgQuery<{ instituicao: string; cod_conta: string; conta: string; valor: string }>(`
      SELECT DISTINCT
        item ->> 'instituicao'  AS instituicao,
        item ->> 'cod_conta'    AS cod_conta,
        item ->> 'conta'        AS conta,
        item ->> 'valor'        AS valor
      FROM raw.siconfi_rreo_raw r,
           jsonb_array_elements(r.payload -> 'items') AS item
      WHERE r.id_municipio = 1200401
        AND (item ->> 'anexo') = 'RREO-Anexo 01'
        AND (item ->> 'conta') ILIKE '%PESSOAL%ENCARGOS%'
        AND (item ->> 'coluna') ILIKE '%LIQUIDADAS%BIMESTRE%'
        AND r.an_exercicio = (SELECT MAX(an_exercicio) FROM raw.siconfi_rreo_raw WHERE id_municipio = 1200401)
      LIMIT 10
    `).catch(() => [] as { instituicao: string; cod_conta: string; conta: string; valor: string }[]);

    if (rawExemplo.length > 0) {
      console.log("  Linhas encontradas no raw:");
      for (const e of rawExemplo) {
        console.log(`    instituicao: ${e.instituicao ?? "(nulo)"}`);
        console.log(`    cod_conta:   ${e.cod_conta ?? "(nulo)"}`);
        console.log(`    valor:       ${e.valor}`);
        console.log();
      }
    } else {
      console.log("  (sem itens Pessoal no raw para Rio Branco no período mais recente)");
      // Tentar sem filtro de exercício
      const rawExemplo2 = await pgQuery<{ instituicao: string; cod_conta: string; valor: string; exercicio: string; periodo: string }>(`
        SELECT DISTINCT
          item ->> 'instituicao'  AS instituicao,
          item ->> 'cod_conta'    AS cod_conta,
          item ->> 'valor'        AS valor,
          item ->> 'exercicio'    AS exercicio,
          item ->> 'periodo'      AS periodo
        FROM raw.siconfi_rreo_raw r,
             jsonb_array_elements(r.payload -> 'items') AS item
        WHERE r.id_municipio = 1200401
          AND (item ->> 'anexo') = 'RREO-Anexo 01'
          AND (item ->> 'conta') ILIKE '%PESSOAL%ENCARGOS%'
          AND (item ->> 'coluna') ILIKE '%LIQUIDADAS%BIMESTRE%'
        LIMIT 10
      `).catch(() => [] as { instituicao: string; cod_conta: string; valor: string; exercicio: string; periodo: string }[]);

      if (rawExemplo2.length > 0) {
        for (const e of rawExemplo2) {
          console.log(`    ${e.exercicio}/${e.periodo}  |  instituicao: ${e.instituicao ?? "(nulo)"}  |  R$ ${e.valor}`);
        }
      } else {
        console.log("  (sem dados raw para esse perfil — raw pode estar em formato diferente)");
      }
    }
  } else {
    console.log("  ⚠ raw.siconfi_rreo_raw está VAZIO — não é possível inspecionar payload raw");
    console.log("  Executar carga RREO primeiro: npm run carga-siconfi-rreo:postgres");
  }

  // =========================================================================
  // 8. COBERTURA RREO — 22 MUNICÍPIOS DO ACRE
  // =========================================================================
  sep("8. COBERTURA RREO — 22 MUNICÍPIOS DO ACRE");

  const cobertura = await pgQuery<{
    id_municipio: number; no_municipio: string;
    periodos_rcl: number; periodos_pessoal: number;
    ultimo_exercicio: number; ultimo_periodo: number;
  }>(`
    WITH rcl AS (
      SELECT id_municipio, COUNT(DISTINCT (an_exercicio, nr_periodo))::int AS periodos_rcl
      FROM dw.fato_siconfi_rreo
      WHERE no_anexo = 'RREO-Anexo 03'
        AND conta ILIKE '%RECEITA CORRENTE L%QUIDA%'
        AND coluna ILIKE '%TOTAL%12 MESES%'
      GROUP BY id_municipio
    ),
    pessoal AS (
      SELECT id_municipio, COUNT(DISTINCT (an_exercicio, nr_periodo))::int AS periodos_pessoal
      FROM dw.fato_siconfi_rreo
      WHERE no_anexo = 'RREO-Anexo 01'
        AND conta ILIKE '%PESSOAL%ENCARGOS%'
        AND coluna ILIKE '%LIQUIDADAS%BIMESTRE%'
      GROUP BY id_municipio
    ),
    ultimo AS (
      SELECT id_municipio, MAX(an_exercicio)::int AS ultimo_exercicio, MAX(nr_periodo)::int AS ultimo_periodo
      FROM dw.fato_siconfi_rreo
      GROUP BY id_municipio
    )
    SELECT
      u.id_municipio,
      u.no_municipio,
      COALESCE(r.periodos_rcl, 0)     AS periodos_rcl,
      COALESCE(p.periodos_pessoal, 0) AS periodos_pessoal,
      ul.ultimo_exercicio,
      ul.ultimo_periodo
    FROM (SELECT DISTINCT id_municipio, no_municipio FROM dw.fato_siconfi_rreo) u
    LEFT JOIN rcl r      ON r.id_municipio = u.id_municipio
    LEFT JOIN pessoal p  ON p.id_municipio = u.id_municipio
    LEFT JOIN ultimo ul  ON ul.id_municipio = u.id_municipio
    ORDER BY u.no_municipio
  `);

  if (cobertura.length === 0) {
    console.log("  ⚠ Nenhum município encontrado no RREO DW");
  } else {
    console.log(`  ${"Município".padEnd(28)} ${"RCL Pers".padEnd(10)} ${"Pessoal Pers".padEnd(14)} ${"Último Per"}`);
    console.log(`  ${"-".repeat(68)}`);
    let comRcl = 0, comPessoal = 0;
    for (const m of cobertura) {
      const rcl = m.periodos_rcl > 0 ? String(m.periodos_rcl) : "⚠ 0";
      const pes = m.periodos_pessoal > 0 ? String(m.periodos_pessoal) : "⚠ 0";
      console.log(
        `  ${(m.no_municipio ?? "?").padEnd(28)}` +
        `  ${rcl.padEnd(8)}` +
        `  ${pes.padEnd(12)}` +
        `  ${m.ultimo_exercicio}/${m.ultimo_periodo}`
      );
      if (m.periodos_rcl > 0) comRcl++;
      if (m.periodos_pessoal > 0) comPessoal++;
    }
    console.log(`\n  Com RCL (Anexo 03):     ${comRcl}/${cobertura.length} municípios`);
    console.log(`  Com Pessoal (Anexo 01): ${comPessoal}/${cobertura.length} municípios`);
  }

  // =========================================================================
  // 9. CAMPOS DISPONÍVEIS NO DW vs NECESSÁRIOS PARA O ALERTA
  // =========================================================================
  sep("9. MAPEAMENTO DE CAMPOS — DW vs NECESSÁRIOS PARA O ALERTA");

  console.log(`
  CAMPO                  | NECESSÁRIO PARA O ALERTA | DISPONÍVEL NO DW | SOLUÇÃO
  -----------------------|--------------------------|------------------|---------
  id_municipio           | Sim (chave)              | ✓ Sim            | —
  an_exercicio           | Sim                      | ✓ Sim            | —
  nr_periodo             | Sim                      | ✓ Sim            | —
  no_anexo               | Sim (filtrar Anexo)      | ✓ Sim            | —
  conta                  | Sim (filtrar conta)      | ✓ Sim            | —
  coluna                 | Sim (filtrar coluna)     | ✓ Sim            | —
  valor                  | Sim (calcular %)         | ✓ Sim            | —
  instituicao            | Sim (Exec vs Leg)        | ✗ AUSENTE        | → raw ou nova carga
  cod_conta              | Desejável (match exato)  | ✗ AUSENTE        | → raw ou nova carga
  esfera                 | Útil (municipal=M)       | ✗ AUSENTE        | → raw ou nova carga
  `);

  // =========================================================================
  // 10. RECOMENDAÇÃO TÉCNICA
  // =========================================================================
  sep("10. RECOMENDAÇÃO TÉCNICA");

  console.log(`
  PERGUNTA: É viável implementar o alerta rgf_despesa_pessoal (LRF Art. 19)?

  RESPOSTA: Parcialmente viável com ajuste na carga RREO.

  BLOQUEIOS ATUAIS:
    1. dw.fato_siconfi_rreo não armazena 'instituicao':
       - Sem esse campo não é possível separar Poder Executivo do Legislativo.
       - O Art. 19 da LRF estabelece limites por poder (Executivo: 54%, Legislativo: 6%).
       - Somar Executivo + Legislativo e comparar com o limite global (60%) é possível,
         mas não permite alertas granulares por poder.

    2. dw.fato_siconfi_rreo não armazena 'cod_conta':
       - O match textual por 'conta ILIKE' é funcional mas frágil.
       - 'cod_conta' permitiria correspondência exata e mais robusta.

  O QUE FUNCIONA AGORA (sem alterar schema):
    - Calcular Despesa Total com Pessoal (Exec + Leg) / RCL
    - Emitir alerta quando total > 60% (limite global Art. 19, §único)
    - Alerta simples sem distinção de poder

  O QUE REQUER AJUSTE NA CARGA:
    - Adicionar coluna 'instituicao' ao dw.fato_siconfi_rreo
    - Adicionar coluna 'cod_conta' ao dw.fato_siconfi_rreo
    - Re-executar carga RREO completa após a migração

  PRÓXIMOS PASSOS RECOMENDADOS:
    1. Decidir se o alerta inicial será: (a) limite global 60% ou (b) por poder
    2. Se (a): pode implementar agora usando SUM(valor) agrupado por mun/período
    3. Se (b): criar migração SQL para adicionar 'instituicao' e 'cod_conta' ao DW,
              re-executar: npm run carga-siconfi-rreo:postgres
    4. Implementar alerta em: etl/jobs/refresh-mart-siconfi-rreo.ts ou novo job
    5. Adicionar à API e ao painel RREO/RGF conforme necessário

  CONTAS MAPEADAS PARA USO FUTURO:
    RCL (denominador):
      Tabela: dw.fato_siconfi_rreo
      no_anexo: 'RREO-Anexo 03'
      conta:    ILIKE '%RECEITA CORRENTE L%QUIDA AJUSTADA%IX%'  (preferencial)
                ou ILIKE '%RECEITA CORRENTE L%QUIDA%'           (fallback)
      coluna:   ILIKE '%TOTAL%12 MESES%'

    Despesa com Pessoal (numerador):
      Tabela: dw.fato_siconfi_rreo
      no_anexo: 'RREO-Anexo 01'
      conta:    ILIKE '%PESSOAL%ENCARGOS%'
      coluna:   ILIKE '%LIQUIDADAS%BIMESTRE%'
      ATENÇÃO:  SUM() para obter total Exec+Leg (pode haver 2 linhas por mun/período)
  `);

  console.log("=================================================================");
  console.log("  FIM DA INSPEÇÃO");
  console.log("=================================================================\n");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main()
  .then(() => closePgPool())
  .catch((err) => {
    console.error("\n[ERRO]", (err as Error).message);
    closePgPool().catch(() => void 0);
    process.exit(1);
  });
