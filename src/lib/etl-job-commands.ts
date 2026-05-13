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
    args: ["--prefix", "etl", "run", "carga-siconfi-rreo:postgres"],
  },
  mis_bolsa_familia_bpc: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "mis-bolsa-familia-bpc"],
  },
};

export function hasEtlJobCommand(modulo: string): boolean {
  return Object.prototype.hasOwnProperty.call(ETL_JOB_COMMANDS, modulo);
}
