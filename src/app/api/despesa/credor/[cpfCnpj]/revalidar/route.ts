import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { onlyDigits } from "@/lib/credor-utils";

export const runtime = "nodejs";

// Tempo máximo para a chamada externa (10 s)
const TIMEOUT_MS = 10_000;

function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

interface QsaItem   { nome: string | null; qualificacao: string | null; cpf_socio?: string | null; cpf_representante?: string | null }
interface CnaeItem  { codigo: string | null; descricao: string | null }

interface DadosCnpj {
  nome_enriquecido:       string | null;
  nome_fantasia:          string | null;
  situacao_cadastral:     string | null;
  natureza_juridica:      string | null;
  cnae_principal:         string | null;
  municipio:              string | null;
  uf:                     string | null;
  endereco:               string | null;
  complemento:            string | null;
  bairro:                 string | null;
  cep:                    string | null;
  telefone:               string | null;
  telefone_2:             string | null;
  email:                  string | null;
  capital_social:         number | null;
  porte:                  string | null;
  data_abertura:          string | null;
  opcao_simples:          boolean | null;
  opcao_mei:              boolean | null;
  data_opcao_simples:     string | null;
  data_exclusao_simples:  string | null;
  motivo_situacao:        string | null;
  situacao_especial:      string | null;
  data_situacao_especial: string | null;
  cnaes_secundarios:      CnaeItem[] | null;
  qsa:                    QsaItem[] | null;
}

