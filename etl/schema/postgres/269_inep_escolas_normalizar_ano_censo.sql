-- 269_inep_escolas_normalizar_ano_censo.sql
-- Normaliza o campo ano_censo em public.dim_escola_inep para refletir
-- corretamente o ano do dado do Censo INEP.
--
-- Antes desta correção, o ingest da Base dos Dados marcava ano_censo=2024
-- como "ano da carga da BD", o que é semanticamente errado: a BD não traz
-- dados de matrícula/docente/infraestrutura — só geolocalização. O ano do
-- Censo deve ser o ano do microdado INEP processado (atualmente 2023).
--
-- Escolas que só vêm da Base dos Dados (sem dado Censo) passam a ter
-- ano_censo = NULL, sinalizando corretamente "sem fotografia do Censo".

UPDATE public.dim_escola_inep
SET ano_censo = NULL
WHERE ano_censo = 2024;
