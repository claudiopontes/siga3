import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ idCadastroUnico: string }> },
) {
  const { idCadastroUnico } = await params;
  const id = Number(idCadastroUnico);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "idCadastroUnico inválido" }, { status: 400 });
  }
  const competencia = req.nextUrl.searchParams.get("competencia");

  // Ficha do servidor
  const servidor = await dbQuery(
    `SELECT id_cadastro_unico_sicap, nome_servidor, cpf_mascarado,
            data_nascimento, sexo, nit_pis_pasep
       FROM folha.dim_servidor
      WHERE id_cadastro_unico_sicap = $1`,
    [id],
  );
  if (servidor.length === 0) {
    return NextResponse.json({ error: "servidor não encontrado" }, { status: 404 });
  }

  // Histórico de contracheques (todas as competências disponíveis)
  const contracheques = await dbQuery(
    `SELECT fc.competencia, fc.ano, fc.mes,
            fc.id_contracheque_sicap,
            fc.id_entidade_cjur, de.entidade_nome, de.ente_nome, de.entidade_poder,
            fc.id_cargo_sicap, dc.cargo_nome, dc.cargo_codigo,
            fc.id_unidade_lotacao_sicap, dl.unidade_lotacao_nome, dl.municipio_lotacao_nome,
            fc.id_tipo_folha_sicap, dtf.tipo_folha_descricao,
            fc.matricula,
            fc.total_vencimentos, fc.total_descontos, fc.total_liquido,
            fc.base_irpf, fc.base_previdenciaria_segurado, fc.base_previdenciaria_patronal,
            fc.alerta_vencimento_negativo, fc.alerta_desconto_negativo,
            fc.alerta_desconto_maior_vencimento, fc.alerta_sem_desconto,
            fc.alerta_cpf_invalido, fc.alerta_cargo_ausente, fc.alerta_lotacao_ausente,
            fc.situacao_atual_servidor, fc.situacao_beneficiario
       FROM folha.fato_contracheque fc
       LEFT JOIN folha.dim_entidade   de  ON de.id_entidade_cjur     = fc.id_entidade_cjur
       LEFT JOIN folha.dim_cargo      dc  ON dc.id_cargo_sicap       = fc.id_cargo_sicap
       LEFT JOIN folha.dim_lotacao    dl  ON dl.id_unidade_lotacao_sicap = fc.id_unidade_lotacao_sicap
       LEFT JOIN folha.dim_tipo_folha dtf ON dtf.id_tipo_folha_sicap = fc.id_tipo_folha_sicap
      WHERE fc.id_cadastro_unico_sicap = $1
      ORDER BY fc.ano DESC, fc.mes DESC, fc.id_entidade_cjur`,
    [id],
  );

  // Verbas detalhadas — filtradas por competência se informada; senão, da competência mais recente.
  const compFiltro = competencia
    ?? ((contracheques[0] as { competencia?: string } | undefined)?.competencia ?? null);

  const verbas = compFiltro
    ? await dbQuery(
        `SELECT fv.competencia, fv.ano, fv.mes,
                fv.id_contracheque_sicap, fv.id_entidade_cjur, de.entidade_nome,
                fv.id_verba_sicap, fv.verba_codigo, fv.verba_descricao,
                fv.verba_natureza, fv.verba_grupo_natureza_despesa,
                fv.verba_subgrupo_classificacao,
                fv.verba_compoe_vencimento_padrao,
                fv.verba_base_fgts, fv.verba_base_irpf, fv.verba_base_previdencia,
                fv.verba_referencia, fv.verba_valor,
                fv.alerta_verba_valor_negativo, fv.alerta_verba_sem_codigo,
                fv.alerta_verba_sem_descricao, fv.alerta_verba_sem_subgrupo_classificacao,
                fv.alerta_verba_sem_natureza
           FROM folha.fato_verba_contracheque fv
           LEFT JOIN folha.dim_entidade de ON de.id_entidade_cjur = fv.id_entidade_cjur
          WHERE fv.id_cadastro_unico_sicap = $1
            AND fv.competencia = $2
          ORDER BY fv.verba_natureza, fv.verba_valor DESC NULLS LAST`,
        [id, compFiltro],
      )
    : [];

  return NextResponse.json({
    servidor: servidor[0],
    contracheques,
    competencia_verbas: compFiltro,
    verbas,
  });
}
