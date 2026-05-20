/**
 * refresh-mart-siops.ts
 *
 * Gera resumo e alertas de saúde/orçamento a partir de dw.fato_siops_indicador.
 *
 * Tabelas geradas:
 *   mart.siops_resumo_municipio — resumo por municipio/periodo
 *   mart.siops_alertas          — alertas histórico completo
 *   mart.siops_alertas_home     — alertas recentes e acionáveis (CRITICO/ALTO, período mais recente, max 30)
 *   mart.siops_resumo_home      — contador agregado para card na home
 *
 * Alertas gerados:
 *   1. siops_sem_dado_recente     — município sem dado no período mais recente (ALTO)
 *   2. siops_aplicacao_saude_baixa — percentual aplicado < 15% (CRITICO) quando disponível
 *   3. siops_dado_incompleto      — poucos indicadores vs mediana (MEDIO)
 *   4. siops_variacao_atipica     — variação brusca de despesa vs período anterior (MEDIO/ALTO)
 *
 * Uso: cd etl && npm run mart:siops
 */

import "dotenv/config";
import { withPgTransaction, pgQuery, closePgPool } from "../connectors/postgres";
import { executarMartComAuditoria } from "../lib/auditoria";

const MODULO = "mart_siops";
// Percentual mínimo de aplicação em saúde para municípios (EC 29/2000, LC 141/2012)
const MINIMO_SAUDE_MUNICIPIO = 15;
// Variação percentual considerada atípica (±50% em relação ao período anterior)
const VARIACAO_ATIPICA_THRESHOLD = 50;

// Prefixo do indicador 3.2: "% da receita própria aplicada em ASPS conforme LC 141"
// O campo indicador é gravado como "3.2 — <ds_indicador>"
const INDICADOR_ASPS_PREFIXO = "3.2";

// Prefixo do indicador 2.1: "Despesa total com Saúde, sob a responsabilidade do Município, por habitante"
// Usado para variação atípica de despesa
const INDICADOR_DESPESA_TOTAL_PREFIXO = "2.1";

