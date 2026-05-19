/**
 * siconfi-rgf-inspecionar-pessoal-legislativo.ts
 *
 * Auditoria somente-leitura: mapeia se é possível calcular a Despesa com Pessoal
 * do Poder Legislativo (Câmara Municipal) — futuro alerta de 6% da RCL — usando
 * exclusivamente os dados disponíveis em dw.fato_siconfi_rgf.
 *
 * NÃO implementa alerta. NÃO altera dados. NÃO modifica schema.
 * Apenas consulta e imprime um relatório.
 *
 * Uso: cd etl && npm run siconfi-rgf:inspecionar-pessoal-legislativo
 */

import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sep(titulo: string): void {
  const linha = "═".repeat(72);
  console.log(`\n${linha}`);
  console.log(`  ${titulo}`);
  console.log(linha);
}

function sub(titulo: string): void {
  console.log(`\n── ${titulo} ──`);
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "null";
  return Number(n).toLocaleString("pt-BR");
}

function truncar(s: string | null | undefined, max: number): string {
  if (!s) return "(nulo)";
  return s.length > max ? `${s.substring(0, max - 1)}…` : s;
}

// Conjunto de campos que o prompt pede para verificar
const CAMPOS_ESPERADOS = [
  "instituicao",
  "cod_conta",
  "conta",
  "coluna",
  "no_anexo",
  "co_esfera",
  "poder",
  "valor",
  "an_exercicio",
  "nr_periodo",
  "id_municipio",
  "no_municipio",
] as const;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface ColunaInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

