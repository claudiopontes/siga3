/**
 * refresh-mart-siconfi-rgf.ts
 *
 * Reconstrói as mart tables de SICONFI/RGF:
 *   - mart.siconfi_rgf_resumo_municipio  (resumo por município/período)
 *   - mart.siconfi_rgf_alertas           (alertas gerados)
 *   - mart.siconfi_rgf_resumo_home       (uma linha para o card/hub)
 *
 * Alertas implementados:
 *   rgf_sem_dado_recente  — CRITICO — município sem nenhum dado RGF no
 *                           período mais recente disponível no DW.
 *   rgf_dado_incompleto   — ALTO — município com total_contas muito abaixo
 *                           da mediana dos demais (threshold: percentil 25,
 *                           somente quando há >= 5 municípios com dado).
 *
 * Alertas PENDENTES (não implementados por falta de campo seguro na API):
 *   rgf_despesa_pessoal   — [PENDENTE] exigiria identificar a conta de
 *                           Despesa com Pessoal e RCL no payload. Os campos
 *                           "conta" e "cod_conta" existem mas os valores
 *                           dependem dos anexos enviados (ex: "RGF-Anexo 01")
 *                           e não foram confirmados em dados reais para municípios
 *                           do Acre. Será implementado quando a carga retornar
 *                           dados concretos.
 *
 * Uso: cd etl && npm run refresh-mart-siconfi-rgf
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Municípios do Acre — espelhado do job de carga para validação de cobertura
// ---------------------------------------------------------------------------

const MUNICIPIOS_ACRE: Array<{ id_municipio: number; no_municipio: string }> = [
  { id_municipio: 1200013, no_municipio: "Acrelândia" },
  { id_municipio: 1200054, no_municipio: "Assis Brasil" },
  { id_municipio: 1200104, no_municipio: "Brasiléia" },
  { id_municipio: 1200138, no_municipio: "Bujari" },
  { id_municipio: 1200179, no_municipio: "Capixaba" },
  { id_municipio: 1200203, no_municipio: "Cruzeiro do Sul" },
  { id_municipio: 1200252, no_municipio: "Epitaciolândia" },
  { id_municipio: 1200302, no_municipio: "Feijó" },
  { id_municipio: 1200328, no_municipio: "Jordão" },
  { id_municipio: 1200336, no_municipio: "Mâncio Lima" },
  { id_municipio: 1200344, no_municipio: "Manoel Urbano" },
  { id_municipio: 1200351, no_municipio: "Marechal Thaumaturgo" },
  { id_municipio: 1200385, no_municipio: "Plácido de Castro" },
  { id_municipio: 1200393, no_municipio: "Porto Walter" },
  { id_municipio: 1200401, no_municipio: "Rio Branco" },
  { id_municipio: 1200427, no_municipio: "Rodrigues Alves" },
  { id_municipio: 1200435, no_municipio: "Santa Rosa do Purus" },
  { id_municipio: 1200450, no_municipio: "Senador Guiomard" },
  { id_municipio: 1200500, no_municipio: "Sena Madureira" },
  { id_municipio: 1200609, no_municipio: "Tarauacá" },
  { id_municipio: 1200708, no_municipio: "Xapuri" },
  { id_municipio: 1200807, no_municipio: "Porto Acre" },
];

const TOTAL_MUNICIPIOS = MUNICIPIOS_ACRE.length;

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

interface FatoRgfRow {
  an_exercicio: number;
  nr_periodo:   number;
  id_ente:      number;
  no_ente:      string | null;
}

interface ResumoRgfRow {
  an_exercicio: number;
  nr_periodo:   number;
  id_municipio: number;
  no_municipio: string | null;
  total_contas: number;
}

interface AlertaInsert {
  an_exercicio:    number;
  nr_periodo:      number;
  id_municipio:    number | null;
  no_municipio:    string | null;
  tipo_alerta:     string;
  nivel:           string;
  descricao:       string;
  valor_observado: number | null;
  valor_referencia: number | null;
  detalhe_json:    object | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nivelPrioridade(nivel: string): number {
  if (nivel === "CRITICO") return 1;
  if (nivel === "ALTO")    return 2;
  return 3;
}

function percentil25(valores: number[]): number {
  if (valores.length === 0) return 0;
  const sorted = [...valores].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.25);
  return sorted[Math.max(0, idx - 1)] ?? sorted[0];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarMartSiconfiRgf(): Promise<void> {
  const inicio = Date.now();
  console.log("[mart:siconfi-rgf] Iniciando refresh das marts SICONFI/RGF...");

  // ── 1. Descobrir período mais recente ──
  const periodoRows = await pgQuery<{ an_exercicio: number; nr_periodo: number }>(`
    SELECT an_exercicio, nr_periodo
    FROM dw.fato_siconfi_rgf
    GROUP BY an_exercicio, nr_periodo
    ORDER BY an_exercicio DESC, nr_periodo DESC
    LIMIT 1
  `);

  if (periodoRows.length === 0) {
    console.log("[mart:siconfi-rgf] Nenhum dado em dw.fato_siconfi_rgf — encerrando.");
    console.log("[PENDENTE] rgf_despesa_pessoal: aguardando dados reais da API para implementação.");
    return;
  }

  const { an_exercicio: ANO_RECENTE, nr_periodo: PERIODO_RECENTE } = periodoRows[0];
  console.log(`[mart:siconfi-rgf] Período mais recente: ${ANO_RECENTE}/${PERIODO_RECENTE}`);

  // ── 2. Carregar contagens por ente/período ──
  const fatoRows = await pgQuery<FatoRgfRow>(`
    SELECT an_exercicio, nr_periodo, id_ente, no_ente
    FROM dw.fato_siconfi_rgf
    ORDER BY an_exercicio, nr_periodo, id_ente
  `);

  // Agrupa: contagem de registros por município/período
  const resumoMap = new Map<string, ResumoRgfRow>();
  for (const f of fatoRows) {
    const key = `${f.an_exercicio}|${f.nr_periodo}|${f.id_ente}`;
    if (!resumoMap.has(key)) {
      resumoMap.set(key, {
        an_exercicio: f.an_exercicio,
        nr_periodo:   f.nr_periodo,
        id_municipio: f.id_ente,
        no_municipio: f.no_ente,
        total_contas: 0,
      });
    }
    const r = resumoMap.get(key)!;
    r.total_contas++;
  }

  const resumos = [...resumoMap.values()];

  // Municípios com dado no período mais recente
  const municipiosComDado = new Set(
    resumos
      .filter((r) => r.an_exercicio === ANO_RECENTE && r.nr_periodo === PERIODO_RECENTE)
      .map((r) => r.id_municipio)
  );

  // ── 3. Gerar alertas ──
  const alertas: AlertaInsert[] = [];

  // Alerta: rgf_sem_dado_recente — CRITICO
  // Município sem nenhum dado RGF no período mais recente carregado.
  for (const mun of MUNICIPIOS_ACRE) {
    if (!municipiosComDado.has(mun.id_municipio)) {
      alertas.push({
        an_exercicio:     ANO_RECENTE,
        nr_periodo:       PERIODO_RECENTE,
        id_municipio:     mun.id_municipio,
        no_municipio:     mun.no_municipio,
        tipo_alerta:      "rgf_sem_dado_recente",
        nivel:            "CRITICO",
        descricao:        `Município sem entrega do RGF no período ${PERIODO_RECENTE}/${ANO_RECENTE}`,
        valor_observado:  0,
        valor_referencia: 1,
        detalhe_json:     { periodo: PERIODO_RECENTE, exercicio: ANO_RECENTE },
      });
    }
  }

  // Alerta: rgf_dado_incompleto — ALTO
  // Total de registros abaixo do percentil 25 dos demais municípios no mesmo período.
  // Só dispara quando há >= 5 municípios com dado (para o threshold ter validade estatística).
  const resumosRecentes = resumos.filter(
    (r) => r.an_exercicio === ANO_RECENTE && r.nr_periodo === PERIODO_RECENTE
  );

  if (resumosRecentes.length >= 5) {
    const totalContasArr = resumosRecentes.map((r) => r.total_contas);
    const threshold = percentil25(totalContasArr);

    for (const r of resumosRecentes) {
      if (r.total_contas < threshold && threshold > 0) {
        alertas.push({
          an_exercicio:     r.an_exercicio,
          nr_periodo:       r.nr_periodo,
          id_municipio:     r.id_municipio,
          no_municipio:     r.no_municipio,
          tipo_alerta:      "rgf_dado_incompleto",
          nivel:            "ALTO",
          descricao:        `RGF entregue com apenas ${r.total_contas} registro(s) — possível envio incompleto (p25=${threshold})`,
          valor_observado:  r.total_contas,
          valor_referencia: threshold,
          detalhe_json:     { total_contas: r.total_contas, percentil25: threshold },
        });
      }
    }
  } else {
    console.log(`[mart:siconfi-rgf] rgf_dado_incompleto: apenas ${resumosRecentes.length} municípios com dado — mínimo 5 necessário para threshold estatístico.`);
  }

  // [PENDENTE] rgf_despesa_pessoal:
  // Verificaria se a Despesa com Pessoal está dentro do limite legal da LRF em relação à RCL.
  // Requer identificar os campos "conta"/"cod_conta" no payload real (ex: anexo RGF-Anexo 01).
  // Não implementado: campos não confirmados em dados reais para municípios do Acre.
  // Será ativado quando a carga retornar itens concretos e os códigos de conta forem mapeados.
  console.log("[PENDENTE] rgf_despesa_pessoal: aguardando dados reais da API para mapear cod_conta de Despesa com Pessoal e RCL.");

  console.log(`[mart:siconfi-rgf] Alertas gerados: ${alertas.length}`);

  await withPgTransaction(async (client) => {

    // ── 4. Rebuild mart.siconfi_rgf_resumo_municipio ──
    await client.query(`DELETE FROM mart.siconfi_rgf_resumo_municipio`);
    for (const r of resumos) {
      await client.query(`
        INSERT INTO mart.siconfi_rgf_resumo_municipio
          (an_exercicio, nr_periodo, id_municipio, no_municipio,
           total_contas, situacao_envio, atualizado_em)
        VALUES ($1, $2, $3, $4, $5, 'COM_DADO', now())
        ON CONFLICT (an_exercicio, nr_periodo, id_municipio) DO UPDATE SET
          no_municipio  = EXCLUDED.no_municipio,
          total_contas  = EXCLUDED.total_contas,
          situacao_envio = EXCLUDED.situacao_envio,
          atualizado_em = now()
      `, [
        r.an_exercicio,
        r.nr_periodo,
        r.id_municipio,
        r.no_municipio,
        r.total_contas,
      ]);
    }
    console.log(`[mart:siconfi-rgf] ✓ siconfi_rgf_resumo_municipio (${resumos.length} linhas)`);

    // ── 5. Rebuild mart.siconfi_rgf_alertas ──
    await client.query(`DELETE FROM mart.siconfi_rgf_alertas`);
    for (const a of alertas) {
      await client.query(`
        INSERT INTO mart.siconfi_rgf_alertas
          (an_exercicio, nr_periodo, id_municipio, no_municipio,
           tipo_alerta, nivel, descricao, valor_observado, valor_referencia, detalhe_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [
        a.an_exercicio, a.nr_periodo, a.id_municipio, a.no_municipio,
        a.tipo_alerta, a.nivel, a.descricao, a.valor_observado, a.valor_referencia,
        a.detalhe_json ? JSON.stringify(a.detalhe_json) : null,
      ]);
    }
    console.log(`[mart:siconfi-rgf] ✓ siconfi_rgf_alertas (${alertas.length} alertas)`);

    // ── 6. Rebuild mart.siconfi_rgf_resumo_home ──
    const criticos = alertas.filter(
      (a) => a.nivel === "CRITICO" && a.an_exercicio === ANO_RECENTE && a.nr_periodo === PERIODO_RECENTE
    ).length;
    const altos = alertas.filter(
      (a) => a.nivel === "ALTO" && a.an_exercicio === ANO_RECENTE && a.nr_periodo === PERIODO_RECENTE
    ).length;
    const comDado = municipiosComDado.size;

    await client.query(`DELETE FROM mart.siconfi_rgf_resumo_home`);
    await client.query(`
      INSERT INTO mart.siconfi_rgf_resumo_home
        (an_exercicio, nr_periodo, municipios_com_dado, municipios_sem_dado,
         total_municipios, total_alertas, alertas_criticos, alertas_altos)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [
      ANO_RECENTE, PERIODO_RECENTE,
      comDado,
      TOTAL_MUNICIPIOS - comDado,
      TOTAL_MUNICIPIOS,
      alertas.filter(
        (a) => a.an_exercicio === ANO_RECENTE && a.nr_periodo === PERIODO_RECENTE
      ).length,
      criticos,
      altos,
    ]);
    console.log(
      `[mart:siconfi-rgf] ✓ siconfi_rgf_resumo_home ` +
      `(${comDado}/${TOTAL_MUNICIPIOS} com dado, ${criticos} críticos, ${altos} altos)`
    );
  });

  // Ordenação dos alertas para exibição (mais grave primeiro)
  const alertasOrdenados = [...alertas]
    .filter((a) => a.an_exercicio === ANO_RECENTE && a.nr_periodo === PERIODO_RECENTE)
    .sort((a, b) => nivelPrioridade(a.nivel) - nivelPrioridade(b.nivel));

  if (alertasOrdenados.length > 0) {
    console.log("[mart:siconfi-rgf] Top alertas:");
    for (const a of alertasOrdenados.slice(0, 5)) {
      console.log(`  [${a.nivel}] ${a.tipo_alerta} — ${a.no_municipio ?? "global"}: ${a.descricao}`);
    }
  }

  const duracao = Date.now() - inicio;
  console.log(`[mart:siconfi-rgf] Refresh concluído em ${duracao}ms.`);

  try {
    await pgQuery(`
      INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
      VALUES ('mart_siconfi_rgf', 'OK', 'Refresh completo das marts SICONFI/RGF', $1, $2)
    `, [resumos.length, duracao]);
  } catch {
    // audit.etl_log pode não existir em ambiente de desenvolvimento
  }
}

if (require.main === module) {
  executarMartSiconfiRgf()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[mart:siconfi-rgf] Erro:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
