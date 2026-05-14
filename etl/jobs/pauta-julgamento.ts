import "dotenv/config";
import { queryInDatabase, closePool } from "../connectors/sqlserver";
import { pgQuery, closePgPool } from "../connectors/postgres";

const MODULO = "pauta_julgamento";
const SQL_DATABASE = process.env.EJURIS_SQLSERVER_DATABASE ?? "EJURIS";
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 500;

// --- Tipos de origem (SQL Server EJURIS) ---

interface SqlSessaoRow {
  id: number;
  numero: string | number | null;
  dt_realizacao: Date | string | null;
  orgao_julgador_id: number | null;
  local_sessao: string | null;
  tipo: string | null;
  situacao: string | null;
  numero_publicacao: string | number | null;
  data_publicacao: Date | string | null;
  tipo_publicacao: string | null;
  arquivo_sessao: string | null;
}

interface SqlProcessoPautaRow {
  id: number;
  sessao_id: number | null;
  sessao_numero: string | number | null;
  processo_id: string | number | null;
  numero_processo: string | number | null;
  situacao: string | null;
  sequencia: number | null;
  relator_id: number | null;
  nome_relator: string | null;
  cargo_relator: string | null;
  titulo_relator: string | null;
  relator_tratamento: string | null;
  revisor_id: number | null;
  nome_revisor: string | null;
  cargo_revisor: string | null;
  titulo_revisor: string | null;
  eletronico: boolean | number | string | null;
  qtde_pron: number | null;
  incluir_interessados: boolean | number | string | null;
  julgado: boolean | number | string | null;
}

// --- Helpers de normalização ---

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? value.toISOString() : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  return null;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function toNullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// --- Queries SQL Server ---
// Sem "USE [database]" — queryInDatabase já conecta no banco correto via config.

// Carrega TODAS as sessões (todos os estados: PARA PAUTA, PARA JULGAMENTO, ENCERRADA, etc.)
const SQL_TODAS_SESSOES = `
SELECT
  s.id,
  s.numero,
  s.dt_realizacao,
  s.orgao_julgador_id,
  s.local_sessao,
  s.tipo,
  s.situacao,
  s.numero_publicacao,
  s.data_publicacao,
  s.tipo_publicacao,
  s.arquivo_sessao
FROM dbo.Sessao s
ORDER BY s.dt_realizacao DESC;
`;

// Carrega TODOS os itens de pauta de uma só vez (evita N+1 de conexões).
// dbo.Processo está no banco EPROCESS — não fazemos cross-db join aqui;
// numero_processo fica como NULL e pode ser enriquecido futuramente.
const SQL_TODOS_ITENS_PAUTA = `
SELECT
  p.id,
  p.sessao_id,
  s.numero        AS sessao_numero,
  p.processo_id,
  CAST(p.processo_id AS NVARCHAR(50)) AS numero_processo,
  p.situacao,
  p.sequencia,
  p.relator_id,
  mr.nome         AS nome_relator,
  mr.cargo        AS cargo_relator,
  mr.titulo       AS titulo_relator,
  mr.tratamento   AS relator_tratamento,
  p.revisor_id,
  rv.nome         AS nome_revisor,
  rv.cargo        AS cargo_revisor,
  rv.titulo       AS titulo_revisor,
  p.eletronico,
  p.qtde_pron,
  p.incluir_interessados,
  p.julgado
FROM dbo.vw_PautaJulgamento p
LEFT JOIN dbo.Sessao  s  ON s.id  = p.sessao_id
LEFT JOIN dbo.Membro  mr ON mr.id = p.relator_id
LEFT JOIN dbo.Membro  rv ON rv.id = p.revisor_id
ORDER BY p.sessao_id, p.sequencia;
`;

// --- Controle de carga no PostgreSQL ---

async function gravarLog(status: "sucesso" | "erro", registros: number, duracao: number, mensagem?: string): Promise<void> {
  await pgQuery(
    `INSERT INTO audit.etl_log (modulo, status, registros, duracao_ms, mensagem)
     VALUES ($1, $2, $3, $4, $5)`,
    [MODULO, status, registros, duracao, mensagem ?? null],
  );
}

async function criarCarga(): Promise<number> {
  const rows = await pgQuery<{ id: number }>(
    `INSERT INTO public.pauta_julgamento_carga (fonte, status, registros)
     VALUES ($1, $2, $3)
     RETURNING id`,
    ["sqlserver_ejuris", "iniciada", 0],
  );
  return rows[0].id;
}

