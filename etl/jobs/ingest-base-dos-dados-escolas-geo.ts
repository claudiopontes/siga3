/**
 * ingest-base-dos-dados-escolas-geo.ts
 *
 * Fase 17D — Geolocalização das escolas usando o arquivo da Base dos Dados
 * (https://basedosdados.org/), que mantém as coordenadas que o INEP removeu
 * do microdado a partir de 2023.
 *
 * Arquivo esperado:
 *   etl/data/inep/censo/br_bd_diretorios_brasil_escola.csv.gz
 *
 * Estrutura (separador vírgula, aspas para campos com vírgula):
 *   id_escola, nome, id_municipio, sigla_uf, restricao_atendimento,
 *   localizacao, localidade_diferenciada, categoria_administrativa,
 *   endereco, telefone, dependencia_administrativa, categoria_privada,
 *   conveniada_poder_publico, regulacao_conselho_educacao, porte,
 *   etapas_modalidades_oferecidas, outras_ofertas_educacionais,
 *   latitude, longitude
 *
 * Faz UPSERT em public.dim_escola_inep usando COALESCE: preserva campos
 * já populados pelo microdado INEP, mas atualiza latitude/longitude
 * (que viriam null do microdado 2022/2023 unificado).
 *
 * Variáveis de ambiente:
 *   INEP_CENSO_DIR — diretório que contém o .csv.gz (padrão: ./data/inep/censo)
 *   INEP_UF        — filtro de UF (padrão: AC; "ALL" para tudo)
 *
 * Uso: cd etl && npx ts-node jobs/ingest-base-dos-dados-escolas-geo.ts
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import * as readline from "readline";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

const CENSO_DIR = process.env.INEP_CENSO_DIR || path.resolve(__dirname, "../data/inep/censo");
const UF_FILTRO = (process.env.INEP_UF || "AC").toUpperCase();
const FILTRAR_UF = UF_FILTRO !== "ALL";

const ARQUIVO_NOME = "br_bd_diretorios_brasil_escola.csv.gz";

// ---------------------------------------------------------------------------
// CSV parser com suporte a aspas (Base dos Dados usa "campo, com vírgula")
// ---------------------------------------------------------------------------

function parseCsvLine(line: string, sep = ","): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === sep) { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function num(v: string | undefined): number | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  if (!t || t === "NA" || t === "N/A") return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function txt(v: string | undefined): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/**
 * Normaliza o campo `restricao_atendimento` da Base dos Dados para os mesmos
 * rótulos usados pelo INEP (microdado), garantindo que o filtro "Situação"
 * do painel não duplique categorias.
 */
