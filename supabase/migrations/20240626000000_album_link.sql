-- A link can be attached to a portfolio album (same idea as portfolio_items.external_link).
alter table portfolio_albums add column if not exists external_link text;
