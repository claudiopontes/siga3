const NPM_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";

export const ETL_JOB_COMMANDS: Record<string, { command: string; args: string[] }> = {
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
  // Botão de processos_ce dispara a cadeia inteira (cadastro + arquivos/movs).
  // processos_eprocess fica visível no painel mas sem botão próprio.
  processos_ce: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-processos:postgres"],
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
  // Refresh isolado (sem refetch das fontes). Os pais já encadeiam este script.
  mart_saude_consolidado: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "mart:saude-consolidado"],
  },
  // Macro: roda todos os 7 ETLs de saúde em sequência + refresh do Consolidado.
  // Executado pelo botão "Recarregar tudo (saúde)" e pelo cron semanal.
  saude_completa: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-saude:postgres"],
  },
  // Pai dispara cadeia completa (a função executarSiconfiRreoIncremental
  // já invoca executarMartSiconfiRreo no final).
  siconfi_rreo_incremental: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-siconfi-rreo:incremental"],
  },
  // Pai dispara cadeia completa (full + refresh do mart).
  siconfi_rgf_full: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-siconfi-rgf:postgres"],
  },
  // Pai dispara cadeia inteira (4 etapas: preparar → interno → cnpj → mart).
  credor_preparar: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "credor:enriquecimento"],
  },
  folha_sicap_base: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "folha:sicap:base"],
  },
  // Pai dispara cadeia completa (full → dimensões → mart).
  remessas_full_postgres: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-remessas:postgres"],
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
  inep_distorcao_municipios: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-inep-distorcao:postgres"],
  },
  mart_gasto_aluno: {
    command: NPM_COMMAND,
    args: ["--prefix", "etl", "run", "carga-gasto-aluno:postgres"],
  },
};

export function hasEtlJobCommand(modulo: string): boolean {
  return Object.prototype.hasOwnProperty.call(ETL_JOB_COMMANDS, modulo);
}