function normalizarSituacao(v: string | null): string | null {
  if (!v) return null;
  const t = v.toUpperCase();
  if (t.includes("PARALISADA"))   return "Paralisada";
  if (t.includes("EXTINTA"))       return "Extinta";
  if (t.includes("FUNCIONAMENTO")) return "Em atividade";
  return v.trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface Resultado {
  linhas_lidas: number;
  escolas_filtradas: number;
  escolas_persistidas: number;
  com_geo: number;
  erro: string | null;
}

async function processar(arquivoPath: string): Promise<Resultado> {
  const r: Resultado = {
    linhas_lidas: 0, escolas_filtradas: 0, escolas_persistidas: 0, com_geo: 0, erro: null,
  };

  const gunzip = zlib.createGunzip();
  const stream = fs.createReadStream(arquivoPath).pipe(gunzip);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let header: string[] | null = null;
  const idxCol = new Map<string, number>();
  const buffer: Array<Record<string, unknown>> = [];
  const BATCH = 500;

  const flush = async () => {
    if (!buffer.length) return;
    await withPgTransaction(async (client) => {
      for (const row of buffer) {
        await client.query(`
          INSERT INTO public.dim_escola_inep
            (cod_escola, no_escola, cod_municipio, no_municipio, sg_uf,
             dependencia, localizacao, porte, etapas_atendidas, situacao,
             latitude, longitude, endereco, ano_censo, payload, atualizado_em)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
          ON CONFLICT (cod_escola) DO UPDATE SET
            no_escola         = COALESCE(public.dim_escola_inep.no_escola, EXCLUDED.no_escola),
            cod_municipio     = COALESCE(public.dim_escola_inep.cod_municipio, EXCLUDED.cod_municipio),
            sg_uf             = COALESCE(public.dim_escola_inep.sg_uf, EXCLUDED.sg_uf),
            dependencia       = COALESCE(public.dim_escola_inep.dependencia, EXCLUDED.dependencia),
            localizacao       = COALESCE(public.dim_escola_inep.localizacao, EXCLUDED.localizacao),
            porte             = COALESCE(public.dim_escola_inep.porte, EXCLUDED.porte),
            etapas_atendidas  = COALESCE(public.dim_escola_inep.etapas_atendidas, EXCLUDED.etapas_atendidas),
            situacao          = COALESCE(public.dim_escola_inep.situacao, EXCLUDED.situacao),
            -- Geo SEMPRE sobrescreve quando o novo valor é não-null
            latitude          = COALESCE(EXCLUDED.latitude, public.dim_escola_inep.latitude),
            longitude         = COALESCE(EXCLUDED.longitude, public.dim_escola_inep.longitude),
            endereco          = COALESCE(public.dim_escola_inep.endereco, EXCLUDED.endereco),
            payload           = public.dim_escola_inep.payload || EXCLUDED.payload,
            atualizado_em     = now()
        `, [
          row.cod_escola, row.no_escola, row.cod_municipio, row.no_municipio, row.sg_uf,
          row.dependencia, row.localizacao, row.porte, row.etapas_atendidas, row.situacao,
          row.latitude, row.longitude, row.endereco, row.ano_censo, row.payload,
        ]);
      }
    });
    buffer.length = 0;
  };

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;

      if (!header) {
        header = parseCsvLine(line, ",").map((h) => h.trim().toLowerCase());
        header.forEach((h, i) => idxCol.set(h, i));
        continue;
      }

      r.linhas_lidas++;

      const cols = parseCsvLine(line, ",");
      const sigla_uf = txt(cols[idxCol.get("sigla_uf") ?? -1])?.toUpperCase() ?? null;
      if (FILTRAR_UF && sigla_uf !== UF_FILTRO) continue;

      const idEscolaStr = txt(cols[idxCol.get("id_escola") ?? -1]);
      const cod_escola = idEscolaStr ? parseInt(idEscolaStr, 10) : null;
      if (!cod_escola || !Number.isFinite(cod_escola)) continue;

      r.escolas_filtradas++;

      const latitude  = num(cols[idxCol.get("latitude")  ?? -1]);
      const longitude = num(cols[idxCol.get("longitude") ?? -1]);
      if (latitude !== null && longitude !== null) r.com_geo++;

      const idMunStr = txt(cols[idxCol.get("id_municipio") ?? -1]);
      const cod_municipio = idMunStr ? parseInt(idMunStr, 10) : null;

      const payload: Record<string, string | null> = {
        fonte_geo: "base-dos-dados",
        bd_id_escola: idEscolaStr,
        bd_endereco: txt(cols[idxCol.get("endereco") ?? -1]),
      };

      buffer.push({
        cod_escola,
        no_escola:        txt(cols[idxCol.get("nome") ?? -1]),
        cod_municipio:    Number.isFinite(cod_municipio) ? cod_municipio : null,
        no_municipio:     null, // não vem no arquivo BD
        sg_uf:            sigla_uf,
        dependencia:      txt(cols[idxCol.get("dependencia_administrativa") ?? -1]),
        localizacao:      txt(cols[idxCol.get("localizacao") ?? -1]),
        porte:            txt(cols[idxCol.get("porte") ?? -1]),
        etapas_atendidas: txt(cols[idxCol.get("etapas_modalidades_oferecidas") ?? -1]),
        situacao:         normalizarSituacao(txt(cols[idxCol.get("restricao_atendimento") ?? -1])),
        latitude,
        longitude,
        endereco:         txt(cols[idxCol.get("endereco") ?? -1]),
        // ano_censo NÃO é setado pela BD — esse campo deve refletir o ano do
        // microdado INEP (fonte autoritativa de matrículas/docentes/infra).
        // Escolas que só vêm da BD ficam com ano_censo NULL, o que é coerente:
        // não há dado de Censo para elas.
        ano_censo:        null,
        payload:          JSON.stringify(payload),
      });

      if (buffer.length >= BATCH) {
        await flush();
        r.escolas_persistidas = r.escolas_filtradas;
      }
    }
    await flush();
    r.escolas_persistidas = r.escolas_filtradas;
  } catch (err) {
    r.erro = (err as Error).message;
  }

  return r;
}

