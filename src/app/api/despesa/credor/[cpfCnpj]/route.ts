import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { onlyDigits } from "@/lib/credor-utils";

export const runtime = "nodejs";

// -------------------------------------------------------
// Tipos de resposta
// -------------------------------------------------------

interface ResumoRow {
  cpf_cnpj_credor: string;
  nome_credor: string | null;
  nome_exibicao: string | null;
  tipo_documento: string | null;
  fonte_enriquecimento: string | null;
  data_consulta: string | null;
  status_consulta: string | null;
  valor_empenhado_liquido: string;
  valor_liquidado: string;
  valor_pago: string;
  valor_a_liquidar: string;
  valor_a_pagar: string;
  qtd_empenhos: number;
  qtd_entidades: number;
  primeiro_empenho: string | null;
  ultimo_empenho: string | null;
}

interface CadastroRow {
  tipo_documento: string | null;
  nome_original: string | null;
  nome_enriquecido: string | null;
  nome_exibicao: string | null;
  fonte_enriquecimento: string | null;
  situacao_cadastral: string | null;
  natureza_juridica: string | null;
  cnae_principal: string | null;
  municipio: string | null;
  uf: string | null;
  endereco: string | null;
  bairro: string | null;
  cep: string | null;
  telefone: string | null;
  email: string | null;
  data_consulta: string | null;
  status_consulta: string | null;
}

interface EvolucaoRow {
  ano_remessa: number;
  mes_empenho: string;
  valor_empenhado_liquido: string;
  valor_liquidado: string;
  valor_pago: string;
}

interface EntidadeRow {
  id_entidade: string;
  nome_entidade: string | null;
  valor_empenhado_liquido: string;
  valor_liquidado: string;
  valor_pago: string;
  valor_a_pagar: string;
  qtd_empenhos: number;
}

interface EmpenhoRow {
  id_despesa: string;
  id_entidade: string;
  nome_entidade: string | null;
  ano_remessa: number | null;
  numero_remessa: number | null;
  ano_empenho: number | null;
  numero_empenho: string | null;
  data_empenho: string | null;
  historico_empenho: string | null;
  valor_empenhado_liquido: string;
  valor_liquidado: string;
  valor_pago: string;
  valor_a_pagar: string;
}

// -------------------------------------------------------
// Handler
// -------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cpfCnpj: string }> }
) {
  const { cpfCnpj } = await params;
  const doc = onlyDigits(cpfCnpj);

  if (!doc) {
    return NextResponse.json({ error: "CPF/CNPJ inválido." }, { status: 400 });
  }

  try {
    const [resumoRows, cadastroRows, evolucaoRows, entidadesRows, empenhosRows] =
      await Promise.all([
        // 1. Resumo financeiro
        dbQuery<ResumoRow>(`
          SELECT
            cpf_cnpj_credor,
            nome_credor,
            nome_exibicao,
            tipo_documento,
            fonte_enriquecimento,
            data_consulta,
            status_consulta,
            valor_empenhado_liquido,
            valor_liquidado,
            valor_pago,
            valor_a_liquidar,
            valor_a_pagar,
            qtd_empenhos,
            qtd_entidades,
            primeiro_empenho,
            ultimo_empenho
          FROM mart.credor_resumo
          WHERE cpf_cnpj_credor = $1
          LIMIT 1
        `, [doc]),

        // 2. Dados cadastrais de enriquecimento
        dbQuery<CadastroRow>(`
          SELECT
            tipo_documento,
            nome_original,
            nome_enriquecido,
            nome_exibicao,
            fonte_enriquecimento,
            situacao_cadastral,
            natureza_juridica,
            cnae_principal,
            municipio,
            uf,
            endereco,
            bairro,
            cep,
            telefone,
            email,
            data_consulta,
            status_consulta
          FROM dw.dim_credor_enriquecido
          WHERE cpf_cnpj = $1
          LIMIT 1
        `, [doc]),

        // 3. Evolução mensal
        dbQuery<EvolucaoRow>(`
          SELECT
            ano_remessa,
            mes_empenho,
            valor_empenhado_liquido,
            valor_liquidado,
            valor_pago
          FROM mart.credor_evolucao_mensal
          WHERE cpf_cnpj_credor = $1
          ORDER BY mes_empenho
        `, [doc]),

        // 4. Entidades (máx 50)
        dbQuery<EntidadeRow>(`
          SELECT
            id_entidade::text,
            nome_entidade,
            valor_empenhado_liquido,
            valor_liquidado,
            valor_pago,
            valor_a_pagar,
            qtd_empenhos
          FROM mart.credor_entidades
          WHERE cpf_cnpj_credor = $1
          ORDER BY valor_empenhado_liquido DESC
          LIMIT 50
        `, [doc]),

        // 5. Empenhos relevantes (máx 100)
        dbQuery<EmpenhoRow>(`
          SELECT
            id_despesa::text,
            id_entidade::text,
            nome_entidade,
            ano_remessa,
            numero_remessa,
            ano_empenho,
            numero_empenho::text,
            data_empenho,
            historico_empenho,
            valor_empenhado_liquido,
            valor_liquidado,
            valor_pago,
            valor_a_pagar
          FROM mart.credor_empenhos_relevantes
          WHERE cpf_cnpj_credor = $1
          ORDER BY valor_empenhado_liquido DESC
          LIMIT 100
        `, [doc]),
      ]);

    if (resumoRows.length === 0) {
      return NextResponse.json({ error: "Credor não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      resumo:    resumoRows[0],
      cadastro:  cadastroRows[0] ?? null,
      evolucao:  evolucaoRows,
      entidades: entidadesRows,
      empenhos:  empenhosRows,
    });
  } catch (err) {
    console.error("[api/despesa/credor]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro interno ao consultar credor." }, { status: 500 });
  }
}
