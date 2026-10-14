-- Comment actions: soft delete (keeps replies), content-owner moderation, server-side permission checks.
alter table comments add column if not exists deleted_at timestamptz;
alter table portfolio_item_comments add column if not exists deleted_at timestamptz;
alter table portfolio_item_comments add column if not exists edited_at timestamptz;

-- Post comments: edit = author within 30 min; soft delete = author or the post's owner.
create or replace function enforce_comment_edit_window() returns trigger as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if auth.uid() is distinct from old.author_id
       and not exists (select 1 from posts p where p.id = old.post_id and p.author_id = auth.uid()) then
      raise exception 'Not allowed to delete this comment';
    end if;
    return new;
  end if;
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

-- Portfolio comments: same rules; the "owner" is the portfolio item's creator.
create or replace function enforce_portfolio_comment_edit_window() returns trigger as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if auth.uid() is distinct from old.user_id
       and not exists (select 1 from portfolio_items i where i.id = old.item_id and i.user_id = auth.uid()) then
      raise exception 'Not allowed to delete this comment';
    end if;
    return new;
  end if;
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

-- Hard delete (comment without replies): author, or the content owner.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'comments' and policyname = 'comments_delete_post_owner') then
    create policy comments_delete_post_owner on comments for delete to authenticated
      using (exists (select 1 from posts p where p.id = comments.post_id and p.author_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'portfolio_item_comments' and policyname = 'portfolio_comments_delete_owner') then
    create policy portfolio_comments_delete_owner on portfolio_item_comments for delete to authenticated
      using (user_id = auth.uid() or exists (select 1 from portfolio_items i where i.id = portfolio_item_comments.item_id and i.user_id = auth.uid()));
  end if;
end $$;
