import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

const cnpj = process.argv[2] || "30760456000110";

pgQuery(`
  SELECT cpf_cnpj, nome_enriquecido, nome_exibicao, status_consulta, erro_consulta, fonte_enriquecimento
  FROM dw.dim_credor_enriquecido
  WHERE cpf_cnpj = $1
`, [cnpj])
  .then(r => {
    console.log("dim_credor_enriquecido:", JSON.stringify(r, null, 2));
    return pgQuery(`SELECT cpf_cnpj_credor, nome_credor FROM mart.credor_pesquisa WHERE cpf_cnpj_credor = $1`, [cnpj]);
  })
  .then(r => {
    console.log("mart.credor_pesquisa:", JSON.stringify(r, null, 2));
    return closePgPool();
  })
  .catch(e => { console.error(e.message); closePgPool(); });