async function main() {
  const inicio = Date.now();
  console.log("[base-dos-dados-geo] Enriquecimento de coordenadas via Base dos Dados");
  console.log(`  Diretório : ${CENSO_DIR}`);
  console.log(`  Filtro UF : ${FILTRAR_UF ? UF_FILTRO : "(sem filtro)"}\n`);

  const arquivoPath = path.join(CENSO_DIR, ARQUIVO_NOME);
  if (!fs.existsSync(arquivoPath)) {
    console.error(`[base-dos-dados-geo] Arquivo não encontrado: ${arquivoPath}`);
    console.error(`  Esperado: ${ARQUIVO_NOME}`);
    console.error(`  Origem: Base dos Dados (https://basedosdados.org/).`);
    await registrarAuditoria("ERRO", `Arquivo ${ARQUIVO_NOME} ausente em ${CENSO_DIR}`, 0, Date.now() - inicio);
    process.exit(1);
  }

  console.log(`  Processando ${ARQUIVO_NOME}…`);
  const r = await processar(arquivoPath);

  console.log("\n══════ Resumo ══════");
  console.log(`  Linhas lidas        : ${r.linhas_lidas}`);
  console.log(`  Escolas ${UF_FILTRO.padEnd(3)}        : ${r.escolas_filtradas}`);
  console.log(`  Com lat/lng         : ${r.com_geo}`);
  console.log(`  Persistidas/atualizadas em dim : ${r.escolas_persistidas}`);
  if (r.erro) console.log(`  ✗ ERRO: ${r.erro}`);

  const [comGeoFinal] = await pgQuery<{ n: string }>(`
    SELECT COUNT(*)::text AS n FROM public.dim_escola_inep
    WHERE sg_uf = '${UF_FILTRO}' AND latitude IS NOT NULL AND longitude IS NOT NULL
  `);
  const [totalDim] = await pgQuery<{ n: string }>(`
    SELECT COUNT(*)::text AS n FROM public.dim_escola_inep WHERE sg_uf = '${UF_FILTRO}'
  `);
  console.log(`\n  Resultado consolidado em dim_escola_inep:`);
  console.log(`     ${totalDim?.n ?? 0} escolas no DW`);
  console.log(`     ${comGeoFinal?.n ?? 0} com lat/lng (visíveis no mapa)`);

  const status = r.erro ? "ERRO" : r.com_geo > 0 ? "OK" : "PARCIAL";
  await registrarAuditoria(
    status,
    `${r.escolas_persistidas} escolas processadas · ${r.com_geo} com geo (UF=${UF_FILTRO})`,
    r.com_geo,
    Date.now() - inicio,
  );
}

async function registrarAuditoria(status: string, mensagem: string, registros: number, duracaoMs: number) {
  try {
    await pgQuery(
      `INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
       VALUES ('inep_base_dos_dados_geo', $1, $2, $3, $4)`,
      [status, mensagem, registros, duracaoMs],
    );
  } catch { /* audit.etl_log pode não existir — silencioso */ }
}

if (require.main === module) {
  main()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[base-dos-dados-geo] Erro fatal:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
