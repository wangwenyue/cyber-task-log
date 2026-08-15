create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.reminder_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  enabled boolean not null default false,
  reminder_time time not null default '09:00:00',
  timezone text not null default 'Asia/Shanghai',
  last_sent_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminder_email_matches_account check (email <> ''),
  constraint reminder_timezone_length check (char_length(timezone) between 1 and 80)
);

alter table public.reminder_settings enable row level security;

grant select, insert, update, delete on public.reminder_settings to authenticated;

create policy "Users can read their reminder settings"
on public.reminder_settings for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their reminder settings"
on public.reminder_settings for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and email = (select auth.jwt() ->> 'email')
);

create policy "Users can update their reminder settings"
on public.reminder_settings for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and email = (select auth.jwt() ->> 'email')
);

create policy "Users can delete their reminder settings"
on public.reminder_settings for delete to authenticated
using ((select auth.uid()) = user_id);

select cron.schedule(
  'neon-log-daily-reminders',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://osgsjjqidodyjreslrbv.supabase.co/functions/v1/send-task-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_nS9Bu52AEVM2i8kYPnWb0A_yIT4p6XX'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $job$
);
