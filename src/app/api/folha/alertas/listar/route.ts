import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { tetoConstitucional } from "@/lib/folha/teto-constitucional";

export const runtime = "nodejs";

const TIPOS_MATERIALIZADOS = [
  "vencimento_negativo",
  "desconto_negativo",
  "desconto_maior_vencimento",
  "sem_desconto",
  "cpf_invalido",
  "cargo_ausente",
  "lotacao_ausente",
] as const;

type TipoMaterializado = (typeof TIPOS_MATERIALIZADOS)[number];

const COLUNA_POR_TIPO: Record<TipoMaterializado, string> = {
  vencimento_negativo:       "fc.alerta_vencimento_negativo",
  desconto_negativo:         "fc.alerta_desconto_negativo",
  desconto_maior_vencimento: "fc.alerta_desconto_maior_vencimento",
  sem_desconto:              "fc.alerta_sem_desconto",
  cpf_invalido:              "fc.alerta_cpf_invalido",
  cargo_ausente:             "fc.alerta_cargo_ausente",
  lotacao_ausente:           "fc.alerta_lotacao_ausente",
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const competencia = sp.get("competencia");
  const idEntidade = sp.get("entidade");
  const poder = sp.get("poder");
  const tipo = sp.get("tipo") ?? "vencimento_negativo";
  const limit = Math.min(Number(sp.get("limit") ?? "50"), 500);
  const offset = Math.max(Number(sp.get("offset") ?? "0"), 0);

  if (!competencia) {
    return NextResponse.json({ error: "competencia obrigatória" }, { status: 400 });
  }

  const ano = Number(competencia.slice(0, 4));
  const teto = tetoConstitucional(ano);

  const params: unknown[] = [competencia];
  const filtros: string[] = ["fc.competencia = $1"];

  if (idEntidade && idEntidade !== "all") {
    params.push(Number(idEntidade));
    filtros.push(`fc.id_entidade_cjur = $${params.length}`);
  }
  if (poder && poder !== "all") {
    params.push(poder);
    filtros.push(`de.entidade_poder = $${params.length}`);
  }

  // Predicado do alerta selecionado.
  let predicado = "TRUE";
  if (TIPOS_MATERIALIZADOS.includes(tipo as TipoMaterializado)) {
    predicado = COLUNA_POR_TIPO[tipo as TipoMaterializado];
  } else if (tipo === "acumulo_de_cargos") {
    // Acúmulo é tratado por rota dedicada /api/folha/alertas/acumulo (resposta
    // agregada por servidor com vínculos, carga horária e classificação legal).
    return NextResponse.json(
      { error: "use /api/folha/alertas/acumulo para acúmulo de cargos" },
      { status: 400 },
    );
  } else if (tipo === "acima_do_teto") {
    params.push(teto);
    predicado = `fc.total_liquido > $${params.length}`;
  } else if (tipo === "variacao_anormal_mes_a_mes") {
    const compAnoMes = competencia.split("-").map(Number);
    let anoAnt = compAnoMes[0];
    let mesAnt = compAnoMes[1] - 1;
    if (mesAnt === 0) { mesAnt = 12; anoAnt -= 1; }
    const compAnt = `${anoAnt}-${String(mesAnt).padStart(2, "0")}`;
    params.push(compAnt);
    predicado = `
      fc.cpf_hash IN (
        WITH base AS (
          SELECT fc3.cpf_hash, fc3.competencia, SUM(fc3.total_liquido) AS liquido
            FROM folha.fato_contracheque fc3
            LEFT JOIN folha.dim_entidade de3 ON de3.id_entidade_cjur = fc3.id_entidade_cjur
           WHERE fc3.competencia IN ($1, $${params.length})
             ${idEntidade && idEntidade !== "all" ? `AND fc3.id_entidade_cjur = ${Number(idEntidade)}` : ""}
             ${poder && poder !== "all" ? `AND de3.entidade_poder = '${String(poder).replace(/'/g, "''")}'` : ""}
             AND fc3.cpf_hash IS NOT NULL
           GROUP BY fc3.cpf_hash, fc3.competencia
        ),
        pivot AS (
          SELECT cpf_hash,
                 SUM(CASE WHEN competencia = $1 THEN liquido END) AS atual,
                 SUM(CASE WHEN competencia = $${params.length} THEN liquido END) AS anterior
            FROM base
           GROUP BY cpf_hash
        )
        SELECT cpf_hash FROM pivot
         WHERE atual IS NOT NULL AND anterior IS NOT NULL AND anterior > 0
           AND ABS(atual - anterior) / anterior > 0.3
      )
    `;
  } else {
    return NextResponse.json({ error: `tipo de alerta inválido: ${tipo}` }, { status: 400 });
  }

  params.push(limit, offset);
  const idxLimit = params.length - 1;
  const idxOffset = params.length;

  const sql = `
    SELECT fc.id_contracheque_sicap,
           fc.competencia,
           fc.id_entidade_cjur,
           de.entidade_nome,
           de.ente_nome,
           de.entidade_poder,
           fc.id_cadastro_unico_sicap,
           ds.nome_servidor,
           fc.cpf_mascarado,
           fc.matricula,
           fc.id_cargo_sicap,
           dc.cargo_nome,
           fc.total_vencimentos,
           fc.total_descontos,
           fc.total_liquido,
           fc.alerta_vencimento_negativo,
           fc.alerta_desconto_negativo,
           fc.alerta_desconto_maior_vencimento,
           fc.alerta_sem_desconto,
           fc.alerta_cpf_invalido,
           fc.alerta_cargo_ausente,
           fc.alerta_lotacao_ausente
      FROM folha.fato_contracheque fc
      LEFT JOIN folha.dim_entidade de ON de.id_entidade_cjur = fc.id_entidade_cjur
      LEFT JOIN folha.dim_servidor ds ON ds.id_cadastro_unico_sicap = fc.id_cadastro_unico_sicap
      LEFT JOIN folha.dim_cargo    dc ON dc.id_cargo_sicap = fc.id_cargo_sicap
     WHERE ${filtros.join(" AND ")}
       AND (${predicado})
     ORDER BY fc.total_liquido DESC NULLS LAST
     LIMIT $${idxLimit} OFFSET $${idxOffset}
  `;

  try {
    const rows = await dbQuery(sql, params);
    return NextResponse.json({ tipo, rows, limit, offset, teto_aplicado: teto });
  } catch (err) {
    console.error("[api/folha/alertas/listar]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
