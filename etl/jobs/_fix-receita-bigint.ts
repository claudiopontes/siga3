import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

async function main() {
  console.log("Verificando tipos atuais...");
  const antes = await pgQuery<{ column_name: string; data_type: string }>(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'receita_publica_categoria_mensal'
      AND data_type = 'integer'
    ORDER BY column_name
  `);
  console.log("Colunas ainda integer:", antes.map((r) => r.column_name));

  console.log("\nAplicando ALTER TABLE...");
  await pgQuery(`
    ALTER TABLE public.receita_publica_categoria_mensal
      ALTER COLUMN id_remessa                       TYPE bigint,
      ALTER COLUMN id_entidade_cjur                 TYPE bigint,
      ALTER COLUMN id_entidade                      TYPE bigint,
      ALTER COLUMN id_natureza_receita_orcamentaria TYPE bigint,
      ALTER COLUMN id_catreceita                    TYPE bigint,
      ALTER COLUMN numero_fonte_recurso             TYPE bigint,
      ALTER COLUMN natureza_nivel                   TYPE bigint,
      ALTER COLUMN natureza_ano_inicio              TYPE bigint,
      ALTER COLUMN natureza_ano_fim                 TYPE bigint,
      ALTER COLUMN registros_origem                 TYPE bigint
  `);
  console.log("ALTER TABLE executado.\n");

  console.log("Verificando tipos após alteração...");
  const depois = await pgQuery<{ column_name: string; data_type: string }>(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'receita_publica_categoria_mensal'
      AND data_type = 'integer'
    ORDER BY column_name
  `);
  console.log("Colunas ainda integer após ALTER:", depois.map((r) => r.column_name));
  if (depois.length === 0) console.log("✓ Nenhuma coluna integer restante.");

  await closePgPool();
}

main().catch((e) => {
  console.error("ERRO:", (e as Error).message);
  process.exit(1);
});
