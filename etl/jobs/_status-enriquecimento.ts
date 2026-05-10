import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

pgQuery(`SELECT status_consulta, COUNT(*) as total FROM dw.dim_credor_enriquecido GROUP BY status_consulta ORDER BY status_consulta`)
  .then(r => { console.log(JSON.stringify(r, null, 2)); return closePgPool(); })
  .catch(e => { console.error(e.message); closePgPool(); });
