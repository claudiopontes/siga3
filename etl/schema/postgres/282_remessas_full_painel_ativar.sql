-- 282_remessas_full_painel_ativar.sql
-- Ativa remessas_full_postgres no painel /seguranca/etl para tornar visível a
-- dependência mart_remessas → remessas_full_postgres. Antes deste ajuste o
-- registro existia mas com ativo_painel=false (oculto), e o operador não
-- conseguia ver a cadeia.

UPDATE audit.etl_monitoramento_config
SET ativo_painel = true,
    atualizado_em = now()
WHERE modulo = 'remessas_full_postgres';
