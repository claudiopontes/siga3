import "dotenv/config";
import { queryInDatabase, closePool } from "../connectors/sqlserver";
import { pgQuery, closePgPool } from "../connectors/postgres";
import { iniciarCargaEtl, finalizarCargaEtl, registrarLogEtl, type StatusCarga } from "../lib/auditoria";

const MODULO = "processos_eprocess";
const EPROCESS_DATABASE = process.env.EPROCESS_SQLSERVER_DATABASE ?? "EPROCESS";
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 500;
const SQL_BATCH = 1000;

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

function sqlArquivos(processoIds: number[]): string {
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

function sqlMovimentacoes(processoIds: number[]): string {
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
  const statusAudit: StatusCarga = status === "sucesso" ? "ok" : "erro";
  await registrarLogEtl({
    modulo: MODULO,
    status: statusAudit,
    registros,
    duracaoMs: duracao,
    mensagem: mensagem ?? null,
  });
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
// Novos registros são inseridos normalmente.
// Registros existentes: atualiza apenas ic_documento_assinado e data_finalizado,
// que mudam quando todos os signatários concluem a assinatura.

async function upsertArquivos(arquivos: SqlArquivoRow[], cargaId: number): Promise<number> {
  let processados = 0;
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
         ON CONFLICT (id_proc_arqv) DO UPDATE SET
           ic_documento_assinado = EXCLUDED.ic_documento_assinado,
           data_finalizado       = EXCLUDED.data_finalizado,
           nr_pagn               = EXCLUDED.nr_pagn
         WHERE pauta_julgamento_arquivo.ic_documento_assinado IS DISTINCT FROM EXCLUDED.ic_documento_assinado
            OR pauta_julgamento_arquivo.data_finalizado       IS DISTINCT FROM EXCLUDED.data_finalizado
            OR pauta_julgamento_arquivo.nr_pagn               IS DISTINCT FROM EXCLUDED.nr_pagn`,
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
      processados++;
    }
  }
  return processados;
}

// --- Upsert movimentações ---
// Novos registros são inseridos normalmente.
// Registros existentes: atualiza dt_saida, que é preenchida quando o processo
// sai do setor atual (movimentação em aberto passa a ter data de saída).

async function upsertMovimentacoes(movs: SqlMovimentacaoRow[], cargaId: number): Promise<number> {
  let processados = 0;
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
         ON CONFLICT (id_item_fluxo_instan, COALESCE(id_processo_arquivo, -1)) DO UPDATE SET
           dt_saida = EXCLUDED.dt_saida
         WHERE pauta_julgamento_movimentacao.dt_saida IS DISTINCT FROM EXCLUDED.dt_saida`,
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
      processados++;
    }
  }
  return processados;
}

// --- Função principal ---

