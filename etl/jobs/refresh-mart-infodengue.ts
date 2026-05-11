/**
 * refresh-mart-infodengue.ts
 *
 * Reconstrói a camada mart de Vigilância Epidemiológica (InfoDengue):
 *   - mart.vigilancia_arboviroses_resumo_municipio  (semana mais recente por município/doença)
 *   - mart.vigilancia_arboviroses_alertas           (todos os alertas gerados)
 *   - mart.vigilancia_arboviroses_alertas_home      (máx 30, CRITICO/ALTO)
 *   - mart.vigilancia_arboviroses_resumo_home       (totais para card da home)
 *
 * Fonte: dw.fato_infodengue_semana
 *
 * Regras de alerta:
 *   alerta_vermelho      — nivel=4                  → CRITICO
 *   alerta_laranja       — nivel=3                  → ALTO
 *   transmissao_alta     — transmissao >= 2         → ALTO
 *   rt_maior_que_1       — rt>1 AND p_rt1>=0.95     → ALTO
 *   incidencia_alta      — p_inc100k >= 100         → ALTO
 *   receptividade_climatica — receptivo >= 2        → MEDIO
 *
 * Uso: cd etl && npm run mart:infodengue
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface FatoSemana {
  codigo_municipio_ibge: string;
  nome_municipio:        string | null;
  uf:                    string | null;
  doenca:                string;
  data_inicio_semana:    string | null;
  semana_epidemiologica: number | null;
  ano_epidemiologico:    number | null;
  casos:                 number | null;
  casos_est:             number | null;
  p_rt1:                 number | null;
  p_inc100k:             number | null;
  nivel:                 number | null;
  rt:                    number | null;
  populacao:             number | null;
  receptivo:             number | null;
  transmissao:           number | null;
  nivel_inc:             number | null;
  notif_accum_year:      number | null;
}

interface AlertaInsert {
  codigoMunicipioIbge:  string | null;
  nomeMunicipio:        string | null;
  doenca:               string;
  anoEpidemiologico:    number | null;
  semanaEpidemiologica: number | null;
  tipoAlerta:           string;
  nivel:                string;
  descricao:            string;
  valorObservado:       number | null;
  valorReferencia:      number | null;
  detalheJson:          object | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nivelDescricao(nivel: number | null): string {
  if (nivel === 4) return "Vermelho";
  if (nivel === 3) return "Laranja";
  if (nivel === 2) return "Amarelo";
  return "Verde";
}

function nomeDoenca(doenca: string): string {
  if (doenca === "dengue")       return "dengue";
  if (doenca === "chikungunya")  return "chikungunya";
  if (doenca === "zika")         return "zika";
  return doenca;
}

function prioridade(nivel: string): number {
  if (nivel === "CRITICO") return 1;
  if (nivel === "ALTO")    return 2;
  return 3;
}

// ─── Geração de alertas a partir da semana mais recente ──────────────────────

function gerarAlertas(semana: FatoSemana): AlertaInsert[] {
  const alertas: AlertaInsert[] = [];
  const d = nomeDoenca(semana.doenca);
  const base = {
    codigoMunicipioIbge:  semana.codigo_municipio_ibge,
    nomeMunicipio:        semana.nome_municipio,
    doenca:               semana.doenca,
    anoEpidemiologico:    semana.ano_epidemiologico,
    semanaEpidemiologica: semana.semana_epidemiologica,
  };

  // 1. Alerta vermelho (nivel = 4)
  if (semana.nivel === 4) {
    alertas.push({
      ...base,
      tipoAlerta:     "alerta_vermelho",
      nivel:          "CRITICO",
      descricao:      `Município em alerta vermelho para ${d}.`,
      valorObservado: semana.nivel,
      valorReferencia: 4,
      detalheJson:    { nivel: semana.nivel, casos_est: semana.casos_est, p_inc100k: semana.p_inc100k },
    });
  }

  // 2. Alerta laranja (nivel = 3)
  if (semana.nivel === 3) {
    alertas.push({
      ...base,
      tipoAlerta:     "alerta_laranja",
      nivel:          "ALTO",
      descricao:      `Município em alerta laranja para ${d}.`,
      valorObservado: semana.nivel,
      valorReferencia: 3,
      detalheJson:    { nivel: semana.nivel, casos_est: semana.casos_est, p_inc100k: semana.p_inc100k },
    });
  }

  // 3. Transmissão alta (transmissao >= 2)
  if ((semana.transmissao ?? 0) >= 2) {
    alertas.push({
      ...base,
      tipoAlerta:     "transmissao_alta",
      nivel:          "ALTO",
      descricao:      `Evidência provável ou altamente provável de transmissão sustentada para ${d}.`,
      valorObservado: semana.transmissao,
      valorReferencia: 2,
      detalheJson:    { transmissao: semana.transmissao, rt: semana.rt, p_rt1: semana.p_rt1 },
    });
  }

  // 4. Rt > 1 com alta probabilidade (rt > 1 AND p_rt1 >= 0.95)
  if ((semana.rt ?? 0) > 1 && (semana.p_rt1 ?? 0) >= 0.95) {
    alertas.push({
      ...base,
      tipoAlerta:     "rt_maior_que_1",
      nivel:          "ALTO",
      descricao:      `Rt maior que 1 com alta probabilidade para ${d}.`,
      valorObservado: semana.rt,
      valorReferencia: 1,
      detalheJson:    { rt: semana.rt, p_rt1: semana.p_rt1 },
    });
  }

  // 5. Incidência alta (p_inc100k >= 100)
  if ((semana.p_inc100k ?? 0) >= 100) {
    alertas.push({
      ...base,
      tipoAlerta:     "incidencia_alta",
      nivel:          "ALTO",
      descricao:      `Incidência estimada elevada por 100 mil habitantes para ${d}.`,
      valorObservado: semana.p_inc100k,
      valorReferencia: 100,
      detalheJson:    { p_inc100k: semana.p_inc100k, casos_est: semana.casos_est },
    });
  }

  // 6. Receptividade climática (receptivo >= 2)
  if ((semana.receptivo ?? 0) >= 2) {
    alertas.push({
      ...base,
      tipoAlerta:     "receptividade_climatica",
      nivel:          "MEDIO",
      descricao:      `Condições climáticas favoráveis à transmissão de ${d}.`,
      valorObservado: semana.receptivo,
      valorReferencia: 2,
      detalheJson:    { receptivo: semana.receptivo },
    });
  }

  return alertas;
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

export async function executarMartInfoDengue(): Promise<void> {
  const inicio = Date.now();
  console.log("[mart:infodengue] Iniciando refresh mart de Vigilância Epidemiológica...");

  // ── 1. Carrega semana mais recente por município/doença ──────────────────
  const semanasMaisRecentes = await pgQuery<FatoSemana>(`
    SELECT DISTINCT ON (codigo_municipio_ibge, doenca)
      codigo_municipio_ibge, nome_municipio, uf, doenca,
      data_inicio_semana, semana_epidemiologica, ano_epidemiologico,
      casos, casos_est, p_rt1, p_inc100k, nivel, rt, populacao,
      receptivo, transmissao, nivel_inc, notif_accum_year
    FROM dw.fato_infodengue_semana
    WHERE ano_epidemiologico IS NOT NULL
      AND semana_epidemiologica IS NOT NULL
    ORDER BY codigo_municipio_ibge, doenca, ano_epidemiologico DESC, semana_epidemiologica DESC
  `);

  console.log(`[mart:infodengue] Semanas mais recentes: ${semanasMaisRecentes.length} (município × doença)`);

  if (semanasMaisRecentes.length === 0) {
    console.log("[mart:infodengue] Sem dados no DW. Execute npm run infodengue:full:postgres primeiro.");
    return;
  }

  // ── 2. Gera todos os alertas ─────────────────────────────────────────────
  const todosAlertas: AlertaInsert[] = [];
  for (const s of semanasMaisRecentes) {
    todosAlertas.push(...gerarAlertas(s));
  }

  // Alertas home: apenas CRITICO/ALTO, máx 30, ordenados
  const alertasHomeFonte = todosAlertas
    .filter(a => a.nivel === "CRITICO" || a.nivel === "ALTO")
    .sort((a, b) => {
      const pa = prioridade(a.nivel), pb = prioridade(b.nivel);
      if (pa !== pb) return pa - pb;
      if (a.doenca !== b.doenca) return a.doenca.localeCompare(b.doenca);
      return (a.nomeMunicipio ?? "").localeCompare(b.nomeMunicipio ?? "");
    })
    .slice(0, 30);

  // ── 3. Totais globais ────────────────────────────────────────────────────
  const totalCriticos = todosAlertas.filter(a => a.nivel === "CRITICO").length;
  const totalAltos    = todosAlertas.filter(a => a.nivel === "ALTO").length;
  const totalMedios   = todosAlertas.filter(a => a.nivel === "MEDIO").length;
  const municipiosAfetados = new Set(
    todosAlertas
      .filter(a => a.nivel === "CRITICO" || a.nivel === "ALTO")
      .map(a => a.codigoMunicipioIbge)
      .filter(Boolean)
  ).size;
  const doencasMonitoradas = new Set(semanasMaisRecentes.map(s => s.doenca)).size;

  // Semana/ano mais recente para o resumo home
  const maisPrecente = semanasMaisRecentes
    .filter(s => s.doenca === "dengue")
    .sort((a, b) => {
      const ay = (a.ano_epidemiologico ?? 0) * 100 + (a.semana_epidemiologica ?? 0);
      const by = (b.ano_epidemiologico ?? 0) * 100 + (b.semana_epidemiologica ?? 0);
      return by - ay;
    })[0];

  const anoEpiHome   = maisPrecente?.ano_epidemiologico   ?? null;
  const semanaEpiHome = maisPrecente?.semana_epidemiologica ?? null;

  console.log(`[mart:infodengue] Alertas: ${todosAlertas.length} (${totalCriticos} CRITICO, ${totalAltos} ALTO, ${totalMedios} MEDIO)`);
  console.log(`[mart:infodengue] Alertas home: ${alertasHomeFonte.length}`);

  // ── 4. Persiste em transação ─────────────────────────────────────────────
  await withPgTransaction(async (client) => {

    // mart.vigilancia_arboviroses_resumo_municipio
    await client.query(`DELETE FROM mart.vigilancia_arboviroses_resumo_municipio`);
    for (const s of semanasMaisRecentes) {
      await client.query(`
        INSERT INTO mart.vigilancia_arboviroses_resumo_municipio
          (codigo_municipio_ibge, nome_municipio, uf, doenca,
           ano_epidemiologico, semana_epidemiologica, data_inicio_semana,
           casos, casos_est, p_inc100k, nivel, nivel_descricao,
           rt, p_rt1, receptivo, transmissao, nivel_inc, notif_accum_year,
           atualizado_em)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())
        ON CONFLICT (codigo_municipio_ibge, doenca) DO UPDATE SET
          nome_municipio         = EXCLUDED.nome_municipio,
          uf                     = EXCLUDED.uf,
          ano_epidemiologico     = EXCLUDED.ano_epidemiologico,
          semana_epidemiologica  = EXCLUDED.semana_epidemiologica,
          data_inicio_semana     = EXCLUDED.data_inicio_semana,
          casos                  = EXCLUDED.casos,
          casos_est              = EXCLUDED.casos_est,
          p_inc100k              = EXCLUDED.p_inc100k,
          nivel                  = EXCLUDED.nivel,
          nivel_descricao        = EXCLUDED.nivel_descricao,
          rt                     = EXCLUDED.rt,
          p_rt1                  = EXCLUDED.p_rt1,
          receptivo              = EXCLUDED.receptivo,
          transmissao            = EXCLUDED.transmissao,
          nivel_inc              = EXCLUDED.nivel_inc,
          notif_accum_year       = EXCLUDED.notif_accum_year,
          atualizado_em          = now()
      `, [
        s.codigo_municipio_ibge, s.nome_municipio, s.uf, s.doenca,
        s.ano_epidemiologico, s.semana_epidemiologica, s.data_inicio_semana,
        s.casos, s.casos_est, s.p_inc100k, s.nivel, nivelDescricao(s.nivel),
        s.rt, s.p_rt1, s.receptivo, s.transmissao, s.nivel_inc, s.notif_accum_year,
      ]);
    }
    console.log(`[mart:infodengue] ✓ vigilancia_arboviroses_resumo_municipio (${semanasMaisRecentes.length} registros)`);

    // mart.vigilancia_arboviroses_alertas
    await client.query(`DELETE FROM mart.vigilancia_arboviroses_alertas`);
    for (const a of todosAlertas) {
      await client.query(`
        INSERT INTO mart.vigilancia_arboviroses_alertas
          (area, fonte, codigo_municipio_ibge, nome_municipio, doenca,
           ano_epidemiologico, semana_epidemiologica,
           tipo_alerta, nivel, descricao,
           valor_observado, valor_referencia, detalhe_json, atualizado_em)
        VALUES ('SAUDE','INFODENGUE',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
      `, [
        a.codigoMunicipioIbge, a.nomeMunicipio, a.doenca,
        a.anoEpidemiologico, a.semanaEpidemiologica,
        a.tipoAlerta, a.nivel, a.descricao,
        a.valorObservado, a.valorReferencia,
        a.detalheJson ? JSON.stringify(a.detalheJson) : null,
      ]);
    }
    console.log(`[mart:infodengue] ✓ vigilancia_arboviroses_alertas (${todosAlertas.length} alertas)`);

    // mart.vigilancia_arboviroses_alertas_home
    await client.query(`DELETE FROM mart.vigilancia_arboviroses_alertas_home`);
    for (const a of alertasHomeFonte) {
      await client.query(`
        INSERT INTO mart.vigilancia_arboviroses_alertas_home
          (area, fonte, codigo_municipio_ibge, nome_municipio, doenca,
           ano_epidemiologico, semana_epidemiologica,
           tipo_alerta, nivel, descricao,
           valor_observado, valor_referencia, prioridade, detalhe_json, atualizado_em)
        VALUES ('SAUDE','INFODENGUE',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
      `, [
        a.codigoMunicipioIbge, a.nomeMunicipio, a.doenca,
        a.anoEpidemiologico, a.semanaEpidemiologica,
        a.tipoAlerta, a.nivel, a.descricao,
        a.valorObservado, a.valorReferencia,
        prioridade(a.nivel),
        a.detalheJson ? JSON.stringify(a.detalheJson) : null,
      ]);
    }
    console.log(`[mart:infodengue] ✓ vigilancia_arboviroses_alertas_home (${alertasHomeFonte.length} alertas)`);

    // mart.vigilancia_arboviroses_resumo_home
    await client.query(`DELETE FROM mart.vigilancia_arboviroses_resumo_home`);
    await client.query(`
      INSERT INTO mart.vigilancia_arboviroses_resumo_home
        (area, fonte, total_alertas, total_criticos, total_altos, total_medios,
         total_municipios_afetados, total_doencas_monitoradas,
         ano_epidemiologico, semana_epidemiologica, atualizado_em)
      VALUES ('SAUDE','INFODENGUE',$1,$2,$3,$4,$5,$6,$7,$8,now())
    `, [
      todosAlertas.length, totalCriticos, totalAltos, totalMedios,
      municipiosAfetados, doencasMonitoradas,
      anoEpiHome, semanaEpiHome,
    ]);
    console.log(`[mart:infodengue] ✓ vigilancia_arboviroses_resumo_home`);
    console.log(`  ${municipiosAfetados} municípios afetados · ${doencasMonitoradas} doenças monitoradas`);
    console.log(`  ${totalCriticos} CRITICO · ${totalAltos} ALTO · ${totalMedios} MEDIO`);
  });

  const duracao = Date.now() - inicio;
  console.log(`[mart:infodengue] Refresh concluído em ${duracao}ms`);

  await pgQuery(`
    INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
    VALUES ('mart:infodengue', 'OK', 'Refresh mart InfoDengue', $1, $2)
  `, [semanasMaisRecentes.length, duracao]).catch(() => void 0);
}

if (require.main === module) {
  executarMartInfoDengue()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[mart:infodengue] Erro:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
