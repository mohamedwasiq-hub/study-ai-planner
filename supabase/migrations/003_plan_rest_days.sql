-- Weekdays the student does not study (0 = Sunday), so re-planning keeps them free.
alter table public.plans add column rest_days int[] not null default '{}';
create index on public.plan_days (plan_id, date);
