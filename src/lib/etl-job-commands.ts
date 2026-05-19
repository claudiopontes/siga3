const NPM_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";

export const ETL_JOB_COMMANDS: Record<string, { command: string; args: string[] }> = {
  mart_remessas: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-remessas:postgres"],
  },
  despesa_full_postgres: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-despesa:incremental"],
  },
  processos_gabinete: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "processos-gabinete"],
  },
  pauta_julgamento: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "pauta-julgamento"],
  },
  processos_eprocess: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "processos-eprocess"],
  },
  receita_publica: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "receita-publica"],
  },
  combustivel: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "combustivel"],
  },
  combustivel_empenho_apc: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "apc-polanco-sync-supabase"],
  },
  cauc: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "cauc"],
  },
  mart_infodengue: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-infodengue:postgres"],
  },
  mart_siops: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-siops:postgres"],
  },
  mart_sisagua: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-sisagua:postgres"],
  },
  mart_saude_estrutura: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-cnes-ubs:postgres"],
  },
  mart_siconfi_rreo: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-siconfi-rreo:incremental"],
  },
  mis_bolsa_familia_bpc: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "mis-bolsa-familia-bpc"],
  },
  inep_ideb_municipios: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-inep-ideb:postgres"],
  },
  inep_rendimento_municipios: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-inep-rendimento:postgres"],
  },
  mart_painel_educacao: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "mart:painel-educacao"],
  },
  inep_ideb_escolas: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-inep-ideb-escolas:postgres"],
  },
  inep_censo_geo: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-inep-censo-geo:postgres"],
  },
  inep_base_dos_dados_geo: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-inep-base-dos-dados-geo:postgres"],
  },
};

export function hasEtlJobCommand(modulo: string): boolean {
  return Object.prototype.hasOwnProperty.call(ETL_JOB_COMMANDS, modulo);
}
