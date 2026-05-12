/**
 * refresh-mart-pni-cobertura.ts
 *
 * Reconstrói a camada mart de cobertura vacinal PNI.
 * Fontes: dw.fato_pni_cobertura
 *
 * Marts principais (somente status_arquivo='ATIVO'):
 *   - mart.pni_cobertura_resumo_municipio
 *   - mart.pni_cobertura_resumo_imunobiologico
 *   - mart.pni_cobertura_alertas
 *   - mart.pni_cobertura_alertas_home
 *   - mart.pni_cobertura_resumo_home
 *
 * Mart histórica (todos os status):
 *   - mart.pni_cobertura_evolucao
 *
 * Alertas gerados:
 *   pni_cobertura_baixa_fechamento — CRITICO (<80%) ou ALTO (80-95%) — apenas FECHADO
 *   pni_cobertura_baixa_parcial    — MEDIO — apenas PARCIAL
 *   pni_cobertura_muito_baixa      — CRITICO (FECHADO) ou ALTO (PARCIAL) — cobertura <50%
 *   pni_sem_denominador            — MEDIO — denominador null/0
 *
 * Uso: cd etl && npm run mart:pni-cobertura
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

const MODULO    = "mart_pni_cobertura";
const META_PCT  = 95;

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface FatoRow {
  arquivo_id:            number | null;
  ano:                   number;
  data_referencia:       string | null;
  tipo_periodo:          string;
  status_arquivo:        string;
  codigo_municipio_ibge: string | null;
  nome_municipio:        string | null;
  uf:                    string | null;
  macrorregiao_saude:    string | null;
  regiao_saude:          string | null;
  imunobiologico:        string;
  cobertura_percentual:  number | null;
  numerador:             number | null;
  denominador:           number | null;
  abaixo_meta:           boolean | null;
}

interface AlertaCobertura {
  arquivo_id:            number | null;
  codigo_municipio_ibge: string | null;
  nome_municipio:        string | null;
  ano:                   number;
  data_referencia:       string | null;
  tipo_periodo:          string;
  imunobiologico:        string | null;
  tipo_alerta:           string;
  nivel:                 string;
  descricao:             string;
  valor_observado:       number | null;
  valor_referencia:      number;
  detalhe_json:          unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nivelPrioridade(nivel: string, tipoPeriodo: string): number {
  // FECHADO + CRITICO = prioridade 1; PARCIAL vai para baixo
  const base = tipoPeriodo === "FECHADO" ? 0 : 10;
  if (nivel === "CRITICO") return base + 1;
  if (nivel === "ALTO")    return base + 2;
  if (nivel === "MEDIO")   return base + 3;
  return base + 4;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function executarMartPniCobertura(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${MODULO}] Iniciando refresh mart cobertura vacinal PNI...`);

  // ── 1. Carrega fatos ATIVOS ──
  const fatos = await pgQuery<FatoRow>(`
    SELECT
      arquivo_id,
      ano,
      data_referencia::text,
      tipo_periodo,
      status_arquivo,
      codigo_municipio_ibge,
      COALESCE(nome_municipio, codigo_municipio_ibge, 'Desconhecido') AS nome_municipio,
      uf,
      macrorregiao_saude,
      regiao_saude,
      imunobiologico,
      cobertura_percentual,
      numerador,
      denominador,
      abaixo_meta
    FROM dw.fato_pni_cobertura
    WHERE status_arquivo = 'ATIVO'
    ORDER BY ano, nome_municipio, imunobiologico
  `);

  // Fatos históricos (todos os status) para evolucao
  const fatosHistorico = await pgQuery<FatoRow>(`
    SELECT
      arquivo_id,
      ano,
      data_referencia::text,
      tipo_periodo,
      status_arquivo,
      codigo_municipio_ibge,
      COALESCE(nome_municipio, codigo_municipio_ibge, 'Desconhecido') AS nome_municipio,
      uf,
      macrorregiao_saude,
      regiao_saude,
      imunobiologico,
      cobertura_percentual,
      numerador,
      denominador,
      abaixo_meta
    FROM dw.fato_pni_cobertura
    WHERE status_arquivo IN ('ATIVO', 'SUPERADO', 'RETIFICADO')
    ORDER BY ano, data_referencia, nome_municipio, imunobiologico
  `);

  console.log(`[${MODULO}] Fatos ATIVO: ${fatos.length} | Histórico: ${fatosHistorico.length}`);

  // ── 2. Gera alertas ──
  const alertas: AlertaCobertura[] = [];

  for (const f of fatos) {
    // Denominador nulo ou zero — MEDIO
    if (!f.denominador || f.denominador === 0) {
      alertas.push({
        arquivo_id: f.arquivo_id,
        codigo_municipio_ibge: f.codigo_municipio_ibge,
        nome_municipio: f.nome_municipio,
        ano: f.ano,
        data_referencia: f.data_referencia,
        tipo_periodo: f.tipo_periodo,
        imunobiologico: f.imunobiologico,
        tipo_alerta: "pni_sem_denominador",
        nivel: "MEDIO",
        descricao: "Denominador não informado ou zerado para cálculo da cobertura.",
        valor_observado: f.denominador,
        valor_referencia: 1,
        detalhe_json: { imunobiologico: f.imunobiologico, municipio: f.nome_municipio },
      });
    }

    if (f.cobertura_percentual === null) continue;
    const cob = Number(f.cobertura_percentual);

    // Cobertura muito baixa (<50%) — independe de FECHADO/PARCIAL
    if (cob < 50) {
      alertas.push({
        arquivo_id: f.arquivo_id,
        codigo_municipio_ibge: f.codigo_municipio_ibge,
        nome_municipio: f.nome_municipio,
        ano: f.ano,
        data_referencia: f.data_referencia,
        tipo_periodo: f.tipo_periodo,
        imunobiologico: f.imunobiologico,
        tipo_alerta: "pni_cobertura_muito_baixa",
        nivel: f.tipo_periodo === "FECHADO" ? "CRITICO" : "ALTO",
        descricao: "Cobertura vacinal muito baixa para o imunobiológico.",
        valor_observado: cob,
        valor_referencia: META_PCT,
        detalhe_json: { imunobiologico: f.imunobiologico, tipo_periodo: f.tipo_periodo },
      });
      continue; // não gerar segundo alerta redundante
    }

    // Abaixo da meta (cobertura < 95)
    if (cob < META_PCT) {
      if (f.tipo_periodo === "FECHADO") {
        alertas.push({
          arquivo_id: f.arquivo_id,
          codigo_municipio_ibge: f.codigo_municipio_ibge,
          nome_municipio: f.nome_municipio,
          ano: f.ano,
          data_referencia: f.data_referencia,
          tipo_periodo: f.tipo_periodo,
          imunobiologico: f.imunobiologico,
          tipo_alerta: "pni_cobertura_baixa_fechamento",
          nivel: cob < 80 ? "CRITICO" : "ALTO",
          descricao: "Cobertura vacinal abaixo da meta no fechamento do exercício.",
          valor_observado: cob,
          valor_referencia: META_PCT,
          detalhe_json: { imunobiologico: f.imunobiologico, ano: f.ano },
        });
      } else {
        alertas.push({
          arquivo_id: f.arquivo_id,
          codigo_municipio_ibge: f.codigo_municipio_ibge,
          nome_municipio: f.nome_municipio,
          ano: f.ano,
          data_referencia: f.data_referencia,
          tipo_periodo: f.tipo_periodo,
          imunobiologico: f.imunobiologico,
          tipo_alerta: "pni_cobertura_baixa_parcial",
          nivel: "MEDIO",
          descricao: "Cobertura vacinal parcial abaixo da referência. Informação de acompanhamento, sujeita à evolução até o fechamento do exercício.",
          valor_observado: cob,
          valor_referencia: META_PCT,
          detalhe_json: {
            imunobiologico: f.imunobiologico,
            data_referencia: f.data_referencia,
            tipo_periodo: "PARCIAL",
          },
        });
      }
    }
  }

  console.log(`[${MODULO}] Alertas gerados: ${alertas.length}`);

  // Alertas para home: prioriza FECHADO > PARCIAL, CRITICO > ALTO, max 30
  // Exclui MEDIO se já houver CRITICO/ALTO suficientes
  const alertasComPrio = alertas
    .filter(a => a.nivel === "CRITICO" || a.nivel === "ALTO")
    .map(a => ({ ...a, prioridade: nivelPrioridade(a.nivel, a.tipo_periodo) }))
    .sort((a, b) => a.prioridade - b.prioridade || (a.nome_municipio ?? "").localeCompare(b.nome_municipio ?? ""));

  const alertasHome = alertasComPrio.slice(0, 30);

  // ── 3. Resumo por município ──
  const munMap = new Map<string, {
    codigo: string | null; uf: string | null;
    ano: number; data_referencia: string | null; tipo_periodo: string; arquivo_id: number | null;
    coberturas: number[]; nomes_imuno: string[];
    abaixo_meta: number; total: number;
  }>();

  for (const f of fatos) {
    const key = `${f.nome_municipio}|${f.ano}`;
    if (!munMap.has(key)) {
      munMap.set(key, {
        codigo: f.codigo_municipio_ibge, uf: f.uf,
        ano: f.ano, data_referencia: f.data_referencia, tipo_periodo: f.tipo_periodo, arquivo_id: f.arquivo_id,
        coberturas: [], nomes_imuno: [], abaixo_meta: 0, total: 0,
      });
    }
    const m = munMap.get(key)!;
    if (f.cobertura_percentual !== null) {
      m.coberturas.push(Number(f.cobertura_percentual));
      m.nomes_imuno.push(f.imunobiologico);
    }
    if (f.abaixo_meta) m.abaixo_meta++;
    m.total++;
  }

  // ── 4. Resumo por imunobiológico ──
  const imunoMap = new Map<string, {
    ano: number; data_referencia: string | null; tipo_periodo: string; arquivo_id: number | null;
    coberturas: number[]; total_mun: number; abaixo_meta: number;
    num_total: number; den_total: number;
  }>();

  for (const f of fatos) {
    const key = `${f.imunobiologico}|${f.ano}`;
    if (!imunoMap.has(key)) {
      imunoMap.set(key, {
        ano: f.ano, data_referencia: f.data_referencia, tipo_periodo: f.tipo_periodo, arquivo_id: f.arquivo_id,
        coberturas: [], total_mun: 0, abaixo_meta: 0, num_total: 0, den_total: 0,
      });
    }
    const im = imunoMap.get(key)!;
    if (f.cobertura_percentual !== null) im.coberturas.push(Number(f.cobertura_percentual));
    im.total_mun++;
    if (f.abaixo_meta) im.abaixo_meta++;
    im.num_total += f.numerador ?? 0;
    im.den_total += f.denominador ?? 0;
  }

  // ── 5. Totais home ──
  const fatoAtivo0 = fatos[0];
  const totalCriticos     = alertas.filter(a => a.nivel === "CRITICO").length;
  const totalAltos        = alertas.filter(a => a.nivel === "ALTO").length;
  const totalMedios       = alertas.filter(a => a.nivel === "MEDIO").length;
  const todasCoberturas   = fatos.filter(f => f.cobertura_percentual !== null).map(f => Number(f.cobertura_percentual));
  const coberturaMedia    = todasCoberturas.length > 0
    ? parseFloat((todasCoberturas.reduce((s, c) => s + c, 0) / todasCoberturas.length).toFixed(2))
    : null;
  const munAfetadas       = new Set(alertas.map(a => a.nome_municipio).filter(Boolean)).size;
  const munAbaixoMeta     = new Set(fatos.filter(f => f.abaixo_meta).map(f => f.nome_municipio)).size;

  // ── 6. Persiste ──
  await withPgTransaction(async (client) => {

    // pni_cobertura_alertas
    await client.query(`DELETE FROM mart.pni_cobertura_alertas`);
    for (const a of alertas) {
      await client.query(`
        INSERT INTO mart.pni_cobertura_alertas
          (fonte, arquivo_id, codigo_municipio_ibge, nome_municipio, ano, data_referencia,
           tipo_periodo, imunobiologico, tipo_alerta, nivel, descricao,
           valor_observado, valor_referencia, detalhe_json)
        VALUES ('PNI_COBERTURA',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `, [
        a.arquivo_id, a.codigo_municipio_ibge, a.nome_municipio, a.ano, a.data_referencia,
        a.tipo_periodo, a.imunobiologico, a.tipo_alerta, a.nivel, a.descricao,
        a.valor_observado, a.valor_referencia,
        a.detalhe_json ? JSON.stringify(a.detalhe_json) : null,
      ]);
    }
    console.log(`[${MODULO}] ✓ pni_cobertura_alertas (${alertas.length})`);

    // pni_cobertura_alertas_home
    await client.query(`DELETE FROM mart.pni_cobertura_alertas_home`);
    for (const a of alertasHome) {
      await client.query(`
        INSERT INTO mart.pni_cobertura_alertas_home
          (fonte, arquivo_id, codigo_municipio_ibge, nome_municipio, ano, data_referencia,
           tipo_periodo, imunobiologico, tipo_alerta, nivel, descricao,
           valor_observado, valor_referencia, prioridade, detalhe_json)
        VALUES ('PNI_COBERTURA',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      `, [
        a.arquivo_id, a.codigo_municipio_ibge, a.nome_municipio, a.ano, a.data_referencia,
        a.tipo_periodo, a.imunobiologico, a.tipo_alerta, a.nivel, a.descricao,
        a.valor_observado, a.valor_referencia, a.prioridade,
        a.detalhe_json ? JSON.stringify(a.detalhe_json) : null,
      ]);
    }
    console.log(`[${MODULO}] ✓ pni_cobertura_alertas_home (${alertasHome.length})`);

    // pni_cobertura_resumo_municipio
    await client.query(`DELETE FROM mart.pni_cobertura_resumo_municipio`);
    for (const [key, m] of munMap) {
      const nomeMun = key.split("|")[0];
      const coberturas = m.coberturas;
      const media = coberturas.length > 0
        ? parseFloat((coberturas.reduce((s, c) => s + c, 0) / coberturas.length).toFixed(2)) : null;
      const menor = coberturas.length > 0 ? Math.min(...coberturas) : null;
      const maior = coberturas.length > 0 ? Math.max(...coberturas) : null;
      const idxMenor = menor !== null ? coberturas.indexOf(menor) : -1;
      const imunoMenor = idxMenor >= 0 ? m.nomes_imuno[idxMenor] : null;

      await client.query(`
        INSERT INTO mart.pni_cobertura_resumo_municipio
          (codigo_municipio_ibge, nome_municipio, uf, ano, data_referencia, tipo_periodo, arquivo_id,
           total_imunobiologicos, total_abaixo_meta,
           cobertura_media, menor_cobertura, maior_cobertura, imunobiologico_menor_cobertura)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (nome_municipio, ano) DO UPDATE SET
          codigo_municipio_ibge          = EXCLUDED.codigo_municipio_ibge,
          uf                             = EXCLUDED.uf,
          data_referencia                = EXCLUDED.data_referencia,
          tipo_periodo                   = EXCLUDED.tipo_periodo,
          arquivo_id                     = EXCLUDED.arquivo_id,
          total_imunobiologicos          = EXCLUDED.total_imunobiologicos,
          total_abaixo_meta              = EXCLUDED.total_abaixo_meta,
          cobertura_media                = EXCLUDED.cobertura_media,
          menor_cobertura                = EXCLUDED.menor_cobertura,
          maior_cobertura                = EXCLUDED.maior_cobertura,
          imunobiologico_menor_cobertura = EXCLUDED.imunobiologico_menor_cobertura,
          atualizado_em                  = now()
      `, [
        m.codigo, nomeMun, m.uf, m.ano, m.data_referencia, m.tipo_periodo, m.arquivo_id,
        m.total, m.abaixo_meta, media, menor, maior, imunoMenor,
      ]);
    }
    console.log(`[${MODULO}] ✓ pni_cobertura_resumo_municipio (${munMap.size})`);

    // pni_cobertura_resumo_imunobiologico
    await client.query(`DELETE FROM mart.pni_cobertura_resumo_imunobiologico`);
    for (const [key, im] of imunoMap) {
      const [imuno] = key.split("|");
      const media = im.coberturas.length > 0
        ? parseFloat((im.coberturas.reduce((s, c) => s + c, 0) / im.coberturas.length).toFixed(2)) : null;
      await client.query(`
        INSERT INTO mart.pni_cobertura_resumo_imunobiologico
          (imunobiologico, ano, data_referencia, tipo_periodo, arquivo_id,
           cobertura_media, total_municipios, total_municipios_abaixo_meta,
           numerador_total, denominador_total)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (imunobiologico, ano) DO UPDATE SET
          data_referencia              = EXCLUDED.data_referencia,
          tipo_periodo                 = EXCLUDED.tipo_periodo,
          arquivo_id                   = EXCLUDED.arquivo_id,
          cobertura_media              = EXCLUDED.cobertura_media,
          total_municipios             = EXCLUDED.total_municipios,
          total_municipios_abaixo_meta = EXCLUDED.total_municipios_abaixo_meta,
          numerador_total              = EXCLUDED.numerador_total,
          denominador_total            = EXCLUDED.denominador_total,
          atualizado_em                = now()
      `, [
        imuno, im.ano, im.data_referencia, im.tipo_periodo, im.arquivo_id,
        media, im.total_mun, im.abaixo_meta,
        im.num_total || null, im.den_total || null,
      ]);
    }
    console.log(`[${MODULO}] ✓ pni_cobertura_resumo_imunobiologico (${imunoMap.size})`);

    // pni_cobertura_evolucao (histórico completo)
    await client.query(`DELETE FROM mart.pni_cobertura_evolucao`);
    for (const f of fatosHistorico) {
      await client.query(`
        INSERT INTO mart.pni_cobertura_evolucao
          (codigo_municipio_ibge, nome_municipio, uf, ano, data_referencia, tipo_periodo,
           status_arquivo, arquivo_id, imunobiologico, cobertura_percentual,
           numerador, denominador, meta_percentual, abaixo_meta)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      `, [
        f.codigo_municipio_ibge, f.nome_municipio, f.uf,
        f.ano, f.data_referencia, f.tipo_periodo, f.status_arquivo, f.arquivo_id,
        f.imunobiologico, f.cobertura_percentual, f.numerador, f.denominador,
        META_PCT, f.abaixo_meta,
      ]);
    }
    console.log(`[${MODULO}] ✓ pni_cobertura_evolucao (${fatosHistorico.length})`);

    // pni_cobertura_resumo_home
    await client.query(`DELETE FROM mart.pni_cobertura_resumo_home`);
    if (fatoAtivo0) {
      await client.query(`
        INSERT INTO mart.pni_cobertura_resumo_home
          (ano, data_referencia, tipo_periodo, arquivo_id,
           total_alertas, total_criticos, total_altos, total_medios, total_informativos,
           total_municipios_afetados, cobertura_media, total_municipios_abaixo_meta)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11)
      `, [
        fatoAtivo0.ano, fatoAtivo0.data_referencia, fatoAtivo0.tipo_periodo, fatoAtivo0.arquivo_id,
        alertas.length, totalCriticos, totalAltos, totalMedios,
        munAfetadas, coberturaMedia, munAbaixoMeta,
      ]);
    }
    console.log(`[${MODULO}] ✓ pni_cobertura_resumo_home`);
  });

  const duracao = Date.now() - inicio;
  console.log(`[${MODULO}] Refresh concluído em ${duracao}ms`);

  await pgQuery(`
    INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
    VALUES ($1, 'OK', 'Refresh mart cobertura vacinal PNI', $2, $3)
  `, [MODULO, fatos.length, duracao]).catch(() => void 0);
}

if (require.main === module) {
  executarMartPniCobertura()
    .then(() => closePgPool())
    .catch((err) => {
      console.error(`[${MODULO}] Erro:`, (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
