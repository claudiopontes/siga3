/**
 * refresh-mart-siconfi-rgf.ts
 *
 * Reconstrói as mart tables de SICONFI/RGF:
 *   - mart.siconfi_rgf_resumo_municipio  (resumo por município/período)
 *   - mart.siconfi_rgf_alertas           (alertas gerados)
 *   - mart.siconfi_rgf_resumo_home       (uma linha para o card/hub)
 *
 * Fonte de dados: dw.fato_siconfi_extrato_entregas WHERE co_entregavel='RGF'
 * (O endpoint /rgf do DataLake não publica dados fiscais. Os dados de entrega
 *  do RGF estão disponíveis apenas via /extrato_entregas.)
 *
 * Lógica de situacao_envio:
 *   COM_DADO — município tem ao menos uma entrega RGF com status HO ou RE
 *   SEM_DADO — município não tem entrega confirmada para o período
 *
 * Alertas implementados:
 *   rgf_sem_dado_recente — CRITICO — município sem entrega RGF no período mais recente.
 *
 * Uso: cd etl && npm run refresh-mart-siconfi-rgf
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";
import { executarMartComAuditoria } from "../lib/auditoria";

const MODULO = "mart_siconfi_rgf";

// ---------------------------------------------------------------------------
// Municípios do Acre
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

interface ExtratoRgfRow {
  id_ente:          number;
  no_ente:          string | null;
  exercicio:        number;
  periodo:          number;
  total_entregas:   number;        // nº de linhas (prefeitura + câmara)
  status_relatorio: string | null; // HO ou RE se houver entrega confirmada
  data_entrega:     string | null; // ISO date string
}

interface AlertaInsert {
  an_exercicio:     number;
  nr_periodo:       number;
  id_municipio:     number | null;
  no_municipio:     string | null;
  tipo_alerta:      string;
  nivel:            string;
  descricao:        string;
  valor_observado:  number | null;
  valor_referencia: number | null;
  detalhe_json:     object | null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarMartSiconfiRgf(): Promise<void> {
  console.log("[mart:siconfi-rgf] Iniciando refresh das marts SICONFI/RGF...");
  console.log("[mart:siconfi-rgf] Fonte: dw.fato_siconfi_extrato_entregas (co_entregavel=RGF)");

  await executarMartComAuditoria(
    {
      modulo: MODULO,
      origem: "dw.fato_siconfi_extrato_entregas (co_entregavel=RGF)",
      destino: "mart.siconfi_rgf_* (resumo + alertas + home)",
    },
    async () => {
  // ── 1. Carregar entregas RGF agrupadas por município/período ──
  // Agrega múltiplas entregas do mesmo ente/período (ex: prefeitura + câmara)
  const extratoRows = await pgQuery<ExtratoRgfRow>(`
    SELECT
      id_ente,
      MAX(no_ente)                                                             AS no_ente,
      exercicio,
      periodo,
      COUNT(*)::int                                                            AS total_entregas,
      MAX(CASE WHEN status_relatorio IN ('HO','RE') THEN status_relatorio
               ELSE NULL END)                                                  AS status_relatorio,
      MAX(CASE WHEN status_relatorio IN ('HO','RE') THEN data_status::date::text
               ELSE NULL END)                                                  AS data_entrega
    FROM dw.fato_siconfi_extrato_entregas
    WHERE co_entregavel = 'RGF'
    GROUP BY id_ente, exercicio, periodo
    ORDER BY exercicio DESC, periodo DESC, id_ente
  `);

  if (extratoRows.length === 0) {
    console.log("[mart:siconfi-rgf] Nenhum dado RGF em dw.fato_siconfi_extrato_entregas.");
    console.log("[mart:siconfi-rgf] Execute: cd etl && npm run siconfi-rgf:full:postgres");
    return;
  }

  // ── 2. Descobrir período mais recente com entregas ──
  const periodoRecente = extratoRows.find((r) => r.status_relatorio != null) ?? extratoRows[0];
  const ANO_RECENTE    = periodoRecente.exercicio;
  const PER_RECENTE    = periodoRecente.periodo;
  console.log(`[mart:siconfi-rgf] Período mais recente com entrega: ${ANO_RECENTE}/${PER_RECENTE}`);

  // Municípios com entrega confirmada (HO/RE) no período mais recente
  const municipiosComDado = new Set(
    extratoRows
      .filter(
        (r) =>
          r.exercicio === ANO_RECENTE &&
          r.periodo   === PER_RECENTE &&
          r.status_relatorio != null,
      )
      .map((r) => r.id_ente),
  );
  console.log(`[mart:siconfi-rgf] Municípios com entrega no período recente: ${municipiosComDado.size}/${TOTAL_MUNICIPIOS}`);

  // ── 3. Gerar alertas ──
  const alertas: AlertaInsert[] = [];

  for (const mun of MUNICIPIOS_ACRE) {
    if (!municipiosComDado.has(mun.id_municipio)) {
      alertas.push({
        an_exercicio:     ANO_RECENTE,
        nr_periodo:       PER_RECENTE,
        id_municipio:     mun.id_municipio,
        no_municipio:     mun.no_municipio,
        tipo_alerta:      "rgf_sem_dado_recente",
        nivel:            "CRITICO",
        descricao:        `Município sem entrega do RGF no ${PER_RECENTE}º quadrimestre de ${ANO_RECENTE}`,
        valor_observado:  0,
        valor_referencia: 1,
        detalhe_json:     { periodo: PER_RECENTE, exercicio: ANO_RECENTE },
      });
    }
  }

  console.log(`[mart:siconfi-rgf] Alertas gerados: ${alertas.length}`);

  await withPgTransaction(async (client) => {

    // ── 4. Rebuild mart.siconfi_rgf_resumo_municipio ──
    await client.query(`DELETE FROM mart.siconfi_rgf_resumo_municipio`);

    for (const r of extratoRows) {
      const temEntrega = r.status_relatorio != null;
      await client.query(`
        INSERT INTO mart.siconfi_rgf_resumo_municipio
          (an_exercicio, nr_periodo, id_municipio, no_municipio,
           total_contas, situacao_envio, status_relatorio, data_entrega, atualizado_em)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
        ON CONFLICT (an_exercicio, nr_periodo, id_municipio) DO UPDATE SET
          no_municipio     = EXCLUDED.no_municipio,
          total_contas     = EXCLUDED.total_contas,
          situacao_envio   = EXCLUDED.situacao_envio,
          status_relatorio = EXCLUDED.status_relatorio,
          data_entrega     = EXCLUDED.data_entrega,
          atualizado_em    = now()
      `, [
        r.exercicio,
        r.periodo,
        r.id_ente,
        r.no_ente,
        r.total_entregas,
        temEntrega ? "COM_DADO" : "SEM_DADO",
        r.status_relatorio ?? null,
        r.data_entrega     ?? null,
      ]);
    }
    console.log(`[mart:siconfi-rgf] ✓ siconfi_rgf_resumo_municipio (${extratoRows.length} linhas)`);

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
    const comDado  = municipiosComDado.size;
    const criticos = alertas.filter(
      (a) => a.nivel === "CRITICO" && a.an_exercicio === ANO_RECENTE && a.nr_periodo === PER_RECENTE,
    ).length;
    const altos = alertas.filter(
      (a) => a.nivel === "ALTO" && a.an_exercicio === ANO_RECENTE && a.nr_periodo === PER_RECENTE,
    ).length;

    await client.query(`DELETE FROM mart.siconfi_rgf_resumo_home`);
    await client.query(`
      INSERT INTO mart.siconfi_rgf_resumo_home
        (an_exercicio, nr_periodo, municipios_com_dado, municipios_sem_dado,
         total_municipios, total_alertas, alertas_criticos, alertas_altos)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [
      ANO_RECENTE, PER_RECENTE,
      comDado,
      TOTAL_MUNICIPIOS - comDado,
      TOTAL_MUNICIPIOS,
      alertas.filter((a) => a.an_exercicio === ANO_RECENTE && a.nr_periodo === PER_RECENTE).length,
      criticos,
      altos,
    ]);
    console.log(
      `[mart:siconfi-rgf] ✓ siconfi_rgf_resumo_home ` +
      `(${comDado}/${TOTAL_MUNICIPIOS} com dado, ${criticos} críticos)`,
    );
      });

      console.log("[mart:siconfi-rgf] Refresh concluído.");

      if (alertas.length > 0) {
        console.log("[mart:siconfi-rgf] Municípios sem entrega RGF:");
        for (const a of alertas.slice(0, 5)) {
          console.log(`  [${a.nivel}] ${a.no_municipio}: ${a.descricao}`);
        }
        if (alertas.length > 5) console.log(`  ... e mais ${alertas.length - 5}`);
      }

      return {
        mensagem: "Refresh completo das marts SICONFI/RGF",
        registrosLidos: extratoRows.length,
        registrosGravados: extratoRows.length,
      };
    },
  );
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
