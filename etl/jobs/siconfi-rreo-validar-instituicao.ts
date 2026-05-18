/**
 * siconfi-rreo-validar-instituicao.ts
 *
 * Script de validação: verifica se os campos 'instituicao' e 'cod_conta'
 * foram preenchidos em dw.fato_siconfi_rreo e avalia se é possível separar
 * Prefeitura/Executivo de Câmara/Legislativo para os alertas de pessoal.
 *
 * NÃO modifica dados. Somente leitura.
 *
 * Uso: cd etl && npm run siconfi-rreo:validar-instituicao
 */

import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sep(titulo: string) {
  const linha = "─".repeat(60);
  console.log(`\n${linha}`);
  console.log(`  ${titulo}`);
  console.log(linha);
}

function fmt(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return String(n);
  return num.toLocaleString("pt-BR");
}

function pct(parte: number | string, total: number | string): string {
  const p = typeof parte === "string" ? parseFloat(parte) : parte;
  const t = typeof total === "string" ? parseFloat(total) : total;
  if (!t) return "—";
  return `${((p / t) * 100).toFixed(1)}%`;
}

function fmtMoeda(v: number | string | null): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}

// ---------------------------------------------------------------------------
// A. Cobertura geral
// ---------------------------------------------------------------------------

async function secaoA() {
  sep("A. Cobertura geral de instituicao e cod_conta");

  const [totRow] = await pgQuery<{ total: string }>(
    "SELECT COUNT(*) AS total FROM dw.fato_siconfi_rreo"
  );
  const [instRow] = await pgQuery<{ com_inst: string }>(
    "SELECT COUNT(*) AS com_inst FROM dw.fato_siconfi_rreo WHERE instituicao IS NOT NULL AND instituicao <> ''"
  );
  const [codRow] = await pgQuery<{ com_cod: string }>(
    "SELECT COUNT(*) AS com_cod FROM dw.fato_siconfi_rreo WHERE cod_conta IS NOT NULL AND cod_conta <> ''"
  );

  const total   = totRow?.total   ?? "0";
  const comInst = instRow?.com_inst ?? "0";
  const comCod  = codRow?.com_cod   ?? "0";

  console.log(`  Total de linhas em dw.fato_siconfi_rreo : ${fmt(total)}`);
  console.log(`  Com instituicao preenchida              : ${fmt(comInst)} (${pct(comInst, total)})`);
  console.log(`  Com cod_conta preenchido                : ${fmt(comCod)} (${pct(comCod, total)})`);

  if (parseFloat(comInst) === 0) {
    console.log("\n  ⚠️  Nenhum registro com 'instituicao' preenchido.");
    console.log("     Execute a migração 181_siconfi_rreo_enriquecer_dw.sql e recarregue o RREO.");
  }
  if (parseFloat(comCod) === 0) {
    console.log("\n  ℹ️  Nenhum registro com 'cod_conta' preenchido.");
    console.log("     cod_conta será preenchido na próxima carga incremental/full.");
  }
}

// ---------------------------------------------------------------------------
// B. Instituições encontradas
// ---------------------------------------------------------------------------