async function finalizarCarga(cargaId: number, status: "sucesso" | "erro", registros: number, mensagem?: string): Promise<void> {
  await pgQuery(
    `UPDATE public.pauta_julgamento_carga
     SET status = $1, finalizado_em = now(), registros = $2, mensagem = $3
     WHERE id = $4`,
    [status, registros, mensagem ?? null, cargaId],
  );
}

// --- Upsert das sessões (atualiza situacao e demais campos a cada carga) ---

async function upsertSessoes(sessoes: SqlSessaoRow[], cargaId: number): Promise<number> {
  let upsertados = 0;
  for (let i = 0; i < sessoes.length; i += BATCH_SIZE) {
    const lote = sessoes.slice(i, i + BATCH_SIZE);
    for (const s of lote) {
      await pgQuery(
        `INSERT INTO public.pauta_julgamento_sessao
           (id, carga_id, numero, dt_realizacao, orgao_julgador_id, local_sessao,
            tipo, situacao, numero_publicacao, data_publicacao, tipo_publicacao, arquivo_sessao, coletado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
         ON CONFLICT (id) DO UPDATE SET
           carga_id          = EXCLUDED.carga_id,
           numero            = EXCLUDED.numero,
           dt_realizacao     = EXCLUDED.dt_realizacao,
           orgao_julgador_id = EXCLUDED.orgao_julgador_id,
           local_sessao      = EXCLUDED.local_sessao,
           tipo              = EXCLUDED.tipo,
           situacao          = EXCLUDED.situacao,
           numero_publicacao = EXCLUDED.numero_publicacao,
           data_publicacao   = EXCLUDED.data_publicacao,
           tipo_publicacao   = EXCLUDED.tipo_publicacao,
           arquivo_sessao    = EXCLUDED.arquivo_sessao,
           coletado_em       = now()`,
        [
          s.id, cargaId,
          toText(s.numero), toIso(s.dt_realizacao),
          toNullableInt(s.orgao_julgador_id),
          toText(s.local_sessao), toText(s.tipo), toText(s.situacao),
          toText(s.numero_publicacao), toIso(s.data_publicacao),
          toText(s.tipo_publicacao), toText(s.arquivo_sessao),
        ],
      );
      upsertados++;
    }
  }
  return upsertados;
}

// --- Upsert dos itens de pauta (incremental — novos registros inseridos, existentes atualizados) ---

async function upsertItens(processos: SqlProcessoPautaRow[], cargaId: number): Promise<number> {
  let upsertados = 0;
  for (let i = 0; i < processos.length; i += BATCH_SIZE) {
    const lote = processos.slice(i, i + BATCH_SIZE);
    for (const p of lote) {
      await pgQuery(
        `INSERT INTO public.pauta_julgamento_item
           (id, carga_id, sessao_id, sessao_numero, processo_id, numero_processo,
            situacao, sequencia, relator_id, nome_relator, cargo_relator, titulo_relator,
            relator_tratamento, revisor_id, nome_revisor, cargo_revisor, titulo_revisor,
            eletronico, qtde_pron, incluir_interessados, julgado, coletado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now())
         ON CONFLICT (id) DO UPDATE SET
           carga_id             = EXCLUDED.carga_id,
           sessao_id            = EXCLUDED.sessao_id,
           sessao_numero        = EXCLUDED.sessao_numero,
           processo_id          = EXCLUDED.processo_id,
           numero_processo      = EXCLUDED.numero_processo,
           situacao             = EXCLUDED.situacao,
           sequencia            = EXCLUDED.sequencia,
           relator_id           = EXCLUDED.relator_id,
           nome_relator         = EXCLUDED.nome_relator,
           cargo_relator        = EXCLUDED.cargo_relator,
           titulo_relator       = EXCLUDED.titulo_relator,
           relator_tratamento   = EXCLUDED.relator_tratamento,
           revisor_id           = EXCLUDED.revisor_id,
           nome_revisor         = EXCLUDED.nome_revisor,
           cargo_revisor        = EXCLUDED.cargo_revisor,
           titulo_revisor       = EXCLUDED.titulo_revisor,
           eletronico           = EXCLUDED.eletronico,
           qtde_pron            = EXCLUDED.qtde_pron,
           incluir_interessados = EXCLUDED.incluir_interessados,
           julgado              = EXCLUDED.julgado,
           coletado_em          = now()`,
        [
          p.id, cargaId,
          toNullableInt(p.sessao_id), toText(p.sessao_numero),
          toNullableInt(p.processo_id), toText(p.numero_processo),
          toText(p.situacao), toNullableInt(p.sequencia),
          toNullableInt(p.relator_id), toText(p.nome_relator),
          toText(p.cargo_relator), toText(p.titulo_relator),
          toText(p.relator_tratamento),
          toNullableInt(p.revisor_id), toText(p.nome_revisor),
          toText(p.cargo_revisor), toText(p.titulo_revisor),
          p.eletronico !== null ? String(p.eletronico) : null,
          toNullableInt(p.qtde_pron),
          p.incluir_interessados !== null ? String(p.incluir_interessados) : null,
          p.julgado !== null ? String(p.julgado) : null,
        ],
      );
      upsertados++;
    }
  }
  return upsertados;
}