export async function executarCargaProcessos(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  if (DRY_RUN) console.log("  -> Modo dry-run ativo. Nenhum dado será gravado no PostgreSQL.");

  // Audit centralizado (painel /seguranca/etl). Mantemos paralelamente o
  // public.pauta_julgamento_carga para o histórico operacional do módulo.
  const idCargaAudit = await iniciarCargaEtl({
    modulo: MODULO,
    modoCarga: "incremental_upsert",
    origem: `${EPROCESS_DATABASE}.processo.vwArquivoProcesso + vwMovimentacoes`,
    destino: "public.pauta_julgamento_arquivo + public.pauta_julgamento_movimentacao",
  });

  let cargaId: number | null = null;
  let totalProcessados = 0;

  try {
    // 1. Todos os processo_ids CE (fonte de verdade)
    const pgItens = await pgQuery<{ processo_id: number }>(
      "SELECT processo_id FROM public.processo ORDER BY processo_id",
    );
    const todosProcessoIds = pgItens.map((r) => r.processo_id);
    console.log(`  -> Total de processos CE: ${todosProcessoIds.length}`);

    if (todosProcessoIds.length === 0) {
      console.log("  -> Nenhum processo encontrado. Execute primeiro o ETL processos-ce.");
      await gravarLog("sucesso", 0, Date.now() - inicio, "Nenhum processo em public.processo.");
      await finalizarCargaEtl({ idCarga: idCargaAudit, status: "ok", registrosLidos: 0, registrosGravados: 0, mensagem: "Nenhum processo em public.processo." });
      return;
    }

    // 2. Processos sem arquivos (carga inicial)
    const pgComArquivos = await pgQuery<{ processo_id: number }>(
      "SELECT DISTINCT processo_id FROM public.pauta_julgamento_arquivo WHERE processo_id IS NOT NULL",
    );
    const comArquivos = new Set(pgComArquivos.map((r) => r.processo_id));

    // 3. Processos com arquivos ainda não totalmente assinados (precisam de atualização)
    const pgArqPendentes = await pgQuery<{ processo_id: number }>(
      `SELECT DISTINCT processo_id FROM public.pauta_julgamento_arquivo
       WHERE processo_id IS NOT NULL
         AND (ic_documento_assinado IS NULL OR ic_documento_assinado IS DISTINCT FROM 'true')`,
    );
    const comArqPendentes = new Set(pgArqPendentes.map((r) => r.processo_id));

    // 4. Processos sem movimentações (carga inicial)
    const pgComMovs = await pgQuery<{ processo_id: number }>(
      "SELECT DISTINCT processo_id FROM public.pauta_julgamento_movimentacao WHERE processo_id IS NOT NULL",
    );
    const comMovs = new Set(pgComMovs.map((r) => r.processo_id));

    // 5. Processos com movimentação ainda em aberto (dt_saida IS NULL — precisam de atualização)
    const pgMovsAbertas = await pgQuery<{ processo_id: number }>(
      `SELECT DISTINCT processo_id FROM public.pauta_julgamento_movimentacao
       WHERE processo_id IS NOT NULL AND dt_saida IS NULL`,
    );
    const comMovsAbertas = new Set(pgMovsAbertas.map((r) => r.processo_id));

    // 6. Conjuntos a processar
    // Arquivos: novos (sem nenhum dado) + com docs pendentes de assinatura
    const idsParaArquivos = new Set(
      todosProcessoIds.filter((id) => !comArquivos.has(id) || comArqPendentes.has(id)),
    );
    // Movimentações: novos + com movimentação em aberto
    const idsParaMovs = new Set(
      todosProcessoIds.filter((id) => !comMovs.has(id) || comMovsAbertas.has(id)),
    );
    // União para iterar em lote único
    const idsParaProcessar = [...new Set([...idsParaArquivos, ...idsParaMovs])];

    console.log(`  -> Processos sem arquivos (carga inicial): ${todosProcessoIds.filter((id) => !comArquivos.has(id)).length}`);
    console.log(`  -> Processos com docs pendentes de assinatura: ${comArqPendentes.size}`);
    console.log(`  -> Processos sem movimentações (carga inicial): ${todosProcessoIds.filter((id) => !comMovs.has(id)).length}`);
    console.log(`  -> Processos com movimentação em aberto: ${comMovsAbertas.size}`);
    console.log(`  -> Total de processos a processar: ${idsParaProcessar.length}`);

    if (idsParaProcessar.length === 0) {
      console.log("  -> Nada a atualizar. ETL encerrado.");
      await gravarLog("sucesso", 0, Date.now() - inicio, "Sem processos para atualizar.");
      await finalizarCargaEtl({ idCarga: idCargaAudit, status: "ok", registrosLidos: 0, registrosGravados: 0, mensagem: "Sem processos para atualizar." });
      return;
    }

    if (DRY_RUN) {
      console.log("\n--- DRY-RUN: processos_eprocess ---");
      console.log(`  Para arquivos (novos + pendentes): ${idsParaArquivos.size}`);
      console.log(`  Para movimentações (novos + abertos): ${idsParaMovs.size}`);
      console.log("--- Fim dry-run ---\n");
      await finalizarCargaEtl({ idCarga: idCargaAudit, status: "ok", registrosLidos: idsParaProcessar.length, registrosGravados: 0, mensagem: `dry-run — arquivos=${idsParaArquivos.size}, movs=${idsParaMovs.size}` });
      return;
    }

    // 7. Registro de carga
    cargaId = await criarCarga();
    console.log(`  -> carga_id=${cargaId}`);

    // 8. Processa em lotes, separando arquivos e movimentações por necessidade
    let arquivosProcessados = 0;
    let movsProcessadas = 0;
    const totalLotes = Math.ceil(idsParaProcessar.length / SQL_BATCH);

    for (let lote = 0; lote < totalLotes; lote++) {
      const ids = idsParaProcessar.slice(lote * SQL_BATCH, (lote + 1) * SQL_BATCH);
      console.log(`  -> Lote ${lote + 1}/${totalLotes} — ${ids.length} processos`);

      const idsArqLote = ids.filter((id) => idsParaArquivos.has(id));
      if (idsArqLote.length > 0) {
        const arquivos = await queryInDatabase<SqlArquivoRow>(EPROCESS_DATABASE, sqlArquivos(idsArqLote));
        arquivosProcessados += await upsertArquivos(arquivos, cargaId);
      }

      const idsMovLote = ids.filter((id) => idsParaMovs.has(id));
      if (idsMovLote.length > 0) {
        const movs = await queryInDatabase<SqlMovimentacaoRow>(EPROCESS_DATABASE, sqlMovimentacoes(idsMovLote));
        movsProcessadas += await upsertMovimentacoes(movs, cargaId);
      }
    }

    console.log(`  -> Arquivos processados (insert+update): ${arquivosProcessados}`);
    console.log(`  -> Movimentações processadas (insert+update): ${movsProcessadas}`);

    totalProcessados = arquivosProcessados + movsProcessadas;
    await finalizarCarga(cargaId, "sucesso", totalProcessados);

    const duracao = Date.now() - inicio;
    const mensagem = `${arquivosProcessados} arquivos, ${movsProcessadas} movimentações`;
    await gravarLog("sucesso", totalProcessados, duracao, mensagem);
    await finalizarCargaEtl({ idCarga: idCargaAudit, status: "ok", registrosLidos: idsParaProcessar.length, registrosGravados: totalProcessados, mensagem });
    console.log(`  OK — ${MODULO} em ${duracao} ms (${mensagem})`);

  } catch (error) {
    const duracao = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error(`  ERRO — ${mensagem}`);

    if (cargaId !== null) {
      await finalizarCarga(cargaId, "erro", totalProcessados, mensagem).catch((e) => {
        console.error(`  ERRO ao atualizar carga: ${e instanceof Error ? e.message : String(e)}`);
      });
    }

    await gravarLog("erro", totalProcessados, duracao, mensagem).catch((e) => {
      console.error(`  ERRO ao gravar etl_log: ${e instanceof Error ? e.message : String(e)}`);
    });
    await finalizarCargaEtl({ idCarga: idCargaAudit, status: "erro", registrosLidos: 0, registrosGravados: totalProcessados, mensagem }).catch(() => void 0);
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
