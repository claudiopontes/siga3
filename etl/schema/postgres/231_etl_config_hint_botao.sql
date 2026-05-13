-- Adiciona coluna hint_botao em etl_execucao_config
-- Exibida como tooltip no botão de execução manual no painel

ALTER TABLE audit.etl_execucao_config
  ADD COLUMN IF NOT EXISTS hint_botao text;
