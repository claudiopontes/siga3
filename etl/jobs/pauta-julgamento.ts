import "dotenv/config";
import { queryInDatabase, closePool } from "../connectors/sqlserver";
import { pgQuery, closePgPool } from "../connectors/postgres";

const MODULO = "pauta_julgamento";
const SQL_DATABASE = process.env.EJURIS_SQLSERVER_DATABASE ?? "EJURIS";
const EPROCESS_DATABASE = process.env.EPROCESS_SQLSERVER_DATABASE ?? "EPROCESS";
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 500;

// --- Tipos de origem ---

interface SqlSessaoRow {
  id: number;
  numero: string | number | null;
  dt_realizacao: Date | string | null;
  orgao_julgador_id: number | null;
  orgao_julgador: string | null;
  local_sessao: string | null;
  tipo: string | null;
  situacao: string | null;
  numero_publicacao: string | number | null;
  data_publicacao: Date | string | null;
  tipo_publicacao: string | null;
  arquivo_sessao: string | null;
  dt_encerramento: Date | string | null;
  qtd_julgado: number | null;
  qtd_vistas: number | null;
  qtd_julgamento: number | null;
}

interface SqlItemPautaRow {
  id: number;
  sessao_id: number | null;
  sessao_numero: string | number | null;
  processo_id: string | number | null;
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
  advogado: string | null;
  incluir_interessados: boolean | number | string | null;
  julgado: boolean | number | string | null;
  // enriquecimento EPROCESS
  numero_processo_fmt: string | null;
  objeto: string | null;
  nome_classe: string | null;
  assunto: string | null;
  nome_1_parte: string | null;
  situacao_funcional: string | null;
  nome_orgao: string | null;
}

// --- Helpers ---

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

// Carrega apenas sessões ENCERRADAS não presentes no PostgreSQL.
function sqlSessoesNovas(idsExcluir: number[]): string {
  const filtro = idsExcluir.length > 0
    ? `AND s.id NOT IN (${idsExcluir.join(",")})`
    : "";
  return `
SELECT
  s.id,
  s.numero,
  s.dt_realizacao,
  s.orgao_julgador_id,
  s.orgao_julgador_normal AS orgao_julgador,
  s.local_sessao,
  s.tipo,
  s.situacao,
  s.numero_publicacao,
  s.data_publicacao,
  s.tipo_publicacao,
  s.arquivo_sessao,
  s.dt_encerramento,
  s.qtd_julgado_lib  AS qtd_julgado,
  s.qtd_vistas,
  s.qtd_julgamento
FROM dbo.vw_Sessao s
WHERE s.situacao = 'ENCERRADA'
${filtro}
ORDER BY s.dt_realizacao DESC;
`;
}

// Itens das sessões novas + enriquecimento EPROCESS.
function sqlItensNovos(sessaoIds: number[]): string {
  const lista = sessaoIds.join(",");
  return `
SELECT
  p.id,
  p.sessao_id,
  p.sessao_numero,
  p.processo_id,
  p.situacao,
  p.sequencia,
  p.relator_id,
  p.nome_relator,
  p.cargo_relator,
  p.titulo_relator,
  p.relator_tratamento,
  p.revisor_id,
  p.nome_revisor,
  p.cargo_revisor,
  p.titulo_revisor,
  p.eletronico,
  p.qtde_pron,
  p.advogado,
  p.incluir_interessados,
  p.julgado,
  ep.Num_proc_ano        AS numero_processo_fmt,
  ep.Objeto              AS objeto,
  ep.nome_classe         AS nome_classe,
  ep.NM_ASSUN            AS assunto,
  ep.Partes              AS nome_1_parte,
  ep.Situacao_Funcional  AS situacao_funcional,
  ep.Cod_Orgao           AS nome_orgao
FROM dbo.vw_PautaJulgamento p
JOIN dbo.Sessao s ON s.id = p.sessao_id AND s.situacao = 'ENCERRADA'
LEFT JOIN [${EPROCESS_DATABASE}].processo.vwProc_Eletronico ep
       ON ep.Cod_Processo = p.processo_id
WHERE p.sessao_id IN (${lista})
ORDER BY p.sessao_id, p.sequencia;
`;
}


// --- Controle de carga ---

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

// --- Upsert sessões ---

async function inserirSessoes(sessoes: SqlSessaoRow[], cargaId: number): Promise<number> {
  let inseridos = 0;
  for (let i = 0; i < sessoes.length; i += BATCH_SIZE) {
    const lote = sessoes.slice(i, i + BATCH_SIZE);
    for (const s of lote) {
      await pgQuery(
        `INSERT INTO public.pauta_julgamento_sessao
           (id, carga_id, numero, dt_realizacao, orgao_julgador_id, orgao_julgador,
            local_sessao, tipo, situacao, numero_publicacao, data_publicacao,
            tipo_publicacao, arquivo_sessao, dt_encerramento,
            qtd_julgado, qtd_vistas, qtd_julgamento, coletado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now())
         ON CONFLICT (id) DO NOTHING`,
        [
          s.id, cargaId,
          toText(s.numero), toIso(s.dt_realizacao),
          toNullableInt(s.orgao_julgador_id), toText(s.orgao_julgador),
          toText(s.local_sessao), toText(s.tipo), toText(s.situacao),
          toText(s.numero_publicacao), toIso(s.data_publicacao),
          toText(s.tipo_publicacao), toText(s.arquivo_sessao),
          toIso(s.dt_encerramento),
          toNullableInt(s.qtd_julgado), toNullableInt(s.qtd_vistas), toNullableInt(s.qtd_julgamento),
        ],
      );
      inseridos++;
    }
  }
  return inseridos;
}

