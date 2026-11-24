-- =============================================================================
-- PontoFácil - Banco de dados no Supabase
-- Cole este arquivo inteiro no Supabase: SQL Editor > New query > Run.
-- Pode ser executado mais de uma vez sem perder dados.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabelas
-- -----------------------------------------------------------------------------

-- Perfil de cada pessoa com login (1 linha por usuário do Supabase Auth)
create table if not exists public.perfis (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text not null,
  email         text not null unique,
  cargo         text not null default '',
  depto         text not null default '',
  perfil        text not null default 'colaborador' check (perfil in ('colaborador', 'gestor')),
  carga_horaria numeric(4,1) not null default 8 check (carga_horaria between 1 and 24),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

-- Pré-cadastro feito pelo gestor: só e-mails listados aqui conseguem criar conta
create table if not exists public.pre_cadastros (
  email         text primary key check (email = lower(email)),
  nome          text not null,
  cargo         text not null default '',
  depto         text not null default '',
  perfil        text not null default 'colaborador' check (perfil in ('colaborador', 'gestor')),
  carga_horaria numeric(4,1) not null default 8 check (carga_horaria between 1 and 24),
  criado_em     timestamptz not null default now()
);

-- Um registro por colaborador por dia, com a lista flexível de batidas
create table if not exists public.registros_ponto (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.perfis(id) on delete cascade,
  data          date not null,
  batidas       jsonb not null default '[]'::jsonb,
  local         text,
  observacao    text not null default '',
  ajustes       jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now(),
  unique (user_id, data)
);

-- Justificativas de ausência / ocorrências
create table if not exists public.justificativas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.perfis(id) on delete cascade,
  data          date not null,
  tipo          text not null,
  horas         numeric(4,1) not null default 8,
  motivo        text not null,
  status        text not null default 'Pendente' check (status in ('Pendente', 'Aprovada', 'Rejeitada')),
  parecer       text not null default '',
  avaliado_por  uuid references public.perfis(id),
  criado_em     timestamptz not null default now()
);

create index if not exists registros_ponto_data_idx on public.registros_ponto (data);
create index if not exists justificativas_user_idx on public.justificativas (user_id);

-- -----------------------------------------------------------------------------
-- 2. Funções auxiliares de permissão
-- -----------------------------------------------------------------------------
create or replace function public.is_gestor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and perfil = 'gestor' and ativo);
$$;

create or replace function public.is_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo);
$$;

-- -----------------------------------------------------------------------------
-- 3. Criação automática do perfil quando alguém cria a conta
--    Só funciona para e-mails pré-cadastrados pelo gestor.
-- -----------------------------------------------------------------------------
create or replace function public.criar_perfil_novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pc public.pre_cadastros;
begin
  select * into pc from public.pre_cadastros where email = lower(new.email);
  if pc.email is null then
    raise exception 'EMAIL_NAO_AUTORIZADO: peça ao gestor para fazer o pré-cadastro do e-mail %', new.email;
  end if;

  insert into public.perfis (id, nome, email, cargo, depto, perfil, carga_horaria)
  values (new.id, pc.nome, lower(new.email), pc.cargo, pc.depto, pc.perfil, pc.carga_horaria);

  delete from public.pre_cadastros where email = pc.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- Impede que o sistema fique sem nenhum gestor ativo
create or replace function public.garantir_um_gestor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.perfis where perfil = 'gestor' and ativo) then
    raise exception 'ULTIMO_GESTOR: o sistema precisa de pelo menos um gestor ativo';
  end if;
  return null;
end;
$$;

drop trigger if exists perfis_garantir_gestor on public.perfis;
create trigger perfis_garantir_gestor
  after update or delete on public.perfis
  for each statement execute function public.garantir_um_gestor();

-- Mantém a data de atualização do registro de ponto
create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists registros_ponto_atualizado on public.registros_ponto;
create trigger registros_ponto_atualizado
  before update on public.registros_ponto
  for each row execute function public.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- 4. Segurança por linha (RLS): colaborador só vê/grava o que é dele
-- -----------------------------------------------------------------------------
alter table public.perfis          enable row level security;
alter table public.pre_cadastros   enable row level security;
alter table public.registros_ponto enable row level security;
alter table public.justificativas  enable row level security;

-- Perfis: cada um vê o próprio; gestor vê e edita todos (colaborador não altera o próprio perfil)
drop policy if exists perfis_select on public.perfis;
create policy perfis_select on public.perfis for select to authenticated
  using (id = auth.uid() or public.is_gestor());

drop policy if exists perfis_update on public.perfis;
create policy perfis_update on public.perfis for update to authenticated
  using (public.is_gestor()) with check (public.is_gestor());

-- Pré-cadastros: só gestor
drop policy if exists pre_cadastros_gestor on public.pre_cadastros;
create policy pre_cadastros_gestor on public.pre_cadastros for all to authenticated
  using (public.is_gestor()) with check (public.is_gestor());

-- Registros de ponto: o próprio colaborador (ativo) ou gestor
drop policy if exists ponto_select on public.registros_ponto;
create policy ponto_select on public.registros_ponto for select to authenticated
  using (user_id = auth.uid() or public.is_gestor());

drop policy if exists ponto_insert on public.registros_ponto;
create policy ponto_insert on public.registros_ponto for insert to authenticated
  with check ((user_id = auth.uid() and public.is_ativo()) or public.is_gestor());

drop policy if exists ponto_update on public.registros_ponto;
create policy ponto_update on public.registros_ponto for update to authenticated
  using ((user_id = auth.uid() and public.is_ativo()) or public.is_gestor())
  with check ((user_id = auth.uid() and public.is_ativo()) or public.is_gestor());

drop policy if exists ponto_delete on public.registros_ponto;
create policy ponto_delete on public.registros_ponto for delete to authenticated
  using (public.is_gestor());

-- Justificativas: colaborador envia (sempre Pendente) e vê as suas; só gestor avalia
-- (gestor também pode inserir, para importar dados da versão antiga)
drop policy if exists just_select on public.justificativas;
create policy just_select on public.justificativas for select to authenticated
  using (user_id = auth.uid() or public.is_gestor());

drop policy if exists just_insert on public.justificativas;
create policy just_insert on public.justificativas for insert to authenticated
  with check (
    (user_id = auth.uid() and public.is_ativo()
      and status = 'Pendente' and parecer = '' and avaliado_por is null)
    or public.is_gestor()
  );

drop policy if exists just_update on public.justificativas;
create policy just_update on public.justificativas for update to authenticated
  using (public.is_gestor()) with check (public.is_gestor());

-- Permissões de tabela (o acesso real é filtrado pelas políticas acima)
revoke all on public.perfis, public.pre_cadastros, public.registros_ponto, public.justificativas from anon;
grant select, update                 on public.perfis          to authenticated;
grant select, insert, update, delete on public.pre_cadastros   to authenticated;
grant select, insert, update, delete on public.registros_ponto to authenticated;
grant select, insert, update         on public.justificativas  to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Atualização em tempo real (o painel do gestor atualiza sozinho)
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['perfis', 'registros_ponto', 'justificativas'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
