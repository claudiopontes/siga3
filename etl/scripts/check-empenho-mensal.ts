import "dotenv/config";
import { getSupabase } from "../connectors/supabase";

(async () => {
  const sb = getSupabase();

  const { count: total } = await sb
    .from("combustivel_empenho_mensal")
    .select("*", { count: "exact", head: true });
  console.log("Registros em combustivel_empenho_mensal:", total);

  const { data: sample } = await sb
    .from("combustivel_empenho_mensal")
    .select("*")
    .limit(3);
  console.log("Amostra:", JSON.stringify(sample, null, 2));

  const { count: bruto } = await sb
    .from("tb_despesa_combustivel_polanco")
    .select("*", { count: "exact", head: true });
  console.log("Registros em tb_despesa_combustivel_polanco:", bruto);

  const { data: brutoSample } = await sb
    .from("tb_despesa_combustivel_polanco")
    .select("data_empenho, entidade, tipo_combustivel, valor_empenho")
    .limit(3);
  console.log("Amostra bruta:", JSON.stringify(brutoSample, null, 2));
})();
