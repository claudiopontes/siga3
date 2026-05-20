import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

async function main() {
  const [c1] = await pgQuery<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM folha.fato_contracheque WHERE ano=2025 AND mes=12`,
  );
  const [c2] = await pgQuery<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM folha.fato_verba_contracheque WHERE ano=2025 AND mes=12`,
  );
  process.stdout.write(`fato_contracheque(2025-12): ${c1.n}\n`);
  process.stdout.write(`fato_verba_contracheque(2025-12): ${c2.n}\n`);

  const [dims] = await pgQuery<{
    entidades: string; servidores: string; cargos: string; lotacoes: string;
    tipos_folha: string; verbas: string; remessas: string;
  }>(`
    SELECT
      (SELECT COUNT(*)::text FROM folha.dim_entidade)    AS entidades,
      (SELECT COUNT(*)::text FROM folha.dim_servidor)    AS servidores,
      (SELECT COUNT(*)::text FROM folha.dim_cargo)       AS cargos,
      (SELECT COUNT(*)::text FROM folha.dim_lotacao)     AS lotacoes,
      (SELECT COUNT(*)::text FROM folha.dim_tipo_folha)  AS tipos_folha,
      (SELECT COUNT(*)::text FROM folha.dim_verba)       AS verbas,
      (SELECT COUNT(*)::text FROM folha.dim_remessa)     AS remessas
  `);
  process.stdout.write(`dim_entidade: ${dims.entidades}\n`);
  process.stdout.write(`dim_servidor: ${dims.servidores}\n`);
  process.stdout.write(`dim_cargo: ${dims.cargos}\n`);
  process.stdout.write(`dim_lotacao: ${dims.lotacoes}\n`);
  process.stdout.write(`dim_tipo_folha: ${dims.tipos_folha}\n`);
  process.stdout.write(`dim_verba: ${dims.verbas}\n`);
  process.stdout.write(`dim_remessa: ${dims.remessas}\n`);

  await closePgPool();
}
main().catch(async (e) => {
  console.error(e.message);
  await closePgPool().catch(() => void 0);
  process.exit(1);
});
