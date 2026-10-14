-- Portfolio comments: author-only edit within 30 minutes.
alter table portfolio_item_comments add column if not exists edited_at timestamptz;

create or replace function enforce_portfolio_comment_edit_window() returns trigger as $$
begin
  if new.body is distinct from old.body then
    if auth.uid() is distinct from old.user_id then
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

drop trigger if exists portfolio_comments_edit_window on portfolio_item_comments;
create trigger portfolio_comments_edit_window before update on portfolio_item_comments
  for each row execute function enforce_portfolio_comment_edit_window();
