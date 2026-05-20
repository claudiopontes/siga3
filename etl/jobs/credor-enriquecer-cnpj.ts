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
import { iniciarCargaEtl, finalizarCargaEtl, registrarLogEtl } from "../lib/auditoria";

const MODULO = "credor_enriquecer_cnpj";

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

interface QsaItem {
  nome: string | null;
  qualificacao: string | null;
  cpf_socio?: string | null;
  cpf_representante?: string | null;
}

interface CnaeItem {
  codigo: string | null;
  descricao: string | null;
}

interface CnpjDados {
  razao_social?: unknown;
  nome_fantasia?: unknown;
  situacao_cadastral?: unknown;
  natureza_juridica?: unknown;
  cnae_fiscal_descricao?: unknown;
  municipio?: unknown;
  uf?: unknown;
  logradouro?: unknown;
  complemento?: unknown;
  bairro?: unknown;
  cep?: unknown;
  ddd_telefone_1?: unknown;
  ddd_telefone_2?: unknown;
  email?: unknown;
  capital_social?: number | null;
  porte?: string | null;
  data_abertura?: string | null;
  opcao_simples?: boolean | null;
  opcao_mei?: boolean | null;
  data_opcao_simples?: string | null;
  data_exclusao_simples?: string | null;
  motivo_situacao?: string | null;
  situacao_especial?: string | null;
  data_situacao_especial?: string | null;
  cnaes_secundarios?: CnaeItem[];
  qsa?: QsaItem[];
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
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
  const raw = await resp.json() as Record<string, unknown>;
  // BrasilAPI retorna situacao_cadastral como número; normaliza para string legível
  const situacaoMap: Record<number, string> = { 1: "NULA", 2: "ATIVA", 3: "SUSPENSA", 4: "INAPTA", 8: "BAIXADA" };
  const situacaoNum = Number(raw.situacao_cadastral);
  const situacao = situacaoMap[situacaoNum] ?? toStr(raw.situacao_cadastral);
  // cnae_fiscal_descricao pode vir como cnae_fiscal_descricao ou dentro de cnaes_secundarios
  // CNAEs secundários
  const cnaesSecRaw = raw.cnaes_secundarios as Array<Record<string, unknown>> | undefined;
  const cnaesSecundarios: CnaeItem[] = (cnaesSecRaw ?? [])
    .map((c) => ({ codigo: toStr(c.codigo), descricao: toStr(c.descricao) }))
    .filter((c) => c.codigo || c.descricao);

  // QSA
  const qsaRaw = raw.qsa as Array<Record<string, unknown>> | undefined;
  const qsa: QsaItem[] = (qsaRaw ?? []).map((s) => ({
    nome:              toStr(s.nome_socio ?? s.nome),
    qualificacao:      toStr(s.qualificacao_socio ?? s.qualificacao),
    cpf_socio:         toStr(s.cnpj_cpf_do_socio),
    cpf_representante: toStr(s.cpf_representante_legal),
  }));

  // Porte
  const porteMap: Record<string, string> = {
    "MICRO EMPRESA": "ME", "ME": "ME",
    "EMPRESA DE PEQUENO PORTE": "EPP", "EPP": "EPP",
    "DEMAIS": "DEMAIS",
  };
  const porteRaw = toStr(raw.porte)?.toUpperCase() ?? "";
  const porte = porteMap[porteRaw] ?? (porteRaw || null);

  const toDate = (v: unknown) => toStr(v) || null;
  const toBool = (v: unknown) => v === true || v === "Sim" || v === "S" ? true : v === false || v === "Não" || v === "N" ? false : null;

