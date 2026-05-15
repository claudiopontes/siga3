import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

async function main() {
  await pgQuery(`
    UPDATE audit.etl_execucao_config
    SET observacao_regra_negocio = 'Carga incremental de arquivos e movimentações de todos os processos CE. Deve ser executado após processos-ce (que popula public.processo). Processa em lotes de 1.000 processos para evitar queries IN() gigantes no SQL Server.'
    WHERE modulo = 'processos_eprocess'
  `);
  await pgQuery(`
    UPDATE audit.etl_monitoramento_config
    SET descricao = 'Carga incremental de arquivos e movimentações dos processos CE. Executado após processos-ce.'
    WHERE modulo = 'processos_eprocess'
  `);

  // Garante que processos_ce exista nas tabelas de configuração
  await pgQuery(`
    INSERT INTO audit.etl_monitoramento_config (modulo, nome_exibicao, periodicidade, tolerancia_dias, ativo_painel, ordem_exibicao, descricao)
    VALUES ('processos_ce', 'Processos CE (cadastro)', 'diaria', 1, true, 4, 'Sincroniza todos os processos de Controle Externo de public.processo a partir do EPROCESS.')
    ON CONFLICT (modulo) DO UPDATE SET
      nome_exibicao   = EXCLUDED.nome_exibicao,
      periodicidade   = EXCLUDED.periodicidade,
      tolerancia_dias = EXCLUDED.tolerancia_dias,
      descricao       = EXCLUDED.descricao
  `);

  console.log("Configurações de monitoramento atualizadas.");
}

main().catch(console.error).finally(() => closePgPool());
