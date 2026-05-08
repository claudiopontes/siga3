# PostgreSQL Local — Varadouro Digital ETL

## Objetivo

Este documento descreve como configurar e usar o PostgreSQL local como destino do ETL do Varadouro Digital, em substituição ou complemento ao Supabase.

---

## Como subir o banco local

Requisito: Docker instalado e em execução.

```bash
cd infra/postgres
docker compose -f docker-compose.postgres.yml up -d
```

O banco ficará disponível em `localhost:5432` com as credenciais padrão:
- Usuário: `varadouro`
- Senha: `varadouro_dev`
- Banco: `varadouro_digital`

Para parar:
```bash
docker compose -f docker-compose.postgres.yml down
```

Para remover também os dados (volume):
```bash
docker compose -f docker-compose.postgres.yml down -v
```

---

## Configurar o ETL

Copie o arquivo de exemplo e ajuste conforme necessário:

```bash
cp etl/.env.example etl/.env
```

Para usar o PostgreSQL local (padrão), mantenha `ETL_TARGET=postgres` e configure as variáveis `PG*` ou `DATABASE_URL`.

---

## Aplicar os schemas (migrations)

Com o banco local rodando, execute:

```bash
cd etl
npm run postgres:migrate
```

Isso aplica em ordem os arquivos SQL em `etl/schema/postgres/`:
1. `000_init_varadouro.sql` — schemas base e tabelas de auditoria
2. `010_public_compat.sql` — tabelas compatíveis com o modelo Supabase
3. `020_mart_despesa.sql` — tabelas mart para o Painel de Despesa

---

## Testar a conexão

```bash
cd etl
npm run postgres:check
```

O script verifica:
- Versão do PostgreSQL
- Existência dos schemas: raw, stage, dw, mart, audit
- Existência e contagem das tabelas principais

---

## Migrar dados do Supabase para o PostgreSQL local

Configure as variáveis do Supabase no `etl/.env` e execute:

```bash
cd etl
npm run migrar:supabase-postgres
```

Variáveis de controle:
- `MIGRAR_TABELAS` — tabelas a migrar (padrão: `dim_ente,dim_credor,fato_empenho`)
- `MIGRAR_MODO` — modo de carga (padrão: `truncate_insert`)
- `MIGRAR_BATCH_SIZE` — tamanho do lote de leitura (padrão: `1000`)

---

## Gerar (ou atualizar) as tabelas mart de despesa

Após popular `fato_empenho`, `dim_ente` e `dim_credor`, execute:

```bash
cd etl
npm run mart:despesa
```

Isso popula as tabelas:
- `mart.despesa_resumo`
- `mart.despesa_evolucao_mensal`
- `mart.despesa_ranking_entes`
- `mart.despesa_ranking_credores`
- `mart.despesa_composicao`
- `mart.despesa_alertas`

---

## Carga full a partir das fontes oficiais do TCE

O caminho preferencial de carga é direto das fontes do TCE (SQL Server) para o PostgreSQL local:

```
SQL Server (TCE) → ETL → PostgreSQL local
```

O script `migrar:supabase-postgres` é apenas um fallback legado para situações onde o acesso ao SQL Server não esteja disponível.

### Como executar a carga full

```bash
cd etl
npm run postgres:migrate   # aplica schemas (apenas na primeira vez)
npm run carga-full:postgres  # carrega dimensões + despesa + mart
```

Esse comando executa em sequência:
1. `dimensoes:postgres` — carrega dim_ente, dim_entidade e dim_credor do SQL Server
2. `despesa:full:postgres` — carrega fato_empenho do SQL Server via staging
3. `mart:despesa` — recalcula as tabelas mart.*

### Trocar para o PostgreSQL institucional

Quando a infraestrutura entregar o banco PostgreSQL de homologação/produção, basta alterar no `etl/.env`:

```
DATABASE_URL=postgres://usuario:senha@host-institucional:5432/banco
# ou separadamente:
PGHOST=host-institucional
PGDATABASE=nome_banco
PGUSER=usuario
PGPASSWORD=senha
```

Nenhuma alteração de código é necessária.

---

## Trocar para o banco institucional (produção)

Basta alterar `DATABASE_URL` ou as variáveis `PG*` no `etl/.env` para apontar para o servidor PostgreSQL institucional do TCE-AC. Nenhum código precisa ser alterado.

Para usar SSL:
```
PGSSLMODE=require
```

---

## Observação sobre o frontend

O frontend Next.js (Painel de Despesa e demais painéis) continua usando o Supabase como backend de leitura. A migração para PostgreSQL local é exclusiva do ETL. Quando o banco institucional estiver disponível, o frontend poderá ser adaptado para consumir uma API própria ou Supabase apontando para o PostgreSQL institucional via connection pooler.

---

## Remessas obrigatórias de prestação de contas

Fonte principal: `APC.dbo.REMESSA` (SQL Server)
Destino DW: `dw.fato_remessa_contabil`
Destino Mart: `mart.remessa_alertas`, `mart.remessa_resumo`

### Comandos

```bash
# Inspecionar valores de domínio e tabelas auxiliares
npm run remessas:inspecionar

# Carga completa (remessas + dimensões + mart)
npm run carga-remessas:postgres
```

### Regras de alerta atuais (fase 1)

Baseadas apenas em datas:
- `remessa_nao_enviada_no_prazo` — CRITICO
- `remessa_enviada_com_atraso` — ALTO
- `remessa_sem_confirmacao` — MEDIO
- `remessa_sem_processamento` — MEDIO

SITUACAO, STATUS, STATUS_PUBLICACAO e TIPO_LIBERACAO serão analisados após execução do job `remessas:inspecionar` para conhecer os valores reais.

### Integração futura

A API `/api/remessas/alertas` e `/api/remessas/resumo` já estão disponíveis para integração com a tela "Alertas do Gabinete".
