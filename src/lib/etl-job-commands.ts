const NPM_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";

export const ETL_JOB_COMMANDS: Record<string, { command: string; args: string[] }> = {
  remessas_full_postgres: {
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
};

export function hasEtlJobCommand(modulo: string): boolean {
  return Object.prototype.hasOwnProperty.call(ETL_JOB_COMMANDS, modulo);
}
