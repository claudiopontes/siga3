import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

pgQuery(`
  UPDATE dw.dim_credor_enriquecido
  SET status_consulta = 'PENDENTE_CNPJ', erro_consulta = NULL
  WHERE tipo_documento = 'CNPJ' AND status_consulta = 'ERRO'
`).then(r => {
  console.log("Resetados para PENDENTE_CNPJ:", (r as unknown as { rowCount: number }).rowCount ?? "ok");
  return closePgPool();
}).catch(e => { console.error(e); closePgPool(); });
