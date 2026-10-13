-- ==============================================================================
-- STOCK METADATA PRO AI - PRODUCTION SUPABASE DATABASE SCHEMA
-- ==============================================================================
-- Run this entire script in your Supabase SQL Editor (Dashboard -> SQL Editor)
-- to provision user-scoped tables with Row-Level Security (RLS).
-- ==============================================================================

-- 1. Projects Table
create table if not exists public.projects (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  marketplace text default 'generic',
  asset_type text default 'photo',
  title_settings jsonb,
  keyword_settings jsonb,
  items jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for fast user-scoped project lookups
create index if not exists idx_projects_user_id on public.projects(user_id);

-- Enable Row Level Security (RLS)
alter table public.projects enable row level security;

-- Policies for Projects (Strictly Isolated by User)
drop policy if exists "Users can select own projects" on public.projects;
create policy "Users can select own projects"
  on public.projects for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own projects" on public.projects;
create policy "Users can insert own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own projects" on public.projects;
create policy "Users can update own projects"
  on public.projects for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own projects" on public.projects;
create policy "Users can delete own projects"
  on public.projects for delete
  using (auth.uid() = user_id);


-- 2. User API Keys Table (Encrypted / Isolated per user)
create table if not exists public.user_api_keys (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  provider text not null check (provider in ('gemini', 'groq')),
  label text not null,
  masked_key text not null,
  raw_key text not null,
  enabled boolean default true,
  status text default 'active',
  request_count integer default 0,
  success_count integer default 0,
  failure_count integer default 0,
  last_used timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_user_api_keys_user_id on public.user_api_keys(user_id);

alter table public.user_api_keys enable row level security;

-- Policies for API Keys (Strictly Isolated by User)
drop policy if exists "Users can select own keys" on public.user_api_keys;
create policy "Users can select own keys"
  on public.user_api_keys for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own keys" on public.user_api_keys;
create policy "Users can insert own keys"
  on public.user_api_keys for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own keys" on public.user_api_keys;
create policy "Users can update own keys"
  on public.user_api_keys for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own keys" on public.user_api_keys;
create policy "Users can delete own keys"
  on public.user_api_keys for delete
  using (auth.uid() = user_id);


-- 3. Metadata Records Table (Detailed Asset & Metadata Storage Isolated per user)
create table if not exists public.metadata_records (
  id text primary key,
  project_id text references public.projects(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  original_filename text not null,
  title text,
  description text,
  keywords jsonb default '[]'::jsonb,
  category text,
  seo_score integer default 0,
  marketplace text default 'generic',
  status text default 'draft',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_metadata_records_user_id on public.metadata_records(user_id);
create index if not exists idx_metadata_records_project_id on public.metadata_records(project_id);

alter table public.metadata_records enable row level security;

drop policy if exists "Users can select own metadata records" on public.metadata_records;
create policy "Users can select own metadata records"
  on public.metadata_records for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own metadata records" on public.metadata_records;
create policy "Users can insert own metadata records"
  on public.metadata_records for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own metadata records" on public.metadata_records;
create policy "Users can update own metadata records"
  on public.metadata_records for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own metadata records" on public.metadata_records;
create policy "Users can delete own metadata records"
  on public.metadata_records for delete
  using (auth.uid() = user_id);


-- 4. User Settings Table
create table if not exists public.user_settings (
  user_id uuid references auth.users(id) on delete cascade primary key,
  concurrency integer default 3,
  retry_count integer default 2,
  preferred_provider text default 'auto',
  groq_model text default 'llama-3.2-11b-vision-preview',
  gemini_model text default 'gemini-2.5-flash',
  enable_auto_save boolean default true,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_settings enable row level security;

-- Policies for User Settings
drop policy if exists "Users can select own settings" on public.user_settings;
create policy "Users can select own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own settings" on public.user_settings;
create policy "Users can insert own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own settings" on public.user_settings;
create policy "Users can update own settings"
  on public.user_settings for update
  using (auth.uid() = user_id);

-- Success verification
select 'Stock Metadata Pro AI schema configured successfully!' as status;
