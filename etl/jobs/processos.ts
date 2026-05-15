import "dotenv/config";
import { queryInDatabase, closePool } from "../connectors/sqlserver";
import { pgQuery, closePgPool } from "../connectors/postgres";

const MODULO = "processos_eprocess";
const EPROCESS_DATABASE = process.env.EPROCESS_SQLSERVER_DATABASE ?? "EPROCESS";
const SQL_DATABASE = process.env.EJURIS_SQLSERVER_DATABASE ?? "EJURIS";
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 500;

// --- Tipos ---

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

function sqlArquivosNovos(processoIds: number[]): string {
  const lista = processoIds.join(",");
  return `
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
WHERE a.ID_PROC_INSTAN IN (${lista})
ORDER BY a.ID_PROC_INSTAN, a.NR_ORDEM;
`;
}

function sqlMovimentacoesNovos(processoIds: number[]): string {
  const lista = processoIds.join(",");
  return `
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
WHERE fi.cod_processo IN (${lista})
ORDER BY fi.cod_processo, fi.dt_mov;
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
    ["sqlserver_eprocess", "iniciada", 0],
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

// --- Upsert arquivos ---

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

// --- Função principal ---

export async function executarCargaProcessos(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  if (DRY_RUN) console.log("  -> Modo dry-run ativo. Nenhum dado será gravado no PostgreSQL.");

  let cargaId: number | null = null;
  let totalInseridos = 0;

  try {
    // 1. Todos os processo_ids presentes nos itens de pauta (fonte de verdade)
    const pgItens = await pgQuery<{ processo_id: number }>(
      "SELECT DISTINCT processo_id FROM public.pauta_julgamento_item WHERE processo_id IS NOT NULL",
    );
    const todosProcessoIds = pgItens.map((r) => r.processo_id);
    console.log(`  -> Total de processos nos itens de pauta: ${todosProcessoIds.length}`);

    if (todosProcessoIds.length === 0) {
      console.log("  -> Nenhum processo encontrado. Execute primeiro o ETL pauta_julgamento.");
      const duracao = Date.now() - inicio;
      await gravarLog("sucesso", 0, duracao, "Nenhum processo nos itens de pauta.");
      return;
    }

    // 2. Processos que já têm arquivos carregados
    const pgArquivos = await pgQuery<{ processo_id: number }>(
      "SELECT DISTINCT processo_id FROM public.pauta_julgamento_arquivo WHERE processo_id IS NOT NULL",
    );
    const processosComArquivos = new Set(pgArquivos.map((r) => r.processo_id));

    // 3. Processos que já têm movimentações carregadas
    const pgMovs = await pgQuery<{ processo_id: number }>(
      "SELECT DISTINCT processo_id FROM public.pauta_julgamento_movimentacao WHERE processo_id IS NOT NULL",
    );
    const processosComMovs = new Set(pgMovs.map((r) => r.processo_id));

    // 4. Processos novos = sem arquivos OU sem movimentações
    const processosNovos = todosProcessoIds.filter(
      (id) => !processosComArquivos.has(id) || !processosComMovs.has(id),
    );
    console.log(`  -> Processos já carregados (arquivos): ${processosComArquivos.size}`);
    console.log(`  -> Processos já carregados (movimentações): ${processosComMovs.size}`);
    console.log(`  -> Processos novos a carregar: ${processosNovos.length}`);

    if (processosNovos.length === 0) {
      console.log("  -> Nenhum processo novo. ETL encerrado sem alterações.");
      const duracao = Date.now() - inicio;
      await gravarLog("sucesso", 0, duracao, "Sem processos novos — nada a inserir.");
      return;
    }

    // 5. Busca arquivos e movimentações no EPROCESS
    console.log(`  -> Consultando arquivos de ${processosNovos.length} processos...`);
    const arquivos = await queryInDatabase<SqlArquivoRow>(EPROCESS_DATABASE, sqlArquivosNovos(processosNovos));
    console.log(`  -> Arquivos encontrados: ${arquivos.length}`);

    console.log(`  -> Consultando movimentações de ${processosNovos.length} processos...`);
    const movimentacoes = await queryInDatabase<SqlMovimentacaoRow>(EPROCESS_DATABASE, sqlMovimentacoesNovos(processosNovos));
    console.log(`  -> Movimentações encontradas: ${movimentacoes.length}`);

    if (DRY_RUN) {
      console.log("\n--- DRY-RUN: processos_eprocess ---");
      console.log(`  Processos novos: ${processosNovos.length}`);
      console.log(`  Arquivos: ${arquivos.length}`);
      console.dir(arquivos.slice(0, 2), { depth: null });
      console.log(`  Movimentações: ${movimentacoes.length}`);
      console.dir(movimentacoes.slice(0, 2), { depth: null });
      console.log("--- Fim dry-run ---\n");
      return;
    }

    // 6. Registro de carga
    cargaId = await criarCarga();
    console.log(`  -> carga_id=${cargaId}`);

    // 7. Inserir arquivos
    const arquivosInseridos = await inserirArquivos(arquivos, cargaId);
    console.log(`  -> Arquivos inseridos: ${arquivosInseridos}`);

    // 8. Inserir movimentações
    const movsInseridas = await inserirMovimentacoes(movimentacoes, cargaId);
    console.log(`  -> Movimentações inseridas: ${movsInseridas}`);

    totalInseridos = arquivosInseridos + movsInseridas;
    await finalizarCarga(cargaId, "sucesso", totalInseridos);

    const duracao = Date.now() - inicio;
    await gravarLog("sucesso", totalInseridos, duracao);
    console.log(`  OK — ${MODULO} em ${duracao} ms (${arquivosInseridos} arquivos, ${movsInseridas} movimentações)`);

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

// Permite execução direta: ts-node jobs/processos.ts [--dry-run]
if (require.main === module) {
  executarCargaProcessos()
    .catch(() => process.exit(1))
    .finally(() => closePgPool());
}
