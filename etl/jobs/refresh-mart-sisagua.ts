/**
 * refresh-mart-sisagua.ts
 *
 * Reconstrói a camada mart do SISAGUA (Qualidade da Água):
 *   - mart.sisagua_resumo_municipio  (uma linha por município)
 *   - mart.sisagua_alertas           (todos os alertas)
 *   - mart.sisagua_alertas_home      (máx 30, CRITICO/ALTO)
 *   - mart.sisagua_resumo_home       (totais para o card da home)
 *
 * Fonte: dw.fato_sisagua_parametro
 *
 * Regras de alerta:
 *   sisagua_ecoli_detectada         — CRITICO — total_ecoli > 0
 *   sisagua_coliformes_detectados   — ALTO    — total_coliformes > 0 (e não CRITICO)
 *   sisagua_amostra_fora_padrao     — ALTO    — total_fora_padrao > 0 (e não CRITICO)
 *   sisagua_sem_dado_recente        — MEDIO   — município sem qualquer dado SISAGUA
 *   sisagua_baixa_quantidade_amostras — MEDIO — total_amostras < mediana
 *
 * Uso: cd etl && npm run mart:sisagua
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Municípios do Acre (22) — fallback quando sem dados na fonte
// ---------------------------------------------------------------------------

const MUNICIPIOS_ACRE: Array<{ codigo: string; nome: string }> = [
  { codigo: "1200013", nome: "Acrelândia" },
  { codigo: "1200054", nome: "Assis Brasil" },
  { codigo: "1200104", nome: "Brasiléia" },
  { codigo: "1200138", nome: "Bujari" },
  { codigo: "1200179", nome: "Capixaba" },
  { codigo: "1200203", nome: "Cruzeiro do Sul" },
  { codigo: "1200252", nome: "Epitaciolândia" },
  { codigo: "1200302", nome: "Feijó" },
  { codigo: "1200328", nome: "Jordão" },
  { codigo: "1200336", nome: "Mâncio Lima" },
  { codigo: "1200344", nome: "Manoel Urbano" },
  { codigo: "1200351", nome: "Marechal Thaumaturgo" },
  { codigo: "1200385", nome: "Plácido de Castro" },
  { codigo: "1200393", nome: "Porto Walter" },
  { codigo: "1200401", nome: "Rio Branco" },
  { codigo: "1200427", nome: "Rodrigues Alves" },
  { codigo: "1200435", nome: "Santa Rosa do Purus" },
  { codigo: "1200450", nome: "Senador Guiomard" },
  { codigo: "1200500", nome: "Sena Madureira" },
  { codigo: "1200609", nome: "Tarauacá" },
  { codigo: "1200708", nome: "Xapuri" },
  { codigo: "1200807", nome: "Porto Acre" },
];

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface ResumoMunicipio {
  codigo:               string;
  nome:                 string | null;
  uf:                   string | null;
  totalAmostras:        number;
  totalForaPadrao:      number;
  totalEcoli:           number;
  totalColiformes:      number;
  totalCloroBaixo:      number;
  totalTurbidezFora:    number;
  percentualForaPadrao: number | null;
  dataUltimaColeta:     string | null;
}

interface AlertaInsert {
  codigoMunicipioIbge: string | null;
  nomeMunicipio:       string | null;
  tipoAlerta:          string;
  nivel:               string;
  descricao:           string;
  valorObservado:      number | null;
  valorReferencia:     number | null;
  detalheJson:         object | null;
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
// Lê dados agregados por município do DW
// ---------------------------------------------------------------------------

interface FatoAgregado {
  codigo_municipio_ibge:   string;
  nome_municipio:          string | null;
  uf:                      string | null;
  total_amostras:          string; // count retorna string
  total_fora_padrao:       string;
  total_ecoli:             string;
  total_coliformes:        string;
  total_cloro_baixo:       string;
  total_turbidez_fora:     string;
  data_ultima_coleta:      string | null;
  competencia_mais_recente: string | null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarRefreshMartSisagua(): Promise<void> {
  const inicio = Date.now();
  console.log("[mart:sisagua] Iniciando refresh das marts SISAGUA...");

  // ── 1. Verifica se há dados ──
  const [countRow] = await pgQuery<{ c: string }>(
    `SELECT count(*)::text AS c FROM dw.fato_sisagua_parametro`
  ).catch(() => [{ c: "0" }] as Array<{ c: string }>);
  const totalFato = parseInt(countRow?.c ?? "0", 10);
  console.log(`[mart:sisagua] dw.fato_sisagua_parametro: ${totalFato} registros.`);

  // ── 2. Agrega por município (competência mais recente via DISTINCT ON) ──
  const agregados = await pgQuery<FatoAgregado>(`
    WITH competencia_recente AS (
      SELECT DISTINCT ON (codigo_municipio_ibge)
        codigo_municipio_ibge,
        nome_municipio,
        uf,
        competencia AS competencia_mais_recente
      FROM dw.fato_sisagua_parametro
      WHERE codigo_municipio_ibge IS NOT NULL
      ORDER BY codigo_municipio_ibge, competencia DESC NULLS LAST
    ),
    totais AS (
      SELECT
        f.codigo_municipio_ibge,
        -- total_amostras: soma das amostras analisadas de E. coli (parâmetro canônico sempre presente)
        coalesce(sum(f.valor) FILTER (
          WHERE f.parametro ILIKE '%escherichia%'
            AND f.resultado ILIKE '%amostras analisadas%'
        ), 0)::text                                                                 AS total_amostras,
        -- total_fora_padrao: amostras com qualquer contaminante em presença
        coalesce(sum(f.valor) FILTER (
          WHERE f.resultado ILIKE '%presença%' OR f.resultado = 'PRESENTE'
        ), 0)::text                                                                 AS total_fora_padrao,
        -- total_ecoli: amostras com presença de Escherichia coli
        coalesce(sum(f.valor) FILTER (
          WHERE f.parametro ILIKE '%escherichia%'
            AND (f.resultado ILIKE '%presença%' OR f.resultado = 'PRESENTE')
        ), 0)::text                                                                 AS total_ecoli,
        -- total_coliformes: amostras com presença de coliformes totais
        coalesce(sum(f.valor) FILTER (
          WHERE f.parametro ILIKE '%coliforme%'
            AND (f.resultado ILIKE '%presença%' OR f.resultado = 'PRESENTE')
        ), 0)::text                                                                 AS total_coliformes,
        -- total_cloro_baixo: amostras com cloro residual abaixo do mínimo (< 0,2 mg/L)
        coalesce(sum(f.valor) FILTER (
          WHERE (f.parametro ILIKE '%cloro%' OR f.parametro ILIKE '%clorine%')
            AND f.resultado ILIKE '%< 0,2%'
        ), 0)::text                                                                 AS total_cloro_baixo,
        -- total_turbidez_fora: amostras com turbidez acima de 5 uT
        coalesce(sum(f.valor) FILTER (
          WHERE f.parametro ILIKE '%turbidez%'
            AND f.resultado ILIKE '%> 5,0 uT%'
        ), 0)::text                                                                 AS total_turbidez_fora,
        -- data_coleta é nulo na API; usa competencia (YYYYMM) → primeiro dia do mês
        to_char(to_date(max(f.competencia), 'YYYYMM'), 'YYYY-MM-DD')               AS data_ultima_coleta
      FROM dw.fato_sisagua_parametro f
      WHERE f.codigo_municipio_ibge IS NOT NULL
        AND f.competencia >= to_char(date_trunc('month', now()) - interval '5 months', 'YYYYMM')
      GROUP BY f.codigo_municipio_ibge
    )
    SELECT
      cr.codigo_municipio_ibge,
      cr.nome_municipio,
      cr.uf,
      coalesce(t.total_amostras, '0')     AS total_amostras,
      coalesce(t.total_fora_padrao, '0')  AS total_fora_padrao,
      coalesce(t.total_ecoli, '0')        AS total_ecoli,
      coalesce(t.total_coliformes, '0')   AS total_coliformes,
      coalesce(t.total_cloro_baixo, '0')  AS total_cloro_baixo,
      coalesce(t.total_turbidez_fora, '0') AS total_turbidez_fora,
      t.data_ultima_coleta,
      cr.competencia_mais_recente
    FROM competencia_recente cr
    LEFT JOIN totais t USING (codigo_municipio_ibge)
  `).catch(() => [] as FatoAgregado[]);

  console.log(`[mart:sisagua] ${agregados.length} municípios com dados no DW.`);

  // ── 3. Monta mapa de resumos ──
  const resumoMap = new Map<string, ResumoMunicipio>();

  for (const row of agregados) {
    const totalAmostras   = parseInt(row.total_amostras, 10)   || 0;
    const totalForaPadrao = parseInt(row.total_fora_padrao, 10) || 0;
    const percentual = totalAmostras > 0 ? Math.round((totalForaPadrao / totalAmostras) * 1000) / 10 : null;

    resumoMap.set(row.codigo_municipio_ibge, {
      codigo:               row.codigo_municipio_ibge,
      nome:                 row.nome_municipio,
      uf:                   row.uf,
      totalAmostras,
      totalForaPadrao,
      totalEcoli:           parseInt(row.total_ecoli, 10)        || 0,
      totalColiformes:      parseInt(row.total_coliformes, 10)   || 0,
      totalCloroBaixo:      parseInt(row.total_cloro_baixo, 10)  || 0,
      totalTurbidezFora:    parseInt(row.total_turbidez_fora, 10) || 0,
      percentualForaPadrao: percentual,
      dataUltimaColeta:     row.data_ultima_coleta ?? null,
    });
  }

  // Calcula mediana de amostras para alertas de baixo volume
  const amostrasOrdenadas = [...resumoMap.values()].map(r => r.totalAmostras).sort((a, b) => a - b);
  const mediana = amostrasOrdenadas.length > 0
    ? amostrasOrdenadas[Math.floor(amostrasOrdenadas.length / 2)]
    : 0;
  console.log(`[mart:sisagua] Mediana de amostras por município: ${mediana}`);

  // ── 4. Gera alertas ──
  const alertas: AlertaInsert[] = [];
  const municipiosComDado = new Set(resumoMap.keys());

  // Alertas para municípios COM dados
  for (const r of resumoMap.values()) {
    if (r.totalEcoli > 0) {
      alertas.push({
        codigoMunicipioIbge: r.codigo,
        nomeMunicipio:       r.nome,
        tipoAlerta:          "sisagua_ecoli_detectada",
        nivel:               "CRITICO",
        descricao:           `E. coli detectada fora do padrão em ${r.totalEcoli} amostra(s).`,
        valorObservado:      r.totalEcoli,
        valorReferencia:     0,
        detalheJson: {
          total_ecoli: r.totalEcoli,
          total_fora_padrao: r.totalForaPadrao,
          data_ultima_coleta: r.dataUltimaColeta,
        },
      });
    }

    if (r.totalColiformes > 0 && r.totalEcoli === 0) {
      alertas.push({
        codigoMunicipioIbge: r.codigo,
        nomeMunicipio:       r.nome,
        tipoAlerta:          "sisagua_coliformes_detectados",
        nivel:               "ALTO",
        descricao:           `Coliformes totais detectados fora do padrão em ${r.totalColiformes} amostra(s).`,
        valorObservado:      r.totalColiformes,
        valorReferencia:     0,
        detalheJson: { total_coliformes: r.totalColiformes },
      });
    }

    if (r.totalForaPadrao > 0 && r.totalEcoli === 0) {
      alertas.push({
        codigoMunicipioIbge: r.codigo,
        nomeMunicipio:       r.nome,
        tipoAlerta:          "sisagua_amostra_fora_padrao",
        nivel:               "ALTO",
        descricao:           `${r.totalForaPadrao} amostra(s) fora dos padrões de potabilidade (${r.percentualForaPadrao ?? 0}%).`,
        valorObservado:      r.totalForaPadrao,
        valorReferencia:     0,
        detalheJson: {
          total_fora_padrao: r.totalForaPadrao,
          percentual_fora_padrao: r.percentualForaPadrao,
          total_amostras: r.totalAmostras,
        },
      });
    }

    // Baixo volume de amostras (abaixo da mediana)
    if (mediana > 0 && r.totalAmostras < mediana && r.totalAmostras > 0) {
      alertas.push({
        codigoMunicipioIbge: r.codigo,
        nomeMunicipio:       r.nome,
        tipoAlerta:          "sisagua_baixa_quantidade_amostras",
        nivel:               "MEDIO",
        descricao:           `Município com baixo volume de amostras coletadas (${r.totalAmostras} vs mediana ${mediana}).`,
        valorObservado:      r.totalAmostras,
        valorReferencia:     mediana,
        detalheJson: { total_amostras: r.totalAmostras, mediana },
      });
    }
  }

  // Alertas para municípios SEM dado (apenas se houver algum dado no DW)
  if (totalFato > 0) {
    for (const mun of MUNICIPIOS_ACRE) {
      const cod6 = mun.codigo.length >= 7 ? mun.codigo.slice(0, 6) : mun.codigo;
      if (!municipiosComDado.has(cod6)) {
        alertas.push({
          codigoMunicipioIbge: cod6,
          nomeMunicipio:       mun.nome,
          tipoAlerta:          "sisagua_sem_dado_recente",
          nivel:               "MEDIO",
          descricao:           "Município sem dados recentes de qualidade de água no SISAGUA.",
          valorObservado:      0,
          valorReferencia:     1,
          detalheJson:         { motivo: "Município ausente na base SISAGUA para o período carregado." },
        });
      }
    }
  }

  console.log(`[mart:sisagua] Alertas gerados: ${alertas.length}`);

  // ── 5. Consolida todos os municípios (com e sem dados) ──
  // Normaliza para 6 dígitos (sem dígito verificador) — igual ao formato que o DW grava.
  // MUNICIPIOS_ACRE usa 7 dígitos; sem normalização, o fallback criaria entradas duplicadas.
  const normalizar6 = (cod: string) => cod.length >= 7 ? cod.slice(0, 6) : cod.padStart(6, "0");

  const todosResumosMap = new Map<string, ResumoMunicipio>(resumoMap);
  for (const mun of MUNICIPIOS_ACRE) {
    const cod6 = normalizar6(mun.codigo);
    if (!todosResumosMap.has(cod6)) {
      todosResumosMap.set(cod6, {
        codigo: cod6, nome: mun.nome, uf: "AC",
        totalAmostras: 0, totalForaPadrao: 0, totalEcoli: 0, totalColiformes: 0,
        totalCloroBaixo: 0, totalTurbidezFora: 0, percentualForaPadrao: null, dataUltimaColeta: null,
      });
    }
  }

  // Score por município
  const scoreMap = new Map<string, number>();
  const countMap = new Map<string, { criticos: number; altos: number; medios: number; total: number }>();
  for (const a of alertas) {
    if (!a.codigoMunicipioIbge) continue;
    const pts = pontosPorNivel(a.nivel);
    scoreMap.set(a.codigoMunicipioIbge, (scoreMap.get(a.codigoMunicipioIbge) ?? 0) + pts);
    const c = countMap.get(a.codigoMunicipioIbge) ?? { criticos: 0, altos: 0, medios: 0, total: 0 };
    c.total++;
    if (a.nivel === "CRITICO") c.criticos++;
    else if (a.nivel === "ALTO") c.altos++;
    else if (a.nivel === "MEDIO") c.medios++;
    countMap.set(a.codigoMunicipioIbge, c);
  }

  // ── 6. Persiste ──
  await withPgTransaction(async (client) => {

    // mart.sisagua_resumo_municipio
    await client.query(`DELETE FROM mart.sisagua_resumo_municipio`);
    for (const r of todosResumosMap.values()) {
      const score  = scoreMap.get(r.codigo) ?? 0;
      const counts = countMap.get(r.codigo) ?? { criticos: 0, altos: 0, medios: 0, total: 0 };

      await client.query(`
        INSERT INTO mart.sisagua_resumo_municipio (
          codigo_municipio_ibge, nome_municipio, uf,
          total_amostras, total_fora_padrao, total_ecoli, total_coliformes,
          total_cloro_baixo, total_turbidez_fora_padrao,
          percentual_fora_padrao, data_ultima_coleta,
          total_alertas, total_criticos, total_altos, total_medios,
          score_risco, nivel_risco, atualizado_em
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now()
        )
        ON CONFLICT (codigo_municipio_ibge) DO UPDATE SET
          nome_municipio            = EXCLUDED.nome_municipio,
          uf                        = EXCLUDED.uf,
          total_amostras            = EXCLUDED.total_amostras,
          total_fora_padrao         = EXCLUDED.total_fora_padrao,
          total_ecoli               = EXCLUDED.total_ecoli,
          total_coliformes          = EXCLUDED.total_coliformes,
          total_cloro_baixo         = EXCLUDED.total_cloro_baixo,
          total_turbidez_fora_padrao = EXCLUDED.total_turbidez_fora_padrao,
          percentual_fora_padrao    = EXCLUDED.percentual_fora_padrao,
          data_ultima_coleta        = EXCLUDED.data_ultima_coleta,
          total_alertas             = EXCLUDED.total_alertas,
          total_criticos            = EXCLUDED.total_criticos,
          total_altos               = EXCLUDED.total_altos,
          total_medios              = EXCLUDED.total_medios,
          score_risco               = EXCLUDED.score_risco,
          nivel_risco               = EXCLUDED.nivel_risco,
          atualizado_em             = now()
      `, [
        r.codigo, r.nome, r.uf ?? "AC",
        r.totalAmostras, r.totalForaPadrao, r.totalEcoli, r.totalColiformes,
        r.totalCloroBaixo, r.totalTurbidezFora,
        r.percentualForaPadrao, r.dataUltimaColeta,
        counts.total, counts.criticos, counts.altos, counts.medios,
        score, nivelRisco(score),
      ]);
    }
    console.log(`[mart:sisagua] ✓ sisagua_resumo_municipio (${todosResumosMap.size} municípios)`);

    // mart.sisagua_alertas
    await client.query(`DELETE FROM mart.sisagua_alertas`);
    for (const a of alertas) {
      await client.query(`
        INSERT INTO mart.sisagua_alertas
          (fonte, codigo_municipio_ibge, nome_municipio, tipo_alerta, nivel,
           descricao, valor_observado, valor_referencia, prioridade, detalhe_json)
        VALUES ('SISAGUA',$1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        a.codigoMunicipioIbge, a.nomeMunicipio, a.tipoAlerta, a.nivel,
        a.descricao, a.valorObservado, a.valorReferencia,
        nivelPrioridade(a.nivel),
        a.detalheJson ? JSON.stringify(a.detalheJson) : null,
      ]);
    }
    console.log(`[mart:sisagua] ✓ sisagua_alertas (${alertas.length})`);

    // mart.sisagua_alertas_home — CRITICO/ALTO, máx 30
    const alertasHome = alertas
      .filter(a => a.nivel === "CRITICO" || a.nivel === "ALTO")
      .sort((a, b) => {
        const pa = nivelPrioridade(a.nivel), pb = nivelPrioridade(b.nivel);
        if (pa !== pb) return pa - pb;
        const ta = a.tipoAlerta.localeCompare(b.tipoAlerta);
        if (ta !== 0) return ta;
        return (a.nomeMunicipio ?? "").localeCompare(b.nomeMunicipio ?? "");
      })
      .slice(0, 30);

    await client.query(`DELETE FROM mart.sisagua_alertas_home`);
    for (const a of alertasHome) {
      await client.query(`
        INSERT INTO mart.sisagua_alertas_home
          (fonte, codigo_municipio_ibge, nome_municipio, tipo_alerta, nivel,
           descricao, valor_observado, valor_referencia, prioridade, detalhe_json)
        VALUES ('SISAGUA',$1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        a.codigoMunicipioIbge, a.nomeMunicipio, a.tipoAlerta, a.nivel,
        a.descricao, a.valorObservado, a.valorReferencia,
        nivelPrioridade(a.nivel),
        a.detalheJson ? JSON.stringify(a.detalheJson) : null,
      ]);
    }
    console.log(`[mart:sisagua] ✓ sisagua_alertas_home (${alertasHome.length})`);

    // mart.sisagua_resumo_home
    const totalCriticos  = alertas.filter(a => a.nivel === "CRITICO").length;
    const totalAltos     = alertas.filter(a => a.nivel === "ALTO").length;
    const totalMedios    = alertas.filter(a => a.nivel === "MEDIO").length;
    const afetados       = new Set(alertas.map(a => a.codigoMunicipioIbge).filter(Boolean)).size;
    const municipios     = [...todosResumosMap.values()];
    const riscoCritico   = municipios.filter(m => nivelRisco(scoreMap.get(m.codigo) ?? 0) === "CRITICO").length;
    const riscoAlto      = municipios.filter(m => nivelRisco(scoreMap.get(m.codigo) ?? 0) === "ALTO").length;
    const riscoMedio     = municipios.filter(m => nivelRisco(scoreMap.get(m.codigo) ?? 0) === "MEDIO").length;
    const totalAmostras  = [...resumoMap.values()].reduce((s, r) => s + r.totalAmostras, 0);
    const totalFora      = [...resumoMap.values()].reduce((s, r) => s + r.totalForaPadrao, 0);

    await client.query(`DELETE FROM mart.sisagua_resumo_home`);
    await client.query(`
      INSERT INTO mart.sisagua_resumo_home (
        total_alertas, total_criticos, total_altos, total_medios,
        total_municipios_afetados,
        municipios_risco_critico, municipios_risco_alto, municipios_risco_medio,
        total_amostras, total_fora_padrao
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [
      alertas.length, totalCriticos, totalAltos, totalMedios,
      afetados, riscoCritico, riscoAlto, riscoMedio,
      totalAmostras, totalFora,
    ]);
    console.log(`[mart:sisagua] ✓ sisagua_resumo_home (${totalCriticos} críticos, ${totalAltos} altos, ${afetados} municípios afetados)`);
  });

  const duracao = Date.now() - inicio;
  console.log(`[mart:sisagua] Refresh concluído em ${duracao}ms.`);

  await pgQuery(
    `INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
     VALUES ('mart:sisagua', 'OK', 'Refresh marts SISAGUA', $1, $2)`,
    [todosResumosMap.size, duracao]
  ).catch(() => void 0);
}

if (require.main === module) {
  executarRefreshMartSisagua()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[mart:sisagua] Erro:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