// --- Upsert itens de pauta ---

async function inserirItens(itens: SqlItemPautaRow[], cargaId: number): Promise<number> {
  let inseridos = 0;
  for (let i = 0; i < itens.length; i += BATCH_SIZE) {
    const lote = itens.slice(i, i + BATCH_SIZE);
    for (const p of lote) {
      await pgQuery(
        `INSERT INTO public.pauta_julgamento_item
           (id, carga_id, sessao_id, sessao_numero, processo_id,
            situacao, sequencia,
            relator_id, nome_relator, cargo_relator, titulo_relator, relator_tratamento,
            revisor_id, nome_revisor, cargo_revisor, titulo_revisor,
            eletronico, qtde_pron, advogado, incluir_interessados, julgado,
            numero_processo_fmt, objeto, nome_classe, assunto, nome_1_parte, situacao_funcional,
            nome_orgao, coletado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,now())
         ON CONFLICT (id) DO NOTHING`,
        [
          p.id, cargaId,
          toNullableInt(p.sessao_id), toText(p.sessao_numero),
          toNullableInt(p.processo_id),
          toText(p.situacao), toNullableInt(p.sequencia),
          toNullableInt(p.relator_id), toText(p.nome_relator),
          toText(p.cargo_relator), toText(p.titulo_relator), toText(p.relator_tratamento),
          toNullableInt(p.revisor_id), toText(p.nome_revisor),
          toText(p.cargo_revisor), toText(p.titulo_revisor),
          p.eletronico !== null ? String(p.eletronico) : null,
          toNullableInt(p.qtde_pron),
          toText(p.advogado),
          p.incluir_interessados !== null ? String(p.incluir_interessados) : null,
          p.julgado !== null ? String(p.julgado) : null,
          toText(p.numero_processo_fmt),
          toText(p.objeto),
          toText(p.nome_classe),
          toText(p.assunto),
          toText(p.nome_1_parte),
          toText(p.situacao_funcional),
          toText(p.nome_orgao),
        ],
      );
      inseridos++;
    }
  }
  return inseridos;
}

// --- Função principal ---

export async function executarCargaPautaJulgamento(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  if (DRY_RUN) console.log("  -> Modo dry-run ativo. Nenhum dado será gravado no PostgreSQL.");

  let cargaId: number | null = null;
  let totalInseridos = 0;

  try {
    // 1. IDs de sessões já presentes no PostgreSQL
    const pgSessoes = await pgQuery<{ id: number }>("SELECT id FROM public.pauta_julgamento_sessao");
    const idsExistentes = pgSessoes.map((r) => r.id);
    console.log(`  -> Sessões já no PostgreSQL: ${idsExistentes.length}`);

    // 2. Busca no SQL Server apenas sessões ENCERRADAS que ainda não existem
    console.log(`  -> Consultando sessões novas em ${SQL_DATABASE}.dbo.vw_Sessao...`);
    const sessoes = await queryInDatabase<SqlSessaoRow>(SQL_DATABASE, sqlSessoesNovas(idsExistentes));
    console.log(`  -> Sessões novas encontradas: ${sessoes.length}`);

    if (sessoes.length === 0) {
      console.log("  -> Nenhuma sessão nova. ETL encerrado sem alterações.");
      const duracao = Date.now() - inicio;
      await gravarLog("sucesso", 0, duracao, "Sem sessões novas — nada a inserir.");
      return;
    }

    const novasSessaoIds = sessoes.map((s) => s.id);

    // 3. Itens apenas das sessões novas
    console.log(`  -> Consultando itens das ${novasSessaoIds.length} sessões novas...`);
    const todosItens = await queryInDatabase<SqlItemPautaRow>(SQL_DATABASE, sqlItensNovos(novasSessaoIds));
    console.log(`  -> Itens encontrados: ${todosItens.length}`);

    if (DRY_RUN) {
      console.log("\n--- DRY-RUN: pauta_julgamento ---");
      console.log(`  Sessões novas: ${sessoes.length}`);
      console.dir(sessoes.slice(0, 2), { depth: null });
      console.log(`  Itens: ${todosItens.length}`);
      console.dir(todosItens.slice(0, 2), { depth: null });
      console.log("--- Fim dry-run ---\n");
      return;
    }

    // 4. Registro de carga
    cargaId = await criarCarga();
    console.log(`  -> carga_id=${cargaId}`);

    // 5. Inserir sessões novas
    const sessoesInseridas = await inserirSessoes(sessoes, cargaId);
    console.log(`  -> Sessões inseridas: ${sessoesInseridas}`);

    // 6. Inserir itens
    const itensInseridos = await inserirItens(todosItens, cargaId);
    console.log(`  -> Itens inseridos: ${itensInseridos}`);

    const totalInseridos = sessoesInseridas + itensInseridos;
    await finalizarCarga(cargaId, "sucesso", totalInseridos);

    const duracao = Date.now() - inicio;
    await gravarLog("sucesso", totalInseridos, duracao);
    console.log(`  OK — ${MODULO} em ${duracao} ms (${sessoesInseridas} sessões, ${itensInseridos} itens)`);

  } catch (error) {
    const duracao = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error(`  ERRO — ${mensagem}`);

    if (cargaId !== null) {
      await finalizarCarga(cargaId, "erro", totalInseridos, mensagem).catch((e) => {
        console.error(`  ERRO ao atualizar carga: ${e instanceof Error ? e.message : String(e)}`);
      });
    }

    await gravarLog("erro", totalInseridos, duracao, mensagem).catch((e) => {
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
