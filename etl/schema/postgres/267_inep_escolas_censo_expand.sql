-- 267_inep_escolas_censo_expand.sql
-- Fase 17D + Censo (D+C) — Adiciona colunas de matrículas, docentes e
-- indicadores de infraestrutura na dim_escola_inep, alimentados pelo
-- microdado do Censo Escolar.
--
-- Permite:
--   - KPIs do painel municipal: total de matrículas e docentes do AC.
--   - Drill-down do modal de escola: ficha com matrículas por etapa,
--     número de docentes e grade de chips de infraestrutura (água, luz,
--     internet, biblioteca, quadra, laboratório, alimentação, etc.).

-- Matrículas
ALTER TABLE public.dim_escola_inep
  ADD COLUMN IF NOT EXISTS qt_mat_bas       integer NULL,  -- ed. básica total
  ADD COLUMN IF NOT EXISTS qt_mat_inf       integer NULL,  -- ed. infantil
  ADD COLUMN IF NOT EXISTS qt_mat_fund      integer NULL,  -- fundamental
  ADD COLUMN IF NOT EXISTS qt_mat_med       integer NULL,  -- médio
  ADD COLUMN IF NOT EXISTS qt_mat_prof      integer NULL,  -- ed. profissional
  ADD COLUMN IF NOT EXISTS qt_mat_eja       integer NULL,  -- EJA
  ADD COLUMN IF NOT EXISTS qt_mat_esp       integer NULL;  -- ed. especial

-- Docentes (na escola)
ALTER TABLE public.dim_escola_inep
  ADD COLUMN IF NOT EXISTS qt_doc_bas       integer NULL,  -- docentes ed. básica
  ADD COLUMN IF NOT EXISTS qt_doc_inf       integer NULL,
  ADD COLUMN IF NOT EXISTS qt_doc_fund      integer NULL,
  ADD COLUMN IF NOT EXISTS qt_doc_med       integer NULL,
  ADD COLUMN IF NOT EXISTS qt_doc_prof      integer NULL;

-- Infraestrutura — flags booleanas (true/false/null). Os 10 mais relevantes
-- para o gabinete TCE-AC (auditoria de condições básicas).
ALTER TABLE public.dim_escola_inep
  ADD COLUMN IF NOT EXISTS infra_agua_potavel         boolean NULL,
  ADD COLUMN IF NOT EXISTS infra_energia_eletrica     boolean NULL,
  ADD COLUMN IF NOT EXISTS infra_esgoto               boolean NULL,
  ADD COLUMN IF NOT EXISTS infra_lixo_coletado        boolean NULL,
  ADD COLUMN IF NOT EXISTS infra_internet             boolean NULL,
  ADD COLUMN IF NOT EXISTS infra_internet_alunos      boolean NULL,
  ADD COLUMN IF NOT EXISTS infra_biblioteca           boolean NULL,
  ADD COLUMN IF NOT EXISTS infra_lab_informatica      boolean NULL,
  ADD COLUMN IF NOT EXISTS infra_lab_ciencias         boolean NULL,
  ADD COLUMN IF NOT EXISTS infra_quadra_esportes      boolean NULL,
  ADD COLUMN IF NOT EXISTS infra_alimentacao          boolean NULL,
  ADD COLUMN IF NOT EXISTS infra_acessibilidade       boolean NULL;

-- Índice agregado para KPIs (soma estado)
CREATE INDEX IF NOT EXISTS idx_dim_escola_inep_mat_bas
  ON public.dim_escola_inep (sg_uf, qt_mat_bas)
  WHERE qt_mat_bas IS NOT NULL;