async function secaoB() {
  sep("B. Instituições encontradas");

  const rows = await pgQuery<{
    instituicao: string | null;
    linhas: string;
    municipios: string;
  }>(`
    SELECT
      instituicao,
      COUNT(*)                           AS linhas,
      COUNT(DISTINCT id_municipio)       AS municipios
    FROM dw.fato_siconfi_rreo
    WHERE instituicao IS NOT NULL AND instituicao <> ''
    GROUP BY instituicao
    ORDER BY COUNT(*) DESC
    LIMIT 30
  `);

  if (!rows.length) {
    console.log("  Sem registros com instituicao preenchida.");
    return;
  }

  console.log(`  ${"Instituição".padEnd(55)} ${"Linhas".padStart(10)} ${"Municípios".padStart(12)}`);
  console.log("  " + "─".repeat(78));
  for (const r of rows) {
    const nome = (r.instituicao ?? "NULL").slice(0, 54).padEnd(55);
    console.log(`  ${nome} ${fmt(r.linhas).padStart(10)} ${fmt(r.municipios).padStart(12)}`);
  }

  // Resumo por tipo de instituição
  const tipos = await pgQuery<{ tipo: string; qtd: string }>(`
    SELECT
      CASE
        WHEN instituicao ILIKE '%Prefeitura%' OR instituicao ILIKE '%Executivo%'
          THEN 'Prefeitura / Executivo'
        WHEN instituicao ILIKE '%Câmara%'     OR instituicao ILIKE '%Camera%'
          OR  instituicao ILIKE '%Legislativo%'
          THEN 'Câmara / Legislativo'
        ELSE 'Outros / Desconhecido'
      END AS tipo,
      COUNT(DISTINCT id_municipio) AS qtd
    FROM dw.fato_siconfi_rreo
    WHERE instituicao IS NOT NULL AND instituicao <> ''
    GROUP BY 1
    ORDER BY 2 DESC
  `);

  console.log("\n  Resumo por tipo:");
  for (const t of tipos) {
    console.log(`    ${t.tipo.padEnd(30)}: ${fmt(t.qtd)} município(s)`);
  }
}

// ---------------------------------------------------------------------------
// C. Validação pessoal: separação Prefeitura × Câmara (filtros do alerta consolidado)
// ---------------------------------------------------------------------------

async function secaoC() {
  sep("C. Validação — Despesa com Pessoal por Poder (Anexo 01)");

  // Encontra o 6º bimestre mais recente
  const [periodo6] = await pgQuery<{ an_exercicio: number; nr_periodo: number }>(`
    SELECT an_exercicio, nr_periodo
    FROM dw.fato_siconfi_rreo
    WHERE nr_periodo = 6
    GROUP BY an_exercicio, nr_periodo
    ORDER BY an_exercicio DESC
    LIMIT 1
  `);

  if (!periodo6) {
    console.log("  ⚠️  Sem 6º bimestre disponível.");
    return;
  }

  const { an_exercicio: ano, nr_periodo: per } = periodo6;
  console.log(`  Referência: ${ano} / ${per}º bimestre`);

  // Municípios com pessoal identificável por instituição
  const cobertura = await pgQuery<{
    id_municipio: number;
    no_municipio: string | null;
    tem_prefeitura: boolean;
    tem_camara: boolean;
    linhas_pessoal: string;
  }>(`
    SELECT
      id_municipio,
      MAX(no_municipio) AS no_municipio,
      BOOL_OR(instituicao ILIKE '%Prefeitura%' OR instituicao ILIKE '%Executivo%')   AS tem_prefeitura,
      BOOL_OR(instituicao ILIKE '%Câmara%' OR instituicao ILIKE '%Camera%'
              OR instituicao ILIKE '%Legislativo%')                                  AS tem_camara,
      COUNT(*) AS linhas_pessoal
    FROM dw.fato_siconfi_rreo
    WHERE an_exercicio = $1 AND nr_periodo = $2
      AND no_anexo = 'RREO-Anexo 01'
      AND conta  ILIKE '%PESSOAL%ENCARGOS%'
      AND coluna ILIKE '%LIQUIDADAS%BIMESTRE%(h)%'
    GROUP BY id_municipio
    ORDER BY no_municipio
  `, [ano, per]);

  if (!cobertura.length) {
    console.log("  ⚠️  Nenhum registro de pessoal encontrado para o filtro padrão.");
    console.log("     Verifique se os filtros no_anexo / conta / coluna estão corretos.");
    return;
  }

  let comAmbos = 0, soPrefeitura = 0, soCamara = 0, semSeparacao = 0;
  for (const m of cobertura) {
    if (m.tem_prefeitura && m.tem_camara)   comAmbos++;
    else if (m.tem_prefeitura)              soPrefeitura++;
    else if (m.tem_camara)                  soCamara++;
    else                                    semSeparacao++;
  }

  console.log(`\n  Total de municípios com dados de pessoal : ${cobertura.length}`);
  console.log(`  Com Prefeitura E Câmara identificados    : ${comAmbos}`);
  console.log(`  Somente Prefeitura identificada          : ${soPrefeitura}`);
  console.log(`  Somente Câmara identificada              : ${soCamara}`);
  console.log(`  Sem separação por Poder possível         : ${semSeparacao}`);

  // Exemplos: até 5 municípios com valores separados
  const exemplos = await pgQuery<{
    id_municipio: number;
    no_municipio: string | null;
    instituicao: string | null;
    despesa_pessoal: string;
  }>(`
    SELECT
      id_municipio,
      MAX(no_municipio)  AS no_municipio,
      instituicao,
      SUM(valor)         AS despesa_pessoal
    FROM dw.fato_siconfi_rreo
    WHERE an_exercicio = $1 AND nr_periodo = $2
      AND no_anexo = 'RREO-Anexo 01'
      AND conta  ILIKE '%PESSOAL%ENCARGOS%'
      AND coluna ILIKE '%LIQUIDADAS%BIMESTRE%(h)%'
      AND instituicao IS NOT NULL
      AND id_municipio IN (
        SELECT id_municipio FROM dw.fato_siconfi_rreo
        WHERE an_exercicio = $1 AND nr_periodo = $2
          AND no_anexo = 'RREO-Anexo 01'
          AND conta  ILIKE '%PESSOAL%ENCARGOS%'
          AND coluna ILIKE '%LIQUIDADAS%BIMESTRE%(h)%'
        GROUP BY id_municipio
        HAVING COUNT(DISTINCT instituicao) > 1
        LIMIT 5
      )
    GROUP BY id_municipio, instituicao
    ORDER BY id_municipio, instituicao
  `, [ano, per]);

  if (exemplos.length) {
    console.log("\n  Exemplos de municípios com separação por instituição:");
    let lastMun = 0;
    for (const e of exemplos) {
      if (e.id_municipio !== lastMun) {
        console.log(`\n    ${e.no_municipio ?? e.id_municipio} (${e.id_municipio}):`);
        lastMun = e.id_municipio;
      }
      console.log(`      • ${(e.instituicao ?? "NULL").padEnd(50)} ${fmtMoeda(e.despesa_pessoal)}`);
    }
  } else {
    console.log("\n  ℹ️  Nenhum município com dois ou mais poderes identificados no pessoal.");
    console.log("     Pode indicar que apenas Prefeituras entregam RREO (Câmaras entregam RGF).");
  }
}

