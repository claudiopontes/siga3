/* ============================================================
   APC - Classificacao de Despesas com Combustivel (Polanco)
   Estrategia medio/longo prazo:
   - Tabela final fisica
   - Staging
   - Controle de carga
   - Procedure unica com modo FULL ou INCREMENTAL (janela deslizante)
   Fonte: dbo.vw_despesa_polanco_base
   ============================================================ */

USE APC;
GO

/* 1) Tabela final */
IF OBJECT_ID('dbo.tb_despesa_combustivel_polanco', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tb_despesa_combustivel_polanco
    (
        ID_DESPESA               BIGINT           NOT NULL,
        ID_ENTIDADE              INT              NULL,
        ENTIDADE                 NVARCHAR(300)    NULL,
        ANO_EMPENHO              INT              NULL,
        DATA_EMPENHO             DATE             NULL,
        NUMERO_EMPENHO           NVARCHAR(50)     NULL,
        HISTORICO_EMPENHO        NVARCHAR(MAX)    NULL,
        CREDOR                   NVARCHAR(300)    NULL,
        NOME_CREDOR              NVARCHAR(300)    NULL,
        NUMERO_ELEMENTO_DESPESA  NVARCHAR(50)     NULL,
        ELEMENTO_DESPESA         NVARCHAR(300)    NULL,
        NUMERO_FUNCAO            NVARCHAR(50)     NULL,
        FUNCAO                   NVARCHAR(300)    NULL,
        NUMERO_SUBFUNCAO         NVARCHAR(50)     NULL,
        SUBFUNCAO                NVARCHAR(300)    NULL,
        VALOR_EMPENHO            DECIMAL(18,2)    NULL,
        VALOR_LIQUIDADO          DECIMAL(18,2)    NULL,
        EH_COMBUSTIVEL           BIT              NOT NULL CONSTRAINT DF_tb_despesa_comb_polanco_eh_comb DEFAULT (1),
        TIPO_COMBUSTIVEL         NVARCHAR(80)     NOT NULL,
        FORMA_FORNECIMENTO       NVARCHAR(40)     NOT NULL,
        REGRA_MATCH              NVARCHAR(200)    NOT NULL,
        DT_CARGA_ETL             DATETIME2(0)     NOT NULL
    );
END;
GO

/* 2) Staging para carga incremental/full */
IF OBJECT_ID('dbo.tb_despesa_combustivel_polanco_stg', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tb_despesa_combustivel_polanco_stg
    (
        ID_DESPESA               BIGINT           NOT NULL,
        ID_ENTIDADE              INT              NULL,
        ENTIDADE                 NVARCHAR(300)    NULL,
        ANO_EMPENHO              INT              NULL,
        DATA_EMPENHO             DATE             NULL,
        NUMERO_EMPENHO           NVARCHAR(50)     NULL,
        HISTORICO_EMPENHO        NVARCHAR(MAX)    NULL,
        CREDOR                   NVARCHAR(300)    NULL,
        NOME_CREDOR              NVARCHAR(300)    NULL,
        NUMERO_ELEMENTO_DESPESA  NVARCHAR(50)     NULL,
        ELEMENTO_DESPESA         NVARCHAR(300)    NULL,
        NUMERO_FUNCAO            NVARCHAR(50)     NULL,
        FUNCAO                   NVARCHAR(300)    NULL,
        NUMERO_SUBFUNCAO         NVARCHAR(50)     NULL,
        SUBFUNCAO                NVARCHAR(300)    NULL,
        VALOR_EMPENHO            DECIMAL(18,2)    NULL,
        VALOR_LIQUIDADO          DECIMAL(18,2)    NULL,
        EH_COMBUSTIVEL           BIT              NOT NULL,
        TIPO_COMBUSTIVEL         NVARCHAR(80)     NOT NULL,
        FORMA_FORNECIMENTO       NVARCHAR(40)     NOT NULL,
        REGRA_MATCH              NVARCHAR(200)    NOT NULL,
        DT_CARGA_ETL             DATETIME2(0)     NOT NULL
    );
END;
GO

/* 3) Controle operacional do ETL */
IF OBJECT_ID('dbo.tb_controle_carga_despesa_combustivel_polanco', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tb_controle_carga_despesa_combustivel_polanco
    (
        id_controle                      INT             IDENTITY(1,1) PRIMARY KEY,
        dt_execucao_ini                  DATETIME2(0)    NOT NULL,
        dt_execucao_fim                  DATETIME2(0)    NULL,
        modo_carga                       VARCHAR(20)     NOT NULL, -- FULL | INCREMENTAL
        dias_reprocessamento             INT             NOT NULL,
        data_corte_janela                DATE            NULL,
        qtd_staging                      INT             NULL,
        qtd_afetadas_final               INT             NULL,
        status_execucao                  VARCHAR(20)     NOT NULL, -- SUCESSO | ERRO
        mensagem                         NVARCHAR(4000)  NULL,
        max_data_empenho_processada      DATE            NULL
    );
END;
GO

/* 4) Procedure principal de carga */
CREATE OR ALTER PROCEDURE dbo.sp_carga_tb_despesa_combustivel_polanco
    @modo_carga           VARCHAR(20) = 'INCREMENTAL', -- FULL | INCREMENTAL
    @dias_reprocessamento INT = 90
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE
        @dt_ini            DATETIME2(0) = SYSUTCDATETIME(),
        @dt_fim            DATETIME2(0),
        @data_corte        DATE,
        @qtd_stg           INT = 0,
        @qtd_final         INT = 0,
        @msg               NVARCHAR(4000);

    SET @modo_carga = UPPER(LTRIM(RTRIM(ISNULL(@modo_carga, 'INCREMENTAL'))));
    IF @modo_carga NOT IN ('FULL', 'INCREMENTAL')
    BEGIN
        THROW 50001, 'Parametro @modo_carga invalido. Use FULL ou INCREMENTAL.', 1;
    END;

    IF @dias_reprocessamento IS NULL OR @dias_reprocessamento < 1
    BEGIN
        SET @dias_reprocessamento = 90;
    END;

    SET @data_corte = DATEADD(DAY, -@dias_reprocessamento, CAST(@dt_ini AS DATE));

    BEGIN TRY
        TRUNCATE TABLE dbo.tb_despesa_combustivel_polanco_stg;

        ;WITH src AS
        (
            SELECT
                ID_DESPESA,
                ID_ENTIDADE,
                ENTIDADE,
                ANO_EMPENHO,
                DATA_EMPENHO,
                NUMERO_EMPENHO,
                HISTORICO_EMPENHO,
                CREDOR,
                NOME_CREDOR,
                NUMERO_ELEMENTO_DESPESA,
                ELEMENTO_DESPESA,
                NUMERO_FUNCAO,
                FUNCAO,
                NUMERO_SUBFUNCAO,
                SUBFUNCAO,
                VALOR_EMPENHO,
                VALOR_LIQUIDADO
            FROM dbo.vw_despesa_polanco_base
            WHERE
                @modo_carga = 'FULL'
                OR DATA_EMPENHO >= @data_corte
                OR DATA_EMPENHO IS NULL
        ),
        norm AS
        (
            SELECT
                s.*,
                UPPER(ISNULL(s.HISTORICO_EMPENHO, '')) COLLATE Latin1_General_CI_AI AS TXT_HIST,
                UPPER(CONCAT(ISNULL(s.CREDOR, ''), ' ', ISNULL(s.NOME_CREDOR, ''))) COLLATE Latin1_General_CI_AI AS TXT_CREDOR,
                UPPER(CONCAT(ISNULL(s.HISTORICO_EMPENHO, ''), ' ', ISNULL(s.CREDOR, ''), ' ', ISNULL(s.NOME_CREDOR, ''))) COLLATE Latin1_General_CI_AI AS TXT_ALL
            FROM src s
        ),
        flags AS
        (
            SELECT
                n.*,
                CASE WHEN
                     CHARINDEX('COMBUST',  n.TXT_HIST) > 0 OR
                     CHARINDEX('GASOLIN',  n.TXT_HIST) > 0 OR
                     CHARINDEX('ETANOL',   n.TXT_HIST) > 0 OR
                     CHARINDEX('ALCOOL',   n.TXT_HIST) > 0 OR
                     CHARINDEX('ABASTEC',  n.TXT_HIST) > 0 OR
                     CHARINDEX('DIESEL',   n.TXT_HIST) > 0
                THEN 1 ELSE 0 END AS FL_INC_HIST_GERAL,

                CASE WHEN
                     CHARINDEX('FORNECIMENTO DE COMBUST', n.TXT_HIST) > 0 OR
                     CHARINDEX('FORNECIMENTO DE GASOLIN', n.TXT_HIST) > 0 OR
                     CHARINDEX('FORNECIMENTO DE ETANOL',  n.TXT_HIST) > 0 OR
                     CHARINDEX('FORNECIMENTO DE DIESEL',  n.TXT_HIST) > 0
                THEN 1 ELSE 0 END AS FL_INC_HIST_FORNECIMENTO,

                CASE WHEN
                     CHARINDEX('LINK CARD', n.TXT_CREDOR) > 0 OR
                     CHARINDEX('TICKET LOG', n.TXT_CREDOR) > 0 OR
                     CHARINDEX('VALECARD', n.TXT_CREDOR) > 0 OR
                     CHARINDEX('MAXIFROTA', n.TXT_CREDOR) > 0 OR
                     CHARINDEX(' PRIME ', CONCAT(' ', n.TXT_CREDOR, ' ')) > 0
                THEN 1 ELSE 0 END AS FL_INC_INTERMEDIADOR,

                CASE WHEN
                     CHARINDEX('OFICINA', n.TXT_ALL) > 0 OR
                     CHARINDEX('MECANIC', n.TXT_ALL) > 0 OR
                     CHARINDEX('PECA', n.TXT_ALL) > 0 OR
                     CHARINDEX('MANUTEN', n.TXT_ALL) > 0 OR
                     CHARINDEX('REPARO', n.TXT_ALL) > 0 OR
                     CHARINDEX('CONSERTO', n.TXT_ALL) > 0 OR
                     CHARINDEX('PNEU', n.TXT_ALL) > 0 OR
                     CHARINDEX('LAVAGEM', n.TXT_ALL) > 0 OR
                     CHARINDEX('TROCA DE OLEO', n.TXT_ALL) > 0 OR
                     CHARINDEX('AUTOMECANICA', n.TXT_ALL) > 0 OR
                     CHARINDEX('AUTO MECANICA', n.TXT_ALL) > 0
                THEN 1 ELSE 0 END AS FL_EXC_SERVICO,

                CASE WHEN
                     CHARINDEX('GLP', n.TXT_ALL) > 0 OR
                     CHARINDEX('GAS DE COZINHA', n.TXT_ALL) > 0 OR
                     CHARINDEX('BOTIJAO', n.TXT_ALL) > 0 OR
                     CHARINDEX('GAS LIQUEFEITO', n.TXT_ALL) > 0
                THEN 1 ELSE 0 END AS FL_EXC_GLP
            FROM norm n
        )
        INSERT INTO dbo.tb_despesa_combustivel_polanco_stg
        (
            ID_DESPESA, ID_ENTIDADE, ENTIDADE, ANO_EMPENHO, DATA_EMPENHO, NUMERO_EMPENHO,
            HISTORICO_EMPENHO, CREDOR, NOME_CREDOR, NUMERO_ELEMENTO_DESPESA, ELEMENTO_DESPESA,
            NUMERO_FUNCAO, FUNCAO, NUMERO_SUBFUNCAO, SUBFUNCAO, VALOR_EMPENHO, VALOR_LIQUIDADO,
            EH_COMBUSTIVEL, TIPO_COMBUSTIVEL, FORMA_FORNECIMENTO, REGRA_MATCH, DT_CARGA_ETL
        )
        SELECT
            f.ID_DESPESA,
            f.ID_ENTIDADE,
            f.ENTIDADE,
            f.ANO_EMPENHO,
            f.DATA_EMPENHO,
            f.NUMERO_EMPENHO,
            f.HISTORICO_EMPENHO,
            f.CREDOR,
            f.NOME_CREDOR,
            f.NUMERO_ELEMENTO_DESPESA,
            f.ELEMENTO_DESPESA,
            f.NUMERO_FUNCAO,
            f.FUNCAO,
            f.NUMERO_SUBFUNCAO,
            f.SUBFUNCAO,
            f.VALOR_EMPENHO,
            f.VALOR_LIQUIDADO,
            CAST(1 AS BIT) AS EH_COMBUSTIVEL,

            CASE
                WHEN CHARINDEX('ARLA', f.TXT_HIST) > 0 THEN 'ARLA'
                WHEN CHARINDEX('DIESEL S10', f.TXT_HIST) > 0 THEN 'DIESEL S10'
                WHEN CHARINDEX('DIESEL S500', f.TXT_HIST) > 0 THEN 'DIESEL S500'
                WHEN CHARINDEX('DIESEL', f.TXT_HIST) > 0 THEN 'DIESEL'
                WHEN CHARINDEX('GASOLINA ADITIV', f.TXT_HIST) > 0 THEN 'GASOLINA ADITIVADA'
                WHEN CHARINDEX('GASOLINA COMUM', f.TXT_HIST) > 0 THEN 'GASOLINA COMUM'
                WHEN CHARINDEX('GASOLIN', f.TXT_HIST) > 0 THEN 'GASOLINA'
                WHEN CHARINDEX('ETANOL', f.TXT_HIST) > 0 OR CHARINDEX('ALCOOL', f.TXT_HIST) > 0 THEN 'ETANOL'
                WHEN f.FL_INC_INTERMEDIADOR = 1 THEN 'CARTAO COMBUSTIVEL'
                ELSE 'COMBUSTIVEL - NAO ESPECIFICADO'
            END AS TIPO_COMBUSTIVEL,

            CASE WHEN f.FL_INC_INTERMEDIADOR = 1 THEN 'CARTAO / INTERMEDIACAO' ELSE 'COMPRA DIRETA' END AS FORMA_FORNECIMENTO,

            CASE
                WHEN f.FL_INC_INTERMEDIADOR = 1 AND CHARINDEX('LINK CARD', f.TXT_CREDOR) > 0 THEN 'CREDOR_INTERMEDIADOR: LINK CARD'
                WHEN f.FL_INC_INTERMEDIADOR = 1 AND CHARINDEX('TICKET LOG', f.TXT_CREDOR) > 0 THEN 'CREDOR_INTERMEDIADOR: TICKET LOG'
                WHEN f.FL_INC_INTERMEDIADOR = 1 AND CHARINDEX('VALECARD', f.TXT_CREDOR) > 0 THEN 'CREDOR_INTERMEDIADOR: VALECARD'
                WHEN f.FL_INC_INTERMEDIADOR = 1 AND CHARINDEX('MAXIFROTA', f.TXT_CREDOR) > 0 THEN 'CREDOR_INTERMEDIADOR: MAXIFROTA'
                WHEN f.FL_INC_INTERMEDIADOR = 1 AND CHARINDEX(' PRIME ', CONCAT(' ', f.TXT_CREDOR, ' ')) > 0 THEN 'CREDOR_INTERMEDIADOR: PRIME'
                WHEN CHARINDEX('FORNECIMENTO DE COMBUST', f.TXT_HIST) > 0 THEN 'HIST_FORNECIMENTO: COMBUST'
                WHEN CHARINDEX('FORNECIMENTO DE GASOLIN', f.TXT_HIST) > 0 THEN 'HIST_FORNECIMENTO: GASOLINA'
                WHEN CHARINDEX('FORNECIMENTO DE ETANOL', f.TXT_HIST) > 0 THEN 'HIST_FORNECIMENTO: ETANOL'
                WHEN CHARINDEX('FORNECIMENTO DE DIESEL', f.TXT_HIST) > 0 THEN 'HIST_FORNECIMENTO: DIESEL'
                WHEN CHARINDEX('COMBUST', f.TXT_HIST) > 0 THEN 'HIST_GERAL: COMBUST'
                WHEN CHARINDEX('GASOLIN', f.TXT_HIST) > 0 THEN 'HIST_GERAL: GASOLINA'
                WHEN CHARINDEX('ETANOL', f.TXT_HIST) > 0 THEN 'HIST_GERAL: ETANOL'
                WHEN CHARINDEX('ALCOOL', f.TXT_HIST) > 0 THEN 'HIST_GERAL: ALCOOL'
                WHEN CHARINDEX('ABASTEC', f.TXT_HIST) > 0 THEN 'HIST_GERAL: ABASTEC'
                WHEN CHARINDEX('DIESEL', f.TXT_HIST) > 0 THEN 'HIST_GERAL: DIESEL'
                ELSE 'REGRA_NAO_IDENTIFICADA'
            END AS REGRA_MATCH,

            @dt_ini AS DT_CARGA_ETL
        FROM flags f
        WHERE
            (f.FL_INC_HIST_GERAL = 1 OR f.FL_INC_HIST_FORNECIMENTO = 1 OR f.FL_INC_INTERMEDIADOR = 1)
            AND f.FL_EXC_SERVICO = 0
            AND f.FL_EXC_GLP = 0;

        SELECT @qtd_stg = COUNT(1) FROM dbo.tb_despesa_combustivel_polanco_stg;

        BEGIN TRAN;

        IF @modo_carga = 'FULL'
        BEGIN
            TRUNCATE TABLE dbo.tb_despesa_combustivel_polanco;

            INSERT INTO dbo.tb_despesa_combustivel_polanco
            SELECT *
            FROM dbo.tb_despesa_combustivel_polanco_stg;
        END
        ELSE
        BEGIN
            DELETE t
            FROM dbo.tb_despesa_combustivel_polanco t
            WHERE t.DATA_EMPENHO >= @data_corte
               OR t.DATA_EMPENHO IS NULL;

            INSERT INTO dbo.tb_despesa_combustivel_polanco
            SELECT *
            FROM dbo.tb_despesa_combustivel_polanco_stg;
        END;

        SET @qtd_final = @@ROWCOUNT;

        COMMIT;

        SET @dt_fim = SYSUTCDATETIME();

        INSERT INTO dbo.tb_controle_carga_despesa_combustivel_polanco
        (
            dt_execucao_ini, dt_execucao_fim, modo_carga, dias_reprocessamento,
            data_corte_janela, qtd_staging, qtd_afetadas_final, status_execucao, mensagem,
            max_data_empenho_processada
        )
        SELECT
            @dt_ini,
            @dt_fim,
            @modo_carga,
            @dias_reprocessamento,
            CASE WHEN @modo_carga = 'FULL' THEN NULL ELSE @data_corte END,
            @qtd_stg,
            @qtd_final,
            'SUCESSO',
            NULL,
            MAX(DATA_EMPENHO)
        FROM dbo.tb_despesa_combustivel_polanco_stg;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK;

        SET @dt_fim = SYSUTCDATETIME();
        SET @msg = CONCAT('Erro ', ERROR_NUMBER(), ': ', ERROR_MESSAGE());

        INSERT INTO dbo.tb_controle_carga_despesa_combustivel_polanco
        (
            dt_execucao_ini, dt_execucao_fim, modo_carga, dias_reprocessamento,
            data_corte_janela, qtd_staging, qtd_afetadas_final, status_execucao, mensagem,
            max_data_empenho_processada
        )
        VALUES
        (
            @dt_ini,
            @dt_fim,
            @modo_carga,
            @dias_reprocessamento,
            CASE WHEN @modo_carga = 'FULL' THEN NULL ELSE @data_corte END,
            @qtd_stg,
            @qtd_final,
            'ERRO',
            @msg,
            NULL
        );

        THROW;
    END CATCH;
END;
GO

/* 5) Indices recomendados (foco leitura + consistencia incremental) */
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.tb_despesa_combustivel_polanco')
      AND name = 'CX_tb_despesa_combustivel_polanco_data_entidade'
)
BEGIN
    CREATE CLUSTERED INDEX CX_tb_despesa_combustivel_polanco_data_entidade
    ON dbo.tb_despesa_combustivel_polanco (DATA_EMPENHO, ID_ENTIDADE, ID_DESPESA);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.tb_despesa_combustivel_polanco')
      AND name = 'UX_tb_despesa_combustivel_polanco_id_despesa'
)
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX UX_tb_despesa_combustivel_polanco_id_despesa
    ON dbo.tb_despesa_combustivel_polanco (ID_DESPESA);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.tb_despesa_combustivel_polanco')
      AND name = 'IX_tb_despesa_combustivel_polanco_entidade_data'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_tb_despesa_combustivel_polanco_entidade_data
    ON dbo.tb_despesa_combustivel_polanco (ID_ENTIDADE, DATA_EMPENHO)
    INCLUDE (TIPO_COMBUSTIVEL, NOME_CREDOR, VALOR_EMPENHO, VALOR_LIQUIDADO, REGRA_MATCH);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.tb_despesa_combustivel_polanco')
      AND name = 'IX_tb_despesa_combustivel_polanco_tipo_data'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_tb_despesa_combustivel_polanco_tipo_data
    ON dbo.tb_despesa_combustivel_polanco (TIPO_COMBUSTIVEL, DATA_EMPENHO)
    INCLUDE (ID_ENTIDADE, NOME_CREDOR, VALOR_EMPENHO, VALOR_LIQUIDADO);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.tb_despesa_combustivel_polanco')
      AND name = 'IX_tb_despesa_combustivel_polanco_credor_data'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_tb_despesa_combustivel_polanco_credor_data
    ON dbo.tb_despesa_combustivel_polanco (NOME_CREDOR, DATA_EMPENHO)
    INCLUDE (ID_ENTIDADE, TIPO_COMBUSTIVEL, VALOR_EMPENHO, VALOR_LIQUIDADO);
END;
GO

/* 6) Execucoes recomendadas
-- Carga diaria (janela deslizante de 90 dias):
-- EXEC dbo.sp_carga_tb_despesa_combustivel_polanco @modo_carga = 'INCREMENTAL', @dias_reprocessamento = 90;

-- Backfill completo (uso eventual):
-- EXEC dbo.sp_carga_tb_despesa_combustivel_polanco @modo_carga = 'FULL', @dias_reprocessamento = 90;

-- Auditoria das ultimas cargas:
-- SELECT TOP 20 * FROM dbo.tb_controle_carga_despesa_combustivel_polanco ORDER BY id_controle DESC;
*/
