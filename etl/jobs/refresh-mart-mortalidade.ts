/**
 * refresh-mart-mortalidade.ts
 *
 * Reconstrói mart.mortalidade_resumo_municipio, mart.mortalidade_alertas,
 * mart.mortalidade_alertas_home e mart.mortalidade_resumo_home
 * a partir de dw.fato_sim_obito (SIM).
 *
 * Prioridade: dados SIM_API_V1 quando disponíveis para o ano/município.
 * Regra TMI: somente calcular quando nascidos_vivos > 0.
 * Alertas:
 *   - mortalidade_infantil_alta: CRITICO/ALTO baseado em mediana estadual
 *   - obito_infantil_recente_sem_denominador: ALTO quando há óbitos infantis mas sem SINASC
 *   - obito_materno_registrado: CRITICO
 *   - obito_fetal_elevado: ALTO se acima da mediana + 50%
 *
 * Uso: cd etl && npm run mart:mortalidade
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";
import { executarMartComAuditoria } from "../lib/auditoria";

const MODULO = "mart_mortalidade";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ObitosMunicipio {
  codigo_municipio_residencia: string | null;
  ano_obito: number;
  total_obitos_nao_fetais: number;
  obitos_infantis: number;
  obitos_neonatais: number;
  obitos_pos_neonatais: number;
  obitos_maternos: number;
  obitos_fetais: number;
  nascimentos_baixo_peso: number;
  nascimentos_com_peso: number;
  sem_assistencia: number;
  total_obitos: number;
  fonte_dado: string;
}

interface DimMunicipio {
  codigo_municipio_ibge: string;
  nome_municipio: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const sorted = [...valores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ─── Leitura de dimensão de municípios ───────────────────────────────────────

async function lerMunicipios(): Promise<DimMunicipio[]> {
  // Tentar dim_municipio, fallback para lista fixa AC
  try {
    const rows = await pgQuery<DimMunicipio>(
      `SELECT codigo_municipio_ibge, nome_municipio FROM dim_municipio WHERE uf = 'AC' ORDER BY nome_municipio`
    );
    if (rows.length > 0) return rows;
  } catch { /* tabela pode não existir */ }

  // Fallback: buscar municípios únicos dos dados SIM
  const rows = await pgQuery<{ codigo_municipio_residencia: string }>(
    `SELECT DISTINCT codigo_municipio_residencia
     FROM dw.fato_sim_obito
     WHERE codigo_municipio_residencia IS NOT NULL
       AND (uf_residencia = 'AC' OR codigo_municipio_residencia LIKE '12%')
       AND codigo_municipio_residencia NOT IN ('12000', '120000')
       AND length(codigo_municipio_residencia) = 6`
  );
  return rows.map(r => ({
    codigo_municipio_ibge: r.codigo_municipio_residencia,
    nome_municipio: r.codigo_municipio_residencia,
  }));
}

// ─── Reconstrução do mart ─────────────────────────────────────────────────────

