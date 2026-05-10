/**
 * refresh-mart-saude-estrutura.ts
 *
 * Reconstrói as mart tables de estrutura de saúde a partir de:
 *   - dw.dim_estabelecimento_saude (CNES)
 *   - dw.dim_ubs                   (UBS)
 *
 * Gera:
 *   - mart.saude_estrutura_municipio
 *   - mart.saude_estrutura_alertas
 *   - mart.saude_estrutura_alertas_home (max 30, CRITICO/ALTO)
 *   - mart.saude_estrutura_resumo_home
 *
 * Regras de alerta:
 *   municipio_sem_ubs_ativa         — CRITICO — total_ubs_ativas = 0
 *   baixa_quantidade_ubs            — ALTO    — total_ubs_ativas em 1
 *   estabelecimentos_inativos       — MEDIO   — total_inativos > 0
 *   estabelecimentos_sem_atualizacao_recente — MEDIO — data < 180 dias
 *
 * Uso: cd etl && npm run mart:saude-estrutura
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

const DIAS_SEM_ATUALIZACAO = 180;

// Municípios do Acre como fallback (quando dim_estabelecimento_saude estiver vazia)
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

function nivelPrioridade(nivel: string): number {
  if (nivel === "CRITICO") return 1;
  if (nivel === "ALTO") return 2;
  return 3;
}

interface EstabRow {
  codigo_municipio_ibge: string;
  nome_municipio: string | null;
  uf: string | null;
  situacao: string | null;
  atende_sus: boolean | null;
  data_atualizacao: Date | null;
}

interface UbsRow {
  codigo_municipio_ibge: string;
  nome_municipio: string | null;
  situacao: string | null;
  data_atualizacao: Date | null;
}

interface AlertaInsert {
  codigo_municipio_ibge: string | null;
  nome_municipio: string | null;
  tipo_alerta: string;
  nivel: string;
  descricao: string;
  valor_observado: number | null;
  valor_referencia: number | null;
  detalhe_json: object | null;
}

interface ResumoMunicipio {
  codigo: string;
  nome: string | null;
  uf: string | null;
  total_estabelecimentos: number;
  total_estabelecimentos_sus: number;
  total_ubs: number;
  total_ubs_ativas: number;
  total_inativos: number;
  total_sem_atualizacao: number;
  data_mais_recente: Date | null;
}

export async function executarMartSaudeEstrutura(): Promise<void> {
  const inicio = Date.now();
  console.log("[mart:saude-estrutura] Iniciando refresh das marts de saúde...");

  // ── 1. Verifica se há dados ──
  const [cnesCount] = await pgQuery<{ c: string }>(`SELECT count(*)::text AS c FROM dw.dim_estabelecimento_saude`);
  const [ubsCount]  = await pgQuery<{ c: string }>(`SELECT count(*)::text AS c FROM dw.dim_ubs`);
  console.log(`[mart:saude-estrutura] dim_estabelecimento_saude: ${cnesCount.c} registros`);
  console.log(`[mart:saude-estrutura] dim_ubs: ${ubsCount.c} registros`);

  // ── 2. Carrega dados ──
  const estabs = await pgQuery<EstabRow>(`
    SELECT codigo_municipio_ibge, nome_municipio, uf, situacao, atende_sus, data_atualizacao
    FROM dw.dim_estabelecimento_saude
    WHERE codigo_municipio_ibge IS NOT NULL
  `);

  const ubsAll = await pgQuery<UbsRow>(`
    SELECT codigo_municipio_ibge, nome_municipio, situacao, data_atualizacao
    FROM dw.dim_ubs
    WHERE codigo_municipio_ibge IS NOT NULL
  `);

  // ── 3. Agrupa por município ──
  const hoje = new Date();
  const limiteAtualizacao = new Date(hoje.getTime() - DIAS_SEM_ATUALIZACAO * 86400000);

  const municipioMap = new Map<string, ResumoMunicipio>();

  function garantirMunicipio(codigo: string, nome: string | null, uf: string | null): ResumoMunicipio {
    if (!municipioMap.has(codigo)) {
      municipioMap.set(codigo, {
        codigo, nome, uf,
        total_estabelecimentos: 0,
        total_estabelecimentos_sus: 0,
        total_ubs: 0,
        total_ubs_ativas: 0,
        total_inativos: 0,
        total_sem_atualizacao: 0,
        data_mais_recente: null,
      });
    }
    return municipioMap.get(codigo)!;
  }

  const SITUACAO_ATIVA = new Set(["ATIVO", "ATIVA", "A", "1", "HABILITADO"]);
  const SITUACAO_INATIVA = new Set(["INATIVO", "INATIVA", "I", "0", "DESABILITADO", "CANCELADO"]);

  for (const e of estabs) {
    const r = garantirMunicipio(e.codigo_municipio_ibge, e.nome_municipio, e.uf);
    r.total_estabelecimentos++;
    if (e.atende_sus) r.total_estabelecimentos_sus++;

    const sit = (e.situacao ?? "").toUpperCase().trim();
    if (SITUACAO_INATIVA.has(sit)) r.total_inativos++;

    if (e.data_atualizacao) {
      const dt = new Date(e.data_atualizacao);
      if (dt < limiteAtualizacao) r.total_sem_atualizacao++;
      if (!r.data_mais_recente || dt > r.data_mais_recente) r.data_mais_recente = dt;
    }
  }

  for (const u of ubsAll) {
    const r = garantirMunicipio(u.codigo_municipio_ibge, u.nome_municipio, null);
    r.total_ubs++;
    const sit = (u.situacao ?? "ATIVO").toUpperCase().trim();
    if (SITUACAO_ATIVA.has(sit) || (!SITUACAO_INATIVA.has(sit) && sit !== "")) {
      r.total_ubs_ativas++;
    }
  }

  const resumos = [...municipioMap.values()];
  console.log(`[mart:saude-estrutura] ${resumos.length} municípios com dados.`);

  // Se não há dados da CNES, usa lista de municípios do Acre para gerar alertas
  // de municípios sem dado nenhum
  const municipiosComDado = new Set(resumos.map(r => r.codigo));
  const semNenhumDado = MUNICIPIOS_ACRE.filter(m => !municipiosComDado.has(m.codigo));
  if (semNenhumDado.length > 0 && parseInt(cnesCount.c) === 0 && parseInt(ubsCount.c) === 0) {
    console.log(`[mart:saude-estrutura] Nenhum dado carregado ainda. Configure CNES_RESOURCE_ID e UBS_RESOURCE_ID.`);
  }

  // ── 4. Gera alertas ──
  const alertas: AlertaInsert[] = [];

  // Para municípios do Acre sem qualquer dado de UBS
  for (const mun of MUNICIPIOS_ACRE) {
    const r = municipioMap.get(mun.codigo);
    if (!r || r.total_ubs === 0) {
      if (parseInt(ubsCount.c) > 0) {
        // Só gera alerta de "sem UBS" se a tabela UBS tiver dados (indica cobertura)
        alertas.push({
          codigo_municipio_ibge: mun.codigo,
          nome_municipio: mun.nome,
          tipo_alerta: "municipio_sem_ubs_ativa",
          nivel: "CRITICO",
          descricao: "Município sem UBS ativa identificada na base CNES/UBS.",
          valor_observado: 0,
          valor_referencia: 1,
          detalhe_json: { total_ubs: 0 },
        });
      }
    }
  }

  for (const r of resumos) {
    // Sem UBS ativa (mas tem registro de UBS)
    if (r.total_ubs > 0 && r.total_ubs_ativas === 0) {
      alertas.push({
        codigo_municipio_ibge: r.codigo,
        nome_municipio: r.nome,
        tipo_alerta: "municipio_sem_ubs_ativa",
        nivel: "CRITICO",
        descricao: "Município sem UBS ativa identificada na base CNES/UBS.",
        valor_observado: 0,
        valor_referencia: 1,
        detalhe_json: { total_ubs: r.total_ubs, total_ubs_ativas: r.total_ubs_ativas },
      });
    }

    // Baixa quantidade de UBS
    if (r.total_ubs_ativas === 1) {
      alertas.push({
        codigo_municipio_ibge: r.codigo,
        nome_municipio: r.nome,
        tipo_alerta: "baixa_quantidade_ubs",
        nivel: "ALTO",
        descricao: "Município com baixa quantidade de UBS ativas identificadas.",
        valor_observado: r.total_ubs_ativas,
        valor_referencia: 2,
        detalhe_json: { total_ubs_ativas: r.total_ubs_ativas },
      });
    }

    // Estabelecimentos inativos
    if (r.total_inativos > 0 && parseInt(cnesCount.c) > 0) {
      alertas.push({
        codigo_municipio_ibge: r.codigo,
        nome_municipio: r.nome,
        tipo_alerta: "estabelecimentos_inativos",
        nivel: "MEDIO",
        descricao: "Município possui estabelecimentos de saúde inativos/desativados na base.",
        valor_observado: r.total_inativos,
        valor_referencia: 0,
        detalhe_json: { total_inativos: r.total_inativos, total_estabelecimentos: r.total_estabelecimentos },
      });
    }

    // Sem atualização recente
    if (r.total_sem_atualizacao > 0 && parseInt(cnesCount.c) > 0) {
      alertas.push({
        codigo_municipio_ibge: r.codigo,
        nome_municipio: r.nome,
        tipo_alerta: "estabelecimentos_sem_atualizacao_recente",
        nivel: "MEDIO",
        descricao: `Município possui estabelecimentos de saúde sem atualização cadastral recente (>${DIAS_SEM_ATUALIZACAO} dias).`,
        valor_observado: r.total_sem_atualizacao,
        valor_referencia: DIAS_SEM_ATUALIZACAO,
        detalhe_json: { total_sem_atualizacao: r.total_sem_atualizacao, limite_dias: DIAS_SEM_ATUALIZACAO },
      });
    }
  }

  console.log(`[mart:saude-estrutura] Alertas gerados: ${alertas.length}`);

  await withPgTransaction(async (client) => {

    // ── mart.saude_estrutura_municipio ──
    await client.query(`DELETE FROM mart.saude_estrutura_municipio`);
    for (const r of resumos) {
      await client.query(`
        INSERT INTO mart.saude_estrutura_municipio
          (codigo_municipio_ibge, nome_municipio, uf,
           total_estabelecimentos, total_estabelecimentos_sus,
           total_ubs, total_ubs_ativas, total_inativos,
           total_sem_atualizacao_recente, data_mais_recente_atualizacao, atualizado_em)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
        ON CONFLICT (codigo_municipio_ibge) DO UPDATE SET
          nome_municipio                = EXCLUDED.nome_municipio,
          uf                            = EXCLUDED.uf,
          total_estabelecimentos        = EXCLUDED.total_estabelecimentos,
          total_estabelecimentos_sus    = EXCLUDED.total_estabelecimentos_sus,
          total_ubs                     = EXCLUDED.total_ubs,
          total_ubs_ativas              = EXCLUDED.total_ubs_ativas,
          total_inativos                = EXCLUDED.total_inativos,
          total_sem_atualizacao_recente = EXCLUDED.total_sem_atualizacao_recente,
          data_mais_recente_atualizacao = EXCLUDED.data_mais_recente_atualizacao,
          atualizado_em                 = now()
      `, [
        r.codigo, r.nome, r.uf,
        r.total_estabelecimentos, r.total_estabelecimentos_sus,
        r.total_ubs, r.total_ubs_ativas, r.total_inativos,
        r.total_sem_atualizacao,
        r.data_mais_recente ? r.data_mais_recente.toISOString().slice(0, 10) : null,
      ]);
    }
    console.log(`[mart:saude-estrutura] ✓ saude_estrutura_municipio (${resumos.length} linhas)`);

    // ── mart.saude_estrutura_alertas ──
    await client.query(`DELETE FROM mart.saude_estrutura_alertas`);
    for (const a of alertas) {
      await client.query(`
        INSERT INTO mart.saude_estrutura_alertas
          (codigo_municipio_ibge, nome_municipio, tipo_alerta, nivel,
           descricao, valor_observado, valor_referencia, detalhe_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [
        a.codigo_municipio_ibge, a.nome_municipio, a.tipo_alerta, a.nivel,
        a.descricao, a.valor_observado, a.valor_referencia,
        a.detalhe_json ? JSON.stringify(a.detalhe_json) : null,
      ]);
    }
    console.log(`[mart:saude-estrutura] ✓ saude_estrutura_alertas (${alertas.length} alertas)`);

    // ── mart.saude_estrutura_alertas_home ──
    const alertasHome = alertas
      .filter(a => a.nivel === "CRITICO" || a.nivel === "ALTO")
      .sort((a, b) => {
        const pa = nivelPrioridade(a.nivel), pb = nivelPrioridade(b.nivel);
        if (pa !== pb) return pa - pb;
        return (a.tipo_alerta).localeCompare(b.tipo_alerta);
      })
      .slice(0, 30);

    await client.query(`DELETE FROM mart.saude_estrutura_alertas_home`);
    for (const a of alertasHome) {
      await client.query(`
        INSERT INTO mart.saude_estrutura_alertas_home
          (codigo_municipio_ibge, nome_municipio, tipo_alerta, nivel,
           descricao, valor_observado, valor_referencia, prioridade, detalhe_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        a.codigo_municipio_ibge, a.nome_municipio, a.tipo_alerta, a.nivel,
        a.descricao, a.valor_observado, a.valor_referencia,
        nivelPrioridade(a.nivel),
        a.detalhe_json ? JSON.stringify(a.detalhe_json) : null,
      ]);
    }
    console.log(`[mart:saude-estrutura] ✓ saude_estrutura_alertas_home (${alertasHome.length} alertas)`);

    // ── mart.saude_estrutura_resumo_home ──
    const criticos  = alertas.filter(a => a.nivel === "CRITICO").length;
    const altos     = alertas.filter(a => a.nivel === "ALTO").length;
    const medios    = alertas.filter(a => a.nivel === "MEDIO").length;
    const afetados  = new Set(alertas.map(a => a.codigo_municipio_ibge).filter(Boolean)).size;

    await client.query(`DELETE FROM mart.saude_estrutura_resumo_home`);
    await client.query(`
      INSERT INTO mart.saude_estrutura_resumo_home
        (total_alertas, total_criticos, total_altos, total_medios, total_municipios_afetados)
      VALUES ($1,$2,$3,$4,$5)
    `, [alertas.length, criticos, altos, medios, afetados]);
    console.log(`[mart:saude-estrutura] ✓ saude_estrutura_resumo_home (${criticos} críticos, ${altos} altos, ${afetados} municípios afetados)`);
  });

  const duracao = Date.now() - inicio;
  console.log(`[mart:saude-estrutura] Refresh concluído em ${duracao}ms.`);

  await pgQuery(`
    INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
    VALUES ('mart:saude-estrutura', 'OK', 'Refresh completo das marts de estrutura de saúde', $1, $2)
  `, [resumos.length, duracao]);
}

if (require.main === module) {
  executarMartSaudeEstrutura()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[mart:saude-estrutura] Erro:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
