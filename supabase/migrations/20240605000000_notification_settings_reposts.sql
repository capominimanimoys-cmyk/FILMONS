alter table public.notification_settings add column if not exists notif_reposts boolean not null default true;
