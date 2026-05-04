create table if not exists public.usuarios_autorizados (
  id uuid primary key default gen_random_uuid(),
  usuario_ad text not null unique,
  nome text,
  email text,
  perfil text not null default 'usuario',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_usuarios_autorizados_ativo
  on public.usuarios_autorizados (ativo);

comment on table public.usuarios_autorizados is
  'Usuários autorizados a acessar o Varadouro Digital após autenticação no Active Directory.';

comment on column public.usuarios_autorizados.usuario_ad is
  'Login do Active Directory em minusculo, sem dominio. Exemplo: claudio.pontes.';

comment on column public.usuarios_autorizados.perfil is
  'Perfil inicial de acesso. Hoje libera todas as páginas; futuramente controla permissões.';
