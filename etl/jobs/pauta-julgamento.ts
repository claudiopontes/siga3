import "dotenv/config";
import { queryInDatabase, closePool } from "../connectors/sqlserver";
import { pgQuery, closePgPool } from "../connectors/postgres";

const MODULO = "pauta_julgamento";
const SQL_DATABASE = process.env.EJURIS_SQLSERVER_DATABASE ?? "EJURIS";
const EPROCESS_DATABASE = process.env.EPROCESS_SQLSERVER_DATABASE ?? "EPROCESS";
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 500;

// --- Tipos de origem ---

interface SqlMovimentacaoRow {
  ID_ITEM_FLUXO_INSTAN: number;
  cod_processo: number;
  dt_mov: Date | string | null;
  dt_saida: Date | string | null;
  grupo_id: number | null;
  grupo_desc: string | null;
  item_fluxo_id: number | null;
  item_fluxo_desc: string | null;
  ID_ATIVIDADE: number | null;
  ATIVIDADE: string | null;
  FASE: string | null;
  ID_SETOR: number | null;
  usuario_login: string | null;
  NOME_USUARIO: string | null;
  ID_PROCESSO_ARQUIVO: number | null;
  TIPO_DOCUMENTO: string | null;
  ULTIMO_TIPO_DOCUMENTO: string | null;
  DATA_CRIACAO_ULTIMO_DOCUMENTO: Date | string | null;
}

interface SqlArquivoRow {
  ID_PROC_INSTAN: number;
  ID_PROC_ARQV: number;
  IC_DOCUMENTO_ASSINADO: string | number | null;
  DT_AUTUADO: Date | string | null;
  DT_CRIAC: Date | string | null;
  ID_TIPO_DOCM: number | null;
  NM_TIPO_DOCM: string | null;
  NM_PROC_ARQV: string | null;
  EN_DIR: string | null;
  ID_FASE_INSTAN: number | null;
  DATA_FINALIZADO: Date | string | null;
  NR_PAGN: number | null;
  NR_ORDEM: number | null;
}

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

// Carrega apenas sessões ENCERRADAS — a pauta só é considerada definitiva
// quando a sessão está neste estado. Sessões em andamento são ignoradas.
const SQL_TODAS_SESSOES = `
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
ORDER BY s.dt_realizacao DESC;
`;

// Itens apenas das sessões ENCERRADAS + enriquecimento EPROCESS.
const SQL_TODOS_ITENS_PAUTA = `
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
  ep.nome_1_parte        AS nome_1_parte,
  ep.Situacao_Funcional  AS situacao_funcional
FROM dbo.vw_PautaJulgamento p
JOIN dbo.Sessao s ON s.id = p.sessao_id AND s.situacao = 'ENCERRADA'
LEFT JOIN [${EPROCESS_DATABASE}].processo.vwProc_Eletronico ep
       ON ep.Cod_Processo = p.processo_id
ORDER BY p.sessao_id, p.sequencia;
`;

// Arquivos apenas dos processos de sessões ENCERRADAS.
const SQL_ARQUIVOS_PAUTA = `
SELECT
  a.ID_PROC_INSTAN,
  a.ID_PROC_ARQV,
  a.IC_DOCUMENTO_ASSINADO,
  a.DT_AUTUADO,
  a.DT_CRIAC,
  a.ID_TIPO_DOCM,
  a.NM_TIPO_DOCM,
  a.NM_PROC_ARQV,
  a.EN_DIR,
  a.ID_FASE_INSTAN,
  a.DATA_FINALIZADO,
  a.NR_PAGN,
  a.NR_ORDEM
FROM processo.vwArquivoProcesso a
WHERE a.ID_PROC_INSTAN IN (
  SELECT DISTINCT p.processo_id
  FROM [${SQL_DATABASE}].dbo.vw_PautaJulgamento p
  JOIN [${SQL_DATABASE}].dbo.Sessao s ON s.id = p.sessao_id AND s.situacao = 'ENCERRADA'
  WHERE p.processo_id IS NOT NULL
)
ORDER BY a.ID_PROC_INSTAN, a.NR_ORDEM;
`;