  return {
    razao_social:           raw.razao_social,
    nome_fantasia:          raw.nome_fantasia,
    situacao_cadastral:     situacao,
    natureza_juridica:      (raw.natureza_juridica as Record<string, unknown> | undefined)?.descricao ?? raw.natureza_juridica,
    cnae_fiscal_descricao:  raw.cnae_fiscal_descricao,
    municipio:              raw.municipio,
    uf:                     raw.uf,
    logradouro:             raw.logradouro ? `${raw.logradouro}, ${raw.numero ?? ""}`.trim() : raw.logradouro,
    complemento:            raw.complemento,
    bairro:                 raw.bairro,
    cep:                    raw.cep,
    ddd_telefone_1:         raw.ddd_telefone_1,
    ddd_telefone_2:         raw.ddd_telefone_2,
    email:                  raw.email,
    capital_social:         typeof raw.capital_social === "number" ? raw.capital_social : null,
    porte:                  porte,
    data_abertura:          toStr(raw.data_inicio_atividade),
    opcao_simples:          toBool(raw.opcao_pelo_simples),
    opcao_mei:              toBool(raw.opcao_pelo_mei),
    data_opcao_simples:     toDate(raw.data_opcao_pelo_simples),
    data_exclusao_simples:  toDate(raw.data_exclusao_do_simples),
    motivo_situacao:        toStr(raw.descricao_motivo_situacao_cadastral),
    situacao_especial:      toStr(raw.situacao_especial),
    data_situacao_especial: toDate(raw.data_situacao_especial),
    cnaes_secundarios:      cnaesSecundarios.length > 0 ? cnaesSecundarios : undefined,
    qsa:                    qsa.length > 0 ? qsa : undefined,
  };
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
  const atividadePrincipal  = data.atividade_principal  as Array<{ code?: string; text?: string }> | undefined;
  const atividadesSecundarias = data.atividades_secundarias as Array<{ code?: string; text?: string }> | undefined;
  const qsaRaw = data.qsa as Array<Record<string, unknown>> | undefined;

  const cnaesSecundarios: CnaeItem[] = (atividadesSecundarias ?? [])
    .map((c) => ({ codigo: toStr(c.code), descricao: toStr(c.text) }))
    .filter((c) => c.codigo || c.descricao);

  const qsa: QsaItem[] = (qsaRaw ?? []).map((s) => ({
    nome:              toStr(s.nome),
    qualificacao:      toStr(s.qual),
    cpf_representante: null,
  }));

