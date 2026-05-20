-- 279_folha_sicap.sql
-- Fase 17B — Gasto de Pessoal / Folha SICAP
--
-- Camada analítica de folha de pagamento alimentada a partir do SQL Server SICAP.
-- Origem bruta: dbo.vw_folha_contracheque_base (~12M linhas)
--               dbo.vw_folha_verbas_detalhada (~63M linhas)
--
-- Esta migration cria apenas a base analítica (schema, dimensões, fatos, índices).
-- Alertas avançados (acúmulo de vínculos, rubricas sensíveis, risco por entidade,
-- crescimento anormal) ficarão para a Fase 17C.

CREATE SCHEMA IF NOT EXISTS folha;

-- ---------------------------------------------------------------------------
-- DIMENSÕES
-- ---------------------------------------------------------------------------

-- dim_tempo (competência mensal — granularidade ano/mês)
CREATE TABLE IF NOT EXISTS folha.dim_tempo (
  competencia        char(7)     PRIMARY KEY,        -- "YYYY-MM"
  ano                integer     NOT NULL,
  mes                smallint    NOT NULL,
  trimestre          smallint    NOT NULL,
  semestre           smallint    NOT NULL,
  primeiro_dia       date        NOT NULL,
  ultimo_dia         date        NOT NULL,
  etl_carregado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_folha_dim_tempo_ano_mes ON folha.dim_tempo (ano, mes);

-- dim_entidade
CREATE TABLE IF NOT EXISTS folha.dim_entidade (
  id_entidade_cjur                       integer      PRIMARY KEY,
  entidade_nome                          text,
  ente_nome                              text,
  entidade_poder                         text,
  entidade_classificacao_administrativa  text,
  entidade_envio_sicap                   text,
  id_ente                                bigint,
  ente_codigo                            text,
  ente_codigo_ibge                       text,
  origem_dado                            text         NOT NULL DEFAULT 'SICAP',
  etl_carregado_em                       timestamptz  NOT NULL DEFAULT now(),
  etl_atualizado_em                      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_folha_dim_ent_ibge ON folha.dim_entidade (ente_codigo_ibge);

-- dim_servidor (chave SICAP é idCadastroUnico)
CREATE TABLE IF NOT EXISTS folha.dim_servidor (
  id_cadastro_unico_sicap   bigint       PRIMARY KEY,
  cpf_hash                  char(64),                 -- SHA-256 hex do CPF
  cpf_mascarado             text,                     -- "***.123.456-**"
  nome_servidor             text,
  data_nascimento           date,
  sexo                      char(1),
  nit_pis_pasep             text,
  origem_dado               text         NOT NULL DEFAULT 'SICAP',
  etl_carregado_em          timestamptz  NOT NULL DEFAULT now(),
  etl_atualizado_em         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_folha_dim_servidor_cpf_hash ON folha.dim_servidor (cpf_hash);

-- dim_cargo
CREATE TABLE IF NOT EXISTS folha.dim_cargo (
  id_cargo_sicap                       bigint       PRIMARY KEY,
  cargo_codigo                         text,
  cargo_nome                           text,
  carga_horaria_mensal                 numeric(8,2),
  cargo_tipo                           text,
  cargo_tipo_acumulavel                text,
  cargo_classificado_sistema           text,
  cargo_subgrupo_classificacao_funcional text,
  origem_dado                          text         NOT NULL DEFAULT 'SICAP',
  etl_carregado_em                     timestamptz  NOT NULL DEFAULT now(),
  etl_atualizado_em                    timestamptz
);

-- dim_lotacao
CREATE TABLE IF NOT EXISTS folha.dim_lotacao (
  id_unidade_lotacao_sicap       bigint       PRIMARY KEY,
  unidade_lotacao_codigo         text,
  unidade_lotacao_nome           text,
  id_municipio_lotacao           bigint,
  municipio_lotacao_nome         text,
  municipio_lotacao_codigo_ibge  text,
  uf_lotacao_sigla               char(2),
  origem_dado                    text         NOT NULL DEFAULT 'SICAP',
  etl_carregado_em               timestamptz  NOT NULL DEFAULT now(),
  etl_atualizado_em              timestamptz
);

CREATE INDEX IF NOT EXISTS idx_folha_dim_lot_municipio ON folha.dim_lotacao (municipio_lotacao_codigo_ibge);

-- dim_tipo_folha
CREATE TABLE IF NOT EXISTS folha.dim_tipo_folha (
  id_tipo_folha_sicap   bigint       PRIMARY KEY,
  tipo_folha_codigo     text,
  tipo_folha_descricao  text,
  origem_dado           text         NOT NULL DEFAULT 'SICAP',
  etl_carregado_em      timestamptz  NOT NULL DEFAULT now(),
  etl_atualizado_em     timestamptz
);

-- dim_verba
CREATE TABLE IF NOT EXISTS folha.dim_verba (
  id_verba_sicap                  bigint       PRIMARY KEY,
  verba_codigo                    text,
  verba_descricao                 text,
  verba_natureza                  text,
  verba_tipo_referencia           text,
  verba_categoria_economica       text,
  verba_grupo_natureza_despesa    text,
  verba_modalidade_aplicacao      text,
  verba_elemento_despesa          text,
  verba_compoe_vencimento_padrao  boolean,
  verba_base_fgts                 boolean,
  verba_base_irpf                 boolean,
  verba_base_previdencia          boolean,
  verba_subgrupo_classificacao    text,
  origem_dado                     text         NOT NULL DEFAULT 'SICAP',
  etl_carregado_em                timestamptz  NOT NULL DEFAULT now(),
  etl_atualizado_em               timestamptz
);

CREATE INDEX IF NOT EXISTS idx_folha_dim_verba_codigo   ON folha.dim_verba (verba_codigo);
CREATE INDEX IF NOT EXISTS idx_folha_dim_verba_natureza ON folha.dim_verba (verba_natureza);

-- dim_remessa
CREATE TABLE IF NOT EXISTS folha.dim_remessa (
  id_remessa_sicap         bigint       PRIMARY KEY,
  ano                      integer,
  mes                      smallint,
  competencia              char(7),
  id_entidade_cjur         integer,
  data_envio               timestamp,
  data_confirmacao         timestamp,
  prazo_envio              timestamp,
  situacao                 text,
  sem_movimento            boolean,
  situacao_tempestividade  text,
  tempo_atraso             integer,
  origem_dado              text         NOT NULL DEFAULT 'SICAP',
  etl_carregado_em         timestamptz  NOT NULL DEFAULT now(),
  etl_atualizado_em        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_folha_dim_remessa_comp ON folha.dim_remessa (competencia);
CREATE INDEX IF NOT EXISTS idx_folha_dim_remessa_ent  ON folha.dim_remessa (id_entidade_cjur);

-- ---------------------------------------------------------------------------
-- FATOS
-- ---------------------------------------------------------------------------

-- fato_contracheque (~12M linhas — 1 linha por contracheque)
CREATE TABLE IF NOT EXISTS folha.fato_contracheque (
  id_contracheque_sicap            bigint       PRIMARY KEY,
  competencia                      char(7)      NOT NULL,
  ano                              integer      NOT NULL,
  mes                              smallint     NOT NULL,
  id_entidade_cjur                 integer,
  id_cadastro_unico_sicap          bigint,
  id_beneficiario_sicap            bigint,
  cpf_hash                         char(64),
  cpf_mascarado                    text,
  matricula                        text,
  id_cargo_sicap                   bigint,
  id_tipo_folha_sicap              bigint,
  id_unidade_lotacao_sicap         bigint,
  id_remessa_sicap                 bigint,
  total_vencimentos                numeric(18,2),
  total_descontos                  numeric(18,2),
  total_liquido                    numeric(18,2),
  base_fgts                        numeric(18,2),
  base_irpf                        numeric(18,2),
  base_previdenciaria_patronal     numeric(18,2),
  base_previdenciaria_segurado     numeric(18,2),
  situacao_beneficiario            text,
  situacao_atual_servidor          text,
  -- Flags de qualidade
  alerta_vencimento_negativo       boolean      NOT NULL DEFAULT false,
  alerta_desconto_negativo         boolean      NOT NULL DEFAULT false,
  alerta_desconto_maior_vencimento boolean      NOT NULL DEFAULT false,
  alerta_sem_desconto              boolean      NOT NULL DEFAULT false,
  alerta_cpf_invalido              boolean      NOT NULL DEFAULT false,
  alerta_cargo_ausente             boolean      NOT NULL DEFAULT false,
  alerta_lotacao_ausente           boolean      NOT NULL DEFAULT false,
  -- Metadados
  data_carga                       timestamptz  NOT NULL DEFAULT now(),
  origem_dado                      text         NOT NULL DEFAULT 'SICAP'
);

CREATE INDEX IF NOT EXISTS idx_folha_fc_competencia  ON folha.fato_contracheque (competencia);
CREATE INDEX IF NOT EXISTS idx_folha_fc_ano_mes      ON folha.fato_contracheque (ano, mes);
CREATE INDEX IF NOT EXISTS idx_folha_fc_entidade     ON folha.fato_contracheque (id_entidade_cjur);
CREATE INDEX IF NOT EXISTS idx_folha_fc_cadastro     ON folha.fato_contracheque (id_cadastro_unico_sicap);
CREATE INDEX IF NOT EXISTS idx_folha_fc_beneficiario ON folha.fato_contracheque (id_beneficiario_sicap);
CREATE INDEX IF NOT EXISTS idx_folha_fc_cpf_hash     ON folha.fato_contracheque (cpf_hash);
CREATE INDEX IF NOT EXISTS idx_folha_fc_remessa      ON folha.fato_contracheque (id_remessa_sicap);
CREATE INDEX IF NOT EXISTS idx_folha_fc_tipo_folha   ON folha.fato_contracheque (id_tipo_folha_sicap);
CREATE INDEX IF NOT EXISTS idx_folha_fc_cargo        ON folha.fato_contracheque (id_cargo_sicap);

-- fato_verba_contracheque (~63M linhas — 1 linha por rubrica/verba)
CREATE TABLE IF NOT EXISTS folha.fato_verba_contracheque (
  id_verba_contracheque_sicap          bigint       PRIMARY KEY,
  id_contracheque_sicap                bigint       NOT NULL,
  competencia                          char(7)      NOT NULL,
  ano                                  integer      NOT NULL,
  mes                                  smallint     NOT NULL,
  id_entidade_cjur                     integer,
  id_cadastro_unico_sicap              bigint,
  id_beneficiario_sicap                bigint,
  cpf_hash                             char(64),
  matricula                            text,
  id_verba_sicap                       bigint,
  verba_codigo                         text,
  verba_descricao                      text,
  verba_natureza                       text,
  verba_tipo_referencia                text,
  verba_categoria_economica            text,
  verba_grupo_natureza_despesa         text,
  verba_modalidade_aplicacao           text,
  verba_elemento_despesa               text,
  verba_compoe_vencimento_padrao       boolean,
  verba_base_fgts                      boolean,
  verba_base_irpf                      boolean,
  verba_base_previdencia               boolean,
  verba_subgrupo_classificacao         text,
  verba_referencia                     numeric(18,4),
  verba_valor                          numeric(18,2),
  id_tipo_folha_sicap                  bigint,
  id_remessa_sicap                     bigint,
  -- Flags de qualidade
  alerta_verba_valor_negativo                 boolean NOT NULL DEFAULT false,
  alerta_verba_sem_codigo                     boolean NOT NULL DEFAULT false,
  alerta_verba_sem_descricao                  boolean NOT NULL DEFAULT false,
  alerta_verba_sem_subgrupo_classificacao     boolean NOT NULL DEFAULT false,
  alerta_verba_sem_natureza                   boolean NOT NULL DEFAULT false,
  -- Metadados
  data_carga                           timestamptz  NOT NULL DEFAULT now(),
  origem_dado                          text         NOT NULL DEFAULT 'SICAP'
);

CREATE INDEX IF NOT EXISTS idx_folha_fvc_competencia  ON folha.fato_verba_contracheque (competencia);
CREATE INDEX IF NOT EXISTS idx_folha_fvc_ano_mes      ON folha.fato_verba_contracheque (ano, mes);
CREATE INDEX IF NOT EXISTS idx_folha_fvc_contracheque ON folha.fato_verba_contracheque (id_contracheque_sicap);
CREATE INDEX IF NOT EXISTS idx_folha_fvc_entidade     ON folha.fato_verba_contracheque (id_entidade_cjur);
CREATE INDEX IF NOT EXISTS idx_folha_fvc_cadastro     ON folha.fato_verba_contracheque (id_cadastro_unico_sicap);
CREATE INDEX IF NOT EXISTS idx_folha_fvc_beneficiario ON folha.fato_verba_contracheque (id_beneficiario_sicap);
CREATE INDEX IF NOT EXISTS idx_folha_fvc_cpf_hash     ON folha.fato_verba_contracheque (cpf_hash);
CREATE INDEX IF NOT EXISTS idx_folha_fvc_verba        ON folha.fato_verba_contracheque (id_verba_sicap);
CREATE INDEX IF NOT EXISTS idx_folha_fvc_verba_codigo ON folha.fato_verba_contracheque (verba_codigo);
CREATE INDEX IF NOT EXISTS idx_folha_fvc_remessa      ON folha.fato_verba_contracheque (id_remessa_sicap);
CREATE INDEX IF NOT EXISTS idx_folha_fvc_tipo_folha   ON folha.fato_verba_contracheque (id_tipo_folha_sicap);