// Movimentações apenas dos processos de sessões ENCERRADAS.
const SQL_MOVIMENTACOES_PAUTA = `
SELECT
  fi.ID_ITEM_FLUXO_INSTAN,
  fi.cod_processo,
  fi.dt_mov,
  fi.dt_saida,
  fi.grupo_id,
  fi.grupo_desc,
  fi.item_fluxo_id,
  fi.item_fluxo_desc,
  fi.ID_ATIVIDADE,
  fi.ATIVIDADE,
  fi.FASE,
  fi.ID_SETOR,
  fi.usuario_login,
  fi.NOME_USUARIO,
  fi.ID_PROCESSO_ARQUIVO,
  fi.TIPO_DOCUMENTO,
  fi.ULTIMO_TIPO_DOCUMENTO,
  fi.DATA_CRIACAO_ULTIMO_DOCUMENTO
FROM processo.vwMovimentacoes fi
WHERE fi.cod_processo IN (
  SELECT DISTINCT p.processo_id
  FROM [${SQL_DATABASE}].dbo.vw_PautaJulgamento p
  JOIN [${SQL_DATABASE}].dbo.Sessao s ON s.id = p.sessao_id AND s.situacao = 'ENCERRADA'
  WHERE p.processo_id IS NOT NULL
)
ORDER BY fi.cod_processo, fi.dt_mov;
`;

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
            coletado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,now())
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
        ],
      );
      inseridos++;
    }
  }
  return inseridos;
}

// --- Upsert movimentações ---

async function inserirMovimentacoes(movs: SqlMovimentacaoRow[], cargaId: number): Promise<number> {
  let inseridos = 0;
  for (let i = 0; i < movs.length; i += BATCH_SIZE) {
    const lote = movs.slice(i, i + BATCH_SIZE);
    for (const m of lote) {
      await pgQuery(
        `INSERT INTO public.pauta_julgamento_movimentacao
           (processo_id, carga_id, id_item_fluxo_instan,
            dt_mov, dt_saida,
            grupo_id, grupo_desc,
            item_fluxo_id, item_fluxo_desc,
            id_atividade, atividade, fase,
            id_setor, usuario_login, nome_usuario,
            id_processo_arquivo, tipo_documento,
            ultimo_tipo_documento, data_criacao_ultimo_doc,
            coletado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now())
         ON CONFLICT (id_item_fluxo_instan, COALESCE(id_processo_arquivo, -1)) DO NOTHING`,
        [
          m.cod_processo, cargaId, m.ID_ITEM_FLUXO_INSTAN,
          toIso(m.dt_mov), toIso(m.dt_saida),
          toNullableInt(m.grupo_id), toText(m.grupo_desc),
          toNullableInt(m.item_fluxo_id), toText(m.item_fluxo_desc),
          toNullableInt(m.ID_ATIVIDADE), toText(m.ATIVIDADE), toText(m.FASE),
          toNullableInt(m.ID_SETOR), toText(m.usuario_login), toText(m.NOME_USUARIO),
          m.ID_PROCESSO_ARQUIVO !== null ? toNullableInt(m.ID_PROCESSO_ARQUIVO) : null,
          toText(m.TIPO_DOCUMENTO),
          toText(m.ULTIMO_TIPO_DOCUMENTO), toIso(m.DATA_CRIACAO_ULTIMO_DOCUMENTO),
        ],
      );
      inseridos++;
    }
  }
  return inseridos;
}

// --- Upsert arquivos dos processos ---

