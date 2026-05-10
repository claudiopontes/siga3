/**
 * refresh-mart-siconfi-rreo.ts
 *
 * Reconstrói as mart tables de SICONFI/RREO:
 *   - mart.siconfi_rreo_resumo_municipio
 *   - mart.siconfi_rreo_alertas
 *   - mart.siconfi_rreo_alertas_home  (max 30, CRITICO/ALTO, período mais recente)
 *   - mart.siconfi_rreo_resumo_home   (uma linha para o card da home)
 *
 * Tipos de alerta gerados:
 *   rreo_sem_dado_recente  — município sem envio no período mais recente (ALTO)
 *   rreo_dado_incompleto   — envio com <10 registros no período recente (MEDIO)
 *   rreo_variacao_atipica  — variação >50% em relação ao período anterior (MEDIO/ALTO)
 *
 * Uso: cd etl && npm run mart:siconfi-rreo
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// Municípios do Acre — espelhado do job de carga para validação de cobertura
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

function nivelPrioridade(nivel: string): number {
  if (nivel === "CRITICO") return 1;
  if (nivel === "ALTO") return 2;
  return 3;
}

interface FatoRow {
  an_exercicio: number;
  nr_periodo: number;
  id_municipio: number;
  no_municipio: string | null;
  no_anexo: string | null;
  conta: string | null;
  coluna: string | null;
  valor: number | null;
}

interface ResumoRow {
  an_exercicio: number;
  nr_periodo: number;
  id_municipio: number;
  no_municipio: string | null;
  total_contas: number;
  total_receitas: number | null;
  total_despesas: number | null;
}

interface AlertaInsert {
  an_exercicio: number;
  nr_periodo: number;
  id_municipio: number | null;
  no_municipio: string | null;
  tipo_alerta: string;
  nivel: string;
  descricao: string;
  valor_observado: number | null;
  valor_referencia: number | null;
  detalhe_json: object | null;
}

export async function executarMartSiconfiRreo(): Promise<void> {
  const inicio = Date.now();
  console.log("[mart:siconfi-rreo] Iniciando refresh das marts SICONFI/RREO...");

  // ── 1. Descobrir período mais recente ──
  const periodoRows = await pgQuery<{ an_exercicio: number; nr_periodo: number }>(`
    SELECT an_exercicio, nr_periodo
    FROM dw.fato_siconfi_rreo
    GROUP BY an_exercicio, nr_periodo
    ORDER BY an_exercicio DESC, nr_periodo DESC
    LIMIT 1
  `);

  if (periodoRows.length === 0) {
    console.log("[mart:siconfi-rreo] Nenhum dado em dw.fato_siconfi_rreo — encerrando.");
    return;
  }

  const { an_exercicio: ANO_RECENTE, nr_periodo: PERIODO_RECENTE } = periodoRows[0];
  console.log(`[mart:siconfi-rreo] Período mais recente: ${ANO_RECENTE}/${PERIODO_RECENTE}`);

  // ── 2. Carregar todos os fatos ──
  const fatos = await pgQuery<FatoRow>(`
    SELECT an_exercicio, nr_periodo, id_municipio, no_municipio,
           no_anexo, conta, coluna, valor
    FROM dw.fato_siconfi_rreo
    ORDER BY an_exercicio, nr_periodo, id_municipio
  `);

  // Agrupa por municipio/periodo
  const resumoMap = new Map<string, ResumoRow>();
  for (const f of fatos) {
    const key = `${f.an_exercicio}|${f.nr_periodo}|${f.id_municipio}`;
    if (!resumoMap.has(key)) {
      resumoMap.set(key, {
        an_exercicio: f.an_exercicio,
        nr_periodo: f.nr_periodo,
        id_municipio: f.id_municipio,
        no_municipio: f.no_municipio,
        total_contas: 0,
        total_receitas: null,
        total_despesas: null,
      });
    }
    const r = resumoMap.get(key)!;
    r.total_contas++;

    // Heurística simples: soma receitas e despesas pelo no_anexo
    if (f.valor !== null && f.coluna?.toLowerCase().includes("bimestre")) {
      const anexo = (f.no_anexo ?? "").toLowerCase();
      if (anexo.includes("receita")) {
        r.total_receitas = (r.total_receitas ?? 0) + f.valor;
      } else if (anexo.includes("despesa") || anexo.includes("função")) {
        r.total_despesas = (r.total_despesas ?? 0) + f.valor;
      }
    }
  }

  const resumos = [...resumoMap.values()];

  // Municípios com dado no período mais recente
  const municipiosComDado = new Set(
    resumos
      .filter(r => r.an_exercicio === ANO_RECENTE && r.nr_periodo === PERIODO_RECENTE)
      .map(r => r.id_municipio)
  );

  // ── 3. Gerar alertas ──
  const alertas: AlertaInsert[] = [];

  // Alerta: rreo_sem_dado_recente — município sem envio no período mais recente
  for (const mun of MUNICIPIOS_ACRE) {
    if (!municipiosComDado.has(mun.id_municipio)) {
      alertas.push({
        an_exercicio: ANO_RECENTE,
        nr_periodo: PERIODO_RECENTE,
        id_municipio: mun.id_municipio,
        no_municipio: mun.no_municipio,
        tipo_alerta: "rreo_sem_dado_recente",
        nivel: "ALTO",
        descricao: `Município sem entrega do RREO no período ${PERIODO_RECENTE}/${ANO_RECENTE}`,
        valor_observado: 0,
        valor_referencia: 1,
        detalhe_json: { periodo: PERIODO_RECENTE, exercicio: ANO_RECENTE },
      });
    }
  }

  // Alerta: rreo_dado_incompleto — envio com poucos registros
  for (const r of resumos) {
    if (r.an_exercicio === ANO_RECENTE && r.nr_periodo === PERIODO_RECENTE) {
      if (r.total_contas < 10) {
        alertas.push({
          an_exercicio: r.an_exercicio,
          nr_periodo: r.nr_periodo,
          id_municipio: r.id_municipio,
          no_municipio: r.no_municipio,
          tipo_alerta: "rreo_dado_incompleto",
          nivel: "MEDIO",
          descricao: `RREO entregue com apenas ${r.total_contas} registro(s) — possível envio incompleto`,
          valor_observado: r.total_contas,
          valor_referencia: 10,
          detalhe_json: { total_contas: r.total_contas },
        });
      }
    }
  }

  // Alerta: rreo_variacao_atipica — variação >50% entre períodos consecutivos
  // Compara despesas do período recente vs período anterior
  const periodoAnteriorRows = await pgQuery<{ an_exercicio: number; nr_periodo: number }>(`
    SELECT an_exercicio, nr_periodo
    FROM dw.fato_siconfi_rreo
    WHERE NOT (an_exercicio = $1 AND nr_periodo = $2)
    GROUP BY an_exercicio, nr_periodo
    ORDER BY an_exercicio DESC, nr_periodo DESC
    LIMIT 1
  `, [ANO_RECENTE, PERIODO_RECENTE]);

  if (periodoAnteriorRows.length > 0) {
    const { an_exercicio: ANO_ANT, nr_periodo: PER_ANT } = periodoAnteriorRows[0];
    const resumosAnterior = new Map(
      resumos
        .filter(r => r.an_exercicio === ANO_ANT && r.nr_periodo === PER_ANT)
        .map(r => [r.id_municipio, r])
    );

    for (const r of resumos) {
      if (r.an_exercicio !== ANO_RECENTE || r.nr_periodo !== PERIODO_RECENTE) continue;
      if (r.total_despesas === null) continue;
      const ant = resumosAnterior.get(r.id_municipio);
      if (!ant || ant.total_despesas === null || ant.total_despesas === 0) continue;

      const variacao = Math.abs((r.total_despesas - ant.total_despesas) / ant.total_despesas);
      if (variacao > 0.5) {
        alertas.push({
          an_exercicio: r.an_exercicio,
          nr_periodo: r.nr_periodo,
          id_municipio: r.id_municipio,
          no_municipio: r.no_municipio,
          tipo_alerta: "rreo_variacao_atipica",
          nivel: variacao > 1.0 ? "ALTO" : "MEDIO",
          descricao: `Variação atípica de ${(variacao * 100).toFixed(1)}% nas despesas em relação ao período anterior`,
          valor_observado: r.total_despesas,
          valor_referencia: ant.total_despesas,
          detalhe_json: { variacao_pct: +(variacao * 100).toFixed(1), periodo_anterior: `${PER_ANT}/${ANO_ANT}` },
        });
      }
    }
  }

  console.log(`[mart:siconfi-rreo] Alertas gerados: ${alertas.length}`);

  await withPgTransaction(async (client) => {

    // ── 4. Rebuild mart.siconfi_rreo_resumo_municipio ──
    await client.query(`DELETE FROM mart.siconfi_rreo_resumo_municipio`);
    for (const r of resumos) {
      await client.query(`
        INSERT INTO mart.siconfi_rreo_resumo_municipio
          (an_exercicio, nr_periodo, id_municipio, no_municipio,
           total_receitas, total_despesas, resultado_orcamentario, total_contas, situacao_envio, atualizado_em)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'COM_DADO', now())
        ON CONFLICT (an_exercicio, nr_periodo, id_municipio) DO UPDATE SET
          no_municipio          = EXCLUDED.no_municipio,
          total_receitas        = EXCLUDED.total_receitas,
          total_despesas        = EXCLUDED.total_despesas,
          resultado_orcamentario = EXCLUDED.resultado_orcamentario,
          total_contas          = EXCLUDED.total_contas,
          situacao_envio        = EXCLUDED.situacao_envio,
          atualizado_em         = now()
      `, [
        r.an_exercicio,
        r.nr_periodo,
        r.id_municipio,
        r.no_municipio,
        r.total_receitas,
        r.total_despesas,
        r.total_receitas !== null && r.total_despesas !== null
          ? r.total_receitas - r.total_despesas
          : null,
        r.total_contas,
      ]);
    }
    console.log(`[mart:siconfi-rreo] ✓ siconfi_rreo_resumo_municipio (${resumos.length} linhas)`);

    // ── 5. Rebuild mart.siconfi_rreo_alertas ──
    await client.query(`DELETE FROM mart.siconfi_rreo_alertas`);
    for (const a of alertas) {
      await client.query(`
        INSERT INTO mart.siconfi_rreo_alertas
          (an_exercicio, nr_periodo, id_municipio, no_municipio,
           tipo_alerta, nivel, descricao, valor_observado, valor_referencia, detalhe_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        a.an_exercicio, a.nr_periodo, a.id_municipio, a.no_municipio,
        a.tipo_alerta, a.nivel, a.descricao, a.valor_observado, a.valor_referencia,
        a.detalhe_json ? JSON.stringify(a.detalhe_json) : null,
      ]);
    }
    console.log(`[mart:siconfi-rreo] ✓ siconfi_rreo_alertas (${alertas.length} alertas)`);

    // ── 6. Rebuild mart.siconfi_rreo_alertas_home ──
    const alertasHome = alertas
      .filter(a => a.nivel === "CRITICO" || a.nivel === "ALTO")
      .filter(a => a.an_exercicio === ANO_RECENTE && a.nr_periodo === PERIODO_RECENTE)
      .sort((a, b) => {
        const pa = nivelPrioridade(a.nivel);
        const pb = nivelPrioridade(b.nivel);
        if (pa !== pb) return pa - pb;
        return (a.tipo_alerta).localeCompare(b.tipo_alerta);
      })
      .slice(0, 30);

    await client.query(`DELETE FROM mart.siconfi_rreo_alertas_home`);
    for (const a of alertasHome) {
      await client.query(`
        INSERT INTO mart.siconfi_rreo_alertas_home
          (an_exercicio, nr_periodo, id_municipio, no_municipio,
           tipo_alerta, nivel, descricao, valor_observado, valor_referencia, prioridade)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        a.an_exercicio, a.nr_periodo, a.id_municipio, a.no_municipio,
        a.tipo_alerta, a.nivel, a.descricao, a.valor_observado, a.valor_referencia,
        nivelPrioridade(a.nivel),
      ]);
    }
    console.log(`[mart:siconfi-rreo] ✓ siconfi_rreo_alertas_home (${alertasHome.length} alertas)`);

    // ── 7. Rebuild mart.siconfi_rreo_resumo_home ──
    const criticos = alertas.filter(a => a.nivel === "CRITICO" && a.an_exercicio === ANO_RECENTE && a.nr_periodo === PERIODO_RECENTE).length;
    const altos    = alertas.filter(a => a.nivel === "ALTO"    && a.an_exercicio === ANO_RECENTE && a.nr_periodo === PERIODO_RECENTE).length;
    const comDado  = municipiosComDado.size;

    await client.query(`DELETE FROM mart.siconfi_rreo_resumo_home`);
    await client.query(`
      INSERT INTO mart.siconfi_rreo_resumo_home
        (an_exercicio, nr_periodo, municipios_com_dado, municipios_sem_dado,
         total_municipios, total_alertas, alertas_criticos, alertas_altos)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      ANO_RECENTE, PERIODO_RECENTE,
      comDado,
      TOTAL_MUNICIPIOS - comDado,
      TOTAL_MUNICIPIOS,
      alertas.filter(a => a.an_exercicio === ANO_RECENTE && a.nr_periodo === PERIODO_RECENTE).length,
      criticos,
      altos,
    ]);
    console.log(`[mart:siconfi-rreo] ✓ siconfi_rreo_resumo_home (${comDado}/${TOTAL_MUNICIPIOS} com dado, ${criticos} críticos, ${altos} altos)`);
  });

  const duracao = Date.now() - inicio;
  console.log(`[mart:siconfi-rreo] Refresh concluído em ${duracao}ms.`);

  await pgQuery(`
    INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
    VALUES ('mart:siconfi-rreo', 'OK', 'Refresh completo das marts SICONFI/RREO', $1, $2)
  `, [resumos.length, duracao]);
}

if (require.main === module) {
  executarMartSiconfiRreo()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[mart:siconfi-rreo] Erro:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
