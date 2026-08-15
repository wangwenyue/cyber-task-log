alter table public.tasks
  add column if not exists due_time time,
  add column if not exists priority text not null default 'normal';

alter table public.tasks
  add constraint tasks_priority_check
  check (priority in ('normal', 'important', 'urgent', 'critical'));

create index if not exists tasks_user_date_priority_index
on public.tasks (user_id, task_date, priority, due_time);
