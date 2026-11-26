-- Schéma SQL Supabase pour ApéroCentral (tables profiles, friendships, groups, group_members + RLS)

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  short_id text unique not null,
  username text not null,
  default_address text,
  default_lat double precision,
  default_lng double precision,
  default_mode text not null default 'TRANSIT',
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id)
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create policy "Profiles readable by authenticated users"
  on public.profiles for select to authenticated using (true);

create policy "Users insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);

create policy "Friendships visible to participants"
  on public.friendships for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Users send friend invites"
  on public.friendships for insert to authenticated
  with check (auth.uid() = requester_id);

create policy "Addressee can accept invite"
  on public.friendships for update to authenticated
  using (auth.uid() = addressee_id);

create policy "Participants can delete friendship"
  on public.friendships for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create policy "Groups visible to creator or members"
  on public.groups for select to authenticated
  using (
    created_by = auth.uid()
    or public.is_group_member(id)
  );

create policy "Users create groups"
  on public.groups for insert to authenticated
  with check (auth.uid() = created_by);

create policy "Creator deletes group"
  on public.groups for delete to authenticated
  using (auth.uid() = created_by);

create policy "Members view group_members"
  on public.group_members for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_group_member(group_id)
    or exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );

create policy "Group creator adds members"
  on public.group_members for insert to authenticated
  with check (
    exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );

create policy "User or creator removes membership"
  on public.group_members for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );
