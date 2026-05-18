-- FounderSprint Database Schema
-- Run this in Supabase SQL Editor

-- PROFILES (extends auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  avatar_url text,
  onboarding_complete boolean default false,
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "Users can manage own profile" on profiles
  for all using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- SPRINTS
create table if not exists sprints (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  mode text check (mode in ('custom', 'prebuilt', 'rotation')) not null,
  duration_days int not null,
  start_date date not null,
  end_date date not null,
  revenue_goal numeric default 0,
  status text check (status in ('active', 'paused', 'completed')) default 'active',
  created_at timestamptz default now()
);
alter table sprints enable row level security;
create policy "Users can manage own sprints" on sprints
  for all using (auth.uid() = user_id);

-- SPRINT DAYS
create table if not exists sprint_days (
  id uuid default gen_random_uuid() primary key,
  sprint_id uuid references sprints on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  day_number int not null,
  date date not null,
  day_type text default 'deep_work',
  task_title text,
  task_notes text,
  status text check (status in ('todo', 'active', 'done', 'paused')) default 'todo',
  is_paused boolean default false,
  created_at timestamptz default now()
);
alter table sprint_days enable row level security;
create policy "Users can manage own sprint days" on sprint_days
  for all using (auth.uid() = user_id);

-- ROUTINE CATEGORIES
create table if not exists routine_categories (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  color text not null default '#22C55E',
  sort_order int default 0,
  created_at timestamptz default now()
);
alter table routine_categories enable row level security;
create policy "Users can manage own routine categories" on routine_categories
  for all using (auth.uid() = user_id);

-- ROUTINE ITEMS
create table if not exists routine_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  category_id uuid references routine_categories on delete set null,
  title text not null,
  duration_minutes int,
  sort_order int default 0,
  created_at timestamptz default now()
);
alter table routine_items enable row level security;
create policy "Users can manage own routine" on routine_items
  for all using (auth.uid() = user_id);

-- ROUTINE ALARMS
create table if not exists routine_alarms (
  id uuid default gen_random_uuid() primary key,
  routine_item_id uuid references routine_items on delete cascade not null,
  hour int not null,
  minute int not null,
  frequency text check (frequency in ('daily', 'weekdays', 'weekends')) not null default 'daily',
  is_active boolean default true,
  created_at timestamptz default now()
);
alter table routine_alarms enable row level security;
create policy "Users can manage own alarms" on routine_alarms
  for all using (
    exists (
      select 1 from routine_items
      where routine_items.id = routine_alarms.routine_item_id
        and routine_items.user_id = auth.uid()
    )
  );

-- ROUTINE COMPLETIONS (per day)
create table if not exists routine_completions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  item_id uuid references routine_items on delete cascade not null,
  completed_on date not null,
  unique(item_id, completed_on)
);
alter table routine_completions enable row level security;
create policy "Users can manage own completions" on routine_completions
  for all using (auth.uid() = user_id);

-- KPIs
create table if not exists kpis (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  sprint_id uuid references sprints on delete cascade,
  week_number int not null,
  category text check (category in ('revenue','clients','content','development','learning','habit')) not null,
  name text not null,
  target numeric not null,
  current_value numeric default 0,
  unit text default '',
  created_at timestamptz default now()
);
alter table kpis enable row level security;
create policy "Users can manage own kpis" on kpis
  for all using (auth.uid() = user_id);

-- LEADS
create table if not exists leads (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  sprint_id uuid references sprints,
  name text not null,
  business text,
  service_type text,
  value numeric default 0,
  status text check (status in ('new','contacted','interested','negotiating','closed','lost')) default 'new',
  follow_up_date date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table leads enable row level security;
create policy "Users can manage own leads" on leads
  for all using (auth.uid() = user_id);

-- REVENUE
create table if not exists revenue_entries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  sprint_id uuid references sprints,
  lead_id uuid references leads,
  amount numeric not null,
  type text check (type in ('website','social_media','consulting','editing','ecommerce','freelance','other')) not null,
  client_name text,
  notes text,
  date date default current_date,
  created_at timestamptz default now()
);
alter table revenue_entries enable row level security;
create policy "Users can manage own revenue" on revenue_entries
  for all using (auth.uid() = user_id);

-- GOALS
create table if not exists goals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  sprint_id uuid references sprints,
  name text not null,
  category text check (category in ('purchase','revenue','lifestyle','travel','health','business','other')) not null,
  deadline date not null,
  financial_target numeric,
  current_amount numeric default 0,
  motivation text,
  is_pinned boolean default false,
  status text check (status in ('active','completed')) default 'active',
  created_at timestamptz default now()
);
alter table goals enable row level security;
create policy "Users can manage own goals" on goals
  for all using (auth.uid() = user_id);

-- GOAL MILESTONES
create table if not exists goal_milestones (
  id uuid default gen_random_uuid() primary key,
  goal_id uuid references goals on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  target_date date,
  is_complete boolean default false,
  sort_order int default 0
);
alter table goal_milestones enable row level security;
create policy "Users can manage own milestones" on goal_milestones
  for all using (auth.uid() = user_id);

-- SPRINT DAY TASKS (multiple tasks per day, separate from the day's main task)
create table if not exists sprint_day_tasks (
  id uuid default gen_random_uuid() primary key,
  sprint_day_id uuid references sprint_days on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  notes text,
  is_done boolean default false,
  sort_order int default 0,
  color_tag text,
  created_at timestamptz default now()
);
alter table sprint_day_tasks enable row level security;
create policy "Users can manage own day tasks" on sprint_day_tasks
  for all using (auth.uid() = user_id);

-- PAUSE LOG
create table if not exists pause_log (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  sprint_id uuid references sprints on delete cascade not null,
  paused_on date not null,
  week_number int not null,
  unique(user_id, paused_on)
);
alter table pause_log enable row level security;
create policy "Users can manage own pauses" on pause_log
  for all using (auth.uid() = user_id);
