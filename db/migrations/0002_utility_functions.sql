-- Generic trigger function that keeps an `updated_at` column current.
-- Reused by every table below instead of duplicating the same trigger body.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
