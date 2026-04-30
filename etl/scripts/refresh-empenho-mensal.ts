import "dotenv/config";
import { getSupabase } from "../connectors/supabase";

(async () => {
  const supabase = getSupabase();

  console.log("Verificando tabela combustivel_empenho_mensal...");
  const { error: chk } = await supabase.from("combustivel_empenho_mensal").select("ano").limit(1);
  if (chk) {
    console.error("Tabela nao encontrada:", chk.message);
    console.error("Aplique o DDL em etl/schema/combustivel_empenho_mensal.sql no Supabase primeiro.");
    process.exit(1);
  }

  console.log("Chamando fn_refresh_combustivel_empenho_mensal()...");
  const inicio = Date.now();
  const { error } = await supabase.rpc("fn_refresh_combustivel_empenho_mensal");
  if (error) {
    console.error("Erro ao chamar RPC:", error.message);
    process.exit(1);
  }

  console.log(`OK - tabela populada em ${Date.now() - inicio}ms`);
})();
