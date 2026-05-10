/**
 * credor-enriquecer-cnpj.ts
 *
 * Enriquece CNPJs pendentes via API pública (BrasilAPI ou ReceitaWS).
 * Não consulta CPF. Não usa browser/frontend.
 *
 * Variáveis de ambiente:
 *   CNPJ_ENRICH_PROVIDER     = none | brasilapi | receitaws   (padrão: none)
 *   CNPJ_ENRICH_RATE_LIMIT_MS = ms entre requisições           (padrão: 1000)
 *   CNPJ_ENRICH_MAX_PER_RUN  = máximo de CNPJs por execução   (padrão: 100)
 *
 * Uso: cd etl && npm run credor:enriquecer:cnpj
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// -------------------------------------------------------
// Configuração
// -------------------------------------------------------

const PROVIDER      = (process.env.CNPJ_ENRICH_PROVIDER      || "none").toLowerCase();
const RATE_LIMIT_MS = parseInt(process.env.CNPJ_ENRICH_RATE_LIMIT_MS || "1000", 10);
const MAX_PER_RUN   = parseInt(process.env.CNPJ_ENRICH_MAX_PER_RUN   || "100",  10);

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface CnpjDados {
  razao_social?: string;
  nome_fantasia?: string;
  situacao_cadastral?: string;
  natureza_juridica?: string;
  cnae_fiscal_descricao?: string;
  municipio?: string;
  uf?: string;
  logradouro?: string;
  bairro?: string;
  cep?: string;
  ddd_telefone_1?: string;
  email?: string;
}

// -------------------------------------------------------
// Provedores
// -------------------------------------------------------

async function consultarBrasilAPI(cnpj: string): Promise<CnpjDados> {
  const url = `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "Varadouro-Digital-ETL/1.0 (interno TCE-AC)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json() as Promise<CnpjDados>;
}

async function consultarReceitaWS(cnpj: string): Promise<CnpjDados> {
  const url = `https://www.receitaws.com.br/v1/cnpj/${cnpj}`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "Varadouro-Digital-ETL/1.0 (interno TCE-AC)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json() as Record<string, unknown>;
  if (data.status === "ERROR") throw new Error(String(data.message) || "CNPJ não encontrado");
  const atividadePrincipal = data.atividade_principal as Array<{ text?: string }> | undefined;
  // Normaliza para estrutura comum
  return {
    razao_social:          data.nome as string,
    nome_fantasia:         data.fantasia as string,
    situacao_cadastral:    data.situacao as string,
    natureza_juridica:     data.natureza_juridica as string,
    cnae_fiscal_descricao: atividadePrincipal?.[0]?.text,
    municipio:             data.municipio as string,
    uf:                    data.uf as string,
    logradouro:            data.logradouro as string,
    bairro:                data.bairro as string,
    cep:                   data.cep as string,
    ddd_telefone_1:        data.telefone as string,
    email:                 data.email as string,
  };
}

async function consultar(cnpj: string): Promise<CnpjDados> {
  if (PROVIDER === "brasilapi") return consultarBrasilAPI(cnpj);
  if (PROVIDER === "receitaws") return consultarReceitaWS(cnpj);
  throw new Error(`Provider desconhecido: ${PROVIDER}`);
}

// -------------------------------------------------------
// Main
// -------------------------------------------------------

async function main() {
  if (PROVIDER === "none") {
    console.log("[credor:enriquecer:cnpj] CNPJ_ENRICH_PROVIDER=none — enriquecimento via API desativado.");
    console.log("  Para ativar: CNPJ_ENRICH_PROVIDER=brasilapi ou CNPJ_ENRICH_PROVIDER=receitaws");
    return;
  }

  const inicio = Date.now();
  console.log(`[credor:enriquecer:cnpj] Provider: ${PROVIDER} | rate limit: ${RATE_LIMIT_MS}ms | max: ${MAX_PER_RUN}`);

  // Busca CNPJs pendentes
  const pendentes = await pgQuery<{ cpf_cnpj: string }>(`
    SELECT cpf_cnpj
    FROM dw.dim_credor_enriquecido
    WHERE tipo_documento = 'CNPJ'
      AND status_consulta = 'PENDENTE_CNPJ'
    ORDER BY cpf_cnpj
    LIMIT $1
  `, [MAX_PER_RUN]);

  console.log(`[credor:enriquecer:cnpj] ${pendentes.length} CNPJs pendentes (limite: ${MAX_PER_RUN}).`);

  let enriquecidos = 0;
  let erros = 0;

  for (const p of pendentes) {
    const cnpj = p.cpf_cnpj;

    try {
      const dados = await consultar(cnpj);
      const nomeEnriquecido = (dados.razao_social || dados.nome_fantasia || "").trim();

      await withPgTransaction(async (client) => {
        await client.query(`
          UPDATE dw.dim_credor_enriquecido SET
            nome_enriquecido     = NULLIF($1, ''),
            nome_exibicao        = COALESCE(NULLIF($1, ''), nome_exibicao),
            fonte_enriquecimento = $2,
            situacao_cadastral   = $3,
            natureza_juridica    = $4,
            cnae_principal       = $5,
            municipio            = $6,
            uf                   = $7,
            endereco             = $8,
            bairro               = $9,
            cep                  = $10,
            telefone             = $11,
            email                = $12,
            data_consulta        = now(),
            status_consulta      = 'ENRIQUECIDO',
            erro_consulta        = NULL,
            atualizado_em        = now()
          WHERE cpf_cnpj = $13
        `, [
          nomeEnriquecido || null,
          PROVIDER.toUpperCase(),
          dados.situacao_cadastral?.trim()    || null,
          dados.natureza_juridica?.trim()     || null,
          dados.cnae_fiscal_descricao?.trim() || null,
          dados.municipio?.trim()             || null,
          dados.uf?.trim()                    || null,
          dados.logradouro?.trim()            || null,
          dados.bairro?.trim()                || null,
          dados.cep?.replace(/\D/g, "") || null,
          dados.ddd_telefone_1?.trim()        || null,
          dados.email?.trim()                 || null,
          cnpj,
        ]);

        await client.query(`
          INSERT INTO audit.credor_enriquecimento_log
            (cpf_cnpj, tipo_documento, fonte, status, mensagem)
          VALUES ($1, 'CNPJ', $2, 'ENRIQUECIDO', $3)
        `, [cnpj, PROVIDER.toUpperCase(), nomeEnriquecido.slice(0, 60) || "OK"]);
      });

      enriquecidos++;
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(`  [ERRO] CNPJ ${cnpj.slice(0, 2)}***${cnpj.slice(-2)}: ${msg}`);

      await pgQuery(`
        UPDATE dw.dim_credor_enriquecido SET
          status_consulta = 'ERRO',
          erro_consulta   = $1,
          data_consulta   = now(),
          atualizado_em   = now()
        WHERE cpf_cnpj = $2
      `, [msg.slice(0, 200), cnpj]);

      await pgQuery(`
        INSERT INTO audit.credor_enriquecimento_log
          (cpf_cnpj, tipo_documento, fonte, status, mensagem)
        VALUES ($1, 'CNPJ', $2, 'ERRO', $3)
      `, [cnpj, PROVIDER.toUpperCase(), msg.slice(0, 200)]);

      erros++;
    }

    // Rate limit
    if (RATE_LIMIT_MS > 0) await sleep(RATE_LIMIT_MS);
  }

  const duracao = Date.now() - inicio;
  console.log(`[credor:enriquecer:cnpj] Concluído em ${duracao}ms — enriquecidos: ${enriquecidos}, erros: ${erros}.`);

  await pgQuery(`
    INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
    VALUES ('credor:enriquecer:cnpj', 'OK', $1, $2, $3)
  `, [`provider=${PROVIDER}`, enriquecidos, duracao]);
}

main()
  .then(() => closePgPool())
  .catch((err) => {
    console.error("[credor:enriquecer:cnpj] Erro:", (err as Error).message);
    closePgPool().catch(() => void 0);
    process.exit(1);
  });