async function main(): Promise<void> {
  console.log("==========================================================================");
  console.log("  AUDITORIA: Despesa com Pessoal do Poder Legislativo via RGF (LRF Art. 20)");
  console.log("==========================================================================");
  console.log(`  Executado em: ${new Date().toLocaleString("pt-BR")}`);
  console.log("  Modo: somente-leitura — nenhuma tabela é alterada");
  console.log("  Objetivo: mapear se é viável calcular % Pessoal/RCL do Legislativo");

  // =========================================================================
  // 0. EXISTÊNCIA E ESTRUTURA DA TABELA dw.fato_siconfi_rgf
  // =========================================================================
  sep("0. ESTRUTURA DE dw.fato_siconfi_rgf");

  const colunas = await pgQuery<ColunaInfo>(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'dw' AND table_name = 'fato_siconfi_rgf'
    ORDER BY ordinal_position
  `);

  if (colunas.length === 0) {
    console.log("  ⚠ TABELA NÃO EXISTE: dw.fato_siconfi_rgf");
    console.log("  Auditoria encerrada — não há o que inspecionar.");
    return;
  }

  console.log(`  Colunas (${colunas.length}):`);
  for (const c of colunas) {
    console.log(`    ${c.column_name.padEnd(24)} ${c.data_type.padEnd(20)} ${c.is_nullable === "YES" ? "NULL" : "NOT NULL"}`);
  }

  const nomesColunas = new Set(colunas.map((c) => c.column_name));

  sub("Campos críticos esperados pelo prompt");
  for (const f of CAMPOS_ESPERADOS) {
    console.log(`    ${f.padEnd(20)} ${nomesColunas.has(f) ? "✓ presente" : "✗ AUSENTE"}`);
  }

  // =========================================================================
  // A. COBERTURA GERAL
  // =========================================================================
  sep("A. COBERTURA GERAL DO RGF");

  const total = await pgQuery<{ n: number }>(`SELECT COUNT(*)::int AS n FROM dw.fato_siconfi_rgf`);
  const totalLinhas = total[0]?.n ?? 0;
  console.log(`  Total de linhas em dw.fato_siconfi_rgf: ${fmt(totalLinhas)}`);

  if (totalLinhas === 0) {
    console.log("\n  ⚠ TABELA VAZIA — nenhum dado fiscal RGF foi carregado.");
    console.log("  Observação: o endpoint /rgf do DataLake Tesouro Nacional retorna");
    console.log("  HTTP 200 com 0 itens (constatado em mai/2025). A carga atual usa");
    console.log("  /extrato_entregas, que traz apenas STATUS DE ENTREGA, não valores.");
  }

  // Períodos (depende das colunas existirem)
  if (nomesColunas.has("an_exercicio") && nomesColunas.has("nr_periodo")) {
    sub("Exercícios/períodos disponíveis");
    const periodos = await pgQuery<{ an_exercicio: number; nr_periodo: number; linhas: number; municipios: number }>(`
      SELECT
        an_exercicio,
        nr_periodo,
        COUNT(*)::int AS linhas,
        ${nomesColunas.has("id_municipio") ? "COUNT(DISTINCT id_municipio)::int" : "0"} AS municipios
      FROM dw.fato_siconfi_rgf
      GROUP BY an_exercicio, nr_periodo
      ORDER BY an_exercicio DESC, nr_periodo DESC
      LIMIT 20
    `);
    if (periodos.length === 0) {
      console.log("    (nenhum período — tabela vazia)");
    } else {
      for (const p of periodos) {
        console.log(`    ${p.an_exercicio}/${p.nr_periodo}  ${fmt(p.linhas).padStart(10)} linhas  |  ${p.municipios} municípios`);
      }
    }
  }

  // Municípios
  if (nomesColunas.has("id_municipio")) {
    sub("Municípios com dados");
    const muns = await pgQuery<{ municipios: number }>(`
      SELECT COUNT(DISTINCT id_municipio)::int AS municipios FROM dw.fato_siconfi_rgf
    `);
    console.log(`    Municípios distintos: ${muns[0]?.municipios ?? 0}`);
  }

  // Anexos
  if (nomesColunas.has("no_anexo")) {
    sub("Anexos encontrados");
    const anexos = await pgQuery<{ no_anexo: string | null; linhas: number }>(`
      SELECT no_anexo, COUNT(*)::int AS linhas
      FROM dw.fato_siconfi_rgf
      GROUP BY no_anexo
      ORDER BY linhas DESC
      LIMIT 20
    `);
    if (anexos.length === 0) console.log("    (nenhum anexo — tabela vazia)");
    for (const a of anexos) {
      console.log(`    ${(a.no_anexo ?? "(nulo)").padEnd(40)} ${fmt(a.linhas).padStart(10)} linhas`);
    }
  }

  // Instituições
  if (nomesColunas.has("instituicao")) {
    sub("Instituições encontradas (top 30)");
    const insts = await pgQuery<{ instituicao: string | null; linhas: number }>(`
      SELECT instituicao, COUNT(*)::int AS linhas
      FROM dw.fato_siconfi_rgf
      GROUP BY instituicao
      ORDER BY linhas DESC
      LIMIT 30
    `);
    if (insts.length === 0) console.log("    (nenhuma instituição — tabela vazia)");
    for (const i of insts) {
      console.log(`    ${truncar(i.instituicao, 50).padEnd(52)} ${fmt(i.linhas).padStart(10)} linhas`);
    }
  } else {
    sub("Instituições encontradas");
    console.log("    ✗ Campo 'instituicao' AUSENTE no DW — impossível separar Executivo/Legislativo");
  }

  // Colunas
  if (nomesColunas.has("coluna")) {
    sub("Colunas (atributos RGF) encontradas (top 30)");
    const cols = await pgQuery<{ coluna: string | null; linhas: number }>(`
      SELECT coluna, COUNT(*)::int AS linhas
      FROM dw.fato_siconfi_rgf
      GROUP BY coluna
      ORDER BY linhas DESC
      LIMIT 30
    `);
    if (cols.length === 0) console.log("    (nenhuma coluna — tabela vazia)");
    for (const c of cols) {
      console.log(`    ${truncar(c.coluna, 60).padEnd(62)} ${fmt(c.linhas).padStart(10)} linhas`);
    }
  }

  // =========================================================================
  // B. CANDIDATOS A LEGISLATIVO
  // =========================================================================
  sep("B. CANDIDATOS A LEGISLATIVO / CÂMARA MUNICIPAL");

  if (totalLinhas === 0) {
    console.log("  (tabela vazia — nada a inspecionar)");
  } else {
    const filtros: string[] = [];
    if (nomesColunas.has("instituicao")) {
      filtros.push("instituicao ILIKE '%Câmara%'");
      filtros.push("instituicao ILIKE '%Camara%'");
      filtros.push("instituicao ILIKE '%Legislativo%'");
    }
    if (nomesColunas.has("conta")) filtros.push("conta ILIKE '%LEGISLATIVO%'");
    if (nomesColunas.has("no_anexo")) filtros.push("no_anexo ILIKE '%LEGISLATIVO%'");
    if (nomesColunas.has("poder")) filtros.push("poder ILIKE '%LEGISLATIVO%'");

    if (filtros.length === 0) {
      console.log("  ⚠ Nenhum campo capaz de identificar Câmara/Legislativo está presente no DW.");
    } else {
      const sql = `
        SELECT
          ${nomesColunas.has("instituicao") ? "instituicao" : "NULL::text AS instituicao"},
          ${nomesColunas.has("poder")       ? "poder"       : "NULL::text AS poder"},
          ${nomesColunas.has("no_anexo")    ? "no_anexo"    : "NULL::text AS no_anexo"},
          ${nomesColunas.has("conta")       ? "conta"       : "NULL::text AS conta"},
          COUNT(*)::int AS linhas
        FROM dw.fato_siconfi_rgf
        WHERE ${filtros.join(" OR ")}
        GROUP BY 1, 2, 3, 4
        ORDER BY linhas DESC
        LIMIT 30
      `;
      const hits = await pgQuery<{ instituicao: string | null; poder: string | null; no_anexo: string | null; conta: string | null; linhas: number }>(sql);
      console.log(`  Linhas candidatas: ${hits.length} grupos distintos`);
      if (hits.length === 0) {
        console.log("  ⚠ Nenhuma linha corresponde a Câmara/Legislativo no DW RGF.");
      }
      for (const h of hits) {
        console.log(
          `    [${fmt(h.linhas).padStart(6)}]  inst=${truncar(h.instituicao, 25)}  poder=${truncar(h.poder, 12)}  anexo=${truncar(h.no_anexo, 24)}  conta=${truncar(h.conta, 40)}`,
        );
      }
    }
  }

  // =========================================================================
  // C. CANDIDATOS A DESPESA COM PESSOAL
  // =========================================================================
  sep("C. CANDIDATOS A DESPESA COM PESSOAL");

  if (totalLinhas === 0) {
    console.log("  (tabela vazia — nada a inspecionar)");
  } else {
    const filtros: string[] = [];
    if (nomesColunas.has("conta")) {
      filtros.push("conta ILIKE '%PESSOAL%'");
      filtros.push("conta ILIKE '%ENCARGOS%'");
    }
    if (nomesColunas.has("cod_conta")) {
      filtros.push("cod_conta ILIKE '%Pessoal%'");
      filtros.push("cod_conta ILIKE '%Despesa%Pessoal%'");
    }

    if (filtros.length === 0) {
      console.log("  ⚠ Campos 'conta' e 'cod_conta' ausentes — impossível buscar despesa com pessoal.");
    } else {
      const sql = `
        SELECT
          ${nomesColunas.has("cod_conta") ? "cod_conta" : "NULL::text AS cod_conta"},
          ${nomesColunas.has("conta")     ? "conta"     : "NULL::text AS conta"},
          COUNT(*)::int AS linhas
        FROM dw.fato_siconfi_rgf
        WHERE ${filtros.join(" OR ")}
        GROUP BY 1, 2
        ORDER BY linhas DESC
        LIMIT 30
      `;
      const hits = await pgQuery<{ cod_conta: string | null; conta: string | null; linhas: number }>(sql);
      console.log(`  Contas candidatas: ${hits.length}`);
      if (hits.length === 0) {
        console.log("  ⚠ Nenhuma conta corresponde a 'Pessoal' / 'Encargos' no DW RGF.");
      }
      for (const h of hits) {
        console.log(`    [${fmt(h.linhas).padStart(6)}]  cod=${truncar(h.cod_conta, 30)}  conta=${truncar(h.conta, 70)}`);
      }
    }
  }

  // =========================================================================
  // D. CANDIDATOS A RCL
  // =========================================================================
  sep("D. CANDIDATOS A RECEITA CORRENTE LÍQUIDA (RCL)");

  if (totalLinhas === 0) {
    console.log("  (tabela vazia — nada a inspecionar)");
  } else {
    const filtros: string[] = [];
    if (nomesColunas.has("conta")) {
      filtros.push("conta ILIKE '%RECEITA CORRENTE L%QUIDA%'");
      filtros.push("conta ILIKE '%RCL%'");
    }
    if (nomesColunas.has("cod_conta")) {
      filtros.push("cod_conta ILIKE '%ReceitaCorrenteLiquida%'");
    }

    if (filtros.length === 0) {
      console.log("  ⚠ Campos 'conta' e 'cod_conta' ausentes — impossível buscar RCL.");
    } else {
      const sql = `
        SELECT
          ${nomesColunas.has("cod_conta") ? "cod_conta" : "NULL::text AS cod_conta"},
          ${nomesColunas.has("conta")     ? "conta"     : "NULL::text AS conta"},
          COUNT(*)::int AS linhas
        FROM dw.fato_siconfi_rgf
        WHERE ${filtros.join(" OR ")}
        GROUP BY 1, 2
        ORDER BY linhas DESC
        LIMIT 30
      `;
      const hits = await pgQuery<{ cod_conta: string | null; conta: string | null; linhas: number }>(sql);
      console.log(`  Contas candidatas: ${hits.length}`);
      if (hits.length === 0) {
        console.log("  ⚠ Nenhuma conta corresponde a RCL no DW RGF.");
      }
      for (const h of hits) {
        console.log(`    [${fmt(h.linhas).padStart(6)}]  cod=${truncar(h.cod_conta, 30)}  conta=${truncar(h.conta, 70)}`);
      }
    }
  }

  // =========================================================================
  // E. EXEMPLOS (até 5 municípios)
  // =========================================================================
  sep("E. EXEMPLOS DE LINHAS (até 5 municípios)");

  if (totalLinhas === 0) {
    console.log("  (tabela vazia — nada a exemplificar)");
  } else {
    interface Exemplo {
      no_municipio: string | null;
      an_exercicio: number | null;
      nr_periodo:   number | null;
      instituicao:  string | null;
      no_anexo:     string | null;
      conta:        string | null;
      cod_conta:    string | null;
      coluna:       string | null;
      valor:        string | null;
    }

    const sel = (campo: string): string =>
      nomesColunas.has(campo) ? campo : `NULL::text AS ${campo}`;
    const selNum = (campo: string): string =>
      nomesColunas.has(campo) ? campo : `NULL::int AS ${campo}`;

    const sql = `
      WITH amostra_mun AS (
        SELECT DISTINCT ${nomesColunas.has("id_municipio") ? "id_municipio" : "NULL::int AS id_municipio"}
        FROM dw.fato_siconfi_rgf
        ${nomesColunas.has("id_municipio") ? "WHERE id_municipio IS NOT NULL" : ""}
        LIMIT 5
      )
      SELECT
        ${sel("no_municipio")},
        ${selNum("an_exercicio")},
        ${selNum("nr_periodo")},
        ${sel("instituicao")},
        ${sel("no_anexo")},
        ${sel("conta")},
        ${sel("cod_conta")},
        ${sel("coluna")},
        ${nomesColunas.has("valor") ? "valor::text AS valor" : "NULL::text AS valor"}
      FROM dw.fato_siconfi_rgf r
      ${nomesColunas.has("id_municipio") ? "WHERE r.id_municipio IN (SELECT id_municipio FROM amostra_mun)" : ""}
      ORDER BY ${nomesColunas.has("an_exercicio") ? "an_exercicio DESC, " : ""}${nomesColunas.has("nr_periodo") ? "nr_periodo DESC" : "1"}
      LIMIT 20
    `;
    const exemplos = await pgQuery<Exemplo>(sql);
    if (exemplos.length === 0) console.log("  (sem amostras)");
    for (const e of exemplos) {
      console.log("");
      console.log(`    município : ${e.no_municipio ?? "(nulo)"}`);
      console.log(`    período   : ${e.an_exercicio ?? "?"}/${e.nr_periodo ?? "?"}`);
      console.log(`    instituic.: ${e.instituicao ?? "(nulo)"}`);
      console.log(`    anexo     : ${e.no_anexo ?? "(nulo)"}`);
      console.log(`    cod_conta : ${e.cod_conta ?? "(nulo)"}`);
      console.log(`    conta     : ${truncar(e.conta, 80)}`);
      console.log(`    coluna    : ${truncar(e.coluna, 80)}`);
      console.log(`    valor     : ${e.valor ?? "(nulo)"}`);
    }
  }

  // =========================================================================
  // EXTRA. SITUAÇÃO DAS TABELAS RELACIONADAS
  // =========================================================================
  sep("EXTRA. TABELAS RELACIONADAS");

  const tabRelacionadas = await pgQuery<{ tabela: string; linhas: number }>(`
    SELECT 'raw.siconfi_rgf_raw'                  AS tabela, COUNT(*)::int AS linhas FROM raw.siconfi_rgf_raw
    UNION ALL
    SELECT 'dw.fato_siconfi_rgf',                 COUNT(*)::int FROM dw.fato_siconfi_rgf
    UNION ALL
    SELECT 'dw.fato_siconfi_extrato_entregas (RGF)',
      COUNT(*)::int FROM dw.fato_siconfi_extrato_entregas WHERE co_entregavel = 'RGF'
    UNION ALL
    SELECT 'mart.siconfi_rgf_resumo_municipio',    COUNT(*)::int FROM mart.siconfi_rgf_resumo_municipio
    UNION ALL
    SELECT 'mart.siconfi_rgf_alertas',             COUNT(*)::int FROM mart.siconfi_rgf_alertas
  `).catch((err: unknown) => {
    console.log(`  (não foi possível consultar todas: ${(err as Error).message})`);
    return [] as { tabela: string; linhas: number }[];
  });

  for (const r of tabRelacionadas) {
    const status = r.linhas === 0 ? "⚠ VAZIO" : `✓ ${fmt(r.linhas)} linhas`;
    console.log(`  ${r.tabela.padEnd(48)} ${status}`);
  }

  // =========================================================================
  // F. DIAGNÓSTICO FINAL
  // =========================================================================
  sep("F. DIAGNÓSTICO FINAL");

  const temInstituicao = nomesColunas.has("instituicao");
  const temPoder       = nomesColunas.has("poder");
  const temCodConta    = nomesColunas.has("cod_conta");
  const temConta       = nomesColunas.has("conta");
  const temColuna      = nomesColunas.has("coluna");

  console.log(`
  1) Há dados suficientes para calcular Despesa com Pessoal do Legislativo?
     ${totalLinhas === 0 ? "✗ NÃO — dw.fato_siconfi_rgf está VAZIO." : "→ depende dos achados acima (ver itens B/C/D)."}

  2) Campo que identifica Câmara/Legislativo:
     - instituicao : ${temInstituicao ? "presente (schema)" : "AUSENTE no schema"}
     - poder       : ${temPoder ? "presente (schema)" : "AUSENTE no schema"}
     ${totalLinhas === 0 ? "→ Como a tabela está vazia, não é possível confirmar valores reais." : "→ Conferir item B."}

  3) Conta/cod_conta que representa Despesa com Pessoal:
     ${temConta || temCodConta
        ? totalLinhas === 0 ? "→ Campos no schema, mas sem linhas — ver item C quando houver dados." : "→ Ver item C."
        : "✗ Nenhum campo de conta no schema."}

  4) Conta/cod_conta que representa RCL:
     ${temConta || temCodConta
        ? totalLinhas === 0 ? "→ Campos no schema, mas sem linhas — ver item D quando houver dados." : "→ Ver item D."
        : "✗ Nenhum campo de conta no schema."}

  5) O percentual (% Pessoal/RCL) já vem calculado pelo SICONFI?
     ${temColuna
        ? totalLinhas === 0
          ? "→ Não verificável agora (tabela vazia). O RGF normalmente expõe colunas como '%SOBRE A RCL AJUSTADA' e os limites prudencial/alerta/máximo no Anexo 01 do RGF, MAS isso só se confirma com dados reais carregados."
          : "→ Verificar nas colunas listadas no item A se há rótulos do tipo '%SOBRE A RCL' / 'LIMITE MÁXIMO' / 'LIMITE PRUDENCIAL' / 'LIMITE DE ALERTA'."
        : "✗ Campo 'coluna' ausente — impossível confirmar."}

  6) Será necessário cruzar RGF com RREO para obter RCL?
     ${totalLinhas === 0
        ? "→ SIM, hoje é a única alternativa. Como o RGF do DataLake não publica linhas\n        (endpoint /rgf retorna 0 itens; o pipeline atual carrega apenas /extrato_entregas\n        em dw.fato_siconfi_extrato_entregas, que contém somente STATUS de entrega), não há\n        RCL disponível na fonte RGF. A RCL precisa vir do RREO-Anexo 03 do mesmo município/período.\n        Ainda assim, o numerador (Despesa com Pessoal do Legislativo) também não está disponível,\n        pois o RREO atual também não distingue por instituicao no DW."
        : "→ Pode ser dispensável se o RGF expõe RCL na própria conta. Caso contrário, sim."}

  7) É seguro implementar o alerta de 6% (LRF Art. 20, III, 'a')?
     ✗ NÃO — pelas razões abaixo:
       a) ${totalLinhas === 0 ? "dw.fato_siconfi_rgf não tem linhas hoje." : "Linhas presentes, mas a separação Executivo/Legislativo precisa ser confirmada pelos dados (item B)."}
       b) ${temInstituicao ? "Campo 'instituicao' existe no schema, mas precisa de dados reais." : "Sem 'instituicao' não é possível identificar a Câmara Municipal."}
       c) Sem 'cod_conta' ou 'conta' com cobertura confiável, o match textual é frágil.
       d) O percentual oficial pode ou não vir pré-calculado; sem dados não há como confirmar.

  8) Limitações persistentes:
     - Endpoint /rgf do DataLake Tesouro Nacional retorna HTTP 200 com 0 itens (mai/2025).
     - O pipeline atual (siconfi-rgf-full-postgres.ts) popula apenas
       dw.fato_siconfi_extrato_entregas (status de entrega), não dw.fato_siconfi_rgf.
     - As marts mart.siconfi_rgf_resumo_municipio / mart.siconfi_rgf_alertas
       operam apenas sobre status de entrega — não há valores fiscais.
     - Sem fonte alternativa (download do anexo do RGF em PDF/XLS, ou outro
       endpoint), não é possível calcular o % Pessoal/RCL do Legislativo
       a partir do RGF dentro do datalake oficial.

  9) Próximo passo recomendado:
     a) Confirmar via /tt/rgf com diferentes combinações se algum município
        do Acre retorna dados (já tentado em mai/2025 sem sucesso).
     b) Avaliar fontes alternativas oficiais:
        - SICONFI Consulta (https://siconfi.tesouro.gov.br): download do
          RGF do município (HTML/PDF/XLS), com parser dedicado.
        - Portal Transparência da Câmara Municipal local (Acre): 22 fontes.
     c) Persistindo o bloqueio, manter a estratégia atual: alertar apenas
        Executivo (54% RCL via RREO + ILIKE '%Prefeitura%') e registrar
        no painel que o Legislativo depende de fonte externa ao DataLake.
     d) Não criar o alerta de 6% até existir uma fonte com instituicao
        identificada, conta de Pessoal e RCL coerentes, e cobertura ≥ 1
        município do Acre.
  `);

  console.log("==========================================================================");
  console.log("  FIM DA AUDITORIA");
  console.log("==========================================================================\n");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main()
  .then(() => closePgPool())
  .catch((err: unknown) => {
    console.error("\n[ERRO]", (err as Error).message);
    closePgPool().catch(() => undefined);
    process.exit(1);
  });
