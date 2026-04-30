-- Tabela agregada de empenhos de combustível por mês
-- Populada via fn_refresh_combustivel_empenho_mensal() após sync do ETL

create table if not exists public.combustivel_empenho_mensal (
  ano                smallint      not null,
  mes                smallint      not null,
  entidade           varchar(250)  not null default '',
  tipo_combustivel   varchar(100)  not null default '',
  forma_fornecimento varchar(100)  not null default '',
  nome_credor        varchar(250)  not null default '',
  valor_empenho      numeric(19,2) not null default 0,
  valor_liquidado    numeric(19,2) not null default 0,
  qtd_empenhos       integer       not null default 0,
  atualizado_em      timestamptz   not null default now(),
  constraint pk_combustivel_empenho_mensal
    primary key (ano, mes, entidade, tipo_combustivel, forma_fornecimento, nome_credor)
);

create index if not exists idx_comb_emp_mensal_ano_mes
  on public.combustivel_empenho_mensal (ano, mes);

create index if not exists idx_comb_emp_mensal_entidade
  on public.combustivel_empenho_mensal (entidade);

-- Função que trunca e repopula a tabela a partir dos dados brutos
create or replace function public.fn_refresh_combustivel_empenho_mensal()
returns void
language plpgsql
security definer
as $$
begin
  truncate table public.combustivel_empenho_mensal;

  insert into public.combustivel_empenho_mensal (
    ano, mes, entidade, tipo_combustivel, forma_fornecimento,
    nome_credor, valor_empenho, valor_liquidado, qtd_empenhos, atualizado_em
  )
  select
    extract(year  from data_empenho::date)::smallint          as ano,
    extract(month from data_empenho::date)::smallint          as mes,
    coalesce(nullif(trim(entidade),           ''), 'N/D')     as entidade,
    coalesce(nullif(trim(tipo_combustivel),   ''), 'N/D')     as tipo_combustivel,
    coalesce(nullif(trim(forma_fornecimento), ''), 'N/D')     as forma_fornecimento,
    coalesce(nullif(trim(nome_credor),        ''), 'N/D')     as nome_credor,
    sum(coalesce(valor_empenho,   0))::numeric(19,2)          as valor_empenho,
    sum(coalesce(valor_liquidado, 0))::numeric(19,2)          as valor_liquidado,
    count(*)::integer                                         as qtd_empenhos,
    now()                                                     as atualizado_em
  from public.tb_despesa_combustivel_polanco
  where data_empenho is not null
  group by 1, 2, 3, 4, 5, 6;
end;
$$;
