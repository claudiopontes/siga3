const NPM_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";

export const ETL_JOB_COMMANDS: Record<string, { command: string; args: string[] }> = {
  remessas_full_postgres: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "remessas:full:postgres"],
  },
};

export function hasEtlJobCommand(modulo: string): boolean {
  return Object.prototype.hasOwnProperty.call(ETL_JOB_COMMANDS, modulo);
}