async function reconstruirMart(): Promise<void> {
  console.log("Lendo óbitos de dw.fato_sim_obito...");

  const obitos = await pgQuery<ObitosMunicipio>(`
    SELECT
      codigo_municipio_residencia,
      ano_obito,
      COUNT(*) FILTER (WHERE tipo_obito = 'nao_fetal' OR tipo_obito IS NULL)::int AS total_obitos_nao_fetais,
      COUNT(*) FILTER (WHERE is_obito_infantil = true)::int AS obitos_infantis,
      COUNT(*) FILTER (WHERE is_obito_neonatal = true)::int AS obitos_neonatais,
      COUNT(*) FILTER (WHERE is_obito_pos_neonatal = true)::int AS obitos_pos_neonatais,
      COUNT(*) FILTER (WHERE is_obito_materno = true)::int AS obitos_maternos,
      COUNT(*) FILTER (WHERE tipo_obito = 'fetal')::int AS obitos_fetais,
      COUNT(*) FILTER (WHERE peso_gramas IS NOT NULL AND peso_gramas < 2500)::int AS nascimentos_baixo_peso,
      COUNT(peso_gramas)::int AS nascimentos_com_peso,
      COUNT(*) FILTER (WHERE assistencia_medica IN ('2', 'nao', 'NAO'))::int AS sem_assistencia,
      COUNT(*)::int AS total_obitos,
      fonte_dado
    FROM dw.fato_sim_obito
    WHERE (uf_residencia = 'AC' OR codigo_municipio_residencia LIKE '12%')
      AND codigo_municipio_residencia NOT IN ('12000', '120000')
      AND length(codigo_municipio_residencia) = 6
    GROUP BY codigo_municipio_residencia, ano_obito, fonte_dado
  `);

  console.log(`  ${obitos.length} combinações município/ano encontradas`);

  // Buscar nomes dos municípios via saude_resumo_municipio ou dim
  const dimRows = await pgQuery<{ codigo_municipio_ibge: string; nome_municipio: string }>(
    `SELECT DISTINCT codigo_municipio_ibge, nome_municipio FROM mart.saude_resumo_municipio WHERE codigo_municipio_ibge IS NOT NULL`
  ).catch(() => [] as { codigo_municipio_ibge: string; nome_municipio: string }[]);

  const nomes = new Map<string, string>(dimRows.map(r => [r.codigo_municipio_ibge, r.nome_municipio]));

  // Calcular medianas por ano para alertas
  const anosUnicos = [...new Set(obitos.map(o => o.ano_obito))];
  const mediaInfantilPorAno = new Map<number, number | null>();
  const mediaFetalPorAno = new Map<number, number | null>();

  for (const ano of anosUnicos) {
    const valInfantis = obitos.filter(o => o.ano_obito === ano).map(o => o.obitos_infantis);
    const valFetais = obitos.filter(o => o.ano_obito === ano).map(o => o.obitos_fetais);
    mediaInfantilPorAno.set(ano, mediana(valInfantis));
    mediaFetalPorAno.set(ano, mediana(valFetais));
  }

  console.log("Reconstruindo mart.mortalidade_resumo_municipio...");

  await withPgTransaction(async (client) => {
    await client.query(`DELETE FROM mart.mortalidade_resumo_municipio`);
    await client.query(`DELETE FROM mart.mortalidade_alertas`);
    await client.query(`DELETE FROM mart.mortalidade_alertas_home`);
    await client.query(`DELETE FROM mart.mortalidade_resumo_home`);

    for (const row of obitos) {
      const codIbge = row.codigo_municipio_residencia;
      const nomeMun = codIbge ? (nomes.get(codIbge) ?? codIbge) : "Não identificado";

      const nascidosVivos = 0; // SINASC não disponível ainda
      const tmi = nascidosVivos > 0
        ? Math.round((row.obitos_infantis / nascidosVivos) * 1000 * 10) / 10
        : null;

      const percBaixoPeso = row.nascimentos_com_peso > 0
        ? Math.round((row.nascimentos_baixo_peso / row.nascimentos_com_peso) * 100 * 10) / 10
        : null;

      await client.query(
        `INSERT INTO mart.mortalidade_resumo_municipio (
          codigo_municipio_ibge, nome_municipio, ano,
          nascidos_vivos, obitos_infantis, obitos_neonatais, obitos_pos_neonatais,
          obitos_maternos, obitos_fetais, total_obitos,
          taxa_mortalidade_infantil, percentual_baixo_peso,
          obitos_sem_assistencia_medica,
          obitos_infantis_sem_denominador, indicador_taxa_disponivel,
          ano_mais_recente_sim, fonte_dado
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (nome_municipio, ano) DO UPDATE SET
          obitos_infantis = EXCLUDED.obitos_infantis,
          obitos_neonatais = EXCLUDED.obitos_neonatais,
          obitos_pos_neonatais = EXCLUDED.obitos_pos_neonatais,
          obitos_maternos = EXCLUDED.obitos_maternos,
          obitos_fetais = EXCLUDED.obitos_fetais,
          total_obitos = EXCLUDED.total_obitos,
          taxa_mortalidade_infantil = EXCLUDED.taxa_mortalidade_infantil,
          percentual_baixo_peso = EXCLUDED.percentual_baixo_peso,
          obitos_sem_assistencia_medica = EXCLUDED.obitos_sem_assistencia_medica,
          obitos_infantis_sem_denominador = EXCLUDED.obitos_infantis_sem_denominador,
          indicador_taxa_disponivel = EXCLUDED.indicador_taxa_disponivel,
          ano_mais_recente_sim = EXCLUDED.ano_mais_recente_sim,
          fonte_dado = EXCLUDED.fonte_dado,
          atualizado_em = now()`,
        [
          codIbge, nomeMun, row.ano_obito,
          nascidosVivos, row.obitos_infantis, row.obitos_neonatais, row.obitos_pos_neonatais,
          row.obitos_maternos, row.obitos_fetais, row.total_obitos,
          tmi, percBaixoPeso,
          row.sem_assistencia,
          nascidosVivos === 0 && row.obitos_infantis > 0, // sem denominador
          nascidosVivos > 0,
          row.ano_obito, row.fonte_dado,
        ]
      );

      // Gerar alertas
      const medInfantil = mediaInfantilPorAno.get(row.ano_obito);
      const medFetal = mediaFetalPorAno.get(row.ano_obito);

      // Alerta: óbito infantil sem denominador
      if (row.obitos_infantis > 0 && nascidosVivos === 0) {
        await client.query(
          `INSERT INTO mart.mortalidade_alertas
           (codigo_municipio_ibge, nome_municipio, ano, tipo_alerta, nivel, descricao, valor_observado)
           VALUES ($1,$2,$3,'obito_infantil_recente_sem_denominador','ALTO',$4,$5)`,
          [codIbge, nomeMun, row.ano_obito,
           `${nomeMun} registrou ${row.obitos_infantis} óbito(s) infantil(is) em ${row.ano_obito}, mas não há dados SINASC para calcular a TMI.`,
           row.obitos_infantis]
        );
      }

      // Alerta: mortalidade infantil alta
      if (medInfantil != null && row.obitos_infantis > 0) {
        if (row.obitos_infantis >= medInfantil * 2.0 && medInfantil > 0) {
          await client.query(
            `INSERT INTO mart.mortalidade_alertas
             (codigo_municipio_ibge, nome_municipio, ano, tipo_alerta, nivel, descricao, valor_observado, valor_referencia)
             VALUES ($1,$2,$3,'mortalidade_infantil_alta','CRITICO',$4,$5,$6)`,
            [codIbge, nomeMun, row.ano_obito,
             `${nomeMun} tem ${row.obitos_infantis} óbitos infantis em ${row.ano_obito}, acima de 2x a mediana estadual.`,
             row.obitos_infantis, medInfantil]
          );
        } else if (row.obitos_infantis >= medInfantil * 1.5 && medInfantil > 0) {
          await client.query(
            `INSERT INTO mart.mortalidade_alertas
             (codigo_municipio_ibge, nome_municipio, ano, tipo_alerta, nivel, descricao, valor_observado, valor_referencia)
             VALUES ($1,$2,$3,'mortalidade_infantil_alta','ALTO',$4,$5,$6)`,
            [codIbge, nomeMun, row.ano_obito,
             `${nomeMun} tem ${row.obitos_infantis} óbitos infantis em ${row.ano_obito}, acima de 1,5x a mediana estadual.`,
             row.obitos_infantis, medInfantil]
          );
        }
      }

      // Alerta: óbito materno
      if (row.obitos_maternos > 0) {
        await client.query(
          `INSERT INTO mart.mortalidade_alertas
           (codigo_municipio_ibge, nome_municipio, ano, tipo_alerta, nivel, descricao, valor_observado)
           VALUES ($1,$2,$3,'obito_materno_registrado','CRITICO',$4,$5)`,
          [codIbge, nomeMun, row.ano_obito,
           `${nomeMun} registrou ${row.obitos_maternos} óbito(s) materno(s) em ${row.ano_obito}.`,
           row.obitos_maternos]
        );
      }

      // Alerta: óbito fetal elevado
      if (medFetal != null && medFetal > 0 && row.obitos_fetais >= medFetal * 1.5) {
        await client.query(
          `INSERT INTO mart.mortalidade_alertas
           (codigo_municipio_ibge, nome_municipio, ano, tipo_alerta, nivel, descricao, valor_observado, valor_referencia)
           VALUES ($1,$2,$3,'obito_fetal_elevado','ALTO',$4,$5,$6)`,
          [codIbge, nomeMun, row.ano_obito,
           `${nomeMun} tem ${row.obitos_fetais} óbitos fetais em ${row.ano_obito}, acima de 1,5x a mediana estadual.`,
           row.obitos_fetais, medFetal]
        );
      }
    }

    // Preencher alertas_home (máx 30, CRITICO/ALTO, por prioridade)
    await client.query(`
      INSERT INTO mart.mortalidade_alertas_home
        (codigo_municipio_ibge, nome_municipio, tipo_alerta, nivel, descricao, valor_observado, valor_referencia, ano, prioridade)
      SELECT codigo_municipio_ibge, nome_municipio, tipo_alerta, nivel, descricao, valor_observado, valor_referencia, ano,
        CASE nivel WHEN 'CRITICO' THEN 1 WHEN 'ALTO' THEN 2 ELSE 3 END AS prioridade
      FROM mart.mortalidade_alertas
      WHERE nivel IN ('CRITICO','ALTO')
      ORDER BY (CASE nivel WHEN 'CRITICO' THEN 1 WHEN 'ALTO' THEN 2 ELSE 3 END), ano DESC
      LIMIT 30
    `);

    // Resumo home por ano
    const anos = await pgQuery<{ ano: number }>(
      `SELECT DISTINCT ano FROM mart.mortalidade_resumo_municipio ORDER BY ano DESC LIMIT 3`
    );
    for (const { ano } of anos) {
      const totais = await pgQuery<{
        nascidos_vivos: number;
        obitos_infantis: number;
        obitos_maternos: number;
        obitos_fetais: number;
        total_criticos: number;
        total_altos: number;
      }>(
        `SELECT
          SUM(nascidos_vivos)::int AS nascidos_vivos,
          SUM(obitos_infantis)::int AS obitos_infantis,
          SUM(obitos_maternos)::int AS obitos_maternos,
          SUM(obitos_fetais)::int AS obitos_fetais,
          COUNT(*) FILTER (WHERE nivel='CRITICO')::int AS total_criticos,
          COUNT(*) FILTER (WHERE nivel='ALTO')::int AS total_altos
        FROM mart.mortalidade_resumo_municipio m
        LEFT JOIN mart.mortalidade_alertas a USING (nome_municipio, ano)
        WHERE m.ano = $1`,
        [ano]
      );
      const t = totais[0];
      const tmi = t.nascidos_vivos > 0
        ? Math.round((t.obitos_infantis / t.nascidos_vivos) * 1000 * 10) / 10
        : null;

      await client.query(
        `INSERT INTO mart.mortalidade_resumo_home
         (ano, nascidos_vivos_total, obitos_infantis_total, obitos_maternos_total, obitos_fetais_total,
          taxa_mortalidade_infantil, total_criticos, total_altos)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [ano, t.nascidos_vivos, t.obitos_infantis, t.obitos_maternos, t.obitos_fetais,
         tmi, t.total_criticos, t.total_altos]
      );
    }
  });

  console.log("✓ mart.mortalidade_resumo_municipio reconstruído");
  console.log("✓ mart.mortalidade_alertas gerados");
  console.log("✓ mart.mortalidade_resumo_home atualizado");
}

// ─── ETL principal ────────────────────────────────────────────────────────────

export async function executarETL(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Mart Mortalidade — Reconstrução                     ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  try {
    await executarMartComAuditoria(
      {
        modulo: MODULO,
        origem: "dw.fato_mortalidade",
        destino: "mart.mortalidade_*",
      },
      async () => {
        await reconstruirMart();
        return { mensagem: "Mart mortalidade reconstruído" };
      },
    );
    console.log(`\n✓ Concluído.`);
  } finally {
    await closePgPool();
  }
}

if (require.main === module) {
  executarETL().then(() => process.exit(0)).catch((err) => {
    console.error("Erro fatal:", (err as Error).message);
    process.exit(1);
  });
}
