-- Field Definitions for Dynamic Configuration
create table if not exists field_definitions (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  type text not null check (type in ('text', 'textarea', 'file')),
  default_value text,
  "order" int default 0
);

-- Agent Configurations per User
create table if not exists agent_configs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prompt_data jsonb default '{}'::jsonb,
  openai_key text,
  manychat_key text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table field_definitions enable row level security;
alter table agent_configs enable row level security;

-- Policies
-- Field Definitions: Readable by everyone (authenticated), Modifiable only by service_role (Admin)
create policy "Enable read access for authenticated users" on field_definitions for select to authenticated using (true);

-- Agent Configs: Users can CRUD their own config
create policy "Users can view their own config" on agent_configs for select to authenticated using (auth.uid() = user_id);
create policy "Users can insert their own config" on agent_configs for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update their own config" on agent_configs for update to authenticated using (auth.uid() = user_id);

-- Seed Initial Fields
insert into field_definitions (key, label, type, "order") values
('agent_name', 'Agent Name', 'text', 10),
('agent_backstory', 'Agent Persona / Backstory', 'textarea', 20),
('business_description', 'Business Description & Offer', 'textarea', 30),
('knowledge_base', 'Knowledge Base (FAQ)', 'textarea', 40),
('uploaded_docs', 'Upload Business Documents', 'file', 50)
on conflict (key) do nothing;
