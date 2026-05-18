-- 181_siconfi_rreo_enriquecer_dw.sql
-- Enriquecimento de dw.fato_siconfi_rreo com os campos instituicao e cod_conta.
--
-- Contexto:
--   Os campos 'instituicao' e 'cod_conta' existem no payload real da API SICONFI
--   mas não foram mapeados nas versões anteriores da carga.
--   Adicionalmente, o campo 'no_municipio' estava sendo preenchido com o nome da
--   instituição (ex: "Prefeitura Municipal de Rio Branco - AC") em vez do nome
--   canônico do município (ex: "Rio Branco").
--
-- Esta migração:
--   1. Adiciona as colunas instituicao e cod_conta (sem remover dados existentes).
--   2. Faz backfill de instituicao a partir do valor atual de no_municipio
--      (que já contém o nome da instituição para os 811k registros existentes).
--   3. Corrige no_municipio para o nome canônico do município usando id_municipio.
--   4. Cria índices úteis para as novas colunas.
--
-- Aplicar com: psql -f 181_siconfi_rreo_enriquecer_dw.sql
-- Idempotente: usa IF NOT EXISTS e condições WHERE para re-execução segura.

-- -------------------------------------------------------
-- Passo 1: Adicionar colunas
-- -------------------------------------------------------

ALTER TABLE dw.fato_siconfi_rreo
  ADD COLUMN IF NOT EXISTS instituicao text NULL,
  ADD COLUMN IF NOT EXISTS cod_conta   text NULL;

-- -------------------------------------------------------
-- Passo 2: Backfill — mover nome da instituição de
--   no_municipio → instituicao para registros existentes.
--   Somente afeta linhas onde instituicao ainda é NULL
--   e no_municipio não é o nome canônico do município.
-- -------------------------------------------------------

UPDATE dw.fato_siconfi_rreo
SET instituicao = no_municipio
WHERE instituicao IS NULL
  AND no_municipio IS NOT NULL
  AND no_municipio NOT IN (
    'Acrelândia', 'Assis Brasil', 'Brasiléia', 'Bujari', 'Capixaba',
    'Cruzeiro do Sul', 'Epitaciolândia', 'Feijó', 'Jordão', 'Mâncio Lima',
    'Manoel Urbano', 'Marechal Thaumaturgo', 'Plácido de Castro', 'Porto Walter',
    'Rio Branco', 'Rodrigues Alves', 'Santa Rosa do Purus', 'Senador Guiomard',
    'Sena Madureira', 'Tarauacá', 'Xapuri', 'Porto Acre'
  );

-- -------------------------------------------------------
-- Passo 3: Corrigir no_municipio → nome canônico do município
--   Aplica apenas onde id_municipio é um município do Acre
--   e no_municipio não é o nome canônico (ainda contém nome de instituição).
-- -------------------------------------------------------

UPDATE dw.fato_siconfi_rreo
SET no_municipio = CASE id_municipio
  WHEN 1200013 THEN 'Acrelândia'
  WHEN 1200054 THEN 'Assis Brasil'
  WHEN 1200104 THEN 'Brasiléia'
  WHEN 1200138 THEN 'Bujari'
  WHEN 1200179 THEN 'Capixaba'
  WHEN 1200203 THEN 'Cruzeiro do Sul'
  WHEN 1200252 THEN 'Epitaciolândia'
  WHEN 1200302 THEN 'Feijó'
  WHEN 1200328 THEN 'Jordão'
  WHEN 1200336 THEN 'Mâncio Lima'
  WHEN 1200344 THEN 'Manoel Urbano'
  WHEN 1200351 THEN 'Marechal Thaumaturgo'
  WHEN 1200385 THEN 'Plácido de Castro'
  WHEN 1200393 THEN 'Porto Walter'
  WHEN 1200401 THEN 'Rio Branco'
  WHEN 1200427 THEN 'Rodrigues Alves'
  WHEN 1200435 THEN 'Santa Rosa do Purus'
  WHEN 1200450 THEN 'Senador Guiomard'
  WHEN 1200500 THEN 'Sena Madureira'
  WHEN 1200609 THEN 'Tarauacá'
  WHEN 1200708 THEN 'Xapuri'
  WHEN 1200807 THEN 'Porto Acre'
  ELSE no_municipio
END
WHERE id_municipio IN (
  1200013, 1200054, 1200104, 1200138, 1200179, 1200203, 1200252, 1200302,
  1200328, 1200336, 1200344, 1200351, 1200385, 1200393, 1200401, 1200427,
  1200435, 1200450, 1200500, 1200609, 1200708, 1200807
)
AND no_municipio NOT IN (
  'Acrelândia', 'Assis Brasil', 'Brasiléia', 'Bujari', 'Capixaba',
  'Cruzeiro do Sul', 'Epitaciolândia', 'Feijó', 'Jordão', 'Mâncio Lima',
  'Manoel Urbano', 'Marechal Thaumaturgo', 'Plácido de Castro', 'Porto Walter',
  'Rio Branco', 'Rodrigues Alves', 'Santa Rosa do Purus', 'Senador Guiomard',
  'Sena Madureira', 'Tarauacá', 'Xapuri', 'Porto Acre'
);

-- Nota: cod_conta permanece NULL para registros existentes.
-- Será preenchido automaticamente na próxima carga incremental ou full.

-- -------------------------------------------------------
-- Passo 4: Índices para as novas colunas
-- -------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_fato_siconfi_rreo_instituicao
  ON dw.fato_siconfi_rreo (instituicao);

CREATE INDEX IF NOT EXISTS idx_fato_siconfi_rreo_cod_conta
  ON dw.fato_siconfi_rreo (cod_conta);

-- Índice composto para as queries de validação pessoal por Poder (uso futuro)
CREATE INDEX IF NOT EXISTS idx_fato_siconfi_rreo_pessoal_validacao
  ON dw.fato_siconfi_rreo (an_exercicio, nr_periodo, no_anexo, id_municipio);