// ---------------------------------------------------------------------------
// D. Validação RCL: Anexo 03
// ---------------------------------------------------------------------------

async function secaoD() {
  sep("D. Validação — RCL Ajustada (Anexo 03)");

  const [periodo6] = await pgQuery<{ an_exercicio: number; nr_periodo: number }>(`
    SELECT an_exercicio, nr_periodo
    FROM dw.fato_siconfi_rreo
    WHERE nr_periodo = 6
    GROUP BY an_exercicio, nr_periodo
    ORDER BY an_exercicio DESC
    LIMIT 1
  `);

  if (!periodo6) {
    console.log("  ⚠️  Sem 6º bimestre disponível.");
    return;
  }

  const { an_exercicio: ano, nr_periodo: per } = periodo6;

  const rclRows = await pgQuery<{
    id_municipio: number;
    no_municipio: string | null;
    instituicao: string | null;
    cod_conta: string | null;
    rcl: string;
  }>(`
    SELECT
      id_municipio,
      MAX(no_municipio)  AS no_municipio,
      instituicao,
      cod_conta,
      SUM(valor)         AS rcl
    FROM dw.fato_siconfi_rreo
    WHERE an_exercicio = $1 AND nr_periodo = $2
      AND no_anexo = 'RREO-Anexo 03'
      AND conta  ILIKE '%RECEITA CORRENTE L%QUIDA AJUSTADA%IX%'
      AND coluna ILIKE '%TOTAL%12 MESES%'
    GROUP BY id_municipio, instituicao, cod_conta
    ORDER BY no_municipio
    LIMIT 30
  `, [ano, per]);

  if (!rclRows.length) {
    console.log("  ⚠️  Nenhum registro de RCL encontrado para o filtro padrão.");
    return;
  }

  console.log(`  Referência: ${ano} / ${per}º bimestre — ${rclRows.length} combinação(ões) encontrada(s)\n`);
  console.log(`  ${"Município".padEnd(25)} ${"Instituição".padEnd(40)} ${"cod_conta".padEnd(38)} ${"RCL Ajustada".padStart(18)}`);
  console.log("  " + "─".repeat(122));

  for (const r of rclRows) {
    const mun  = (r.no_municipio   ?? String(r.id_municipio)).slice(0, 24).padEnd(25);
    const inst = (r.instituicao    ?? "NULL").slice(0, 39).padEnd(40);
    const cod  = (r.cod_conta      ?? "NULL").slice(0, 37).padEnd(38);
    const val  = fmtMoeda(r.rcl).padStart(18);
    console.log(`  ${mun} ${inst} ${cod} ${val}`);
  }

  // Municípios com RCL identificada
  const [countRcl] = await pgQuery<{ qtd: string }>(`
    SELECT COUNT(DISTINCT id_municipio) AS qtd
    FROM dw.fato_siconfi_rreo
    WHERE an_exercicio = $1 AND nr_periodo = $2
      AND no_anexo = 'RREO-Anexo 03'
      AND conta  ILIKE '%RECEITA CORRENTE L%QUIDA AJUSTADA%IX%'
      AND coluna ILIKE '%TOTAL%12 MESES%'
  `, [ano, per]);

  console.log(`\n  Municípios com RCL identificada: ${fmt(countRcl?.qtd ?? 0)} de 22`);

  // Verifica se cod_conta ajuda
  const codDistintos = await pgQuery<{ cod_conta: string | null; qtd: string }>(`
    SELECT cod_conta, COUNT(DISTINCT id_municipio) AS qtd
    FROM dw.fato_siconfi_rreo
    WHERE an_exercicio = $1 AND nr_periodo = $2
      AND no_anexo = 'RREO-Anexo 03'
      AND conta ILIKE '%RECEITA CORRENTE L%QUIDA AJUSTADA%IX%'
      AND coluna ILIKE '%TOTAL%12 MESES%'
    GROUP BY cod_conta
    ORDER BY qtd DESC
  `, [ano, per]);

  if (codDistintos.length) {
    console.log("\n  cod_conta distintos para RCL:");
    for (const c of codDistintos) {
      console.log(`    • ${(c.cod_conta ?? "NULL").padEnd(45)} ${fmt(c.qtd)} município(s)`);
    }
  }
}

