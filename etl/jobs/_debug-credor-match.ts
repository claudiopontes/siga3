import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";
import { pgQuery, closePgPool } from "../connectors/postgres";

async function run() {
  // Amostra dos pendentes no postgres
  const pend = await pgQuery<{ cpf_cnpj: string; status_consulta: string }>(`
    SELECT cpf_cnpj, status_consulta
    FROM dw.dim_credor_enriquecido
    WHERE status_consulta IN ('PENDENTE_CNPJ', 'PENDENTE_CPF_INTERNO')
    LIMIT 5
  `);
  console.log("PENDENTES (postgres):", JSON.stringify(pend, null, 2));

  // Amostra do SQL Server com nome preenchido
  const fonte = await queryInDatabase<{ cnpj_cpf: string; nome: string }>("APC", `
    SELECT TOP 10
      CAST(cnpj_cpf AS varchar(30)) AS cnpj_cpf,
      CAST(nome AS varchar(100))    AS nome
    FROM [dbo].[CREDOR]
    WHERE nome IS NOT NULL
      AND LEN(TRIM(CAST(nome AS varchar(100)))) > 2
  `);
  console.log("FONTE APC (sql server):", JSON.stringify(fonte, null, 2));

  // Pega uma amostra maior de pendentes para testar
  const allPend = await pgQuery<{ cpf_cnpj: string }>(`
    SELECT cpf_cnpj FROM dw.dim_credor_enriquecido
    WHERE status_consulta IN ('PENDENTE_CNPJ', 'PENDENTE_CPF_INTERNO')
    LIMIT 20
  `);
  const sample = allPend.map(p => `'${p.cpf_cnpj}'`).join(",");

  // Teste em dbo.CREDOR
  const m1 = await queryInDatabase<{ cnpj_cpf: string; nome: string }>("APC", `
    SELECT CAST(cnpj_cpf AS varchar(30)) AS cnpj_cpf, CAST(nome AS varchar(100)) AS nome
    FROM [dbo].[CREDOR]
    WHERE REPLACE(REPLACE(REPLACE(CAST(cnpj_cpf AS varchar(30)),'.',''),'-',''),'/','') IN (${sample})
  `);
  console.log("MATCH dbo.CREDOR:", m1.length, JSON.stringify(m1.slice(0,3)));

  // Teste em contacorrente.credor_temp
  const m2 = await queryInDatabase<{ cnpj_cpf: string; nome: string }>("APC", `
    SELECT CAST(cnpj_cpf AS varchar(30)) AS cnpj_cpf, CAST(nome AS varchar(100)) AS nome
    FROM [contacorrente].[credor_temp]
    WHERE REPLACE(REPLACE(REPLACE(CAST(cnpj_cpf AS varchar(30)),'.',''),'-',''),'/','') IN (${sample})
  `);
  console.log("MATCH contacorrente.credor_temp:", m2.length, JSON.stringify(m2.slice(0,3)));

  // Teste em contacorrente.RETENCAO_PAGAMENTO
  const m3 = await queryInDatabase<{ cpf_cnpj: string; nome: string }>("APC", `
    SELECT TOP 5 CAST(CPF_CNPJ AS varchar(30)) AS cpf_cnpj, CAST(NOME_CREDOR_CONSIGNADO AS varchar(100)) AS nome
    FROM [contacorrente].[RETENCAO_PAGAMENTO]
    WHERE REPLACE(REPLACE(REPLACE(CAST(CPF_CNPJ AS varchar(30)),'.',''),'-',''),'/','') IN (${sample})
      AND NOME_CREDOR_CONSIGNADO IS NOT NULL
  `);
  console.log("MATCH contacorrente.RETENCAO_PAGAMENTO:", m3.length, JSON.stringify(m3.slice(0,3)));

  await closePgPool();
}

run().catch(e => { console.error(e.message); closePgPool(); });
