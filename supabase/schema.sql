-- Run this entire file in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  login_code text not null,
  team text not null default '未分组',
  role text not null default 'guest' check (role in ('guest','spy','helper')),
  points integer not null default 0,
  created_at timestamptz not null default now(),
  unique(name, login_code)
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  points integer not null default 10,
  role_scope text not null default 'all' check (role_scope in ('all','guest','spy','helper')),
  created_at timestamptz not null default now()
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned','submitted','approved')),
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(guest_id, task_id)
);

create table if not exists clues (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists guest_clues (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests(id) on delete cascade,
  clue_id uuid not null references clues(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(guest_id, clue_id)
);

create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  voter_guest_id uuid not null references guests(id) on delete cascade,
  target_guest_id uuid not null references guests(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(voter_guest_id),
  constraint no_self_vote check (voter_guest_id <> target_guest_id)
);

create table if not exists game_state (
  id integer primary key,
  voting_open boolean not null default false,
  results_visible boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into game_state (id) values (1) on conflict (id) do nothing;

-- This app only accesses the database from secured server-side API routes.
alter table guests enable row level security;
alter table tasks enable row level security;
alter table assignments enable row level security;
alter table clues enable row level security;
alter table guest_clues enable row level security;
alter table votes enable row level security;
alter table game_state enable row level security;

-- No public policies are created. The service-role key bypasses RLS server-side.
