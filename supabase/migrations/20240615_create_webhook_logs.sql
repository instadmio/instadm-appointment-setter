-- Create Webhook Logs Table for Debugging
create table if not exists webhook_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade,
    level text check (level in ('info', 'error', 'success')),
    event text not null,
    details jsonb default '{}'::jsonb,
    created_at timestamptz default now()
);

-- Enable RLS
alter table webhook_logs enable row level security;

-- Policies
create policy "Users can view their own logs" on webhook_logs for select to authenticated using (auth.uid() = user_id);

-- Allow inserting logs (usually internal, but we can allow authenticated)
-- If we run the webhook as a service user or authenticated user, this should work.
create policy "Enable insert for authenticated users" on webhook_logs for insert to authenticated with check (auth.uid() = user_id);

-- Also allow service_role (for background tasks)
create policy "Service role insert" on webhook_logs for insert to service_role with check (true);