  return {
    razao_social:           data.nome as string,
    nome_fantasia:          data.fantasia as string,
    situacao_cadastral:     data.situacao as string,
    natureza_juridica:      data.natureza_juridica as string,
    cnae_fiscal_descricao:  atividadePrincipal?.[0]?.text,
    municipio:              data.municipio as string,
    uf:                     data.uf as string,
    logradouro:             data.logradouro as string,
    complemento:            data.complemento,
    bairro:                 data.bairro as string,
    cep:                    data.cep as string,
    ddd_telefone_1:         data.telefone as string,
    ddd_telefone_2:         null,
    email:                  data.email as string,
    capital_social:         data.capital_social ? Number(data.capital_social) : null,
    porte:                  toStr(data.porte),
    data_abertura:          toStr(data.abertura),
    opcao_simples:          null,
    opcao_mei:              null,
    data_opcao_simples:     null,
    data_exclusao_simples:  null,
    motivo_situacao:        toStr(data.motivo_situacao),
    situacao_especial:      toStr(data.situacao_especial),
    data_situacao_especial: toStr(data.data_situacao_especial),
    cnaes_secundarios:      cnaesSecundarios.length > 0 ? cnaesSecundarios : undefined,
    qsa:                    qsa.length > 0 ? qsa : undefined,
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

export async function executarCredorEnriquecerCnpj(): Promise<void> {
  const inicio = Date.now();

  if (PROVIDER === "none") {
    console.log("[credor:enriquecer:cnpj] CNPJ_ENRICH_PROVIDER=none — enriquecimento via API desativado.");
    console.log("  Para ativar: CNPJ_ENRICH_PROVIDER=brasilapi ou CNPJ_ENRICH_PROVIDER=receitaws");
    const idCargaSkip = await iniciarCargaEtl({ modulo: MODULO, modoCarga: "skip", origem: "provider=none", destino: "—" });
    await registrarLogEtl({ modulo: MODULO, status: "ok", registros: 0, duracaoMs: Date.now() - inicio, mensagem: "Provider=none — enriquecimento desativado" });
    await finalizarCargaEtl({ idCarga: idCargaSkip, status: "ok", registrosLidos: 0, registrosGravados: 0, mensagem: "Provider=none — enriquecimento desativado" });
    return;
  }

  console.log(`[credor:enriquecer:cnpj] Provider: ${PROVIDER} | rate limit: ${RATE_LIMIT_MS}ms | max: ${MAX_PER_RUN}`);

  const idCarga = await iniciarCargaEtl({
    modulo: MODULO,
    modoCarga: "incremental_update",
    origem: `API CNPJ (${PROVIDER})`,
    destino: "dw.dim_credor_enriquecido",
  });

  try {

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
      const nomeEnriquecido = toStr(dados.razao_social) || toStr(dados.nome_fantasia) || "";

      await withPgTransaction(async (client) => {
        await client.query(`
          UPDATE dw.dim_credor_enriquecido SET
            nome_enriquecido        = NULLIF($1, ''),
            nome_exibicao           = COALESCE(NULLIF($1, ''), nome_exibicao),
            fonte_enriquecimento    = $2,
            situacao_cadastral      = $3,
            natureza_juridica       = $4,
            cnae_principal          = $5,
            municipio               = $6,
            uf                      = $7,
            endereco                = $8,
            bairro                  = $9,
            cep                     = $10,
            telefone                = $11,
            email                   = $12,
            capital_social          = $13,
            porte                   = $14,
            data_abertura           = $15,
            cnaes_secundarios       = $16,
            qsa                     = $17,
            nome_fantasia           = $19,
            complemento             = $20,
            telefone_2              = $21,
            opcao_simples           = $22,
            opcao_mei               = $23,
            data_opcao_simples      = $24,
            data_exclusao_simples   = $25,
            motivo_situacao         = $26,
            situacao_especial       = $27,
            data_situacao_especial  = $28,
            data_consulta           = now(),
            status_consulta         = 'ENRIQUECIDO',
            erro_consulta           = NULL,
            atualizado_em           = now()
          WHERE cpf_cnpj = $18
        `, [
          nomeEnriquecido || null,
          PROVIDER.toUpperCase(),
          toStr(dados.situacao_cadastral),
          toStr(dados.natureza_juridica),
          toStr(dados.cnae_fiscal_descricao),
          toStr(dados.municipio),
          toStr(dados.uf),
          toStr(dados.logradouro),
          toStr(dados.bairro),
          toStr(dados.cep)?.replace(/\D/g, "") || null,
          toStr(dados.ddd_telefone_1),
          toStr(dados.email),
          dados.capital_social ?? null,
          dados.porte ?? null,
          dados.data_abertura ?? null,
          dados.cnaes_secundarios ? JSON.stringify(dados.cnaes_secundarios) : null,
          dados.qsa ? JSON.stringify(dados.qsa) : null,
          cnpj,
          toStr(dados.nome_fantasia),
          toStr(dados.complemento),
          toStr(dados.ddd_telefone_2),
          dados.opcao_simples ?? null,
          dados.opcao_mei ?? null,
          dados.data_opcao_simples ?? null,
          dados.data_exclusao_simples ?? null,
          dados.motivo_situacao ?? null,
          dados.situacao_especial ?? null,
          dados.data_situacao_especial ?? null,
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
    const mensagem = `provider=${PROVIDER} — enriquecidos: ${enriquecidos}, erros: ${erros}`;
    console.log(`[credor:enriquecer:cnpj] Concluído em ${duracao}ms — ${mensagem}`);

    await registrarLogEtl({ modulo: MODULO, status: "ok", registros: enriquecidos, duracaoMs: duracao, mensagem });
    await finalizarCargaEtl({ idCarga, status: "ok", registrosLidos: enriquecidos + erros, registrosGravados: enriquecidos, mensagem });
  } catch (error) {
    const duracao = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error(`[credor:enriquecer:cnpj] ERRO — ${mensagem}`);
    await registrarLogEtl({ modulo: MODULO, status: "erro", registros: 0, duracaoMs: duracao, mensagem }).catch(() => void 0);
    await finalizarCargaEtl({ idCarga, status: "erro", registrosLidos: 0, registrosGravados: 0, mensagem }).catch(() => void 0);
    throw error;
  }
}

if (require.main === module) {
  executarCredorEnriquecerCnpj()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[credor:enriquecer:cnpj] Erro:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