async function inserirArquivos(arquivos: SqlArquivoRow[], cargaId: number): Promise<number> {
  let inseridos = 0;
  for (let i = 0; i < arquivos.length; i += BATCH_SIZE) {
    const lote = arquivos.slice(i, i + BATCH_SIZE);
    for (const a of lote) {
      await pgQuery(
        `INSERT INTO public.pauta_julgamento_arquivo
           (id_proc_arqv, processo_id, carga_id, id_tipo_docm, nm_tipo_docm,
            nm_proc_arqv, en_dir, ic_documento_assinado,
            dt_autuado, dt_criac, data_finalizado,
            nr_pagn, nr_ordem, id_fase_instan, coletado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
         ON CONFLICT (id_proc_arqv) DO NOTHING`,
        [
          a.ID_PROC_ARQV, a.ID_PROC_INSTAN, cargaId,
          toNullableInt(a.ID_TIPO_DOCM), toText(a.NM_TIPO_DOCM),
          toText(a.NM_PROC_ARQV), toText(a.EN_DIR),
          a.IC_DOCUMENTO_ASSINADO !== null ? String(a.IC_DOCUMENTO_ASSINADO) : null,
          toIso(a.DT_AUTUADO), toIso(a.DT_CRIAC), toIso(a.DATA_FINALIZADO),
          toNullableInt(a.NR_PAGN), toNullableInt(a.NR_ORDEM),
          toNullableInt(a.ID_FASE_INSTAN),
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
    // 1. Sessões (dbo.vw_Sessao — inclui orgao_julgador, dt_encerramento, contadores)
    console.log(`  -> Consultando sessões em ${SQL_DATABASE}.dbo.vw_Sessao...`);
    const sessoes = await queryInDatabase<SqlSessaoRow>(SQL_DATABASE, SQL_TODAS_SESSOES);
    console.log(`  -> Sessões ENCERRADAS encontradas: ${sessoes.length}`);

    // 2. Itens de pauta com enriquecimento EPROCESS (cross-db join na mesma instância)
    console.log(`  -> Consultando itens em ${SQL_DATABASE}.dbo.vw_PautaJulgamento + ${EPROCESS_DATABASE}...`);
    const todosItens = await queryInDatabase<SqlItemPautaRow>(SQL_DATABASE, SQL_TODOS_ITENS_PAUTA);
    console.log(`  -> Itens encontrados: ${todosItens.length}`);

    // 3. Arquivos PDF dos processos na pauta (consultado a partir do EPROCESS)
    console.log(`  -> Consultando arquivos em ${EPROCESS_DATABASE}.processo.vwArquivoProcesso...`);
    const todosArquivos = await queryInDatabase<SqlArquivoRow>(EPROCESS_DATABASE, SQL_ARQUIVOS_PAUTA);
    console.log(`  -> Arquivos encontrados: ${todosArquivos.length}`);

    // 4. Movimentações dos processos na pauta (consultado a partir do EPROCESS)
    console.log(`  -> Consultando movimentações em ${EPROCESS_DATABASE}.processo.vwMovimentacoes...`);
    const todasMovimentacoes = await queryInDatabase<SqlMovimentacaoRow>(EPROCESS_DATABASE, SQL_MOVIMENTACOES_PAUTA);
    console.log(`  -> Movimentações encontradas: ${todasMovimentacoes.length}`);

    if (DRY_RUN) {
      console.log("\n--- DRY-RUN: pauta_julgamento ---");
      console.log(`  Sessões: ${sessoes.length}`);
      console.dir(sessoes.slice(0, 2), { depth: null });
      console.log(`  Itens: ${todosItens.length}`);
      console.dir(todosItens.slice(0, 2), { depth: null });
      console.log(`  Arquivos: ${todosArquivos.length}`);
      console.dir(todosArquivos.slice(0, 2), { depth: null });
      console.log(`  Movimentações: ${todasMovimentacoes.length}`);
      console.dir(todasMovimentacoes.slice(0, 2), { depth: null });
      console.log("--- Fim dry-run ---\n");
      return;
    }

    // 5. Registro de carga
    cargaId = await criarCarga();
    console.log(`  -> carga_id=${cargaId}`);

    // 6. Inserir sessões (novas; existentes ignoradas — DO NOTHING)
    const sessoesInseridas = await inserirSessoes(sessoes, cargaId);
    console.log(`  -> Sessões inseridas: ${sessoesInseridas}`);

    // 7. Inserir itens
    const itensInseridos = await inserirItens(todosItens, cargaId);
    console.log(`  -> Itens inseridos: ${itensInseridos}`);

    // 8. Inserir arquivos
    const arquivosInseridos = await inserirArquivos(todosArquivos, cargaId);
    console.log(`  -> Arquivos inseridos: ${arquivosInseridos}`);

    // 9. Inserir movimentações
    const movsInseridas = await inserirMovimentacoes(todasMovimentacoes, cargaId);
    console.log(`  -> Movimentações inseridas: ${movsInseridas}`);

    const totalInseridos = sessoesInseridas + itensInseridos + arquivosInseridos + movsInseridas;
    await finalizarCarga(cargaId, "sucesso", totalInseridos);

    const duracao = Date.now() - inicio;
    await gravarLog("sucesso", totalInseridos, duracao);
    console.log(`  OK — ${MODULO} em ${duracao} ms (${sessoesInseridas} sessões, ${itensInseridos} itens, ${arquivosInseridos} arquivos, ${movsInseridas} movimentações)`);

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
