/**
 * refresh-mart-painel-educacao.ts
 *
 * Fase 17B — Reconstrói mart.painel_educacao_municipio cruzando:
 *   - última edição do IDEB (rede "Pública") por município × etapa
 *   - último ano de Taxas de Rendimento (localizacao="Total", dependencia="Total")
 *
 * O mart alimenta /api/educacao/mapa-acre (a ser criado na Fase 17C) e
 * substitui os mocks em src/components/Maps/MapaAcreContent.tsx e
 * src/components/home/GraficoIdeb.tsx.
 *
 * Uso: cd etl && npx ts-node jobs/refresh-mart-painel-educacao.ts
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

const REDE_PUBLICO = "Pública";   // rede agregada que a planilha INEP costuma trazer
const LOCALIZACAO_TOTAL = "Total";
const DEPENDENCIA_TOTAL = "Total";

async function executar() {
  const inicio = Date.now();
  console.log("[mart-painel-educacao] Reconstruindo mart.painel_educacao_municipio…");

  // Última edição IDEB e último ano de rendimento — globais
  const [maxIdebRow] = await pgQuery<{ edicao: number | null }>(
    `SELECT MAX(edicao) AS edicao FROM dw.fato_inep_ideb_municipal`,
  );
  const [maxRendRow] = await pgQuery<{ ano: number | null }>(
    `SELECT MAX(ano) AS ano FROM dw.fato_inep_rendimento_municipal`,
  );
  const edicaoIdeb = maxIdebRow?.edicao ?? null;
  const anoRend   = maxRendRow?.ano   ?? null;
  console.log(`  Última edição IDEB     : ${edicaoIdeb ?? "(sem dados)"}`);
  console.log(`  Último ano Rendimento  : ${anoRend ?? "(sem dados)"}`);

  if (!edicaoIdeb && !anoRend) {
    console.log("  Nada a fazer — fato_inep_ideb_municipal e fato_inep_rendimento_municipal vazias.");
    return;
  }

  await withPgTransaction(async (client) => {
    await client.query(`TRUNCATE mart.painel_educacao_municipio`);

    // Conjunto de municípios da última edição IDEB Pública + último ano rendimento Total/Total
    await client.query(`
      INSERT INTO mart.painel_educacao_municipio (cod_municipio, no_municipio, sg_uf, atualizado_em)
      SELECT DISTINCT cod_municipio, MAX(no_municipio), MAX(sg_uf), now()
      FROM (
        SELECT cod_municipio, no_municipio, sg_uf
        FROM dw.fato_inep_ideb_municipal
        WHERE edicao = $1 AND rede = $2 AND $1 IS NOT NULL
        UNION ALL
        SELECT cod_municipio, no_municipio, sg_uf
        FROM dw.fato_inep_rendimento_municipal
        WHERE ano = $3 AND localizacao = $4 AND dependencia = $5 AND $3 IS NOT NULL
      ) u
      GROUP BY cod_municipio
    `, [edicaoIdeb, REDE_PUBLICO, anoRend, LOCALIZACAO_TOTAL, DEPENDENCIA_TOTAL]);

    if (edicaoIdeb !== null) {
      // IDEB observado/meta por etapa (último ano de cada município dentro da edição)
      await client.query(`
        UPDATE mart.painel_educacao_municipio m
        SET edicao_ideb = $1,
            ideb_publico_ai = sub.ideb_ai,
            ideb_publico_af = sub.ideb_af,
            ideb_publico_em = sub.ideb_em,
            meta_publico_ai = sub.meta_ai,
            meta_publico_af = sub.meta_af,
            meta_publico_em = sub.meta_em,
            atualizado_em   = now()
        FROM (
          SELECT
            cod_municipio,
            MAX(CASE WHEN etapa = 'AI' AND ano = max_ano_ai THEN ideb_observado END) AS ideb_ai,
            MAX(CASE WHEN etapa = 'AF' AND ano = max_ano_af THEN ideb_observado END) AS ideb_af,
            MAX(CASE WHEN etapa = 'EM' AND ano = max_ano_em THEN ideb_observado END) AS ideb_em,
            MAX(CASE WHEN etapa = 'AI' AND ano = max_ano_ai THEN ideb_projetado END) AS meta_ai,
            MAX(CASE WHEN etapa = 'AF' AND ano = max_ano_af THEN ideb_projetado END) AS meta_af,
            MAX(CASE WHEN etapa = 'EM' AND ano = max_ano_em THEN ideb_projetado END) AS meta_em
          FROM (
            SELECT f.*,
              MAX(CASE WHEN etapa = 'AI' AND ideb_observado IS NOT NULL THEN ano END)
                OVER (PARTITION BY cod_municipio) AS max_ano_ai,
              MAX(CASE WHEN etapa = 'AF' AND ideb_observado IS NOT NULL THEN ano END)
                OVER (PARTITION BY cod_municipio) AS max_ano_af,
              MAX(CASE WHEN etapa = 'EM' AND ideb_observado IS NOT NULL THEN ano END)
                OVER (PARTITION BY cod_municipio) AS max_ano_em
            FROM dw.fato_inep_ideb_municipal f
            WHERE edicao = $1 AND rede = $2
          ) f2
          GROUP BY cod_municipio
        ) sub
        WHERE m.cod_municipio = sub.cod_municipio
      `, [edicaoIdeb, REDE_PUBLICO]);
    }

    if (anoRend !== null) {
      await client.query(`
        UPDATE mart.painel_educacao_municipio m
        SET ano_rendimento        = $1,
            aprovacao_fund_total  = r.aprov_fund_total,
            aprovacao_em_total    = r.aprov_em_total,
            reprovacao_fund_total = r.reprov_fund_total,
            reprovacao_em_total   = r.reprov_em_total,
            abandono_fund_total   = r.abandono_fund_total,
            abandono_em_total     = r.abandono_em_total,
            atualizado_em         = now()
        FROM dw.fato_inep_rendimento_municipal r
        WHERE m.cod_municipio = r.cod_municipio
          AND r.ano           = $1
          AND r.localizacao   = $2
          AND r.dependencia   = $3
      `, [anoRend, LOCALIZACAO_TOTAL, DEPENDENCIA_TOTAL]);
    }
  });

  const [linhas] = await pgQuery<{ n: string }>(`SELECT COUNT(*)::text AS n FROM mart.painel_educacao_municipio`);
  const [comIdeb] = await pgQuery<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM mart.painel_educacao_municipio
      WHERE ideb_publico_ai IS NOT NULL OR ideb_publico_af IS NOT NULL OR ideb_publico_em IS NOT NULL`,
  );
  const [comRend] = await pgQuery<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM mart.painel_educacao_municipio WHERE ano_rendimento IS NOT NULL`,
  );
  console.log(`  ✓ mart.painel_educacao_municipio: ${linhas?.n ?? 0} municípios`);
  console.log(`     com IDEB       : ${comIdeb?.n ?? 0}`);
  console.log(`     com Rendimento : ${comRend?.n ?? 0}`);

  const total = parseInt(linhas?.n ?? "0", 10);
  try {
    await pgQuery(
      `INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
       VALUES ('mart_painel_educacao', $1, $2, $3, $4)`,
      [
        total > 0 ? "OK" : "PARCIAL",
        `${total} municípios consolidados · com IDEB=${comIdeb?.n ?? 0} · com Rendimento=${comRend?.n ?? 0}`,
        total,
        Date.now() - inicio,
      ],
    );
  } catch {
    /* audit.etl_log pode não existir — silencioso */
  }
}

if (require.main === module) {
  executar()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[mart-painel-educacao] Erro fatal:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}

export { executar as executarRefreshMartPainelEducacao };
