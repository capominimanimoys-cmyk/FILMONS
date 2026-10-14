-- Comment editing: author only, within 30 minutes of posting.
alter table comments add column if not exists edited_at timestamptz;

create or replace function enforce_comment_edit_window() returns trigger as $$
begin
  if new.content is distinct from old.content then
    if auth.uid() is distinct from old.author_id then
      raise exception 'Only the author can edit a comment';
    end if;
    if now() - old.created_at > interval '30 minutes' then
      raise exception 'Comments can only be edited within 30 minutes';
    end if;
    new.edited_at := now();
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists comments_edit_window on comments;
create trigger comments_edit_window before update on comments
  for each row execute function enforce_comment_edit_window();
