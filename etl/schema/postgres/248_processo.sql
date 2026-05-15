-- 248_processo.sql
-- Tabela central de processos de Controle Externo (CE).
-- Fonte: EPROCESS.processo.vwProc_Eletronico WHERE Id_Tipo_Proc = 2
-- Substitui a dependência de pauta_julgamento_item como fonte de processos.

CREATE TABLE IF NOT EXISTS public.processo (
  processo_id          integer      PRIMARY KEY,   -- ID_PROC_INSTAN
  numero_fmt           text         NULL,           -- Num_proc_ano (ex: TC-001/2024)
  ano                  integer      NULL,           -- Ano_Processo
  objeto               text         NULL,           -- DS_OBJE
  nome_classe          text         NULL,           -- assunto + classe
  assunto              text         NULL,           -- NM_ASSUN
  cod_classe           integer      NULL,           -- ID_CLASS
  nome_orgao           text         NULL,           -- NM_UNDD_GEST
  nome_relator         text         NULL,           -- RELATOR (tipo_partc = 5)
  nome_1_parte         text         NULL,           -- primeira parte (tipo 17 ou 15)
  partes               text         NULL,           -- todas as partes concatenadas
  nm_status            integer      NULL,           -- 0=Ativo 1=Arquivado 2=Aguard.Desarq 3=Apensado
  situacao             text         NULL,           -- Situacao_Funcional (label)
  processos_apensados  text         NULL,           -- IDs apensados concatenados
  tipo_processo        text         NULL,           -- Nm_Tipo_Proc
  dt_criacao           timestamptz  NULL,           -- DT_CRIAC
  coletado_em          timestamptz  NOT NULL DEFAULT now(),
  atualizado_em        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processo_numero_fmt  ON public.processo (numero_fmt);
CREATE INDEX IF NOT EXISTS idx_processo_ano         ON public.processo (ano);
CREATE INDEX IF NOT EXISTS idx_processo_nm_status   ON public.processo (nm_status);
CREATE INDEX IF NOT EXISTS idx_processo_nome_relator ON public.processo (nome_relator);
