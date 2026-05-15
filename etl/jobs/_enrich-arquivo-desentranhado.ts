/**
 * Script de enriquecimento: popula ic_valido e desentranhado
 * na tabela pauta_julgamento_arquivo.
 *
 * Executa separado do ETL principal pois precisa de acesso
 * direto à F_PROCESSO_ARQUIVO e F_DESENTRANHAMENTO no SQL Server,
 * cujo banco exato precisa ser confirmado.
 *
 * Uso: npx ts-node jobs/_enrich-arquivo-desentranhado.ts [--dry-run] [--db EPROCESS]
 */
import "dotenv/config";
import { queryInDatabase, closePool } from "../connectors/sqlserver";
import { pgQuery, closePgPool } from "../connectors/postgres";

const DRY_RUN = process.argv.includes("--dry-run");
const DB_ARG   = process.argv.find(a => a.startsWith("--db="))?.split("=")[1];
const DB       = DB_ARG ?? process.env.EPROCESS_SQLSERVER_DATABASE ?? "EPROCESS";
const BATCH    = 500;

async function main() {
  console.log(`[enrich-desentranhado] banco=${DB} dry_run=${DRY_RUN}`);

  // 1. Confirmar acesso às tabelas necessárias
  console.log("  -> Verificando acesso às tabelas no SQL Server...");
  try {
    await queryInDatabase<unknown>(DB,
      "SELECT TOP 1 ID_PROC_ARQV, IC_VALD FROM processo.F_PROCESSO_ARQUIVO"
    );
    console.log("  -> F_PROCESSO_ARQUIVO: OK");
  } catch (e) {
    console.error("  ERRO: não foi possível acessar F_PROCESSO_ARQUIVO no banco", DB);
    console.error("  Tente: --db=EJURIS ou --db=EPROCESS");
    throw e;
  }

  try {
    await queryInDatabase<unknown>(DB,
      "SELECT TOP 1 ID_DESENTRANHAMENTO FROM processo.F_DESENTRANHAMENTO"
    );
    console.log("  -> F_DESENTRANHAMENTO: OK");
  } catch (e) {
    console.error("  ERRO: não foi possível acessar F_DESENTRANHAMENTO");
    throw e;
  }

  // 2. Busca todos os id_proc_arqv que ainda não têm ic_valido preenchido
  const pendentes = await pgQuery<{ id_proc_arqv: number; nr_ordem: number | null }>(
    `SELECT id_proc_arqv, nr_ordem
     FROM public.pauta_julgamento_arquivo
     WHERE ic_valido IS NULL
     ORDER BY id_proc_arqv`,
    []
  );
  console.log(`  -> Registros a atualizar: ${pendentes.length}`);
  if (!pendentes.length) { console.log("  Nada a fazer."); return; }

  // 3. Busca IC_VALD e DESENTRANHADO no SQL Server em lotes
  let atualizados = 0;
  for (let i = 0; i < pendentes.length; i += BATCH) {
    const lote = pendentes.slice(i, i + BATCH);
    const ids  = lote.map(r => r.id_proc_arqv).join(",");

    const rows = await queryInDatabase<{
      ID_PROC_ARQV: number;
      IC_VALD: boolean | number | null;
      DESENTRANHADO: number;
    }>(DB, `
      SELECT
        f.ID_PROC_ARQV,
        f.IC_VALD,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM processo.F_DESENTRANHAMENTO d
            WHERE d.ID_ARQUIVO_A_EXCLUIR = f.ID_PROC_ARQV
              AND f.NR_ORDEM BETWEEN
                TRY_CONVERT(INT, LTRIM(RTRIM(
                  CASE WHEN CHARINDEX('-', d.FLS) > 0
                    THEN LEFT(d.FLS, CHARINDEX('-', d.FLS) - 1)
                    ELSE d.FLS END)))
              AND
                TRY_CONVERT(INT, LTRIM(RTRIM(
                  CASE WHEN CHARINDEX('-', d.FLS) > 0
                    THEN SUBSTRING(d.FLS, CHARINDEX('-', d.FLS) + 1, 50)
                    ELSE d.FLS END)))
          ) THEN 1 ELSE 0
        END AS DESENTRANHADO
      FROM processo.F_PROCESSO_ARQUIVO f
      WHERE f.ID_PROC_ARQV IN (${ids})
    `);

    if (!DRY_RUN) {
      for (const r of rows) {
        await pgQuery(
          `UPDATE public.pauta_julgamento_arquivo
           SET ic_valido = $1, desentranhado = $2
           WHERE id_proc_arqv = $3`,
          [
            r.IC_VALD !== null && r.IC_VALD !== undefined ? Boolean(r.IC_VALD) : null,
            Boolean(r.DESENTRANHADO),
            r.ID_PROC_ARQV,
          ]
        );
        atualizados++;
      }
    } else {
      const desent = rows.filter(r => r.DESENTRANHADO).length;
      const invald = rows.filter(r => r.IC_VALD === false || r.IC_VALD === 0).length;
      console.log(`  [dry-run] lote ${i}–${i + lote.length}: ${rows.length} encontrados, ${desent} desentranhados, ${invald} inválidos`);
      atualizados += rows.length;
    }

    if ((i / BATCH) % 10 === 0) {
      console.log(`  -> Progresso: ${Math.min(i + BATCH, pendentes.length)}/${pendentes.length}`);
    }
  }

  console.log(`  -> Concluído: ${atualizados} registros ${DRY_RUN ? "verificados" : "atualizados"}.`);
}

main()
  .catch(e => { console.error("ERRO FATAL:", e.message); process.exit(1); })
  .finally(async () => { await closePool(); await closePgPool(); });
