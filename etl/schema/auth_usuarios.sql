create table if not exists public.usuarios_autorizados (
  id uuid primary key default gen_random_uuid(),
  usuario_ad text not null unique,
  nome text,
  email text,
  foto_url text,
  foto_posicao text not null default 'center center',
  perfil text not null default 'usuario',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.usuarios_autorizados
  add column if not exists foto_url text;

alter table public.usuarios_autorizados
  add column if not exists foto_posicao text not null default 'center center';

create index if not exists idx_usuarios_autorizados_ativo
  on public.usuarios_autorizados (ativo);

comment on table public.usuarios_autorizados is
  'Usuários autorizados a acessar o Varadouro Digital após autenticação no Active Directory.';

comment on column public.usuarios_autorizados.usuario_ad is
  'Login do Active Directory em minúsculo, sem domínio. Exemplo: claudio.pontes.';

comment on column public.usuarios_autorizados.perfil is
  'Perfil inicial de acesso. Hoje libera todas as páginas; futuramente controla permissões.';

comment on column public.usuarios_autorizados.foto_url is
  'URL pública da foto exibida no perfil e no cabeçalho do sistema.';

comment on column public.usuarios_autorizados.foto_posicao is
  'Posição CSS object-position usada para enquadrar a foto no avatar.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
