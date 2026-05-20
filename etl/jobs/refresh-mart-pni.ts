/**
 * refresh-mart-pni.ts
 *
 * Reconstrói a camada mart do módulo PNI / Vacinação:
 *   - mart.pni_resumo_municipio   (doses por município × ano)
 *   - mart.pni_resumo_vacina      (doses por imunobiológico × ano)
 *   - mart.pni_serie_mensal       (série temporal mês a mês)
 *   - mart.pni_alertas            (4 tipos de alerta)
 *   - mart.pni_alertas_home       (max 30, CRITICO/ALTO)
 *   - mart.pni_resumo_home        (totais globais)
 *
 * Alertas gerados:
 *   - pni_sem_dado_recente      (ALTO)    — município sem dose no último mês
 *   - pni_queda_mes_anterior    (MEDIO/ALTO) — queda ≥ 50% vs mês anterior
 *   - pni_queda_ano_anterior    (ALTO)    — queda ≥ 30% vs mesmo mês no ano anterior
 *   - pni_baixa_aplicacao_relativa (MEDIO) — doses/mês < 50% da média estadual
 *
 * Uso: cd etl && npm run mart:pni
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";
import { executarMartComAuditoria } from "../lib/auditoria";

const MODULO = "mart_pni";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface DoseMunAno {
  co_municipio_ibge_6: string;
  ds_municipio:        string | null;
  ano:                 number;
  total_doses:         number;
}

interface DoseMunMes {
  co_municipio_ibge_6: string;
  ds_municipio:        string | null;
  ano:                 number;
  mes:                 number;
  total_doses:         number;
}

interface DoseVacina {
  no_imunobiologico:  string;
  ano:                number;
  total_doses:        number;
  total_municipios:   number;
}

interface AlertaRow {
  codigo_municipio_ibge: string | null;
  nome_municipio:        string | null;
  tipo_alerta:           string;
  nivel:                 string;
  descricao:             string;
  valor_observado:       number | null;
  valor_referencia:      number | null;
  detalhe_json:          unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nivelPrioridade(nivel: string): number {
  if (nivel === "CRITICO") return 1;
  if (nivel === "ALTO")    return 2;
  return 3;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function executarMartPni(): Promise<void> {
  console.log(`[${MODULO}] Iniciando refresh mart PNI...`);

  await executarMartComAuditoria(
    {
      modulo: MODULO,
      origem: "dw.fato_pni_doses",
      destino: "mart.pni_resumo_municipio + pni_resumo_vacina + pni_serie_mensal + pni_alertas + pni_alertas_home + pni_resumo_home",
    },
    async () => {
  // ── 1. Carrega dados do dw ──
  const dosesMunAno = await pgQuery<DoseMunAno>(`
    SELECT
      co_municipio_ibge_6,
      MAX(ds_municipio) AS ds_municipio,
      ano,
      COUNT(*) AS total_doses
    FROM dw.fato_pni_dose
    WHERE co_municipio_ibge_6 IS NOT NULL
    GROUP BY co_municipio_ibge_6, ano
  `);

  const dosesMunMes = await pgQuery<DoseMunMes>(`
    SELECT
      co_municipio_ibge_6,
      MAX(ds_municipio) AS ds_municipio,
      ano,
      EXTRACT(MONTH FROM dt_aplicacao)::integer AS mes,
      COUNT(*) AS total_doses
    FROM dw.fato_pni_dose
    WHERE co_municipio_ibge_6 IS NOT NULL
      AND dt_aplicacao IS NOT NULL
    GROUP BY co_municipio_ibge_6, ano, EXTRACT(MONTH FROM dt_aplicacao)
  `);

  const dosesVacina = await pgQuery<DoseVacina>(`
    SELECT
      COALESCE(no_imunobiologico, '(não informado)') AS no_imunobiologico,
      ano,
      COUNT(*) AS total_doses,
      COUNT(DISTINCT co_municipio_ibge_6) AS total_municipios
    FROM dw.fato_pni_dose
    GROUP BY no_imunobiologico, ano
  `);

  console.log(`[${MODULO}] Município × ano: ${dosesMunAno.length}`);
  console.log(`[${MODULO}] Município × mês: ${dosesMunMes.length}`);
  console.log(`[${MODULO}] Vacina × ano  : ${dosesVacina.length}`);

  // ── 2. Mapa de dose por município e mês para alertas ──
  // chave: "cod|ano|mes" → total
  const doseMunMesMap = new Map<string, number>();
  for (const r of dosesMunMes) {
    doseMunMesMap.set(`${r.co_municipio_ibge_6}|${r.ano}|${r.mes}`, Number(r.total_doses));
  }

  // Meses com dado por município
  const mesesPorMun = new Map<string, Array<{ ano: number; mes: number; total: number }>>();
  for (const r of dosesMunMes) {
    const key = r.co_municipio_ibge_6;
    const arr = mesesPorMun.get(key) ?? [];
    arr.push({ ano: Number(r.ano), mes: Number(r.mes), total: Number(r.total_doses) });
    mesesPorMun.set(key, arr);
  }

  // Mês referência global (mês mais recente com dado)
  let mesRef = 0, anoRef = 0;
  for (const r of dosesMunMes) {
    const a = Number(r.ano), m = Number(r.mes);
    if (a > anoRef || (a === anoRef && m > mesRef)) { anoRef = a; mesRef = m; }
  }

  // Média mensal estadual (total doses no mês ref / municípios com dado nesse mês)
  const munComDadoMesRef = dosesMunMes.filter(r => Number(r.ano) === anoRef && Number(r.mes) === mesRef);
  const mediaEstadualMesRef = munComDadoMesRef.length > 0
    ? munComDadoMesRef.reduce((s, r) => s + Number(r.total_doses), 0) / munComDadoMesRef.length
    : 0;

  // ── 3. Gera alertas ──
  const alertas: AlertaRow[] = [];

  // pni_resumo_municipio para uso nos alertas
  const munMap = new Map<string, { nome: string | null; dosesAno: number; dosesUltimoMes: number }>();
  for (const r of dosesMunAno) {
    const chave = r.co_municipio_ibge_6;
    const dosesUltimoMes = doseMunMesMap.get(`${chave}|${anoRef}|${mesRef}`) ?? 0;
    munMap.set(chave, {
      nome: r.ds_municipio,
      dosesAno: Number(r.total_doses),
      dosesUltimoMes,
    });
  }

  for (const [cod, info] of munMap) {
    const meses = (mesesPorMun.get(cod) ?? []).sort((a, b) =>
      a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes
    );

    // Alerta 1: sem dado no mês de referência (ALTO)
    if (mesRef > 0 && info.dosesUltimoMes === 0) {
      alertas.push({
        codigo_municipio_ibge: cod,
        nome_municipio: info.nome,
        tipo_alerta: "pni_sem_dado_recente",
        nivel: "ALTO",
        descricao: `Município sem registro de dose aplicada em ${mesRef}/${anoRef}`,
        valor_observado: 0,
        valor_referencia: null,
        detalhe_json: { mes_referencia: mesRef, ano_referencia: anoRef },
      });
    }

    // Alerta 2: queda mês anterior
    if (meses.length >= 2) {
      const ultimo = meses[meses.length - 1];
      const penultimo = meses[meses.length - 2];
      if (penultimo.total > 0) {
        const queda = (penultimo.total - ultimo.total) / penultimo.total;
        if (queda >= 0.5) {
          alertas.push({
            codigo_municipio_ibge: cod,
            nome_municipio: info.nome,
            tipo_alerta: "pni_queda_mes_anterior",
            nivel: queda >= 0.7 ? "ALTO" : "MEDIO",
            descricao: `Queda de ${Math.round(queda * 100)}% nas doses em relação ao mês anterior`,
            valor_observado: ultimo.total,
            valor_referencia: penultimo.total,
            detalhe_json: { mes_atual: ultimo.mes, ano_atual: ultimo.ano, queda_pct: Math.round(queda * 100) },
          });
        }
      }
    }

    // Alerta 3: queda vs mesmo mês do ano anterior
    if (mesRef > 0 && anoRef > 0) {
      const anoAnt = anoRef - 1;
      const dosesAnoAnt = doseMunMesMap.get(`${cod}|${anoAnt}|${mesRef}`) ?? null;
      if (dosesAnoAnt !== null && dosesAnoAnt > 0) {
        const queda = (dosesAnoAnt - info.dosesUltimoMes) / dosesAnoAnt;
        if (queda >= 0.3) {
          alertas.push({
            codigo_municipio_ibge: cod,
            nome_municipio: info.nome,
            tipo_alerta: "pni_queda_ano_anterior",
            nivel: "ALTO",
            descricao: `Queda de ${Math.round(queda * 100)}% nas doses vs mesmo mês de ${anoAnt}`,
            valor_observado: info.dosesUltimoMes,
            valor_referencia: dosesAnoAnt,
            detalhe_json: { mes: mesRef, ano_atual: anoRef, ano_anterior: anoAnt },
          });
        }
      }
    }

    // Alerta 4: baixa aplicação relativa (< 50% da média estadual)
    if (mediaEstadualMesRef > 0 && info.dosesUltimoMes < mediaEstadualMesRef * 0.5) {
      alertas.push({
        codigo_municipio_ibge: cod,
        nome_municipio: info.nome,
        tipo_alerta: "pni_baixa_aplicacao_relativa",
        nivel: "MEDIO",
        descricao: `Doses no mês ${mesRef}/${anoRef} abaixo de 50% da média estadual`,
        valor_observado: info.dosesUltimoMes,
        valor_referencia: Math.round(mediaEstadualMesRef),
        detalhe_json: { media_estadual: Math.round(mediaEstadualMesRef), mes: mesRef, ano: anoRef },
      });
    }
  }

  const alertasHome = alertas
    .filter(a => a.nivel === "CRITICO" || a.nivel === "ALTO")
    .sort((a, b) => {
      const pa = nivelPrioridade(a.nivel), pb = nivelPrioridade(b.nivel);
      if (pa !== pb) return pa - pb;
      return (a.nome_municipio ?? "").localeCompare(b.nome_municipio ?? "");
    })
    .slice(0, 30);

  console.log(`[${MODULO}] Alertas gerados: ${alertas.length} (${alertasHome.length} para home)`);

  // ── 4. Persiste ──
  await withPgTransaction(async (client) => {

    // mart.pni_resumo_municipio
    await client.query(`DELETE FROM mart.pni_resumo_municipio`);
    for (const r of dosesMunAno) {
      const cod = r.co_municipio_ibge_6;
      const dosesUltimoMes = doseMunMesMap.get(`${cod}|${anoRef}|${mesRef}`) ?? 0;
      await client.query(`
        INSERT INTO mart.pni_resumo_municipio
          (codigo_municipio_ibge, nome_municipio, ano, total_doses, total_imunobiologicos, doses_ultimo_mes, mes_referencia)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (codigo_municipio_ibge, ano) DO UPDATE SET
          nome_municipio       = EXCLUDED.nome_municipio,
          total_doses          = EXCLUDED.total_doses,
          total_imunobiologicos = EXCLUDED.total_imunobiologicos,
          doses_ultimo_mes     = EXCLUDED.doses_ultimo_mes,
          mes_referencia       = EXCLUDED.mes_referencia,
          atualizado_em        = now()
      `, [
        cod,
        r.ds_municipio,
        Number(r.ano),
        Number(r.total_doses),
        0, // total_imunobiologicos — calculado separadamente se necessário
        dosesUltimoMes,
        mesRef || null,
      ]);
    }
    console.log(`[${MODULO}] ✓ pni_resumo_municipio (${dosesMunAno.length})`);

    // mart.pni_resumo_vacina
    await client.query(`DELETE FROM mart.pni_resumo_vacina`);
    for (const r of dosesVacina) {
      await client.query(`
        INSERT INTO mart.pni_resumo_vacina (no_imunobiologico, ano, total_doses, total_municipios)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (no_imunobiologico, ano) DO UPDATE SET
          total_doses      = EXCLUDED.total_doses,
          total_municipios = EXCLUDED.total_municipios,
          atualizado_em    = now()
      `, [r.no_imunobiologico, Number(r.ano), Number(r.total_doses), Number(r.total_municipios)]);
    }
    console.log(`[${MODULO}] ✓ pni_resumo_vacina (${dosesVacina.length})`);

    // mart.pni_serie_mensal
    await client.query(`DELETE FROM mart.pni_serie_mensal`);
    for (const r of dosesMunMes) {
      await client.query(`
        INSERT INTO mart.pni_serie_mensal
          (codigo_municipio_ibge, no_imunobiologico, ano, mes, total_doses)
        VALUES ($1,'(todos)',$2,$3,$4)
        ON CONFLICT (codigo_municipio_ibge, no_imunobiologico, ano, mes) DO UPDATE SET
          total_doses   = EXCLUDED.total_doses,
          atualizado_em = now()
      `, [r.co_municipio_ibge_6, Number(r.ano), Number(r.mes), Number(r.total_doses)]);
    }
    console.log(`[${MODULO}] ✓ pni_serie_mensal (${dosesMunMes.length})`);

    // mart.pni_alertas
    await client.query(`DELETE FROM mart.pni_alertas`);
    for (const a of alertas) {
      await client.query(`
        INSERT INTO mart.pni_alertas
          (fonte, codigo_municipio_ibge, nome_municipio, tipo_alerta, nivel,
           descricao, valor_observado, valor_referencia, detalhe_json)
        VALUES ('PNI',$1,$2,$3,$4,$5,$6,$7,$8)
      `, [
        a.codigo_municipio_ibge, a.nome_municipio, a.tipo_alerta, a.nivel,
        a.descricao, a.valor_observado, a.valor_referencia,
        a.detalhe_json ? JSON.stringify(a.detalhe_json) : null,
      ]);
    }
    console.log(`[${MODULO}] ✓ pni_alertas (${alertas.length})`);

    // mart.pni_alertas_home
    await client.query(`DELETE FROM mart.pni_alertas_home`);
    for (const a of alertasHome) {
      await client.query(`
        INSERT INTO mart.pni_alertas_home
          (fonte, codigo_municipio_ibge, nome_municipio, tipo_alerta, nivel,
           descricao, valor_observado, valor_referencia, prioridade, detalhe_json)
        VALUES ('PNI',$1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        a.codigo_municipio_ibge, a.nome_municipio, a.tipo_alerta, a.nivel,
        a.descricao, a.valor_observado, a.valor_referencia,
        nivelPrioridade(a.nivel),
        a.detalhe_json ? JSON.stringify(a.detalhe_json) : null,
      ]);
    }
    console.log(`[${MODULO}] ✓ pni_alertas_home (${alertasHome.length})`);

    // mart.pni_resumo_home
    const totalCriticos = alertas.filter(a => a.nivel === "CRITICO").length;
    const totalAltos    = alertas.filter(a => a.nivel === "ALTO").length;
    const totalMedios   = alertas.filter(a => a.nivel === "MEDIO").length;
    const totalDosesAnoAtual = dosesMunAno
      .filter(r => Number(r.ano) === anoRef)
      .reduce((s, r) => s + Number(r.total_doses), 0);
    const totalDosesMesAtual = munComDadoMesRef.reduce((s, r) => s + Number(r.total_doses), 0);
    const totalImunobiologicos = new Set(dosesVacina.map(r => r.no_imunobiologico)).size;

    await client.query(`DELETE FROM mart.pni_resumo_home`);
    await client.query(`
      INSERT INTO mart.pni_resumo_home (
        total_doses_ano_atual, total_doses_mes_atual,
        total_municipios_com_dado, total_imunobiologicos,
        total_alertas, total_criticos, total_altos, total_medios,
        ano_referencia, mes_referencia
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [
      totalDosesAnoAtual, totalDosesMesAtual,
      munComDadoMesRef.length, totalImunobiologicos,
      alertas.length, totalCriticos, totalAltos, totalMedios,
      anoRef || null, mesRef || null,
    ]);
    console.log(`[${MODULO}] ✓ pni_resumo_home`);
      });

      console.log(`[${MODULO}] Refresh concluído.`);
      return {
        mensagem: "Refresh mart PNI",
        registrosLidos: dosesMunAno.length,
        registrosGravados: dosesMunAno.length,
      };
    },
  );
}

if (require.main === module) {
  executarMartPni()
    .then(() => closePgPool())
    .catch((err) => {
      console.error(`[${MODULO}] Erro:`, (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