// --- Função principal exportada ---

export async function executarCargaPautaJulgamento(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  if (DRY_RUN) console.log("  -> Modo dry-run ativo. Nenhum dado será gravado no PostgreSQL.");

  let cargaId: number | null = null;
  let totalUpsertados = 0;

  try {
    // 1. Buscar todas as sessões do EJURIS (todos os estados)
    console.log(`  -> Consultando sessões em ${SQL_DATABASE}.dbo.Sessao...`);
    const sessoes = await queryInDatabase<SqlSessaoRow>(SQL_DATABASE, SQL_TODAS_SESSOES);
    console.log(`  -> Sessões encontradas: ${sessoes.length}`);

    // 2. Buscar todos os itens de pauta de uma só vez (sem loop por sessão)
    console.log(`  -> Consultando itens de pauta em ${SQL_DATABASE}.dbo.vw_PautaJulgamento...`);
    const todosItens = await queryInDatabase<SqlProcessoPautaRow>(SQL_DATABASE, SQL_TODOS_ITENS_PAUTA);
    console.log(`  -> Itens de pauta encontrados: ${todosItens.length}`);

    if (DRY_RUN) {
      console.log("\n--- DRY-RUN: pauta_julgamento ---");
      console.log(`  Total de sessões: ${sessoes.length}`);
      console.dir(sessoes.slice(0, 3), { depth: null });
      console.log(`  Total de itens: ${todosItens.length}`);
      console.dir(todosItens.slice(0, 3), { depth: null });
      console.log("--- Fim dry-run ---\n");
      return;
    }

    // 3. Criar registro de carga
    cargaId = await criarCarga();
    console.log(`  -> carga_id=${cargaId}`);

    // 4. Upsert sessões (insere novas, atualiza situacao e demais campos das existentes)
    const sessoesUpsertadas = await upsertSessoes(sessoes, cargaId);
    console.log(`  -> Sessões upsertadas: ${sessoesUpsertadas}`);

    // 5. Upsert itens de pauta (incremental — preserva histórico, atualiza campos)
    const itensUpsertados = await upsertItens(todosItens, cargaId);
    console.log(`  -> Itens upsertados: ${itensUpsertados}`);

    totalUpsertados = sessoesUpsertadas + itensUpsertados;
    await finalizarCarga(cargaId, "sucesso", totalUpsertados);

    const duracao = Date.now() - inicio;
    await gravarLog("sucesso", totalUpsertados, duracao);
    console.log(`  OK — ${MODULO} carregado em ${duracao} ms (${sessoesUpsertadas} sessões, ${itensUpsertados} itens)`);

  } catch (error) {
    const duracao = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error(`  ERRO — ${mensagem}`);

    if (cargaId !== null) {
      await finalizarCarga(cargaId, "erro", totalUpsertados, mensagem).catch((e) => {
        console.error(`  ERRO ao atualizar carga com falha: ${e instanceof Error ? e.message : String(e)}`);
      });
    }

    await gravarLog("erro", totalUpsertados, duracao, mensagem).catch((e) => {
      console.error(`  ERRO ao gravar etl_log: ${e instanceof Error ? e.message : String(e)}`);
    });
    throw error;

  } finally {
    await closePool();
  }
}

// Permite execução direta: ts-node jobs/pauta-julgamento.ts [--dry-run]
if (require.main === module) {
  executarCargaPautaJulgamento()
    .catch(() => process.exit(1))
    .finally(() => closePgPool());
}
