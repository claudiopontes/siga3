-- 268_inep_escolas_normalizar_situacao.sql
-- Padroniza valores da coluna `situacao` em public.dim_escola_inep para
-- evitar duplicatas no filtro do painel.
--
-- A Base dos Dados grava "ESCOLA PARALISADA" / "ESCOLA EXTINTA" em CAIXA ALTA,
-- enquanto o microdado do INEP usa "Paralisada" / "Extinta" / "Em atividade".
-- Esta migration consolida os dois conjuntos no formato INEP.

UPDATE public.dim_escola_inep
SET situacao = 'Paralisada'
WHERE situacao ILIKE '%paralisada%' AND situacao <> 'Paralisada';

UPDATE public.dim_escola_inep
SET situacao = 'Extinta'
WHERE situacao ILIKE '%extinta%' AND situacao <> 'Extinta';

UPDATE public.dim_escola_inep
SET situacao = 'Em atividade'
WHERE situacao ILIKE '%funcionamento%' AND situacao <> 'Em atividade';