async function consultarBrasilAPI(cnpj: string): Promise<DadosCnpj> {
  const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    headers: { "User-Agent": "Varadouro-Digital/1.0 (interno TCE-AC)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`BrasilAPI HTTP ${resp.status}`);
  const r = await resp.json() as Record<string, unknown>;

  const situacaoMap: Record<number, string> = { 1: "NULA", 2: "ATIVA", 3: "SUSPENSA", 4: "INAPTA", 8: "BAIXADA" };
  const situacaoNum = Number(r.situacao_cadastral);
  const situacao = situacaoMap[situacaoNum] ?? toStr(r.situacao_cadastral);

  const porteMap: Record<string, string> = {
    "MICRO EMPRESA": "ME", "ME": "ME",
    "EMPRESA DE PEQUENO PORTE": "EPP", "EPP": "EPP",
    "DEMAIS": "DEMAIS",
  };
  const porteRaw = toStr(r.porte)?.toUpperCase() ?? "";
  const porte = porteMap[porteRaw] ?? (porteRaw || null);

  const cnaesSecRaw = r.cnaes_secundarios as Array<Record<string, unknown>> | undefined;
  const cnaesSecundarios: CnaeItem[] = (cnaesSecRaw ?? [])
    .map((c) => ({ codigo: toStr(c.codigo), descricao: toStr(c.descricao) }))
    .filter((c) => c.codigo || c.descricao);

  const qsaRaw = r.qsa as Array<Record<string, unknown>> | undefined;
  const qsa: QsaItem[] = (qsaRaw ?? []).map((s) => ({
    nome:              toStr(s.nome_socio ?? s.nome),
    qualificacao:      toStr(s.qualificacao_socio ?? s.qualificacao),
    cpf_socio:         toStr(s.cnpj_cpf_do_socio),
    cpf_representante: toStr(s.cpf_representante_legal),
  }));

  const toBool = (v: unknown) => v === true || v === "Sim" || v === "S" ? true : v === false || v === "Não" || v === "N" ? false : null;

  return {
    nome_enriquecido:       toStr(r.razao_social) || toStr(r.nome_fantasia),
    nome_fantasia:          toStr(r.nome_fantasia),
    situacao_cadastral:     situacao,
    natureza_juridica:      toStr((r.natureza_juridica as Record<string,unknown> | undefined)?.descricao ?? r.natureza_juridica),
    cnae_principal:         toStr(r.cnae_fiscal_descricao),
    municipio:              toStr(r.municipio),
    uf:                     toStr(r.uf),
    endereco:               r.logradouro ? `${r.logradouro}, ${r.numero ?? ""}`.trim() : null,
    complemento:            toStr(r.complemento),
    bairro:                 toStr(r.bairro),
    cep:                    toStr(r.cep)?.replace(/\D/g, "") || null,
    telefone:               toStr(r.ddd_telefone_1),
    telefone_2:             toStr(r.ddd_telefone_2),
    email:                  toStr(r.email),
    capital_social:         typeof r.capital_social === "number" ? r.capital_social : null,
    porte,
    data_abertura:          toStr(r.data_inicio_atividade),
    opcao_simples:          toBool(r.opcao_pelo_simples),
    opcao_mei:              toBool(r.opcao_pelo_mei),
    data_opcao_simples:     toStr(r.data_opcao_pelo_simples),
    data_exclusao_simples:  toStr(r.data_exclusao_do_simples),
    motivo_situacao:        toStr(r.descricao_motivo_situacao_cadastral),
    situacao_especial:      toStr(r.situacao_especial),
    data_situacao_especial: toStr(r.data_situacao_especial),
    cnaes_secundarios:      cnaesSecundarios.length > 0 ? cnaesSecundarios : null,
    qsa:                    qsa.length > 0 ? qsa : null,
  };
}

async function consultarReceitaWS(cnpj: string): Promise<DadosCnpj> {
  const resp = await fetch(`https://www.receitaws.com.br/v1/cnpj/${cnpj}`, {
    headers: { "User-Agent": "Varadouro-Digital/1.0 (interno TCE-AC)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`ReceitaWS HTTP ${resp.status}`);
  const r = await resp.json() as Record<string, unknown>;
  if (r.status === "ERROR") throw new Error(String(r.message) || "CNPJ não encontrado");

  const ativPrincipal    = r.atividade_principal    as Array<{ code?: string; text?: string }> | undefined;
  const ativSecundarias  = r.atividades_secundarias  as Array<{ code?: string; text?: string }> | undefined;
  const qsaRaw           = r.qsa                    as Array<Record<string, unknown>> | undefined;

  const cnaesSecundarios: CnaeItem[] = (ativSecundarias ?? [])
    .map((c) => ({ codigo: toStr(c.code), descricao: toStr(c.text) }))
    .filter((c) => c.codigo || c.descricao);

  const qsa: QsaItem[] = (qsaRaw ?? []).map((s) => ({
    nome:              toStr(s.nome),
    qualificacao:      toStr(s.qual),
    cpf_representante: null,
  }));

  return {
    nome_enriquecido:       toStr(r.nome) || toStr(r.fantasia),
    nome_fantasia:          toStr(r.fantasia),
    situacao_cadastral:     toStr(r.situacao),
    natureza_juridica:      toStr(r.natureza_juridica),
    cnae_principal:         toStr(ativPrincipal?.[0]?.text),
    municipio:              toStr(r.municipio),
    uf:                     toStr(r.uf),
    endereco:               toStr(r.logradouro),
    complemento:            toStr(r.complemento),
    bairro:                 toStr(r.bairro),
    cep:                    toStr(r.cep)?.replace(/\D/g, "") || null,
    telefone:               toStr(r.telefone),
    telefone_2:             null,
    email:                  toStr(r.email),
    capital_social:         r.capital_social ? Number(r.capital_social) : null,
    porte:                  toStr(r.porte),
    data_abertura:          toStr(r.abertura),
    opcao_simples:          null,
    opcao_mei:              null,
    data_opcao_simples:     null,
    data_exclusao_simples:  null,
    motivo_situacao:        toStr(r.motivo_situacao),
    situacao_especial:      toStr(r.situacao_especial),
    data_situacao_especial: toStr(r.data_situacao_especial),
    cnaes_secundarios:      cnaesSecundarios.length > 0 ? cnaesSecundarios : null,
    qsa:                    qsa.length > 0 ? qsa : null,
  };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ cpfCnpj: string }> },
) {
  const { cpfCnpj } = await params;
  const doc = onlyDigits(cpfCnpj);

  if (!doc) {
    return NextResponse.json({ error: "CPF/CNPJ inválido." }, { status: 400 });
  }

  if (doc.length !== 14) {
    return NextResponse.json(
      { error: "Revalidação automática disponível apenas para CNPJ." },
      { status: 422 },
    );
  }

  const provider = (process.env.CNPJ_ENRICH_PROVIDER ?? "brasilapi").toLowerCase();

  try {
    let dados: DadosCnpj;
    let fonte: string;

    if (provider === "receitaws") {
      dados = await consultarReceitaWS(doc);
      fonte = "RECEITAWS";
    } else {
      dados = await consultarBrasilAPI(doc);
      fonte = "BRASILAPI";
    }

    await dbQuery(`
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
      dados.nome_enriquecido,
      fonte,
      dados.situacao_cadastral,
      dados.natureza_juridica,
      dados.cnae_principal,
      dados.municipio,
      dados.uf,
      dados.endereco,
      dados.bairro,
      dados.cep,
      dados.telefone,
      dados.email,
      dados.capital_social,
      dados.porte,
      dados.data_abertura,
      dados.cnaes_secundarios ? JSON.stringify(dados.cnaes_secundarios) : null,
      dados.qsa ? JSON.stringify(dados.qsa) : null,
      doc,
      dados.nome_fantasia,
      dados.complemento,
      dados.telefone_2,
      dados.opcao_simples,
      dados.opcao_mei,
      dados.data_opcao_simples,
      dados.data_exclusao_simples,
      dados.motivo_situacao,
      dados.situacao_especial,
      dados.data_situacao_especial,
    ]);

    await dbQuery(`
      INSERT INTO audit.credor_enriquecimento_log
        (cpf_cnpj, tipo_documento, fonte, status, mensagem)
      VALUES ($1, 'CNPJ', $2, 'REVALIDADO', $3)
    `, [doc, fonte, (dados.nome_enriquecido ?? "").slice(0, 60) || "revalidação manual"]);

    return NextResponse.json({ ok: true, fonte });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await dbQuery(`
      UPDATE dw.dim_credor_enriquecido SET
        status_consulta = 'ERRO',
        erro_consulta   = $1,
        data_consulta   = now(),
        atualizado_em   = now()
      WHERE cpf_cnpj = $2
    `, [msg.slice(0, 200), doc]).catch(() => null);

    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
