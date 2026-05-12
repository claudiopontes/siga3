import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const anoInicio = searchParams.get("anoInicio");
  const anoFim = searchParams.get("anoFim");
  const idEnte = searchParams.get("id_ente");
  const idEntidade = searchParams.get("id_entidade");

  // Carrega dados dimensionais em paralelo
  const [entesRes, entidadesRes, municipiosRes, naturezaRes] = await Promise.allSettled([
    dbQuery(
      `SELECT id_ente, cod_ibgce, cod_municipio, populacao, nome
       FROM public.dim_ente LIMIT 10000`
    ),
    dbQuery(
      `SELECT id_entidade, id_entidade_cjur, id_ente
       FROM public.dim_entidade LIMIT 10000`
    ),
    dbQuery(
      `SELECT codigo, nome, uf_codigo FROM public.aux_dim_municipio
       WHERE uf_codigo = '12' LIMIT 10000`
    ),
    dbQuery(
      `SELECT codigo, nivel, nome, rubrica
       FROM public.aux_dim_natureza_receita_orcamentaria LIMIT 10000`
    ),
  ]);

  const entes = entesRes.status === "fulfilled" ? entesRes.value : [];
  const entidades = entidadesRes.status === "fulfilled" ? entidadesRes.value : [];
  const municipios = municipiosRes.status === "fulfilled" ? municipiosRes.value : [];
  const natureza = naturezaRes.status === "fulfilled" ? naturezaRes.value : [];

  // Resolve anos se não fornecidos
  let anoInicioNum: number;
  let anoFimNum: number;

  if (anoInicio && anoFim) {
    anoInicioNum = Number(anoInicio);
    anoFimNum = Number(anoFim);
  } else {
    // Descobre 2 anos mais recentes
    try {
      const anosRows = await dbQuery<{ ano: number }>(
        `SELECT DISTINCT ano FROM public.receita_publica_categoria_mensal ORDER BY ano DESC LIMIT 5`
      );
      const anos = anosRows.map((r) => Number(r.ano)).filter(Boolean).sort((a, b) => b - a);
      if (anos.length === 0) {
        return NextResponse.json({ rows: [], entes, entidades, municipios, natureza });
      }
      anoFimNum = anos[0]!;
      anoInicioNum = anos.length >= 2 ? anos[1]! : anoFimNum;
    } catch {
      return NextResponse.json({ rows: [], entes, entidades, municipios, natureza });
    }
  }

  // Chama a RPC via SELECT
  let rows: unknown[] = [];
  try {
    const pEnte = idEnte && idEnte !== "all" ? Number(idEnte) : null;
    const pEntidade = idEntidade && idEntidade !== "all" ? Number(idEntidade) : null;

    rows = await dbQuery(
      `SELECT * FROM fn_receita_publica_entidade_mensal($1, $2, $3, $4)`,
      [anoInicioNum, anoFimNum, pEnte, pEntidade]
    );
  } catch {
    rows = [];
  }

  return NextResponse.json({ rows, entes, entidades, municipios, natureza });
}