export async function executarMartSiops(): Promise<void> {
  console.log(`[${MODULO}] Iniciando refresh das marts SIOPS...`);

  await executarMartComAuditoria(
    {
      modulo: MODULO,
      origem: "dw.fato_siops_indicador",
      destino: "mart.siops_resumo_municipio + siops_alertas + siops_alertas_home + siops_resumo_home",
    },
    async () => {
      // Verifica se há dados no DW
      const contagem = await pgQuery<{ total: string }>(`SELECT COUNT(*) as total FROM dw.fato_siops_indicador`);
      const totalFatos = parseInt(contagem[0]?.total ?? "0", 10);

      if (totalFatos === 0) {
        console.warn(`[${MODULO}] ⚠ Nenhum dado em dw.fato_siops_indicador. Execute npm run siops:full:postgres primeiro.`);
        return { mensagem: "Sem dados no DW — marts não geradas", registrosLidos: 0, registrosGravados: 0 };
      }

      console.log(`[${MODULO}] ${totalFatos} fatos encontrados no DW.`);

      await withPgTransaction(async (client) => {

    // -----------------------------------------------------------------
    // 1. Identifica período mais recente carregado
    // -----------------------------------------------------------------
    const periodoResult = await client.query<{ ano: number; periodo: string }>(`
      SELECT ano, periodo
      FROM dw.fato_siops_indicador
      GROUP BY ano, periodo
      ORDER BY ano DESC, periodo DESC
      LIMIT 1
    `);
    const periodoRecente = periodoResult.rows[0];
    const anoRecente   = periodoRecente?.ano    ?? null;
    const periodoLabel = periodoRecente?.periodo ?? null;

    // -----------------------------------------------------------------
    // 2. Lista de todos os municípios com algum dado
    // -----------------------------------------------------------------
    const municipiosResult = await client.query<{ codigo: string; nome: string | null }>(`
      SELECT DISTINCT codigo_municipio_ibge AS codigo, nome_municipio AS nome
      FROM dw.fato_siops_indicador
      WHERE codigo_municipio_ibge IS NOT NULL
    `);
    const municipiosTodos = municipiosResult.rows;

    // -----------------------------------------------------------------
    // 3. Municípios com dado no período recente
    // -----------------------------------------------------------------
    const comDadoResult = await client.query<{ codigo: string }>(`
      SELECT DISTINCT codigo_municipio_ibge AS codigo
      FROM dw.fato_siops_indicador
      WHERE ano = $1 AND periodo = $2
    `, [anoRecente, periodoLabel]);
    const comDadoSet = new Set(comDadoResult.rows.map(r => r.codigo));

    // -----------------------------------------------------------------
    // 4. Indicadores por municipio/periodo (para calcular totais e matchear nomes)
    // -----------------------------------------------------------------
    const indResult = await client.query<{
      codigo: string; nome: string | null; ano: number; periodo: string | null;
      indicador: string; valor: number | null; percentual: number | null;
    }>(`
      SELECT codigo_municipio_ibge AS codigo, nome_municipio AS nome,
             ano, periodo, indicador, valor, percentual
      FROM dw.fato_siops_indicador
    `);
    const fatos = indResult.rows;

    // Agrupa por codigo+ano+periodo
    type GrupoKey = string;
    type GrupoVal = { nome: string | null; indicadores: typeof fatos };
    const grupos = new Map<GrupoKey, GrupoVal>();
    for (const f of fatos) {
      const key = `${f.codigo}|${f.ano}|${f.periodo ?? ""}`;
      if (!grupos.has(key)) grupos.set(key, { nome: f.nome, indicadores: [] });
      grupos.get(key)!.indicadores.push(f);
    }

    // Mediana de indicadores por periodo
    const totalPorGrupo = [...grupos.values()].map(g => g.indicadores.length);
    totalPorGrupo.sort((a, b) => a - b);
    const mediana = totalPorGrupo[Math.floor(totalPorGrupo.length / 2)] ?? 1;

    // -----------------------------------------------------------------
    // 5. Reconstrói mart.siops_resumo_municipio
    // -----------------------------------------------------------------
    await client.query(`DELETE FROM mart.siops_resumo_municipio`);

    for (const [key, grupo] of grupos.entries()) {
      const [codigo, anoStr, periodo] = key.split("|");
      const ano = parseInt(anoStr, 10);

      // Busca percentual ASPS (indicador 3.2) e despesa total (indicador 2.1)
      const percInd = grupo.indicadores.find(i => i.indicador.startsWith(INDICADOR_ASPS_PREFIXO));
      const despInd = grupo.indicadores.find(i => i.indicador.startsWith(INDICADOR_DESPESA_TOTAL_PREFIXO));

      const percentual = percInd?.percentual ?? percInd?.valor ?? null;
      const despesa    = despInd?.valor ?? null;
      const totalInd   = grupo.indicadores.length;
      const situacao   = totalInd >= mediana ? "COM_DADO" : "INCOMPLETO";

      await client.query(`
        INSERT INTO mart.siops_resumo_municipio
          (ano, periodo, codigo_municipio_ibge, nome_municipio,
           percentual_aplicado_saude, despesa_total_saude, receita_base_calculo,
           situacao_envio, total_indicadores, atualizado_em)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
        ON CONFLICT (ano, codigo_municipio_ibge, periodo) DO UPDATE SET
          nome_municipio            = EXCLUDED.nome_municipio,
          percentual_aplicado_saude = EXCLUDED.percentual_aplicado_saude,
          despesa_total_saude       = EXCLUDED.despesa_total_saude,
          situacao_envio            = EXCLUDED.situacao_envio,
          total_indicadores         = EXCLUDED.total_indicadores,
          atualizado_em             = now()
      `, [ano, periodo || null, codigo, grupo.nome, percentual, despesa, null, situacao, totalInd]);
    }
    console.log(`[${MODULO}] ✓ siops_resumo_municipio`);

    // -----------------------------------------------------------------
    // 6. Reconstrói mart.siops_alertas
    // -----------------------------------------------------------------
    await client.query(`DELETE FROM mart.siops_alertas`);

    const alertas: {
      ano: number; periodo: string | null; codigo: string | null; nome: string | null;
      tipo: string; nivel: string; descricao: string;
      valor_obs: number | null; valor_ref: number | null; detalhe: object;
    }[] = [];

    // -- Alerta 1: siops_sem_dado_recente --
    if (anoRecente !== null) {
      for (const m of municipiosTodos) {
        if (!comDadoSet.has(m.codigo)) {
          alertas.push({
            ano: anoRecente, periodo: periodoLabel, codigo: m.codigo, nome: m.nome,
            tipo: "siops_sem_dado_recente", nivel: "ALTO",
            descricao: "Município sem informação SIOPS no período mais recente carregado.",
            valor_obs: null, valor_ref: null,
            detalhe: { periodo_referencia: periodoLabel, ano_referencia: anoRecente },
          });
        }
      }
    }

    // -- Alertas por grupo --
    // Construção de histórico para variação atípica
    type HistKey = string; // codigo|indicador
    const historicoValor = new Map<HistKey, { ano: number; periodo: string; valor: number }[]>();

    for (const [key, grupo] of grupos.entries()) {
      const [codigo, anoStr, periodo] = key.split("|");
      const ano = parseInt(anoStr, 10);
      const nome = grupo.nome;

      // Coleta despesa total para histórico (indicador 2.1)
      const despInd = grupo.indicadores.find(i => i.indicador.startsWith(INDICADOR_DESPESA_TOTAL_PREFIXO));
      if (despInd?.valor != null) {
        const hKey: HistKey = `${codigo}|despesa_total_saude`;
        if (!historicoValor.has(hKey)) historicoValor.set(hKey, []);
        historicoValor.get(hKey)!.push({ ano, periodo: periodo || "", valor: despInd.valor });
      }

      // -- Alerta 2: siops_aplicacao_saude_baixa --
      const percInd = grupo.indicadores.find(i => i.indicador.startsWith(INDICADOR_ASPS_PREFIXO));
      if (percInd != null) {
        const perc = percInd.percentual ?? percInd.valor ?? null;
        if (perc !== null && perc < MINIMO_SAUDE_MUNICIPIO) {
          alertas.push({
            ano, periodo: periodo || null, codigo, nome,
            tipo: "siops_aplicacao_saude_baixa", nivel: "CRITICO",
            descricao: "Percentual aplicado em saúde abaixo do parâmetro mínimo municipal (15%).",
            valor_obs: perc, valor_ref: MINIMO_SAUDE_MUNICIPIO,
            detalhe: { indicador_usado: percInd.indicador, percentual: perc },
          });
        }
      }

      // -- Alerta 3: siops_dado_incompleto --
      const totalInd = grupo.indicadores.length;
      if (totalInd < Math.ceil(mediana * 0.5) && totalInd > 0) {
        alertas.push({
          ano, periodo: periodo || null, codigo, nome,
          tipo: "siops_dado_incompleto", nivel: "MEDIO",
          descricao: "Município com conjunto de indicadores SIOPS possivelmente incompleto.",
          valor_obs: totalInd, valor_ref: mediana,
          detalhe: { total_indicadores: totalInd, mediana_municipios: mediana },
        });
      }
    }

    // -- Alerta 4: siops_variacao_atipica --
    // Compara o mesmo período entre anos consecutivos (ex: 1º bim/2025 vs 1º bim/2026)
    // para evitar comparações sem sentido entre bimestres de grandezas distintas.
    for (const [hKey, serie] of historicoValor.entries()) {
      if (serie.length < 2) continue;
      const codigo = hKey.split("|")[0];
      const nome = municipiosTodos.find(m => m.codigo === codigo)?.nome ?? null;

      // Agrupa por período
      const porPeriodo = new Map<string, { ano: number; valor: number }[]>();
      for (const s of serie) {
        const p = s.periodo ?? "";
        if (!porPeriodo.has(p)) porPeriodo.set(p, []);
        porPeriodo.get(p)!.push({ ano: s.ano, valor: s.valor });
      }

      for (const [periodo, entradas] of porPeriodo.entries()) {
        if (entradas.length < 2) continue;
        entradas.sort((a, b) => a.ano - b.ano);
        for (let i = 1; i < entradas.length; i++) {
          const anterior = entradas[i - 1];
          const atual    = entradas[i];
          if (anterior.valor === 0 || atual.valor == null) continue;
          const variacao = Math.abs((atual.valor - anterior.valor) / anterior.valor) * 100;
          if (variacao >= VARIACAO_ATIPICA_THRESHOLD) {
            const nivel = variacao >= 100 ? "ALTO" : "MEDIO";
            alertas.push({
              ano: atual.ano, periodo: periodo || null, codigo, nome,
              tipo: "siops_variacao_atipica", nivel,
              descricao: `Variação atípica de despesa total em saúde (${variacao.toFixed(1)}% em relação ao mesmo período do ano anterior).`,
              valor_obs: atual.valor, valor_ref: anterior.valor,
              detalhe: {
                variacao_percentual: variacao.toFixed(2),
                periodo_anterior: `${anterior.ano}/${periodo}`,
                valor_anterior: anterior.valor,
              },
            });
          }
        }
      }
    }

    // Insere todos os alertas no histórico completo
    for (const a of alertas) {
      await client.query(`
        INSERT INTO mart.siops_alertas
          (ano, periodo, codigo_municipio_ibge, nome_municipio,
           tipo_alerta, nivel, descricao, valor_observado, valor_referencia, detalhe_json, atualizado_em)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
      `, [a.ano, a.periodo, a.codigo, a.nome, a.tipo, a.nivel, a.descricao, a.valor_obs, a.valor_ref, JSON.stringify(a.detalhe)]);
    }

    console.log(`[${MODULO}] ✓ siops_alertas (${alertas.length} alertas gerados)`);

    // -----------------------------------------------------------------
    // 7. Reconstrói mart.siops_alertas_home
    // Apenas período mais recente, apenas CRITICO e ALTO, máx 30 registros.
    // -----------------------------------------------------------------
    await client.query(`DELETE FROM mart.siops_alertas_home`);

    const nivelPrioridade = (nivel: string): number => nivel === "CRITICO" ? 1 : nivel === "ALTO" ? 2 : 3;

    const alertasHome = alertas
      .filter(a => a.ano === anoRecente && a.periodo === periodoLabel && (a.nivel === "CRITICO" || a.nivel === "ALTO"))
      .sort((x, y) => {
        const dp = nivelPrioridade(x.nivel) - nivelPrioridade(y.nivel);
        if (dp !== 0) return dp;
        const dt = x.tipo.localeCompare(y.tipo);
        if (dt !== 0) return dt;
        // Maior severidade: CRITICO ordena por menor percentual, ALTO por ausência de valor
        const vx = x.valor_obs ?? -Infinity;
        const vy = y.valor_obs ?? -Infinity;
        if (vx !== vy) return vx - vy; // menor valor_obs = mais crítico
        return (x.nome ?? "").localeCompare(y.nome ?? "");
      })
      .slice(0, 30);

    for (const a of alertasHome) {
      await client.query(`
        INSERT INTO mart.siops_alertas_home
          (area, fonte, ano, periodo, codigo_municipio_ibge, nome_municipio,
           tipo_alerta, nivel, descricao, valor_observado, valor_referencia,
           prioridade, detalhe_json, atualizado_em)
        VALUES ('SAUDE','SIOPS',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
      `, [a.ano, a.periodo, a.codigo, a.nome, a.tipo, a.nivel, a.descricao,
          a.valor_obs, a.valor_ref, nivelPrioridade(a.nivel), JSON.stringify(a.detalhe)]);
    }

    console.log(`[${MODULO}] ✓ siops_alertas_home (${alertasHome.length} alertas)`);

    // -----------------------------------------------------------------
    // 8. Reconstrói mart.siops_resumo_home
    // -----------------------------------------------------------------
    await client.query(`DELETE FROM mart.siops_resumo_home`);

    const alertasRecentes = alertas.filter(a => a.ano === anoRecente && a.periodo === periodoLabel);
    const municipiosAfetados = new Set(alertasRecentes.map(a => a.codigo).filter(Boolean)).size;

    await client.query(`
      INSERT INTO mart.siops_resumo_home
        (area, fonte, ano, periodo, total_alertas, total_criticos, total_altos,
         total_municipios_afetados, atualizado_em)
      VALUES ('SAUDE','SIOPS',$1,$2,$3,$4,$5,$6,now())
    `, [
      anoRecente ?? 0,
      periodoLabel,
      alertasRecentes.length,
      alertasRecentes.filter(a => a.nivel === "CRITICO").length,
      alertasRecentes.filter(a => a.nivel === "ALTO").length,
      municipiosAfetados,
    ]);

    console.log(`[${MODULO}] ✓ siops_resumo_home`);
      });

      console.log(`[${MODULO}] Refresh concluído.`);
      return {
        mensagem: "Refresh mart SIOPS concluído",
        registrosLidos: totalFatos,
        registrosGravados: totalFatos,
      };
    },
  );
}

if (require.main === module) {
  executarMartSiops()
    .then(() => closePgPool())
    .catch((err) => {
      console.error(`[${MODULO}] Erro:`, (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
