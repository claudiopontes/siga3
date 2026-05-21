import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import {
  CARGA_HORARIA_LIMITE_SOFT,
  classificarAcumulo,
  classificarCargo,
  type CategoriaCargo,
} from "@/lib/folha/acumulo-cargos";

export const runtime = "nodejs";

type VinculoRow = {
  cpf_hash: string;
  id_cadastro_unico_sicap: number;
  nome_servidor: string | null;
  cpf_mascarado: string | null;
  id_beneficiario_sicap: number;
  matricula: string | null;
  id_entidade_cjur: number;
  entidade_nome: string | null;
  entidade_poder: string | null;
  ente_nome: string | null;
  id_cargo_sicap: number | null;
  cargo_nome: string | null;
  carga_horaria_mensal: string | null;
  total_liquido_vinculo: string;
};

type Vinculo = {
  id_beneficiario_sicap: number;
  matricula: string | null;
  id_entidade_cjur: number;
  entidade_nome: string | null;
  entidade_poder: string | null;
  id_cargo_sicap: number | null;
  cargo_nome: string | null;
  categoria_cargo: CategoriaCargo;
  carga_horaria_mensal: number | null;
  total_liquido: number;
};

type ServidorAcumulo = {
  cpf_hash: string;
  id_cadastro_unico_sicap: number;
  nome_servidor: string | null;
  cpf_mascarado: string | null;
  qtd_vinculos: number;
  qtd_entidades: number;
  carga_horaria_total: number;
  carga_horaria_excessiva: boolean;
  total_liquido_somado: number;
  classificacao: "POTENCIALMENTE_LICITO" | "INVESTIGAR";
  vinculos: Vinculo[];
};

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toNum(v: unknown): number {
  return toNumOrNull(v) ?? 0;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const competencia = sp.get("competencia");
  const idEntidade = sp.get("entidade");
  const poder = sp.get("poder");
  const filtro = sp.get("filtro") ?? "todos"; // "todos" | "investigar" | "licito" | "excesso_horas"
  const limit = Math.min(Number(sp.get("limit") ?? "50"), 500);
  const offset = Math.max(Number(sp.get("offset") ?? "0"), 0);

  if (!competencia) {
    return NextResponse.json({ error: "competencia obrigatória" }, { status: 400 });
  }

  // Escopo opcional (entidade/poder atuam como filtro de presença: ao menos um
  // vínculo deve cair nele para o servidor entrar no relatório).
  const params: unknown[] = [competencia];
  const filtrosPresenca: string[] = ["fc.competencia = $1"];

  if (idEntidade && idEntidade !== "all") {
    params.push(Number(idEntidade));
    filtrosPresenca.push(`fc.id_entidade_cjur = $${params.length}`);
  }
  if (poder && poder !== "all") {
    params.push(poder);
    filtrosPresenca.push(`de.entidade_poder = $${params.length}`);
  }

  // 1) Identifica cpf_hashes em acumulação real (>1 vínculo, em entidades distintas)
  //    DENTRO do escopo. Para servidores que tem v1 em órgão A e v2 em órgão B,
  //    o filtro por entidade A vai pegar o servidor (porque v1 cai no escopo) —
  //    mas os v2 em B também serão exibidos (acumulação cruza limites do filtro).
  //
  // 2) Em seguida, busca TODOS os vínculos do servidor (sem filtro de escopo),
  //    inclusive os fora do escopo, agregando por vínculo.
  const sqlCpfHashesAcumulando = `
    SELECT DISTINCT fc.cpf_hash
      FROM folha.fato_contracheque fc
      LEFT JOIN folha.dim_entidade de ON de.id_entidade_cjur = fc.id_entidade_cjur
     WHERE fc.cpf_hash IN (
       SELECT fc2.cpf_hash
         FROM folha.fato_contracheque fc2
         LEFT JOIN folha.dim_entidade de2 ON de2.id_entidade_cjur = fc2.id_entidade_cjur
        WHERE ${filtrosPresenca.join(" AND ").replace(/fc\./g, "fc2.").replace(/de\./g, "de2.")}
          AND fc2.cpf_hash IS NOT NULL
       )
       AND fc.competencia = $1
       AND fc.cpf_hash IS NOT NULL
       AND fc.id_beneficiario_sicap IS NOT NULL
     GROUP BY fc.cpf_hash
    HAVING COUNT(DISTINCT fc.id_beneficiario_sicap) > 1
       AND COUNT(DISTINCT fc.id_entidade_cjur)      > 1
  `;

  // Agrega vínculos: 1 linha por (cpf, vínculo). Soma total_liquido entre tipos de folha.
  const sqlVinculos = `
    WITH alvo AS (${sqlCpfHashesAcumulando})
    SELECT
      fc.cpf_hash,
      fc.id_cadastro_unico_sicap,
      ds.nome_servidor,
      ds.cpf_mascarado,
      fc.id_beneficiario_sicap,
      MAX(fc.matricula)                        AS matricula,
      fc.id_entidade_cjur,
      MAX(de.entidade_nome)                    AS entidade_nome,
      MAX(de.entidade_poder)                   AS entidade_poder,
      MAX(de.ente_nome)                        AS ente_nome,
      fc.id_cargo_sicap,
      MAX(dc.cargo_nome)                       AS cargo_nome,
      MAX(dc.carga_horaria_mensal)::text       AS carga_horaria_mensal,
      SUM(fc.total_liquido)::text              AS total_liquido_vinculo
    FROM folha.fato_contracheque fc
    INNER JOIN alvo                ON alvo.cpf_hash             = fc.cpf_hash
    LEFT  JOIN folha.dim_servidor ds ON ds.id_cadastro_unico_sicap = fc.id_cadastro_unico_sicap
    LEFT  JOIN folha.dim_entidade  de ON de.id_entidade_cjur       = fc.id_entidade_cjur
    LEFT  JOIN folha.dim_cargo     dc ON dc.id_cargo_sicap         = fc.id_cargo_sicap
    WHERE fc.competencia = $1
      AND fc.id_beneficiario_sicap IS NOT NULL
    GROUP BY fc.cpf_hash, fc.id_cadastro_unico_sicap, ds.nome_servidor, ds.cpf_mascarado,
             fc.id_beneficiario_sicap, fc.id_entidade_cjur, fc.id_cargo_sicap
  `;

  try {
    const linhas = await dbQuery<VinculoRow>(sqlVinculos, params);

    // Agrupa por servidor.
    const porServidor = new Map<string, ServidorAcumulo>();
    for (const r of linhas) {
      const ch = r.cpf_hash;
      const vinculo: Vinculo = {
        id_beneficiario_sicap: Number(r.id_beneficiario_sicap),
        matricula: r.matricula,
        id_entidade_cjur: Number(r.id_entidade_cjur),
        entidade_nome: r.entidade_nome,
        entidade_poder: r.entidade_poder,
        id_cargo_sicap: r.id_cargo_sicap ? Number(r.id_cargo_sicap) : null,
        cargo_nome: r.cargo_nome,
        categoria_cargo: classificarCargo(r.cargo_nome),
        carga_horaria_mensal: toNumOrNull(r.carga_horaria_mensal),
        total_liquido: toNum(r.total_liquido_vinculo),
      };

      const existente = porServidor.get(ch);
      if (existente) {
        existente.vinculos.push(vinculo);
      } else {
        porServidor.set(ch, {
          cpf_hash: ch,
          id_cadastro_unico_sicap: Number(r.id_cadastro_unico_sicap),
          nome_servidor: r.nome_servidor,
          cpf_mascarado: r.cpf_mascarado,
          qtd_vinculos: 0,
          qtd_entidades: 0,
          carga_horaria_total: 0,
          carga_horaria_excessiva: false,
          total_liquido_somado: 0,
          classificacao: "INVESTIGAR",
          vinculos: [vinculo],
        });
      }
    }

    // Finaliza agregações por servidor.
    for (const s of porServidor.values()) {
      s.qtd_vinculos = s.vinculos.length;
      s.qtd_entidades = new Set(s.vinculos.map((v) => v.id_entidade_cjur)).size;
      s.carga_horaria_total = s.vinculos.reduce((acc, v) => acc + (v.carga_horaria_mensal ?? 0), 0);
      s.carga_horaria_excessiva = s.carga_horaria_total > CARGA_HORARIA_LIMITE_SOFT;
      s.total_liquido_somado = s.vinculos.reduce((acc, v) => acc + v.total_liquido, 0);
      s.classificacao = classificarAcumulo(s.vinculos.map((v) => v.categoria_cargo));
    }

    // Filtros e ordenação no servidor (após classificação).
    let lista = Array.from(porServidor.values());
    if (filtro === "investigar") {
      lista = lista.filter((s) => s.classificacao === "INVESTIGAR");
    } else if (filtro === "licito") {
      lista = lista.filter((s) => s.classificacao === "POTENCIALMENTE_LICITO");
    } else if (filtro === "excesso_horas") {
      lista = lista.filter((s) => s.carga_horaria_excessiva);
    }
    lista.sort((a, b) => b.carga_horaria_total - a.carga_horaria_total
      || b.total_liquido_somado - a.total_liquido_somado);

    const total = lista.length;
    const pagina = lista.slice(offset, offset + limit);

    return NextResponse.json({
      total,
      limit,
      offset,
      carga_horaria_limite: CARGA_HORARIA_LIMITE_SOFT,
      rows: pagina,
    });
  } catch (err) {
    console.error("[api/folha/alertas/acumulo]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
