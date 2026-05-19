/**
 * _diagnostico-censo-escolas.ts
 *
 * Diagnóstico ad-hoc: quantas escolas do AC têm cada tipo de dado do Censo.
 * Somente leitura. Roda contra o Postgres local.
 *
 * Uso: cd etl && npx ts-node jobs/_diagnostico-censo-escolas.ts
 */

import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

const UF = (process.env.INEP_UF || "AC").toUpperCase();

async function main() {
  console.log(`\n══════════════════ Diagnóstico Censo Escolar — UF=${UF} ══════════════════`);

  // 1) Total geral
  const [tot] = await pgQuery<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM public.dim_escola_inep WHERE sg_uf = $1`, [UF],
  );
  const total = parseInt(tot?.n ?? "0", 10);
  console.log(`\nTotal de escolas no DW : ${total}`);

  // 2) Cobertura por campo
  const campos = [
    { col: "qt_mat_bas",            rotulo: "Matrículas (educação básica)" },
    { col: "qt_mat_inf",            rotulo: "  → Educação Infantil" },
    { col: "qt_mat_fund",           rotulo: "  → Ensino Fundamental" },
    { col: "qt_mat_med",            rotulo: "  → Ensino Médio" },
    { col: "qt_mat_prof",           rotulo: "  → Ed. Profissional" },
    { col: "qt_mat_eja",            rotulo: "  → EJA" },
    { col: "qt_mat_esp",            rotulo: "  → Ed. Especial" },
    { col: "qt_doc_bas",            rotulo: "Docentes (educação básica)" },
    { col: "latitude",              rotulo: "Latitude" },
    { col: "longitude",             rotulo: "Longitude" },
    { col: "infra_agua_potavel",    rotulo: "Água potável (informado)" },
    { col: "infra_energia_eletrica",rotulo: "Energia elétrica (informado)" },
    { col: "infra_esgoto",          rotulo: "Esgoto (informado)" },
    { col: "infra_lixo_coletado",   rotulo: "Coleta de lixo (informado)" },
    { col: "infra_internet",        rotulo: "Internet (informado)" },
    { col: "infra_internet_alunos", rotulo: "Internet p/ alunos (informado)" },
    { col: "infra_biblioteca",      rotulo: "Biblioteca (informado)" },
    { col: "infra_lab_informatica", rotulo: "Lab. informática (informado)" },
    { col: "infra_lab_ciencias",    rotulo: "Lab. ciências (informado)" },
    { col: "infra_quadra_esportes", rotulo: "Quadra esportes (informado)" },
    { col: "infra_alimentacao",     rotulo: "Alimentação (informado)" },
    { col: "infra_acessibilidade",  rotulo: "Acessibilidade (informado)" },
  ];

  console.log("\n── Cobertura por campo ──");
  for (const c of campos) {
    const [r] = await pgQuery<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM public.dim_escola_inep
       WHERE sg_uf = $1 AND ${c.col} IS NOT NULL`,
      [UF],
    );
    const n = parseInt(r?.n ?? "0", 10);
    const pct = total > 0 ? ((n / total) * 100).toFixed(1).padStart(5) : "—";
    console.log(`  ${c.rotulo.padEnd(40)} ${String(n).padStart(5)} / ${total}  (${pct}%)`);
  }

  // 3) Combinações úteis
  console.log("\n── Combinações ──");
  const combinacoes = [
    {
      rotulo: "Com Censo (qualquer matrícula OU docente OU infra)",
      sql: `qt_mat_bas IS NOT NULL OR qt_doc_bas IS NOT NULL
            OR infra_agua_potavel IS NOT NULL OR infra_energia_eletrica IS NOT NULL`,
    },
    {
      rotulo: "Com IDEB (alguma etapa)",
      sql: `EXISTS (SELECT 1 FROM dw.fato_inep_ideb_escola f
                    WHERE f.cod_escola = public.dim_escola_inep.cod_escola)`,
    },
    {
      rotulo: "Com Censo E com IDEB",
      sql: `(qt_mat_bas IS NOT NULL OR infra_agua_potavel IS NOT NULL)
            AND EXISTS (SELECT 1 FROM dw.fato_inep_ideb_escola f
                         WHERE f.cod_escola = public.dim_escola_inep.cod_escola)`,
    },
    {
      rotulo: "Sem Censo E sem IDEB",
      sql: `(qt_mat_bas IS NULL AND infra_agua_potavel IS NULL)
            AND NOT EXISTS (SELECT 1 FROM dw.fato_inep_ideb_escola f
                             WHERE f.cod_escola = public.dim_escola_inep.cod_escola)`,
    },
    {
      rotulo: "Com geo (lat/lng não nulos)",
      sql: `latitude IS NOT NULL AND longitude IS NOT NULL`,
    },
  ];

  for (const c of combinacoes) {
    const [r] = await pgQuery<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM public.dim_escola_inep
       WHERE sg_uf = $1 AND (${c.sql})`,
      [UF],
    );
    const n = parseInt(r?.n ?? "0", 10);
    const pct = total > 0 ? ((n / total) * 100).toFixed(1).padStart(5) : "—";
    console.log(`  ${c.rotulo.padEnd(60)} ${String(n).padStart(5)} / ${total}  (${pct}%)`);
  }

  // 4) Distribuição por situação
  console.log("\n── Distribuição por situação ──");
  const sit = await pgQuery<{ situacao: string | null; n: string; com_censo: string }>(
    `SELECT
       situacao,
       COUNT(*)::text AS n,
       COUNT(*) FILTER (
         WHERE qt_mat_bas IS NOT NULL OR infra_agua_potavel IS NOT NULL OR qt_doc_bas IS NOT NULL
       )::text AS com_censo
     FROM public.dim_escola_inep
     WHERE sg_uf = $1
     GROUP BY situacao
     ORDER BY 2 DESC`,
    [UF],
  );
  for (const s of sit) {
    const n = parseInt(s.n, 10);
    const cc = parseInt(s.com_censo, 10);
    console.log(`  ${(s.situacao ?? "(sem situação)").padEnd(40)} total=${String(n).padStart(5)}  com_censo=${String(cc).padStart(5)}`);
  }

  // 5) Distribuição por dependência
  console.log("\n── Distribuição por dependência ──");
  const dep = await pgQuery<{ dependencia: string | null; n: string; com_censo: string }>(
    `SELECT
       dependencia,
       COUNT(*)::text AS n,
       COUNT(*) FILTER (
         WHERE qt_mat_bas IS NOT NULL OR infra_agua_potavel IS NOT NULL OR qt_doc_bas IS NOT NULL
       )::text AS com_censo
     FROM public.dim_escola_inep
     WHERE sg_uf = $1
     GROUP BY dependencia
     ORDER BY 2 DESC`,
    [UF],
  );
  for (const d of dep) {
    const n = parseInt(d.n, 10);
    const cc = parseInt(d.com_censo, 10);
    console.log(`  ${(d.dependencia ?? "(sem dependência)").padEnd(40)} total=${String(n).padStart(5)}  com_censo=${String(cc).padStart(5)}`);
  }

  console.log("\n══════════════════════════════════════════════════════════════════════\n");
}

main()
  .then(() => closePgPool())
  .catch((err) => {
    console.error("[diagnostico-censo]", (err as Error).message);
    closePgPool().catch(() => void 0);
    process.exit(1);
  });
