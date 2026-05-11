/**
 * refresh-mart-saude-consolidado.ts
 *
 * Reconstrói a camada consolidada do Painel da Saúde:
 *   - mart.saude_resumo_municipio  (SIOPS + CNES/UBS + SISAGUA por município)
 *   - mart.saude_alertas           (todos os alertas de SIOPS, CNES/UBS e SISAGUA)
 *   - mart.saude_alertas_home      (máx 30, CRITICO/ALTO)
 *   - mart.saude_resumo_home       (totais + score para o card da home)
 *
 * Fontes:
 *   mart.siops_resumo_municipio    — orçamento saúde
 *   mart.siops_alertas             — alertas SIOPS
 *   mart.siops_alertas_home        — alertas SIOPS home
 *   mart.siops_resumo_home         — resumo SIOPS
 *   mart.saude_estrutura_municipio — estrutura CNES/UBS
 *   mart.saude_estrutura_alertas   — alertas CNES/UBS
 *   mart.sisagua_resumo_municipio  — qualidade da água SISAGUA
 *   mart.sisagua_alertas           — alertas SISAGUA
 *
 * Score de risco por município:
 *   CRITICO = 5 pts · ALTO = 3 pts · MEDIO = 1 pt
 *   nivel_risco: CRITICO ≥10 · ALTO ≥5 · MEDIO ≥1 · BAIXO=0
 *
 * Uso: cd etl && npm run mart:saude-consolidado
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface SiopsResumoRow {
  codigo_municipio_ibge:    string;
  nome_municipio:           string | null;
  ano:                      number;
  periodo:                  string | null;
  percentual_aplicado_saude: number | null;
  despesa_total_saude:      number | null;
  receita_base_calculo:     number | null;
  total_indicadores:        number;
  situacao_envio:           string | null;
}

interface SisaguaResumoRow {
  codigo_municipio_ibge:      string;
  nome_municipio:             string | null;
  sisagua_total_amostras:     number;
  sisagua_total_fora_padrao:  number;
  sisagua_total_ecoli:        number;
  sisagua_total_coliformes:   number;
  sisagua_percentual_fora_padrao: number | null;
  sisagua_data_ultima_coleta: string | null;
}

interface CnesResumoRow {
  codigo_municipio_ibge:         string;
  nome_municipio:                string | null;
  uf:                            string | null;
  total_estabelecimentos:        number;
  total_estabelecimentos_sus:    number;
  total_ubs:                     number;
  total_ubs_ativas:              number;
  total_inativos:                number;
  total_sem_atualizacao_recente: number;
  data_mais_recente_atualizacao: Date | null;
}

interface AlertaRow {
  id_alerta:             number | null;
  fonte:                 string;
  codigo_municipio_ibge: string | null;
  nome_municipio:        string | null;
  tipo_alerta:           string;
  nivel:                 string;
  descricao:             string;
  valor_observado:       number | null;
  valor_referencia:      number | null;
  detalhe_json:          unknown;
}

interface SiopsHomeRow {
  ano:     number;
  periodo: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pontosPorNivel(nivel: string): number {
  if (nivel === "CRITICO") return 5;
  if (nivel === "ALTO")    return 3;
  if (nivel === "MEDIO")   return 1;
  return 0;
}

function nivelRisco(score: number): string {
  if (score >= 10) return "CRITICO";
  if (score >= 5)  return "ALTO";
  if (score >= 1)  return "MEDIO";
  return "BAIXO";
}

function nivelPrioridade(nivel: string): number {
  if (nivel === "CRITICO") return 1;
  if (nivel === "ALTO")    return 2;
  return 3;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarMartSaudeConsolidado(): Promise<void> {
  const inicio = Date.now();
  console.log("[mart:saude-consolidado] Iniciando refresh consolidado do Painel da Saúde...");

  // ── 1. Carrega fontes ──
  // Período mais recente por município (evita duplicatas de períodos anteriores)
  const siopsResumos = await pgQuery<SiopsResumoRow>(`
    SELECT DISTINCT ON (codigo_municipio_ibge)
      codigo_municipio_ibge,
      nome_municipio,
      ano,
      periodo,
      percentual_aplicado_saude,
      despesa_total_saude,
      receita_base_calculo,
      total_indicadores,
      situacao_envio
    FROM mart.siops_resumo_municipio
    ORDER BY codigo_municipio_ibge, ano DESC, periodo DESC
  `);

  const cnesResumos = await pgQuery<CnesResumoRow>(`
    SELECT
      codigo_municipio_ibge,
      nome_municipio,
      uf,
      total_estabelecimentos,
      total_estabelecimentos_sus,
      total_ubs,
      total_ubs_ativas,
      total_inativos,
      total_sem_atualizacao_recente,
      data_mais_recente_atualizacao
    FROM mart.saude_estrutura_municipio
  `);

  const siopsAlertas = await pgQuery<AlertaRow>(`
    SELECT
      id_alerta,
      'SIOPS'         AS fonte,
      codigo_municipio_ibge,
      nome_municipio,
      tipo_alerta,
      nivel,
      descricao,
      valor_observado,
      valor_referencia,
      detalhe_json
    FROM mart.siops_alertas
  `);

  const cnesAlertas = await pgQuery<AlertaRow>(`
    SELECT
      id_alerta,
      'CNES_UBS'      AS fonte,
      codigo_municipio_ibge,
      nome_municipio,
      tipo_alerta,
      nivel,
      descricao,
      valor_observado,
      valor_referencia,
      detalhe_json
    FROM mart.saude_estrutura_alertas
  `);

  const sisaguaAlertas = await pgQuery<AlertaRow>(`
    SELECT
      id_alerta,
      'SISAGUA'       AS fonte,
      codigo_municipio_ibge,
      nome_municipio,
      tipo_alerta,
      nivel,
      descricao,
      valor_observado,
      valor_referencia,
      detalhe_json
    FROM mart.sisagua_alertas
  `).catch(() => [] as AlertaRow[]);

  const sisaguaResumos = await pgQuery<SisaguaResumoRow>(`
    SELECT
      codigo_municipio_ibge,
      nome_municipio,
      total_amostras        AS sisagua_total_amostras,
      total_fora_padrao     AS sisagua_total_fora_padrao,
      total_ecoli           AS sisagua_total_ecoli,
      total_coliformes      AS sisagua_total_coliformes,
      percentual_fora_padrao AS sisagua_percentual_fora_padrao,
      data_ultima_coleta    AS sisagua_data_ultima_coleta
    FROM mart.sisagua_resumo_municipio
  `).catch(() => [] as SisaguaResumoRow[]);

  const siopsHome = await pgQuery<SiopsHomeRow>(`
    SELECT an_exercicio AS ano, nr_periodo::text AS periodo
    FROM mart.siops_resumo_home
    ORDER BY an_exercicio DESC, nr_periodo DESC
    LIMIT 1
  `).catch(() => [] as SiopsHomeRow[]);

  // Fallback: busca via siops_resumo_municipio se tabela home não existir
  const siopsHomeFallback = siopsHome.length === 0
    ? await pgQuery<SiopsHomeRow>(`
        SELECT ano, periodo FROM mart.siops_resumo_municipio
        ORDER BY ano DESC, periodo DESC LIMIT 1
      `).catch(() => [] as SiopsHomeRow[])
    : siopsHome;

  const siopsAnoAtual = siopsHomeFallback[0]?.ano ?? null;
  const siopsPerAtual = siopsHomeFallback[0]?.periodo ?? null;

  console.log(`[mart:saude-consolidado] SIOPS municípios:    ${siopsResumos.length}`);
  console.log(`[mart:saude-consolidado] CNES municípios:    ${cnesResumos.length}`);
  console.log(`[mart:saude-consolidado] SISAGUA municípios: ${sisaguaResumos.length}`);
  console.log(`[mart:saude-consolidado] Alertas SIOPS:    ${siopsAlertas.length}`);
  console.log(`[mart:saude-consolidado] Alertas CNES/UBS: ${cnesAlertas.length}`);
  console.log(`[mart:saude-consolidado] Alertas SISAGUA:  ${sisaguaAlertas.length}`);

  // Mapa SISAGUA por município
  const sisaguaMap = new Map<string, SisaguaResumoRow>();
  for (const sg of sisaguaResumos) {
    sisaguaMap.set(sg.codigo_municipio_ibge, sg);
  }

  // ── 2. Consolida municípios ──
  const municipioMap = new Map<string, {
    codigo: string;
    nome:   string | null;
    uf:     string | null;
    siops:  SiopsResumoRow    | null;
    cnes:   CnesResumoRow     | null;
    sisagua: SisaguaResumoRow | null;
  }>();

  for (const s of siopsResumos) {
    municipioMap.set(s.codigo_municipio_ibge, {
      codigo: s.codigo_municipio_ibge,
      nome: s.nome_municipio,
      uf: null,
      siops: s,
      cnes: null,
      sisagua: sisaguaMap.get(s.codigo_municipio_ibge) ?? null,
    });
  }
  for (const c of cnesResumos) {
    const existing = municipioMap.get(c.codigo_municipio_ibge);
    if (existing) {
      existing.cnes = c;
      // CNES tem nome preferencial
      if (c.nome_municipio) existing.nome = c.nome_municipio;
      if (c.uf) existing.uf = c.uf;
    } else {
      municipioMap.set(c.codigo_municipio_ibge, {
        codigo: c.codigo_municipio_ibge,
        nome: c.nome_municipio,
        uf: c.uf,
        siops: null,
        cnes: c,
        sisagua: sisaguaMap.get(c.codigo_municipio_ibge) ?? null,
      });
    }
  }
  // Inclui municípios que só têm dados SISAGUA
  for (const sg of sisaguaResumos) {
    if (!municipioMap.has(sg.codigo_municipio_ibge)) {
      municipioMap.set(sg.codigo_municipio_ibge, {
        codigo: sg.codigo_municipio_ibge,
        nome: sg.nome_municipio,
        uf: null,
        siops: null,
        cnes: null,
        sisagua: sg,
      });
    }
  }

  // ── 3. Todos alertas consolidados (SIOPS + CNES/UBS + SISAGUA) ──
  const todosAlertas: AlertaRow[] = [...siopsAlertas, ...cnesAlertas, ...sisaguaAlertas];

  // Score por município
  const scoreMap = new Map<string, number>();
  for (const a of todosAlertas) {
    if (!a.codigo_municipio_ibge) continue;
    const pts = pontosPorNivel(a.nivel);
    scoreMap.set(a.codigo_municipio_ibge, (scoreMap.get(a.codigo_municipio_ibge) ?? 0) + pts);
  }

  // Contadores de alertas por município e nível
  const alertaCountMap = new Map<string, { criticos: number; altos: number; medios: number; total: number }>();
  for (const a of todosAlertas) {
    if (!a.codigo_municipio_ibge) continue;
    const c = alertaCountMap.get(a.codigo_municipio_ibge) ?? { criticos: 0, altos: 0, medios: 0, total: 0 };
    c.total++;
    if (a.nivel === "CRITICO") c.criticos++;
    else if (a.nivel === "ALTO") c.altos++;
    else if (a.nivel === "MEDIO") c.medios++;
    alertaCountMap.set(a.codigo_municipio_ibge, c);
  }

  // ── 4. alertas_home: CRITICO/ALTO, máx 30, ordenados ──
  const alertasHomeSource: AlertaRow[] = [...siopsAlertas, ...cnesAlertas, ...sisaguaAlertas]
    .filter(a => a.nivel === "CRITICO" || a.nivel === "ALTO");

  alertasHomeSource.sort((a, b) => {
    const pa = nivelPrioridade(a.nivel), pb = nivelPrioridade(b.nivel);
    if (pa !== pb) return pa - pb;
    const fa = a.fonte.localeCompare(b.fonte);
    if (fa !== 0) return fa;
    const ta = a.tipo_alerta.localeCompare(b.tipo_alerta);
    if (ta !== 0) return ta;
    return (a.nome_municipio ?? "").localeCompare(b.nome_municipio ?? "");
  });

  const alertasHome = alertasHomeSource.slice(0, 30);

  // ── 5. Totais globais ──
  const totalCriticos = todosAlertas.filter(a => a.nivel === "CRITICO").length;
  const totalAltos    = todosAlertas.filter(a => a.nivel === "ALTO").length;
  const totalMedios   = todosAlertas.filter(a => a.nivel === "MEDIO").length;
  const municipiosAfetados = new Set(todosAlertas.map(a => a.codigo_municipio_ibge).filter(Boolean)).size;

  const municipios = [...municipioMap.values()];
  const riscoCritico = municipios.filter(m => nivelRisco(scoreMap.get(m.codigo) ?? 0) === "CRITICO").length;
  const riscoAlto    = municipios.filter(m => nivelRisco(scoreMap.get(m.codigo) ?? 0) === "ALTO").length;
  const riscoMedio   = municipios.filter(m => nivelRisco(scoreMap.get(m.codigo) ?? 0) === "MEDIO").length;

  console.log(`[mart:saude-consolidado] Municípios consolidados: ${municipios.length}`);
  console.log(`[mart:saude-consolidado] Alertas totais: ${todosAlertas.length} (${totalCriticos} CRITICO, ${totalAltos} ALTO, ${totalMedios} MEDIO)`);
  console.log(`[mart:saude-consolidado] Alertas home: ${alertasHome.length}`);

  // ── 6. Persiste ──
  await withPgTransaction(async (client) => {

    // mart.saude_alertas
    await client.query(`DELETE FROM mart.saude_alertas`);
    for (const a of todosAlertas) {
      await client.query(`
        INSERT INTO mart.saude_alertas
          (fonte, codigo_municipio_ibge, nome_municipio, tipo_alerta, nivel,
           descricao, valor_observado, valor_referencia, detalhe_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        a.fonte, a.codigo_municipio_ibge, a.nome_municipio, a.tipo_alerta, a.nivel,
        a.descricao, a.valor_observado, a.valor_referencia,
        a.detalhe_json ? JSON.stringify(a.detalhe_json) : null,
      ]);
    }
    console.log(`[mart:saude-consolidado] ✓ saude_alertas (${todosAlertas.length} alertas)`);

    // mart.saude_alertas_home
    await client.query(`DELETE FROM mart.saude_alertas_home`);
    for (const a of alertasHome) {
      await client.query(`
        INSERT INTO mart.saude_alertas_home
          (id_alerta, fonte, codigo_municipio_ibge, nome_municipio, tipo_alerta, nivel,
           descricao, valor_observado, valor_referencia, prioridade, detalhe_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `, [
        a.id_alerta, a.fonte, a.codigo_municipio_ibge, a.nome_municipio, a.tipo_alerta, a.nivel,
        a.descricao, a.valor_observado, a.valor_referencia,
        nivelPrioridade(a.nivel),
        a.detalhe_json ? JSON.stringify(a.detalhe_json) : null,
      ]);
    }
    console.log(`[mart:saude-consolidado] ✓ saude_alertas_home (${alertasHome.length} alertas)`);

    // mart.saude_resumo_municipio
    await client.query(`DELETE FROM mart.saude_resumo_municipio`);
    for (const m of municipios) {
      const score = scoreMap.get(m.codigo) ?? 0;
      const counts = alertaCountMap.get(m.codigo) ?? { criticos: 0, altos: 0, medios: 0, total: 0 };
      const s = m.siops;
      const c = m.cnes;

      const sg = m.sisagua;
      await client.query(`
        INSERT INTO mart.saude_resumo_municipio (
          codigo_municipio_ibge, nome_municipio, uf,
          siops_ano, siops_periodo,
          percentual_aplicado_saude, despesa_total_saude, receita_base_calculo,
          siops_total_indicadores, siops_situacao_envio,
          total_estabelecimentos, total_estabelecimentos_sus,
          total_ubs, total_ubs_ativas, total_inativos,
          total_sem_atualizacao_recente, data_mais_recente_atualizacao,
          total_alertas, total_criticos, total_altos, total_medios,
          score_risco, nivel_risco,
          sisagua_total_amostras, sisagua_total_fora_padrao,
          sisagua_total_ecoli, sisagua_total_coliformes,
          sisagua_percentual_fora_padrao, sisagua_data_ultima_coleta,
          atualizado_em
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,
          $18,$19,$20,$21,$22,$23,
          $24,$25,$26,$27,$28,$29,now()
        )
        ON CONFLICT (codigo_municipio_ibge) DO UPDATE SET
          nome_municipio                = EXCLUDED.nome_municipio,
          uf                            = EXCLUDED.uf,
          siops_ano                     = EXCLUDED.siops_ano,
          siops_periodo                 = EXCLUDED.siops_periodo,
          percentual_aplicado_saude     = EXCLUDED.percentual_aplicado_saude,
          despesa_total_saude           = EXCLUDED.despesa_total_saude,
          receita_base_calculo          = EXCLUDED.receita_base_calculo,
          siops_total_indicadores       = EXCLUDED.siops_total_indicadores,
          siops_situacao_envio          = EXCLUDED.siops_situacao_envio,
          total_estabelecimentos        = EXCLUDED.total_estabelecimentos,
          total_estabelecimentos_sus    = EXCLUDED.total_estabelecimentos_sus,
          total_ubs                     = EXCLUDED.total_ubs,
          total_ubs_ativas              = EXCLUDED.total_ubs_ativas,
          total_inativos                = EXCLUDED.total_inativos,
          total_sem_atualizacao_recente = EXCLUDED.total_sem_atualizacao_recente,
          data_mais_recente_atualizacao = EXCLUDED.data_mais_recente_atualizacao,
          total_alertas                 = EXCLUDED.total_alertas,
          total_criticos                = EXCLUDED.total_criticos,
          total_altos                   = EXCLUDED.total_altos,
          total_medios                  = EXCLUDED.total_medios,
          score_risco                   = EXCLUDED.score_risco,
          nivel_risco                   = EXCLUDED.nivel_risco,
          sisagua_total_amostras        = EXCLUDED.sisagua_total_amostras,
          sisagua_total_fora_padrao     = EXCLUDED.sisagua_total_fora_padrao,
          sisagua_total_ecoli           = EXCLUDED.sisagua_total_ecoli,
          sisagua_total_coliformes      = EXCLUDED.sisagua_total_coliformes,
          sisagua_percentual_fora_padrao = EXCLUDED.sisagua_percentual_fora_padrao,
          sisagua_data_ultima_coleta    = EXCLUDED.sisagua_data_ultima_coleta,
          atualizado_em                 = now()
      `, [
        m.codigo, m.nome, m.uf,
        s?.ano ?? null, s?.periodo ?? null,
        s?.percentual_aplicado_saude ?? null,
        s?.despesa_total_saude ?? null,
        s?.receita_base_calculo ?? null,
        s?.total_indicadores ?? 0,
        s?.situacao_envio ?? null,
        c?.total_estabelecimentos ?? 0,
        c?.total_estabelecimentos_sus ?? 0,
        c?.total_ubs ?? 0,
        c?.total_ubs_ativas ?? 0,
        c?.total_inativos ?? 0,
        c?.total_sem_atualizacao_recente ?? 0,
        c?.data_mais_recente_atualizacao
          ? new Date(c.data_mais_recente_atualizacao).toISOString().slice(0, 10)
          : null,
        counts.total,
        counts.criticos,
        counts.altos,
        counts.medios,
        score,
        nivelRisco(score),
        sg?.sisagua_total_amostras    ?? 0,
        sg?.sisagua_total_fora_padrao ?? 0,
        sg?.sisagua_total_ecoli       ?? 0,
        sg?.sisagua_total_coliformes  ?? 0,
        sg?.sisagua_percentual_fora_padrao ?? null,
        sg?.sisagua_data_ultima_coleta ?? null,
      ]);
    }
    console.log(`[mart:saude-consolidado] ✓ saude_resumo_municipio (${municipios.length} municípios)`);

    // mart.saude_resumo_home
    await client.query(`DELETE FROM mart.saude_resumo_home`);
    await client.query(`
      INSERT INTO mart.saude_resumo_home (
        total_alertas, total_criticos, total_altos, total_medios,
        total_municipios_afetados,
        municipios_risco_critico, municipios_risco_alto, municipios_risco_medio,
        siops_ano, siops_periodo
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [
      todosAlertas.length,
      totalCriticos, totalAltos, totalMedios,
      municipiosAfetados,
      riscoCritico, riscoAlto, riscoMedio,
      siopsAnoAtual, siopsPerAtual,
    ]);
    console.log(`[mart:saude-consolidado] ✓ saude_resumo_home`);
    console.log(`  ${municipios.length} municípios · ${riscoCritico} risco CRITICO · ${riscoAlto} ALTO · ${riscoMedio} MEDIO`);
  });

  const duracao = Date.now() - inicio;
  console.log(`[mart:saude-consolidado] Refresh concluído em ${duracao}ms.`);

  await pgQuery(`
    INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
    VALUES ('mart:saude-consolidado', 'OK', 'Refresh consolidado do Painel da Saúde', $1, $2)
  `, [municipios.length, duracao]);
}

if (require.main === module) {
  executarMartSaudeConsolidado()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[mart:saude-consolidado] Erro:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