// ---------------------------------------------------------------------------
// E. Recomendação final
// ---------------------------------------------------------------------------

async function secaoE() {
  sep("E. Recomendação final");

  // Conta distintos padrões de instituicao com pessoal
  const instPessoal = await pgQuery<{ instituicao: string | null; qtd_mun: string }>(`
    SELECT instituicao, COUNT(DISTINCT id_municipio) AS qtd_mun
    FROM dw.fato_siconfi_rreo
    WHERE no_anexo = 'RREO-Anexo 01'
      AND conta  ILIKE '%PESSOAL%ENCARGOS%'
      AND coluna ILIKE '%LIQUIDADAS%BIMESTRE%(h)%'
      AND instituicao IS NOT NULL
      AND nr_periodo = 6
    GROUP BY instituicao
    ORDER BY qtd_mun DESC, instituicao
    LIMIT 20
  `);

  const prefPatterns   = instPessoal.filter(r => r.instituicao && (
    r.instituicao.toUpperCase().includes("PREFEITURA") ||
    r.instituicao.toUpperCase().includes("EXECUTIVO")
  ));
  const camaraPatterns = instPessoal.filter(r => r.instituicao && (
    r.instituicao.toUpperCase().includes("CÂMARA") ||
    r.instituicao.toUpperCase().includes("CAMARA") ||
    r.instituicao.toUpperCase().includes("LEGISLATIVO")
  ));

  const podeSeparar = prefPatterns.length > 0 || camaraPatterns.length > 0;

  console.log(`\n  Padrões de instituicao identificados nas contas de pessoal (Anexo 01, 6º bim.):`);

  if (instPessoal.length === 0) {
    console.log("  ⚠️  Nenhum dado com 'instituicao' preenchida nas contas de pessoal.");
    console.log("     Aplique a migração SQL e recarregue o RREO para habilitar a separação.");
  } else {
    for (const r of instPessoal) {
      console.log(`    • ${(r.instituicao ?? "NULL").padEnd(55)} ${fmt(r.qtd_mun)} município(s)`);
    }
  }

  console.log("\n  ┌─────────────────────────────────────────────────────────┐");
  if (!podeSeparar) {
    console.log("  │  RESULTADO: NÃO é seguro implementar alerta por Poder  │");
    console.log("  │  Razão: campo instituicao sem dados ou sem padrões      │");
    console.log("  │  suficientes para distinguir Executivo de Legislativo.  │");
  } else {
    console.log("  │  RESULTADO: É possível implementar alerta por Poder     │");
    if (camaraPatterns.length === 0) {
      console.log("  │  ATENÇÃO: Câmara/Legislativo não encontrado nas contas  │");
      console.log("  │  de pessoal do RREO — pode ser que Câmaras não entreguem│");
      console.log("  │  RREO (entregam apenas RGF). Alerta de Executivo seria  │");
      console.log("  │  o próximo passo seguro.                                │");
    }
  }
  console.log("  └─────────────────────────────────────────────────────────┘");

  if (prefPatterns.length > 0) {
    console.log("\n  Padrões recomendados para filtro Prefeitura/Executivo:");
    console.log("    • instituicao ILIKE '%Prefeitura%'");
    console.log("    • instituicao ILIKE '%Executivo%'");
  }
  if (camaraPatterns.length > 0) {
    console.log("\n  Padrões recomendados para filtro Câmara/Legislativo:");
    console.log("    • instituicao ILIKE '%Câmara%'");
    console.log("    • instituicao ILIKE '%Camera%'");
    console.log("    • instituicao ILIKE '%Legislativo%'");
  }

  // Listar cod_conta distintos em pessoal
  const codContaPessoal = await pgQuery<{ cod_conta: string | null; qtd: string }>(`
    SELECT cod_conta, COUNT(DISTINCT id_municipio) AS qtd
    FROM dw.fato_siconfi_rreo
    WHERE no_anexo = 'RREO-Anexo 01'
      AND conta  ILIKE '%PESSOAL%ENCARGOS%'
      AND coluna ILIKE '%LIQUIDADAS%BIMESTRE%(h)%'
      AND nr_periodo = 6
    GROUP BY cod_conta
    ORDER BY qtd DESC
    LIMIT 10
  `);

  if (codContaPessoal.some(r => r.cod_conta !== null)) {
    console.log("\n  cod_conta mais frequentes nas contas de pessoal:");
    for (const r of codContaPessoal) {
      console.log(`    • ${(r.cod_conta ?? "NULL").padEnd(50)} ${fmt(r.qtd)} município(s)`);
    }
    console.log("  → cod_conta pode ser usado como filtro alternativo ou complementar.");
  } else {
    console.log("\n  ℹ️  cod_conta ainda NULL nas contas de pessoal.");
    console.log("     Será preenchido na próxima carga incremental/full.");
  }

  console.log("\n  Limitações remanescentes:");
  console.log("    1. cod_conta não está backfillado para registros anteriores à migração 181.");
  console.log("    2. Se Câmaras não entregam RREO, o limite individual de 6% (Legislativo)");
  console.log("       não pode ser verificado apenas pelo RREO — necessita RGF.");
  console.log("    3. O alerta consolidado existente (60% / 54%) permanece válido e não");
  console.log("       deve ser alterado nesta etapa.");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  SICONFI RREO — Validação de instituicao e cod_conta       ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  await secaoA();
  await secaoB();
  await secaoC();
  await secaoD();
  await secaoE();

  console.log("\n" + "═".repeat(62));
  console.log("  Validação concluída.");
  console.log("═".repeat(62) + "\n");
}

main()
  .then(() => closePgPool())
  .catch((err) => {
    console.error("[validar-instituicao] Erro:", (err as Error).message);
    closePgPool().catch(() => void 0);
    process.exit(1);
  });
