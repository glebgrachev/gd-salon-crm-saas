


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."booking_status" AS ENUM (
    'hold',
    'new',
    'confirmed',
    'completed',
    'paid',
    'cancelled',
    'no_show'
);


ALTER TYPE "public"."booking_status" OWNER TO "postgres";


CREATE TYPE "public"."promo_discount_type" AS ENUM (
    'percent',
    'fixed'
);


ALTER TYPE "public"."promo_discount_type" OWNER TO "postgres";


CREATE TYPE "public"."review_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."review_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activate_certificate"("p_client" bigint, "p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_cert certificates%rowtype;
begin
  select * into v_cert from certificates
  where upper(code) = upper(trim(p_code))
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_cert.status = 'disabled' then
    return jsonb_build_object('ok', false, 'error', 'disabled');
  end if;
  if v_cert.status = 'expired' or (v_cert.expires_at is not null and v_cert.expires_at < current_date) then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if v_cert.activated_by is not null then
    if v_cert.activated_by = p_client then
      return jsonb_build_object('ok', false, 'error', 'already_yours');
    end if;
    return jsonb_build_object('ok', false, 'error', 'already_used');
  end if;

  update certificates
    set status = 'active', activated_by = p_client, activated_at = now()
  where id = v_cert.id;

  insert into certificate_transactions (client_id, certificate_id, kind, amount, note)
    values (p_client, v_cert.id, 'activation', v_cert.balance, 'Активация сертификата');

  perform certificate_recalc(p_client);

  return jsonb_build_object('ok', true, 'added', v_cert.balance, 'code', v_cert.code);
end;
$$;


ALTER FUNCTION "public"."activate_certificate"("p_client" bigint, "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_cron_call"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_url    text;
  v_secret text;
  v_has_pending boolean;
begin
  -- дёргаем только если есть что отправлять
  select exists (select 1 from broadcast_recipients where status = 'pending')
    into v_has_pending;
  if not v_has_pending then
    return;
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'crm_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';

  if v_url is null or v_secret is null then
    raise notice 'broadcast_cron_call: secrets not found';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/api/cron/broadcast-worker',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', v_secret),
    body    := '{}'::jsonb
  );
end;
$$;


ALTER FUNCTION "public"."broadcast_cron_call"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_recalc"("p_broadcast" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_sent int;
  v_failed int;
  v_opted int;
  v_total int;
  v_pending int;
begin
  select
    count(*) filter (where status = 'sent'),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status = 'opted_out'),
    count(*),
    count(*) filter (where status = 'pending')
  into v_sent, v_failed, v_opted, v_total, v_pending
  from broadcast_recipients where broadcast_id = p_broadcast;

  update broadcasts
    set sent = v_sent,
        failed = v_failed,
        opted_out = v_opted,
        total = v_total,
        status = case when v_pending = 0 then 'done' else 'sending' end,
        finished_at = case when v_pending = 0 then now() else finished_at end
  where id = p_broadcast;
end;
$$;


ALTER FUNCTION "public"."broadcast_recalc"("p_broadcast" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_recipients_for_segments"("p_segments" "text"[]) RETURNS TABLE("client_id" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if 'all' = any(p_segments) then
    return query
      select v.client_id
      from v_client_segments v
      join users u on u.telegram_id = v.client_id
      where coalesce(u.promo_opt_out, false) = false;
  else
    return query
      select v.client_id
      from v_client_segments v
      join users u on u.telegram_id = v.client_id
      where v.segment = any(p_segments)
        and coalesce(u.promo_opt_out, false) = false;
  end if;
end;
$$;


ALTER FUNCTION "public"."broadcast_recipients_for_segments"("p_segments" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_product_sale"("p_sale" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_s      product_sales%rowtype;
  v_p      products%rowtype;
  v_new    numeric;
  v_killed int := 0;
begin
  select * into v_s from product_sales where id = p_sale for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_s.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select * into v_p from products where id = v_s.product_id for update;

  update product_sales set status = 'cancelled' where id = p_sale;

  if v_p.kind = 'certificate' then
    -- Склада у сертификата нет — возвращать нечего.
    -- Но если коды уже выданы, их нужно погасить: покупка отменена.
    -- Активированные и потраченные не трогаем — там уже живые деньги,
    -- такие случаи разбираются вручную.
    with dead as (
      update certificates
        set status = 'disabled'
      where note = 'sale:' || p_sale::text
        and status = 'issued'          -- ещё не активирован никем
      returning 1
    )
    select count(*) into v_killed from dead;

    return jsonb_build_object(
      'ok', true,
      'certificates_disabled', v_killed
    );
  end if;

  -- обычный товар: возвращаем на склад
  v_new := v_p.stock + v_s.qty;

  update products set stock = v_new where id = v_p.id;

  insert into stock_movements (
    product_id, kind, qty_base, cost_base, balance_after, ref_type, ref_id, note
  )
  values (
    v_p.id, 'adjust', v_s.qty, v_p.avg_cost, v_new, 'sale', p_sale,
    'Возврат при отмене продажи'
  );

  return jsonb_build_object('ok', true);
end;
$$;


ALTER FUNCTION "public"."cancel_product_sale"("p_sale" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_reschedule"("p_booking" "uuid", "p_client" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_b bookings%rowtype;
begin
  select * into v_b from bookings where id = p_booking for update;
  if not found or v_b.client_id <> p_client then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_b.rescheduling_started_at is null then
    return jsonb_build_object('ok', true);   -- нечего откатывать
  end if;
  if v_b.status <> 'new' then
    return jsonb_build_object('ok', false, 'error', 'wrong_status');
  end if;
  update bookings set rescheduling_started_at = null where id = v_b.id;
  return jsonb_build_object('ok', true);
end;
$$;


ALTER FUNCTION "public"."cancel_reschedule"("p_booking" "uuid", "p_client" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."certificate_recalc"("p_client" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into certificate_accounts (client_id, balance, updated_at)
  select p_client, coalesce(sum(amount), 0), now()
  from certificate_transactions
  where client_id = p_client
  on conflict (client_id) do update
    set balance = excluded.balance, updated_at = now();
end;
$$;


ALTER FUNCTION "public"."certificate_recalc"("p_client" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."certificates_expire_due"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update certificates
    set status = 'expired'
  where expires_at is not null
    and expires_at < current_date
    and status in ('issued', 'active');
end;
$$;


ALTER FUNCTION "public"."certificates_expire_due"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."client_segment"("p_client" bigint) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count       int;
  v_last        timestamptz;
  v_days        int;
  v_new_days    int;
  v_reg_days    int;
  v_lost_days   int;
begin
  select new_days, regular_days, lost_days
    into v_new_days, v_reg_days, v_lost_days
  from retention_settings where id = 1;

  select count(*), max(ends_at)
    into v_count, v_last
  from bookings
  where client_id = p_client
    and status = 'paid'
    and coalesce(is_synthetic, false) = false;

  if v_count = 0 or v_last is null then
    return 'no_visits';
  end if;

  v_days := greatest(0, extract(day from (now() - v_last))::int);

  if v_count = 1 and v_days <= v_new_days then
    return 'new';
  elsif v_days <= v_reg_days then
    return 'regular';
  elsif v_days <= v_lost_days then
    return 'sleeping';
  else
    return 'lost';
  end if;
end;
$$;


ALTER FUNCTION "public"."client_segment"("p_client" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_for_booking"("p_booking" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_b     bookings%rowtype;
  v_row   record;
  v_cnt   int := 0;
  v_neg   int := 0;
  v_res   jsonb;
begin
  select * into v_b from bookings where id = p_booking;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  -- защита от двойного списания
  if exists (
    select 1 from stock_movements
    where ref_type = 'booking' and ref_id = p_booking and kind = 'consume'
  ) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  for v_row in
    select sc.product_id, sc.qty_base
    from service_consumables sc
    where sc.service_id = v_b.service_id
  loop
    v_res := stock_consume(
      v_row.product_id, v_row.qty_base, 'consume', 'booking', p_booking, 'Автосписание по услуге'
    );
    v_cnt := v_cnt + 1;
    if (v_res->>'negative')::boolean then
      v_neg := v_neg + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'consumed', v_cnt, 'negative', v_neg);
end;
$$;


ALTER FUNCTION "public"."consume_for_booking"("p_booking" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_order_with_bookings"("p_client_id" bigint, "p_items" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_order_id uuid;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total    numeric := 0;
  v_busy     int[]   := '{}';
  it         jsonb;
  i          int := 0;
begin
  for it in select * from jsonb_array_elements(p_items)
  loop
    if exists (
      select 1 from bookings b
      where b.specialist_id = (it->>'specialist_id')::uuid
        and b.status <> 'cancelled'
        and tstzrange(b.starts_at, b.ends_at, '[)') &&
            tstzrange((it->>'starts_at')::timestamptz, (it->>'ends_at')::timestamptz, '[)')
    ) then
      v_busy := array_append(v_busy, i);
    end if;
    i := i + 1;
  end loop;

  if array_length(v_busy, 1) is not null then
    return jsonb_build_object('ok', false, 'busy', to_jsonb(v_busy));
  end if;

  select
    coalesce(sum((x->>'full_price')::numeric), 0),
    coalesce(sum((x->>'discount')::numeric), 0),
    coalesce(sum((x->>'final_price')::numeric), 0)
  into v_subtotal, v_discount, v_total
  from jsonb_array_elements(p_items) x;

  insert into orders (client_id, subtotal, discount_total, total)
  values (p_client_id, v_subtotal, v_discount, v_total)
  returning id into v_order_id;

  insert into bookings (
    order_id, client_id, service_id, specialist_id,
    starts_at, ends_at, status,
    full_price, discount_amount, final_price, price_snapshot, promo_id, is_gift,
    points_to_redeem, cert_to_redeem, cert_id
  )
  select
    v_order_id, p_client_id,
    (x->>'service_id')::uuid, (x->>'specialist_id')::uuid,
    (x->>'starts_at')::timestamptz, (x->>'ends_at')::timestamptz, 'new',
    (x->>'full_price')::numeric, (x->>'discount')::numeric, (x->>'final_price')::numeric,
    (x->>'final_price')::numeric,
    nullif(x->>'promo_id','')::uuid, coalesce((x->>'is_gift')::boolean, false),
    coalesce((x->>'points_to_redeem')::numeric, 0),
    coalesce((x->>'cert_to_redeem')::numeric, 0),
    nullif(x->>'cert_id','')::uuid
  from jsonb_array_elements(p_items) x;

  return jsonb_build_object('ok', true, 'order_id', v_order_id);
exception
  when exclusion_violation then
    return jsonb_build_object('ok', false, 'busy', to_jsonb('{}'::int[]), 'race', true);
end;
$$;


ALTER FUNCTION "public"."create_order_with_bookings"("p_client_id" bigint, "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."documents_cron_call"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_url    text;
  v_secret text;
  v_has    boolean;
begin
  -- дёргаем только если есть что сообщить
  select exists (
    select 1 from v_specialist_documents
    where expiry_status in ('expiring', 'expired')
  ) into v_has;
  if not v_has then
    return;
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'crm_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    raise notice 'documents_cron_call: secrets not found';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/api/cron/documents',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', v_secret),
    body    := '{}'::jsonb
  );
end;
$$;


ALTER FUNCTION "public"."documents_cron_call"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_holds"() RETURNS "void"
    LANGUAGE "sql"
    AS $$
  delete from bookings
  where status = 'hold'
    and hold_expires_at is not null
    and hold_expires_at < now();
$$;


ALTER FUNCTION "public"."expire_holds"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_reschedules"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_min int;
  v_cnt int;
begin
  select expire_pending_minutes into v_min from reschedule_settings where id = 1;
  update bookings
    set rescheduling_started_at = null
  where rescheduling_started_at is not null
    and status = 'new'
    and rescheduling_started_at < now() - (v_min || ' minutes')::interval;
  get diagnostics v_cnt = row_count;
  return v_cnt;
end;
$$;


ALTER FUNCTION "public"."expire_reschedules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_reschedule"("p_old_booking" "uuid", "p_new_booking" "uuid", "p_client" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_old bookings%rowtype;
  v_new bookings%rowtype;
begin
  select * into v_old from bookings where id = p_old_booking for update;
  select * into v_new from bookings where id = p_new_booking;

  if not found or v_old.client_id <> p_client then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_old.rescheduling_started_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_in_reschedule');
  end if;
  if v_old.status <> 'new' then
    return jsonb_build_object('ok', false, 'error', 'wrong_status');
  end if;

  update bookings
    set status = 'cancelled',
        rescheduled_to = p_new_booking,
        rescheduling_started_at = null
  where id = v_old.id;

  update bookings
    set rescheduled_from = p_old_booking,
        reschedule_count = coalesce(v_old.reschedule_count, 0) + 1,
        orig_starts_at   = coalesce(v_old.orig_starts_at, v_old.starts_at)
  where id = p_new_booking;

  insert into booking_reschedules (client_id, from_booking, to_booking, from_starts_at, to_starts_at)
    values (p_client, p_old_booking, p_new_booking, v_old.starts_at, v_new.starts_at);

  return jsonb_build_object('ok', true);
end;
$$;


ALTER FUNCTION "public"."finalize_reschedule"("p_old_booking" "uuid", "p_new_booking" "uuid", "p_client" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_available_slots"("p_specialist_id" "uuid", "p_service_id" "uuid", "p_date" "date", "p_tz" "text" DEFAULT 'Europe/Moscow'::"text", "p_step_min" integer DEFAULT NULL::integer, "p_busy_ranges" "tstzrange"[] DEFAULT NULL::"tstzrange"[]) RETURNS TABLE("slot_start" timestamp with time zone, "slot_end" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_duration    int;
  v_step        int;
  v_day         schedule_days%rowtype;
  v_win_start   timestamptz;
  v_win_end     timestamptz;
  v_break_start timestamptz;
  v_break_end   timestamptz;
  v_cursor      timestamptz;
  v_cand_end    timestamptz;
  v_range       tstzrange;
  v_hits_cart   boolean;
begin
  select duration_min into v_duration from services where id = p_service_id;
  if v_duration is null then
    return;
  end if;

  v_step := coalesce(p_step_min, v_duration);

  -- рабочий день должен быть явно задан
  select * into v_day
  from schedule_days
  where specialist_id = p_specialist_id and date = p_date;

  if not found or v_day.day_type <> 'work' then
    return;   -- день не задан (серый) или выходной (красный)
  end if;
  if v_day.start_time is null or v_day.end_time is null then
    return;
  end if;

  v_win_start := (p_date + v_day.start_time) at time zone p_tz;
  v_win_end   := (p_date + v_day.end_time)   at time zone p_tz;

  if v_day.break_start is not null and v_day.break_end is not null then
    v_break_start := (p_date + v_day.break_start) at time zone p_tz;
    v_break_end   := (p_date + v_day.break_end)   at time zone p_tz;
  end if;

  v_cursor := v_win_start;

  while v_cursor + make_interval(mins => v_duration) <= v_win_end loop
    v_cand_end := v_cursor + make_interval(mins => v_duration);

    -- прошедшее время
    if v_cursor <= now() then
      v_cursor := v_cursor + make_interval(mins => v_step);
      continue;
    end if;

    -- перерыв
    if v_break_start is not null
       and v_cursor < v_break_end and v_cand_end > v_break_start then
      v_cursor := v_cursor + make_interval(mins => v_step);
      continue;
    end if;

    -- занято другими бронями (кроме тех, что в процессе переноса)
    if exists (
      select 1 from bookings b
      where b.specialist_id = p_specialist_id
        and b.status in ('hold','new','confirmed','completed','paid')
        and b.rescheduling_started_at is null
        and tstzrange(b.starts_at, b.ends_at) && tstzrange(v_cursor, v_cand_end)
    ) then
      v_cursor := v_cursor + make_interval(mins => v_step);
      continue;
    end if;

    -- занято позициями в корзине клиента
    if p_busy_ranges is not null then
      v_hits_cart := false;
      v_range := tstzrange(v_cursor, v_cand_end);
      for i in 1 .. coalesce(array_length(p_busy_ranges, 1), 0) loop
        if p_busy_ranges[i] && v_range then
          v_hits_cart := true;
          exit;
        end if;
      end loop;
      if v_hits_cart then
        v_cursor := v_cursor + make_interval(mins => v_step);
        continue;
      end if;
    end if;

    slot_start := v_cursor;
    slot_end   := v_cand_end;
    return next;

    v_cursor := v_cursor + make_interval(mins => v_step);
  end loop;

  return;
end;
$$;


ALTER FUNCTION "public"."get_available_slots"("p_specialist_id" "uuid", "p_service_id" "uuid", "p_date" "date", "p_tz" "text", "p_step_min" integer, "p_busy_ranges" "tstzrange"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_day_slots"("p_specialist_id" "uuid", "p_service_id" "uuid", "p_date" "date", "p_tz" "text" DEFAULT 'Europe/Moscow'::"text") RETURNS TABLE("slot_start" timestamp with time zone, "slot_end" timestamp with time zone, "is_free" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_duration    int;
  v_step        int;
  v_day         schedule_days%rowtype;
  v_win_start   timestamptz;
  v_win_end     timestamptz;
  v_break_start timestamptz;
  v_break_end   timestamptz;
  v_cursor      timestamptz;
  v_cand_end    timestamptz;
  v_busy        boolean;
begin
  select duration_min into v_duration from services where id = p_service_id;
  if v_duration is null then
    return;
  end if;

  v_step := v_duration;

  select * into v_day
  from schedule_days
  where specialist_id = p_specialist_id and date = p_date;

  if not found or v_day.day_type <> 'work' then
    return;
  end if;
  if v_day.start_time is null or v_day.end_time is null then
    return;
  end if;

  v_win_start := (p_date + v_day.start_time) at time zone p_tz;
  v_win_end   := (p_date + v_day.end_time)   at time zone p_tz;

  if v_day.break_start is not null and v_day.break_end is not null then
    v_break_start := (p_date + v_day.break_start) at time zone p_tz;
    v_break_end   := (p_date + v_day.break_end)   at time zone p_tz;
  end if;

  v_cursor := v_win_start;

  while v_cursor + make_interval(mins => v_duration) <= v_win_end loop
    v_cand_end := v_cursor + make_interval(mins => v_duration);

    -- прошедшее время не показываем
    if v_cursor <= now() then
      v_cursor := v_cursor + make_interval(mins => v_step);
      continue;
    end if;

    -- перерыв не показываем: в очередь на него не встать
    if v_break_start is not null
       and v_cursor < v_break_end and v_cand_end > v_break_start then
      v_cursor := v_cursor + make_interval(mins => v_step);
      continue;
    end if;

    -- занято другими бронями?
    select exists (
      select 1 from bookings b
      where b.specialist_id = p_specialist_id
        and b.status in ('hold','new','confirmed','completed','paid')
        and b.rescheduling_started_at is null
        and tstzrange(b.starts_at, b.ends_at) && tstzrange(v_cursor, v_cand_end)
    ) into v_busy;

    slot_start := v_cursor;
    slot_end   := v_cand_end;
    is_free    := not v_busy;
    return next;

    v_cursor := v_cursor + make_interval(mins => v_step);
  end loop;

  return;
end;
$$;


ALTER FUNCTION "public"."get_day_slots"("p_specialist_id" "uuid", "p_service_id" "uuid", "p_date" "date", "p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_certificates_for_sale"("p_sale" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_s      product_sales%rowtype;
  v_p      products%rowtype;
  v_code   text;
  v_id     uuid;
  v_exp    date;
  v_codes  jsonb := '[]'::jsonb;
  i        int;
begin
  select * into v_s from product_sales where id = p_sale;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'sale_not_found');
  end if;

  select * into v_p from products where id = v_s.product_id;
  if not found or v_p.kind <> 'certificate' then
    -- обычный товар — сертификаты не нужны, это не ошибка
    return jsonb_build_object('ok', true, 'codes', '[]'::jsonb);
  end if;

  -- уже выдавали? не дублируем
  if exists (
    select 1 from certificates
    where note = 'sale:' || p_sale::text
  ) then
    select coalesce(jsonb_agg(jsonb_build_object(
             'code', code, 'amount', amount, 'expires_at', expires_at
           )), '[]'::jsonb)
      into v_codes
    from certificates
    where note = 'sale:' || p_sale::text;

    return jsonb_build_object('ok', true, 'codes', v_codes, 'already', true);
  end if;

  v_exp := case
    when v_p.validity_days is not null
    then (now() + make_interval(days => v_p.validity_days))::date
    else null
  end;

  -- сколько купил — столько и выдаём
  for i in 1 .. v_s.qty::int loop
    -- код вида BS-XXXX-XXXX
    loop
      v_code := 'BS-' ||
        upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-' ||
        upper(substr(md5(gen_random_uuid()::text), 1, 4));
      exit when not exists (select 1 from certificates where code = v_code);
    end loop;

    insert into certificates (code, amount, balance, status, expires_at, note)
    values (
      v_code,
      v_p.face_value,
      v_p.face_value,
      'issued',           -- ещё не активирован: активирует тот, кто будет тратить
      v_exp,
      'sale:' || p_sale::text
    )
    returning id into v_id;

    v_codes := v_codes || jsonb_build_object(
      'code',       v_code,
      'amount',     v_p.face_value,
      'expires_at', v_exp
    );
  end loop;

  return jsonb_build_object('ok', true, 'codes', v_codes);
end;
$$;


ALTER FUNCTION "public"."issue_certificates_for_sale"("p_sale" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_waitlist"("p_client" bigint, "p_service" "uuid", "p_specialist" "uuid", "p_kind" "text", "p_date" "date", "p_slot" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_max     int;
  v_active  int;
  v_free    boolean;
  v_id      uuid;
begin
  if p_kind not in ('slot','day') then
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;
  if p_kind = 'slot' and p_slot is null then
    return jsonb_build_object('ok', false, 'error', 'slot_required');
  end if;

  -- в прошлое не ждём
  if p_date < (now() at time zone 'Europe/Moscow')::date then
    return jsonb_build_object('ok', false, 'error', 'past_date');
  end if;
  if p_kind = 'slot' and p_slot <= now() then
    return jsonb_build_object('ok', false, 'error', 'past_slot');
  end if;

  -- мастер должен оказывать эту услугу
  if not exists (
    select 1 from specialist_services
    where specialist_id = p_specialist and service_id = p_service
  ) then
    return jsonb_build_object('ok', false, 'error', 'service_not_offered');
  end if;

  -- лимит активных ожиданий
  select max_active into v_max from waitlist_settings where id = 1;

  select count(*) into v_active
  from waitlist
  where client_id = p_client and status in ('waiting','offered');

  if v_active >= coalesce(v_max, 3) then
    return jsonb_build_object('ok', false, 'error', 'limit_reached', 'limit', v_max);
  end if;

  -- если слот на самом деле свободен — очередь не нужна, пусть записывается
  if p_kind = 'slot' then
    select exists (
      select 1 from get_available_slots(p_specialist, p_service, p_date)
      where slot_start = p_slot
    ) into v_free;

    if v_free then
      return jsonb_build_object('ok', false, 'error', 'slot_is_free');
    end if;
  end if;

  insert into waitlist (client_id, service_id, specialist_id, kind, target_date, slot_start)
  values (p_client, p_service, p_specialist, p_kind, p_date, p_slot)
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'already_waiting');
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;


ALTER FUNCTION "public"."join_waitlist"("p_client" bigint, "p_service" "uuid", "p_specialist" "uuid", "p_kind" "text", "p_date" "date", "p_slot" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keepalive_cleanup"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from bookings where is_synthetic and created_at < now() - interval '24 hours';
  delete from orders   where is_synthetic and created_at < now() - interval '24 hours';
end;
$$;


ALTER FUNCTION "public"."keepalive_cleanup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keepalive_make_orders"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_client  bigint      := 113577667;
  v_spec    uuid        := '1ae4ec83-0a50-44ce-a01e-b86f48549aeb';
  v_service uuid        := '812901d7-a316-4bb5-b2e7-8db9bebf0ed4';
  v_price   numeric     := 1500;
  -- базовое время привязано к часу запуска → два дневных запуска не совпадут
  v_base    timestamptz := date_trunc('hour', now()) + interval '100 days';
  v_order   uuid;
  v_start   timestamptz;
  i         int;
begin
  for i in 0..2 loop
    -- разносим 3 брони внутри запуска (длительность 10 мин, шаг 20 мин)
    v_start := v_base + (i * interval '1 day') + (i * interval '20 minutes');
    begin
      insert into orders (client_id, subtotal, discount_total, total, is_synthetic)
      values (v_client, v_price, 0, v_price, true)
      returning id into v_order;

      insert into bookings (
        order_id, client_id, service_id, specialist_id,
        starts_at, ends_at, status,
        full_price, discount_amount, final_price, price_snapshot,
        is_gift, is_synthetic
      )
      values (
        v_order, v_client, v_service, v_spec,
        v_start, v_start + interval '10 minutes', 'new',
        v_price, 0, v_price, v_price,
        false, true
      );
    exception when others then
      -- любая коллизия (занятый слот и т.п.) — пропускаем, подтранзакция откатится
      null;
    end;
  end loop;
end;
$$;


ALTER FUNCTION "public"."keepalive_make_orders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keepalive_prune"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  delete from bookings b
  where b.is_synthetic = true
    and b.id not in (
      select id from bookings
      where is_synthetic = true
      order by created_at desc
      limit 3
    );
$$;


ALTER FUNCTION "public"."keepalive_prune"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leave_waitlist"("p_id" "uuid", "p_client" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_upd int;
begin
  update waitlist
    set status = 'cancelled', updated_at = now()
  where id = p_id
    and client_id = p_client
    and status in ('waiting','offered');

  get diagnostics v_upd = row_count;

  if v_upd = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;


ALTER FUNCTION "public"."leave_waitlist"("p_id" "uuid", "p_client" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_specialist_by_code"("p_telegram" bigint, "p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_spec specialists%rowtype;
begin
  select * into v_spec from specialists where telegram_id = p_telegram;
  if found then
    return jsonb_build_object('ok', true, 'specialist_id', v_spec.id, 'full_name', v_spec.full_name);
  end if;

  select * into v_spec
  from specialists
  where upper(link_code) = upper(trim(p_code))
    and telegram_id is null
    and (link_code_expires_at is null or link_code_expires_at > now())
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'bad_code');
  end if;

  update specialists
    set telegram_id = p_telegram,
        link_code = null,
        link_code_expires_at = null
  where id = v_spec.id;

  return jsonb_build_object('ok', true, 'specialist_id', v_spec.id, 'full_name', v_spec.full_name);
end;
$$;


ALTER FUNCTION "public"."link_specialist_by_code"("p_telegram" bigint, "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_specialist_by_phone"("p_telegram" bigint, "p_phone" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_spec specialists%rowtype;
  v_norm text;
begin
  v_norm := normalize_phone(p_phone);
  if v_norm is null or length(v_norm) < 10 then
    return jsonb_build_object('ok', false, 'error', 'bad_phone');
  end if;

  -- уже привязан?
  select * into v_spec from specialists where telegram_id = p_telegram;
  if found then
    return jsonb_build_object('ok', true, 'specialist_id', v_spec.id, 'full_name', v_spec.full_name);
  end if;

  select * into v_spec
  from specialists
  where normalize_phone(phone) = v_norm
    and telegram_id is null
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update specialists set telegram_id = p_telegram where id = v_spec.id;
  return jsonb_build_object('ok', true, 'specialist_id', v_spec.id, 'full_name', v_spec.full_name);
end;
$$;


ALTER FUNCTION "public"."link_specialist_by_phone"("p_telegram" bigint, "p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."loyalty_accrue_on_paid"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_pct    numeric;
  v_base   numeric;
  v_points numeric;
begin
  if NEW.status = 'paid'
     and (OLD.status is distinct from 'paid')
     and coalesce(NEW.is_synthetic, false) = false
     and NEW.client_id is not null then

    select cashback_percent into v_pct from loyalty_settings where id = 1;
    v_base   := coalesce(nullif(NEW.final_price, 0), NEW.price_snapshot, 0);
    v_points := round(coalesce(v_base, 0) * coalesce(v_pct, 0) / 100.0);

    if v_points > 0
       and not exists (
         select 1 from loyalty_transactions t
         where t.booking_id = NEW.id and t.kind = 'accrual'
       ) then

      insert into loyalty_transactions (client_id, order_id, booking_id, kind, points, note)
        values (NEW.client_id, NEW.order_id, NEW.id, 'accrual', v_points, 'Кешбэк за визит');

      -- баланс клиента = проекция истории
      insert into loyalty_accounts (client_id, balance, total_earned, total_spent, updated_at)
      select NEW.client_id,
             coalesce(sum(points), 0),
             coalesce(sum(points) filter (where points > 0), 0),
             coalesce(-sum(points) filter (where points < 0), 0),
             now()
      from loyalty_transactions where client_id = NEW.client_id
      on conflict (client_id) do update
        set balance      = excluded.balance,
            total_earned = excluded.total_earned,
            total_spent  = excluded.total_spent,
            updated_at   = now();
    end if;
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."loyalty_accrue_on_paid"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."loyalty_on_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_pct      numeric;
  v_pval     numeric;
  v_pts_bal  numeric;
  v_gross    numeric;
  v_redeem   numeric;   -- баллы (шт.)
  v_after_pt numeric;   -- остаток после баллов (₽)
  v_cert     numeric;   -- сертификат (₽)
  v_cert_bal numeric;   -- остаток конкретного сертификата
  v_cert_exp date;
  v_cert_st  text;
  v_money    numeric;
  v_cashbk   numeric;
begin
  if coalesce(NEW.is_synthetic, false) = true or NEW.client_id is null then
    return NEW;
  end if;

  select cashback_percent, point_value into v_pct, v_pval from loyalty_settings where id = 1;
  v_pval := coalesce(v_pval, 1);

  -- ---- ПЕРЕХОД В 'paid' ----
  if NEW.status = 'paid' and (OLD.status is distinct from 'paid') then
    if exists (select 1 from loyalty_transactions where booking_id = NEW.id)
       or exists (select 1 from certificate_transactions where booking_id = NEW.id) then
      return NEW;
    end if;

    v_gross := coalesce(nullif(NEW.final_price, 0), NEW.price_snapshot, 0);

    -- 1) баллы
    select coalesce(balance, 0) into v_pts_bal from loyalty_accounts where client_id = NEW.client_id;
    v_pts_bal := coalesce(v_pts_bal, 0);
    v_redeem := least(coalesce(NEW.points_to_redeem, 0), v_pts_bal);
    if v_redeem < 0 then v_redeem := 0; end if;

    if v_redeem > 0 then
      insert into loyalty_transactions (client_id, order_id, booking_id, kind, points, note)
        values (NEW.client_id, NEW.order_id, NEW.id, 'redemption', -v_redeem, 'Оплата баллами');
    end if;

    v_after_pt := greatest(0, v_gross - v_redeem * v_pval);

    -- 2) сертификат — только выбранный (cert_id), в пределах его остатка/срока/статуса
    v_cert := 0;
    if NEW.cert_id is not null and coalesce(NEW.cert_to_redeem, 0) > 0 then
      select balance, expires_at, status into v_cert_bal, v_cert_exp, v_cert_st
      from certificates
      where id = NEW.cert_id and activated_by = NEW.client_id
      for update;

      if found
         and v_cert_st in ('active')
         and (v_cert_exp is null or v_cert_exp >= current_date) then
        v_cert := least(coalesce(NEW.cert_to_redeem, 0), coalesce(v_cert_bal, 0), v_after_pt);
        if v_cert < 0 then v_cert := 0; end if;

        if v_cert > 0 then
          update certificates
            set balance = balance - v_cert,
                status  = case when balance - v_cert <= 0 then 'used' else status end
          where id = NEW.cert_id;

          insert into certificate_transactions (client_id, certificate_id, order_id, booking_id, kind, amount, note)
            values (NEW.client_id, NEW.cert_id, NEW.order_id, NEW.id, 'redemption', -v_cert, 'Оплата сертификатом');
        end if;
      end if;
    end if;

    -- 3) кешбэк с денежной части
    v_money  := greatest(0, v_after_pt - v_cert);
    v_cashbk := round(v_money * coalesce(v_pct, 0) / 100.0);
    if v_cashbk > 0 then
      insert into loyalty_transactions (client_id, order_id, booking_id, kind, points, note)
        values (NEW.client_id, NEW.order_id, NEW.id, 'accrual', v_cashbk, 'Кешбэк за визит');
    end if;

    if v_redeem > 0 or v_cashbk > 0 then perform loyalty_recalc(NEW.client_id); end if;
    if v_cert > 0 then perform certificate_recalc(NEW.client_id); end if;

  -- ---- УХОД ИЗ 'paid' (сторно) ----
  elsif OLD.status = 'paid' and (NEW.status is distinct from 'paid') then
    insert into loyalty_transactions (client_id, order_id, booking_id, kind, points, note)
    select t.client_id, t.order_id, t.booking_id, 'adjustment', -t.points,
           case when t.points < 0 then 'Возврат баллов (отмена оплаты)'
                else 'Снятие кешбэка (отмена оплаты)' end
    from loyalty_transactions t
    where t.booking_id = NEW.id and t.kind in ('accrual', 'redemption');

    -- возврат на конкретные сертификаты (по истории списаний этой брони)
    update certificates c
      set balance = c.balance + (-t.amount),
          status  = case when c.status = 'used' then 'active' else c.status end
    from certificate_transactions t
    where t.booking_id = NEW.id and t.kind = 'redemption' and t.certificate_id = c.id;

    insert into certificate_transactions (client_id, order_id, booking_id, certificate_id, kind, amount, note)
    select t.client_id, t.order_id, t.booking_id, t.certificate_id, 'adjustment', -t.amount,
           'Возврат на сертификат (отмена оплаты)'
    from certificate_transactions t
    where t.booking_id = NEW.id and t.kind = 'redemption';

    perform loyalty_recalc(NEW.client_id);
    perform certificate_recalc(NEW.client_id);
  end if;

  return NEW;
end;
$$;


ALTER FUNCTION "public"."loyalty_on_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."loyalty_recalc"("p_client" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into loyalty_accounts (client_id, balance, total_earned, total_spent, updated_at)
  select p_client,
         coalesce(sum(points), 0),
         coalesce(sum(points) filter (where points > 0), 0),
         coalesce(-sum(points) filter (where points < 0), 0),
         now()
  from loyalty_transactions
  where client_id = p_client
  on conflict (client_id) do update
    set balance      = excluded.balance,
        total_earned = excluded.total_earned,
        total_spent  = excluded.total_spent,
        updated_at   = now();
end;
$$;


ALTER FUNCTION "public"."loyalty_recalc"("p_client" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_certificates"("p_client" bigint) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id',         c.id,
      'code',       c.code,
      'amount',     c.amount,
      'balance',    c.balance,
      'status',     c.status,
      'expires_at', c.expires_at,
      'created_at', c.created_at
    ) as x
    from certificates c
    where c.activated_by = p_client
  ) t;
$$;


ALTER FUNCTION "public"."my_certificates"("p_client" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_waitlist"("p_client" bigint) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(jsonb_agg(x order by x->>'created_at'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id',               w.id,
      'kind',             w.kind,
      'status',           w.status,
      'target_date',      w.target_date,
      'slot_start',       w.slot_start,
      'offered_slot',     w.offered_slot,
      'offer_expires_at', w.offer_expires_at,
      'service_id',       w.service_id,
      'service_name',     s.name,
      'specialist_id',    w.specialist_id,
      'specialist_name',  sp.full_name,
      'created_at',       w.created_at
    ) as x
    from waitlist w
    join services s     on s.id  = w.service_id
    join specialists sp on sp.id = w.specialist_id
    where w.client_id = p_client
      and w.status in ('waiting','offered')
  ) t;
$$;


ALTER FUNCTION "public"."my_waitlist"("p_client" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_phone"("p" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  d text;
begin
  if p is null then
    return null;
  end if;

  d := regexp_replace(p, '\D', '', 'g');

  if d = '' then
    return null;
  end if;

  -- российская «восьмёрка»: 8 999 123-45-67 → 79991234567
  if length(d) = 11 and left(d, 1) = '8' then
    return '7' || right(d, 10);
  end if;

  -- номер без кода страны (legacy): 9991234567 → 79991234567
  if length(d) = 10 then
    return '7' || d;
  end if;

  -- всё остальное уже с кодом страны (7…, 375…, 380…, 998… и т.д.)
  return d;
end;
$$;


ALTER FUNCTION "public"."normalize_phone"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payout_detail"("p_specialist" "uuid", "p_from" "date", "p_to" "date") RETURNS TABLE("booking_id" "uuid", "starts_at" timestamp with time zone, "service_name" "text", "client_name" "text", "amount" numeric, "payout_type" "text", "payout_value" numeric, "payout" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    b.id,
    b.starts_at,
    sv.name,
    coalesce(nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), ''), '@' || coalesce(u.username,'—')),
    coalesce(b.final_price, b.price_snapshot, 0)::numeric as amount,
    coalesce(ssp.payout_type,  s.payout_type)             as ptype,
    coalesce(ssp.payout_value, s.payout_value)            as pvalue,
    case coalesce(ssp.payout_type, s.payout_type)
      when 'percent' then round(coalesce(b.final_price, b.price_snapshot, 0)::numeric * coalesce(ssp.payout_value, s.payout_value) / 100.0, 2)
      when 'fixed'   then coalesce(ssp.payout_value, s.payout_value)
      else 0
    end                                                   as payout
  from bookings b
  join specialists s on s.id = b.specialist_id
  join services   sv on sv.id = b.service_id
  left join users u on u.telegram_id = b.client_id
  left join specialist_service_payouts ssp
    on ssp.specialist_id = b.specialist_id and ssp.service_id = b.service_id
  where b.specialist_id = p_specialist
    and b.status = 'paid'
    and coalesce(b.is_synthetic, false) = false
    and b.starts_at >= p_from::timestamptz
    and b.starts_at <  (p_to + 1)::timestamptz
  order by b.starts_at;
$$;


ALTER FUNCTION "public"."payout_detail"("p_specialist" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payout_report"("p_from" "date", "p_to" "date") RETURNS TABLE("specialist_id" "uuid", "full_name" "text", "services_count" integer, "revenue" numeric, "services_payout" numeric, "shifts" integer, "shifts_payout" numeric, "salary_payout" numeric, "products_count" numeric, "products_revenue" numeric, "products_payout" numeric, "total_payout" numeric, "salon_share" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_days_in_period int;
  v_month_days     int;
begin
  v_days_in_period := (p_to - p_from) + 1;
  v_month_days := extract(day from (date_trunc('month', p_from) + interval '1 month - 1 day'))::int;

  return query
  with paid as (
    select
      b.specialist_id,
      b.service_id,
      coalesce(b.final_price, b.price_snapshot, 0)::numeric as amount
    from bookings b
    where b.status = 'paid'
      and coalesce(b.is_synthetic, false) = false
      and b.starts_at >= p_from::timestamptz
      and b.starts_at <  (p_to + 1)::timestamptz
  ),
  per_booking as (
    select
      p.specialist_id,
      p.amount,
      coalesce(ssp.payout_type,  s.payout_type)  as ptype,
      coalesce(ssp.payout_value, s.payout_value) as pvalue
    from paid p
    join specialists s on s.id = p.specialist_id
    left join specialist_service_payouts ssp
      on ssp.specialist_id = p.specialist_id and ssp.service_id = p.service_id
  ),
  svc as (
    select
      pb.specialist_id,
      count(*)::int  as cnt,
      sum(pb.amount) as revenue,
      sum(
        case pb.ptype
          when 'percent' then round(pb.amount * pb.pvalue / 100.0, 2)
          when 'fixed'   then pb.pvalue
          else 0
        end
      )              as payout
    from per_booking pb
    group by pb.specialist_id
  ),
  prod as (
    select
      ps.specialist_id,
      sum(ps.qty)                                          as cnt,
      sum(ps.total)                                        as revenue,
      sum(round(ps.total * sp.product_percent / 100.0, 2)) as payout
    from product_sales ps
    join specialists sp on sp.id = ps.specialist_id
    where ps.status = 'paid'
      and ps.specialist_id is not null
      and coalesce(ps.paid_at, ps.created_at) >= p_from::timestamptz
      and coalesce(ps.paid_at, ps.created_at) <  (p_to + 1)::timestamptz
    group by ps.specialist_id
  ),
  base as (
    select
      s.id                                              as specialist_id,
      s.full_name,
      coalesce(svc.cnt, 0)                              as services_count,
      coalesce(svc.revenue, 0)::numeric                 as revenue,
      coalesce(svc.payout, 0)::numeric                  as services_payout,
      specialist_shifts_in_period(s.id, p_from, p_to)   as shifts,
      s.shift_rate,
      s.salary_month,
      s.salary_mode,
      coalesce(prod.cnt, 0)::numeric                    as products_count,
      coalesce(prod.revenue, 0)::numeric                as products_revenue,
      coalesce(prod.payout, 0)::numeric                 as products_payout
    from specialists s
    left join svc  on svc.specialist_id  = s.id
    left join prod on prod.specialist_id = s.id
  ),
  calc as (
    select
      b.*,
      (b.shifts * b.shift_rate)::numeric                as shifts_payout,
      case b.salary_mode
        when 'full_month' then
          case
            when p_from = date_trunc('month', p_from)::date
             and p_to   = (date_trunc('month', p_from) + interval '1 month - 1 day')::date
            then b.salary_month
            else 0
          end
        when 'by_days' then
          round(b.salary_month * v_days_in_period::numeric / nullif(v_month_days, 0), 2)
        when 'by_shifts' then
          case
            when specialist_shifts_in_period(
                   b.specialist_id,
                   date_trunc('month', p_from)::date,
                   (date_trunc('month', p_from) + interval '1 month - 1 day')::date
                 ) > 0
            then round(
              b.salary_month * b.shifts::numeric /
              specialist_shifts_in_period(
                b.specialist_id,
                date_trunc('month', p_from)::date,
                (date_trunc('month', p_from) + interval '1 month - 1 day')::date
              )::numeric, 2)
            else 0
          end
        else 0
      end                                               as salary_payout
    from base b
  )
  select
    c.specialist_id,
    c.full_name,
    c.services_count,
    c.revenue,
    c.services_payout,
    c.shifts,
    c.shifts_payout,
    c.salary_payout,
    c.products_count,
    c.products_revenue,
    c.products_payout,
    (c.services_payout + c.shifts_payout + c.salary_payout + c.products_payout) as total_payout,
    ((c.revenue + c.products_revenue)
      - (c.services_payout + c.shifts_payout + c.salary_payout + c.products_payout)) as salon_share
  from calc c
  order by
    (c.services_payout + c.shifts_payout + c.salary_payout + c.products_payout) desc,
    c.full_name;
end;
$$;


ALTER FUNCTION "public"."payout_report"("p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."product_sales_detail"("p_specialist" "uuid", "p_from" "date", "p_to" "date") RETURNS TABLE("sale_id" "uuid", "sold_at" timestamp with time zone, "product_name" "text", "client_name" "text", "qty" numeric, "price" numeric, "total" numeric, "payout" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    ps.id,
    coalesce(ps.paid_at, ps.created_at),
    p.name,
    coalesce(
      nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), ''),
      case when u.username is not null then '@' || u.username else '—' end
    ),
    ps.qty,
    ps.price,
    ps.total,
    round(ps.total * sp.product_percent / 100.0, 2)
  from product_sales ps
  join products p     on p.id = ps.product_id
  join specialists sp on sp.id = ps.specialist_id
  left join users u   on u.telegram_id = ps.client_id
  where ps.specialist_id = p_specialist
    and ps.status = 'paid'
    and coalesce(ps.paid_at, ps.created_at) >= p_from::timestamptz
    and coalesce(ps.paid_at, ps.created_at) <  (p_to + 1)::timestamptz
  order by coalesce(ps.paid_at, ps.created_at);
$$;


ALTER FUNCTION "public"."product_sales_detail"("p_specialist" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_specialist_rating"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_sid uuid;
begin
  v_sid := coalesce(new.specialist_id, old.specialist_id);
  update specialists s
  set rating = coalesce((
    select round(avg(specialist_rating)::numeric, 2)
    from reviews
    where specialist_id = v_sid
      and status = 'approved'
      and specialist_rating is not null
  ), 0)
  where s.id = v_sid;
  return null;
end;
$$;


ALTER FUNCTION "public"."recompute_specialist_rating"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_retention_notification"("p_client" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update users set retention_notified_at = null where telegram_id = p_client;
end;
$$;


ALTER FUNCTION "public"."reset_retention_notification"("p_client" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."retention_cron_call"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'crm_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';

  if v_url is null or v_secret is null then
    raise notice 'retention_cron_call: secrets crm_url / cron_secret not found in vault';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/api/cron/retention',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', v_secret),
    body    := '{}'::jsonb
  );
end;
$$;


ALTER FUNCTION "public"."retention_cron_call"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_schedule_days"("p_specialist" "uuid", "p_from" "date", "p_to" "date", "p_days" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_cnt int;
begin
  delete from schedule_days
  where specialist_id = p_specialist
    and date between p_from and p_to;

  insert into schedule_days (specialist_id, date, day_type, start_time, end_time, break_start, break_end)
  select
    p_specialist,
    (e->>'date')::date,
    coalesce(e->>'day_type', 'work'),
    nullif(e->>'start_time','')::time,
    nullif(e->>'end_time','')::time,
    nullif(e->>'break_start','')::time,
    nullif(e->>'break_end','')::time
  from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) e
  where (e->>'date')::date between p_from and p_to;

  get diagnostics v_cnt = row_count;
  return v_cnt;
end;
$$;


ALTER FUNCTION "public"."save_schedule_days"("p_specialist" "uuid", "p_from" "date", "p_to" "date", "p_days" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sell_product"("p_product" "uuid", "p_qty" numeric, "p_client" bigint DEFAULT NULL::bigint, "p_specialist" "uuid" DEFAULT NULL::"uuid", "p_booking" "uuid" DEFAULT NULL::"uuid", "p_status" "text" DEFAULT 'paid'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_p     products%rowtype;
  v_sale  uuid;
  v_total numeric;
begin
  if p_status not in ('reserved','paid') then
    return jsonb_build_object('ok', false, 'error', 'bad_status');
  end if;

  select * into v_p from products where id = p_product for update;

  -- теперь продаём и товары, и сертификаты
  if not found or v_p.kind not in ('sale', 'certificate') then
    return jsonb_build_object('ok', false, 'error', 'product_not_found');
  end if;
  if not v_p.is_active then
    return jsonb_build_object('ok', false, 'error', 'inactive');
  end if;
  if v_p.price is null then
    return jsonb_build_object('ok', false, 'error', 'no_price');
  end if;

  -- склад проверяем только у обычных товаров: сертификаты не кончаются
  if v_p.kind = 'sale' and v_p.stock < p_qty then
    return jsonb_build_object('ok', false, 'error', 'out_of_stock', 'stock', v_p.stock);
  end if;

  -- у сертификата должен быть номинал
  if v_p.kind = 'certificate' and coalesce(v_p.face_value, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_face_value');
  end if;

  v_total := round(p_qty * v_p.price, 2);

  insert into product_sales (
    product_id, client_id, specialist_id, booking_id,
    qty, price, cost, total, status, paid_at
  )
  values (
    p_product, p_client, p_specialist, p_booking,
    p_qty, v_p.price, v_p.avg_cost, v_total, p_status,
    case when p_status = 'paid' then now() end
  )
  returning id into v_sale;

  -- со склада снимаем только настоящий товар
  if v_p.kind = 'sale' then
    perform stock_consume(p_product, p_qty, 'sale', 'sale', v_sale, null);
  end if;

  return jsonb_build_object('ok', true, 'sale_id', v_sale, 'total', v_total);
end;
$$;


ALTER FUNCTION "public"."sell_product"("p_product" "uuid", "p_qty" numeric, "p_client" bigint, "p_specialist" "uuid", "p_booking" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."specialist_bookings"("p_specialist" "uuid", "p_from" "date", "p_to" "date") RETURNS TABLE("id" "uuid", "starts_at" timestamp with time zone, "ends_at" timestamp with time zone, "status" "text", "service_name" "text", "client_name" "text", "client_phone" "text", "price" numeric, "can_mark" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    b.id,
    b.starts_at,
    b.ends_at,
    b.status,
    sv.name,
    coalesce(
      nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), ''),
      case when u.username is not null then '@' || u.username else 'Клиент' end
    ),
    u.phone,
    coalesce(b.final_price, b.price_snapshot, 0)::numeric,
    -- отмечать можно только начавшиеся визиты в активных статусах
    (b.status in ('new','confirmed') and b.starts_at <= now())
  from bookings b
  join services sv on sv.id = b.service_id
  left join users u on u.telegram_id = b.client_id
  where b.specialist_id = p_specialist
    and coalesce(b.is_synthetic, false) = false
    and b.starts_at >= p_from::timestamptz
    and b.starts_at <  (p_to + 1)::timestamptz
  order by b.starts_at;
$$;


ALTER FUNCTION "public"."specialist_bookings"("p_specialist" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."specialist_earnings"("p_specialist" "uuid", "p_from" "date", "p_to" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'services_count',   r.services_count,
    'services_payout',  r.services_payout,
    'shifts',           r.shifts,
    'shifts_payout',    r.shifts_payout,
    'salary_payout',    r.salary_payout,
    'products_count',   r.products_count,
    'products_payout',  r.products_payout,
    'total_payout',     r.total_payout
  )
  into v
  from payout_report(p_from, p_to) r
  where r.specialist_id = p_specialist;

  return coalesce(v, jsonb_build_object(
    'services_count', 0, 'services_payout', 0,
    'shifts', 0, 'shifts_payout', 0,
    'salary_payout', 0,
    'products_count', 0, 'products_payout', 0,
    'total_payout', 0
  ));
end;
$$;


ALTER FUNCTION "public"."specialist_earnings"("p_specialist" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."specialist_mark_booking"("p_telegram" bigint, "p_booking" "uuid", "p_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_spec_id uuid;
  v_b       bookings%rowtype;
begin
  if p_status not in ('completed','no_show') then
    return jsonb_build_object('ok', false, 'error', 'bad_status');
  end if;

  select id into v_spec_id from specialists where telegram_id = p_telegram;
  if v_spec_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  select * into v_b from bookings where id = p_booking for update;
  if not found or v_b.specialist_id <> v_spec_id then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_b.status not in ('new','confirmed') then
    return jsonb_build_object('ok', false, 'error', 'wrong_status');
  end if;
  if v_b.starts_at > now() then
    return jsonb_build_object('ok', false, 'error', 'too_early');
  end if;

  update bookings set status = p_status where id = v_b.id;
  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;


ALTER FUNCTION "public"."specialist_mark_booking"("p_telegram" bigint, "p_booking" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."specialist_shifts_in_period"("p_specialist" "uuid", "p_from" "date", "p_to" "date") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select count(*)::int
  from schedule_days
  where specialist_id = p_specialist
    and date between p_from and p_to
    and day_type = 'work';
$$;


ALTER FUNCTION "public"."specialist_shifts_in_period"("p_specialist" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_reschedule"("p_booking" "uuid", "p_client" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_b    bookings%rowtype;
  v_cfg  reschedule_settings%rowtype;
  v_now  timestamptz := now();
begin
  select * into v_cfg from reschedule_settings where id = 1;
  select * into v_b from bookings where id = p_booking for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_b.client_id is null or v_b.client_id <> p_client then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(v_b.is_synthetic, false) then
    return jsonb_build_object('ok', false, 'error', 'synthetic');
  end if;
  if v_b.status <> 'new' then
    return jsonb_build_object('ok', false, 'error', 'wrong_status');
  end if;
  if v_b.rescheduling_started_at is not null then
    -- уже в процессе — просто возвращаем ok (клиент вернулся к переносу)
    return jsonb_build_object(
      'ok', true,
      'orig_starts_at', coalesce(v_b.orig_starts_at, v_b.starts_at),
      'min_hours_before', v_cfg.min_hours_before,
      'max_forward_days', v_cfg.max_forward_days,
      'expire_pending_minutes', v_cfg.expire_pending_minutes
    );
  end if;
  if extract(epoch from (v_b.starts_at - v_now)) < v_cfg.min_hours_before * 3600 then
    return jsonb_build_object('ok', false, 'error', 'too_late');
  end if;

  update bookings
    set rescheduling_started_at = v_now,
        orig_starts_at = coalesce(orig_starts_at, starts_at)
  where id = v_b.id;

  return jsonb_build_object(
    'ok', true,
    'orig_starts_at', coalesce(v_b.orig_starts_at, v_b.starts_at),
    'min_hours_before', v_cfg.min_hours_before,
    'max_forward_days', v_cfg.max_forward_days,
    'expire_pending_minutes', v_cfg.expire_pending_minutes
  );
end;
$$;


ALTER FUNCTION "public"."start_reschedule"("p_booking" "uuid", "p_client" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stock_adjust"("p_product" "uuid", "p_new_stock" numeric, "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_p    products%rowtype;
  v_diff numeric;
begin
  select * into v_p from products where id = p_product for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'product_not_found');
  end if;

  v_diff := p_new_stock - v_p.stock;
  update products set stock = p_new_stock where id = p_product;

  insert into stock_movements (product_id, kind, qty_base, cost_base, balance_after, note)
  values (p_product, 'adjust', v_diff, v_p.avg_cost, p_new_stock, coalesce(p_note, 'Инвентаризация'));

  return jsonb_build_object('ok', true, 'stock', p_new_stock, 'diff', v_diff);
end;
$$;


ALTER FUNCTION "public"."stock_adjust"("p_product" "uuid", "p_new_stock" numeric, "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stock_consume"("p_product" "uuid", "p_qty" numeric, "p_kind" "text", "p_ref_type" "text" DEFAULT NULL::"text", "p_ref_id" "uuid" DEFAULT NULL::"uuid", "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_p     products%rowtype;
  v_new   numeric;
begin
  if p_kind not in ('sale','consume','writeoff') then
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;

  select * into v_p from products where id = p_product for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'product_not_found');
  end if;

  v_new := v_p.stock - p_qty;

  update products set stock = v_new where id = p_product;

  insert into stock_movements (product_id, kind, qty_base, cost_base, balance_after, ref_type, ref_id, note)
  values (p_product, p_kind, -p_qty, v_p.avg_cost, v_new, p_ref_type, p_ref_id, p_note);

  return jsonb_build_object('ok', true, 'stock', v_new, 'negative', v_new < 0);
end;
$$;


ALTER FUNCTION "public"."stock_consume"("p_product" "uuid", "p_qty" numeric, "p_kind" "text", "p_ref_type" "text", "p_ref_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stock_purchase"("p_product" "uuid", "p_packs" numeric, "p_pack_size" numeric, "p_cost_total" numeric, "p_invoice" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_p       products%rowtype;
  v_qty     numeric;
  v_new_stock numeric;
  v_new_cost  numeric;
begin
  select * into v_p from products where id = p_product for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'product_not_found');
  end if;

  v_qty := p_packs * p_pack_size;
  if v_qty <= 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_qty');
  end if;

  v_new_stock := v_p.stock + v_qty;

  -- средневзвешенная: (старый остаток × старая цена + новая закупка) / новый остаток
  if v_new_stock > 0 then
    v_new_cost := round(
      ((v_p.stock * v_p.avg_cost) + coalesce(p_cost_total, 0)) / v_new_stock,
      4
    );
  else
    v_new_cost := 0;
  end if;

  update products
    set stock = v_new_stock,
        avg_cost = v_new_cost
  where id = p_product;

  insert into stock_movements (product_id, kind, qty_base, cost_base, balance_after, ref_type, ref_id)
  values (p_product, 'purchase', v_qty, v_new_cost, v_new_stock, 'invoice', p_invoice);

  return jsonb_build_object('ok', true, 'stock', v_new_stock, 'avg_cost', v_new_cost);
end;
$$;


ALTER FUNCTION "public"."stock_purchase"("p_product" "uuid", "p_packs" numeric, "p_pack_size" numeric, "p_cost_total" numeric, "p_invoice" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_booking_paid_consume"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- списываем расходники только при переходе в 'paid'
  -- (и только для настоящих записей, не служебных)
  if new.status = 'paid'
     and old.status is distinct from 'paid'
     and coalesce(new.is_synthetic, false) = false
  then
    perform consume_for_booking(new.id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trg_booking_paid_consume"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."waitlist_cron_call"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'crm_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'cron_secret';

  if v_url is null or v_secret is null then
    raise notice 'waitlist_cron_call: нет crm_url или cron_secret в vault';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/api/cron/waitlist',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body    := '{}'::jsonb
  );
end;
$$;


ALTER FUNCTION "public"."waitlist_cron_call"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."waitlist_mark_booked"("p_id" "uuid", "p_client" bigint, "p_booking" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update waitlist
    set status = 'booked', booking_id = p_booking, updated_at = now()
  where id = p_id and client_id = p_client and status = 'offered';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;


ALTER FUNCTION "public"."waitlist_mark_booked"("p_id" "uuid", "p_client" bigint, "p_booking" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."waitlist_scan"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ttl     int;
  v_max_off int;
  v_row     record;
  v_slot    timestamptz;
  v_out     jsonb := '[]'::jsonb;
  v_expired int := 0;
  v_stale   int := 0;
begin
  select offer_ttl_min, max_offers into v_ttl, v_max_off
  from waitlist_settings where id = 1;

  v_ttl     := coalesce(v_ttl, 30);
  v_max_off := coalesce(v_max_off, 3);

  -- 1. Сгоревшие предложения: клиент не успел за отведённое время.
  --    Возвращаем в очередь, но в конец — пусть попробуют другие.
  with burned as (
    update waitlist
      set status = 'waiting',
          offered_slot = null,
          offered_at = null,
          offer_expires_at = null,
          updated_at = now(),
          created_at = now()      -- уходит в хвост очереди
    where status = 'offered'
      and offer_expires_at < now()
      and offers_sent < v_max_off
    returning 1
  )
  select count(*) into v_expired from burned;

  -- тем, кто уже исчерпал попытки, больше не предлагаем
  update waitlist
    set status = 'expired', updated_at = now()
  where status = 'offered'
    and offer_expires_at < now()
    and offers_sent >= v_max_off;

  -- 2. Протухшие: слот или день уже прошли
  with dead as (
    update waitlist
      set status = 'expired', updated_at = now()
    where status in ('waiting','offered')
      and (
        (kind = 'slot' and slot_start < now())
        or (kind = 'day' and target_date < (now() at time zone 'Europe/Moscow')::date)
      )
    returning 1
  )
  select count(*) into v_stale from dead;

  -- 3. Раздаём предложения: по одному активному офферу на слот
  for v_row in
    select w.*
    from waitlist w
    where w.status = 'waiting'
    order by w.created_at
  loop
    -- на этого мастера+услугу+дату уже есть активное предложение? пропускаем
    if exists (
      select 1 from waitlist o
      where o.status = 'offered'
        and o.specialist_id = v_row.specialist_id
        and o.service_id    = v_row.service_id
        and o.target_date   = v_row.target_date
        and (v_row.kind = 'day' or o.offered_slot = v_row.slot_start)
    ) then
      continue;
    end if;

    v_slot := null;

    if v_row.kind = 'slot' then
      -- ждём конкретное время: освободилось ли оно
      select g.slot_start into v_slot
      from get_available_slots(v_row.specialist_id, v_row.service_id, v_row.target_date) g
      where g.slot_start = v_row.slot_start
      limit 1;
    else
      -- ждём любой слот в этот день: берём самый ранний свободный
      select g.slot_start into v_slot
      from get_available_slots(v_row.specialist_id, v_row.service_id, v_row.target_date) g
      where g.slot_start > now()
      order by g.slot_start
      limit 1;
    end if;

    if v_slot is null then
      continue;   -- пока ничего не освободилось
    end if;

    update waitlist
      set status = 'offered',
          offered_slot = v_slot,
          offered_at = now(),
          offer_expires_at = now() + make_interval(mins => v_ttl),
          offers_sent = offers_sent + 1,
          updated_at = now()
    where id = v_row.id;

    v_out := v_out || jsonb_build_object(
      'id',            v_row.id,
      'client_id',     v_row.client_id,
      'slot',          v_slot,
      'expires_at',    now() + make_interval(mins => v_ttl),
      'ttl_min',       v_ttl,
      'service_id',    v_row.service_id,
      'specialist_id', v_row.specialist_id,
      'service_name',    (select name from services where id = v_row.service_id),
      'specialist_name', (select full_name from specialists where id = v_row.specialist_id)
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'offers', v_out,
    'burned', v_expired,
    'stale',  v_stale
  );
end;
$$;


ALTER FUNCTION "public"."waitlist_scan"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."whoami_specialist"("p_telegram" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_spec specialists%rowtype;
begin
  select * into v_spec from specialists where telegram_id = p_telegram;
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'specialist_id', v_spec.id,
    'full_name', v_spec.full_name,
    'photo_url', v_spec.photo_url
  );
end;
$$;


ALTER FUNCTION "public"."whoami_specialist"("p_telegram" bigint) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admins" (
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_reschedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" bigint NOT NULL,
    "from_booking" "uuid" NOT NULL,
    "to_booking" "uuid",
    "from_starts_at" timestamp with time zone NOT NULL,
    "to_starts_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."booking_reschedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" bigint NOT NULL,
    "specialist_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "status" "public"."booking_status" DEFAULT 'hold'::"public"."booking_status" NOT NULL,
    "price_snapshot" numeric(10,2),
    "promo_id" "uuid",
    "client_confirmed_at" timestamp with time zone,
    "hold_expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "order_id" "uuid",
    "full_price" numeric(10,2),
    "discount_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "final_price" numeric(10,2),
    "is_gift" boolean DEFAULT false NOT NULL,
    "reminded_day_at" timestamp with time zone,
    "reminded_3h_at" timestamp with time zone,
    "review_requested_at" timestamp with time zone,
    "is_synthetic" boolean DEFAULT false NOT NULL,
    "points_to_redeem" numeric DEFAULT 0 NOT NULL,
    "cert_to_redeem" numeric DEFAULT 0 NOT NULL,
    "cert_id" "uuid",
    "rescheduling_started_at" timestamp with time zone,
    "reschedule_count" integer DEFAULT 0 NOT NULL,
    "rescheduled_from" "uuid",
    "rescheduled_to" "uuid",
    "orig_starts_at" timestamp with time zone
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."broadcast_recipients" (
    "broadcast_id" "uuid" NOT NULL,
    "client_id" bigint NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error" "text",
    "sent_at" timestamp with time zone,
    CONSTRAINT "broadcast_recipients_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text", 'opted_out'::"text"])))
);


ALTER TABLE "public"."broadcast_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."broadcasts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid",
    "segments" "text"[] NOT NULL,
    "text" "text" NOT NULL,
    "cta_url" "text",
    "status" "text" DEFAULT 'sending'::"text" NOT NULL,
    "total" integer DEFAULT 0 NOT NULL,
    "sent" integer DEFAULT 0 NOT NULL,
    "failed" integer DEFAULT 0 NOT NULL,
    "opted_out" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    CONSTRAINT "broadcasts_status_check" CHECK (("status" = ANY (ARRAY['sending'::"text", 'done'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."broadcasts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_id" "uuid",
    "name" "text" NOT NULL,
    "level" integer DEFAULT 1 NOT NULL,
    "image_url" "text",
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."certificate_accounts" (
    "client_id" bigint NOT NULL,
    "balance" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."certificate_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."certificate_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" bigint NOT NULL,
    "certificate_id" "uuid",
    "order_id" "uuid",
    "booking_id" "uuid",
    "kind" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "certificate_transactions_kind_check" CHECK (("kind" = ANY (ARRAY['activation'::"text", 'redemption'::"text", 'refund'::"text", 'adjustment'::"text"])))
);


ALTER TABLE "public"."certificate_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."certificates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "balance" numeric NOT NULL,
    "status" "text" DEFAULT 'issued'::"text" NOT NULL,
    "activated_by" bigint,
    "activated_at" timestamp with time zone,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" "date",
    CONSTRAINT "certificates_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "certificates_status_check" CHECK (("status" = ANY (ARRAY['issued'::"text", 'active'::"text", 'used'::"text", 'disabled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."certificates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "expiry_warn_days" integer DEFAULT 30 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "notify_chat_id" bigint,
    "stock_notify_chat_id" bigint,
    CONSTRAINT "document_settings_sane" CHECK (("expiry_warn_days" > 0)),
    CONSTRAINT "document_settings_singleton" CHECK (("id" = 1))
);


ALTER TABLE "public"."document_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" bigint NOT NULL,
    "kind" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "favorites_kind_check" CHECK (("kind" = ANY (ARRAY['specialist'::"text", 'service'::"text"])))
);


ALTER TABLE "public"."favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_accounts" (
    "client_id" bigint NOT NULL,
    "balance" numeric DEFAULT 0 NOT NULL,
    "total_earned" numeric DEFAULT 0 NOT NULL,
    "total_spent" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."loyalty_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "cashback_percent" numeric DEFAULT 5 NOT NULL,
    "redeem_max_percent" numeric DEFAULT 50 NOT NULL,
    "point_value" numeric DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "loyalty_settings_singleton" CHECK (("id" = 1))
);


ALTER TABLE "public"."loyalty_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" bigint NOT NULL,
    "order_id" "uuid",
    "booking_id" "uuid",
    "kind" "text" NOT NULL,
    "points" numeric NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_transactions_kind_check" CHECK (("kind" = ANY (ARRAY['accrual'::"text", 'redemption'::"text", 'adjustment'::"text"])))
);


ALTER TABLE "public"."loyalty_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" bigint NOT NULL,
    "subtotal" numeric(10,2) DEFAULT 0 NOT NULL,
    "discount_total" numeric(10,2) DEFAULT 0 NOT NULL,
    "total" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_synthetic" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "client_id" bigint,
    "specialist_id" "uuid",
    "booking_id" "uuid",
    "qty" numeric NOT NULL,
    "price" numeric NOT NULL,
    "cost" numeric DEFAULT 0 NOT NULL,
    "total" numeric NOT NULL,
    "status" "text" DEFAULT 'reserved'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    CONSTRAINT "product_sales_qty_check" CHECK (("qty" > (0)::numeric)),
    CONSTRAINT "product_sales_status_check" CHECK (("status" = ANY (ARRAY['reserved'::"text", 'paid'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."product_sales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" DEFAULT 'sale'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "sku" "text",
    "photo_url" "text",
    "description" "text",
    "base_unit" "text" DEFAULT 'pcs'::"text" NOT NULL,
    "pack_size" numeric DEFAULT 1 NOT NULL,
    "stock" numeric DEFAULT 0 NOT NULL,
    "avg_cost" numeric DEFAULT 0 NOT NULL,
    "price" numeric,
    "low_stock" numeric DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "face_value" numeric,
    "validity_days" integer,
    CONSTRAINT "products_base_unit_check" CHECK (("base_unit" = ANY (ARRAY['pcs'::"text", 'ml'::"text", 'g'::"text"]))),
    CONSTRAINT "products_kind_check" CHECK (("kind" = ANY (ARRAY['sale'::"text", 'supply'::"text", 'certificate'::"text"]))),
    CONSTRAINT "products_pack_size_check" CHECK (("pack_size" > (0)::numeric))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


COMMENT ON COLUMN "public"."products"."face_value" IS 'Номинал сертификата. Цена (price) может быть ниже — это скидка при покупке.';



COMMENT ON COLUMN "public"."products"."validity_days" IS 'Через сколько дней сертификат сгорает. NULL — бессрочный.';



CREATE TABLE IF NOT EXISTS "public"."promotion_triggers" (
    "promotion_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL
);


ALTER TABLE "public"."promotion_triggers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promotions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "banner_url" "text",
    "discount_type" "public"."promo_discount_type",
    "discount_value" numeric(10,2),
    "target_category_id" "uuid",
    "target_service_id" "uuid",
    "valid_from" "date",
    "valid_to" "date",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "text" DEFAULT 'discount'::"text" NOT NULL,
    "gift_service_id" "uuid",
    "gift_discount_percent" integer DEFAULT 100
);


ALTER TABLE "public"."promotions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid",
    "number" "text",
    "invoice_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "note" "text",
    "total" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."purchase_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "packs" numeric NOT NULL,
    "pack_size" numeric NOT NULL,
    "qty_base" numeric NOT NULL,
    "cost_total" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "purchase_items_pack_size_check" CHECK (("pack_size" > (0)::numeric)),
    CONSTRAINT "purchase_items_packs_check" CHECK (("packs" > (0)::numeric))
);


ALTER TABLE "public"."purchase_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reschedule_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "min_hours_before" integer DEFAULT 2 NOT NULL,
    "max_forward_days" integer DEFAULT 30 NOT NULL,
    "expire_pending_minutes" integer DEFAULT 30 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "reschedule_sane" CHECK ((("min_hours_before" >= 0) AND ("max_forward_days" > 0) AND ("expire_pending_minutes" > 0))),
    CONSTRAINT "reschedule_singleton" CHECK (("id" = 1))
);


ALTER TABLE "public"."reschedule_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retention_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "new_days" integer DEFAULT 30 NOT NULL,
    "regular_days" integer DEFAULT 60 NOT NULL,
    "lost_days" integer DEFAULT 120 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "retention_order" CHECK ((("new_days" > 0) AND ("regular_days" > "new_days") AND ("lost_days" > "regular_days"))),
    CONSTRAINT "retention_singleton" CHECK (("id" = 1))
);


ALTER TABLE "public"."retention_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "client_id" bigint NOT NULL,
    "specialist_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "specialist_rating" integer,
    "service_rating" integer,
    "comment" "text",
    "status" "public"."review_status" DEFAULT 'pending'::"public"."review_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_name" "text",
    CONSTRAINT "reviews_service_rating_check" CHECK ((("service_rating" >= 1) AND ("service_rating" <= 5))),
    CONSTRAINT "reviews_specialist_rating_check" CHECK ((("specialist_rating" >= 1) AND ("specialist_rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_days" (
    "specialist_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "day_type" "text" DEFAULT 'work'::"text" NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "break_start" time without time zone,
    "break_end" time without time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "schedule_days_break" CHECK (((("break_start" IS NULL) AND ("break_end" IS NULL)) OR (("break_start" IS NOT NULL) AND ("break_end" IS NOT NULL) AND ("break_end" > "break_start")))),
    CONSTRAINT "schedule_days_day_type_check" CHECK (("day_type" = ANY (ARRAY['work'::"text", 'off'::"text"]))),
    CONSTRAINT "schedule_days_work_times" CHECK ((("day_type" = 'off'::"text") OR (("start_time" IS NOT NULL) AND ("end_time" IS NOT NULL) AND ("end_time" > "start_time"))))
);


ALTER TABLE "public"."schedule_days" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_exceptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "specialist_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "is_working" boolean DEFAULT false NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "break_start" time without time zone,
    "break_end" time without time zone
);


ALTER TABLE "public"."schedule_exceptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_consumables" (
    "service_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "qty_base" numeric NOT NULL,
    CONSTRAINT "service_consumables_qty_base_check" CHECK (("qty_base" > (0)::numeric))
);


ALTER TABLE "public"."service_consumables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "duration_min" integer DEFAULT 60 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_url" "text"
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."specialist_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "specialist_id" "uuid" NOT NULL,
    "doc_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "mime_type" "text",
    "size_bytes" bigint,
    "expires_at" "date",
    "is_public" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "specialist_documents_doc_type_check" CHECK (("doc_type" = ANY (ARRAY['diploma'::"text", 'certificate'::"text", 'license'::"text", 'medical'::"text", 'contract'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."specialist_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."specialist_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "specialist_id" "uuid" NOT NULL,
    "weekday" integer NOT NULL,
    "is_working" boolean DEFAULT true NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "break_start" time without time zone,
    "break_end" time without time zone,
    CONSTRAINT "specialist_schedules_weekday_check" CHECK ((("weekday" >= 0) AND ("weekday" <= 6)))
);


ALTER TABLE "public"."specialist_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."specialist_service_payouts" (
    "specialist_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "payout_type" "text" NOT NULL,
    "payout_value" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "specialist_service_payouts_payout_type_check" CHECK (("payout_type" = ANY (ARRAY['percent'::"text", 'fixed'::"text"])))
);


ALTER TABLE "public"."specialist_service_payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."specialist_services" (
    "specialist_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "price" numeric(10,2) NOT NULL
);


ALTER TABLE "public"."specialist_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."specialist_works" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "specialist_id" "uuid" NOT NULL,
    "image_url" "text" NOT NULL,
    "caption" "text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."specialist_works" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."specialists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "photo_url" "text",
    "bio" "text",
    "experience_years" integer DEFAULT 0,
    "rating" numeric(3,2) DEFAULT 0,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payout_type" "text" DEFAULT 'percent'::"text" NOT NULL,
    "payout_value" numeric DEFAULT 0 NOT NULL,
    "salary_month" numeric DEFAULT 0 NOT NULL,
    "salary_mode" "text" DEFAULT 'by_days'::"text" NOT NULL,
    "shift_rate" numeric DEFAULT 0 NOT NULL,
    "telegram_id" bigint,
    "phone" "text",
    "link_code" "text",
    "link_code_expires_at" timestamp with time zone,
    "product_percent" numeric DEFAULT 0 NOT NULL,
    CONSTRAINT "specialists_payout_type_check" CHECK (("payout_type" = ANY (ARRAY['percent'::"text", 'fixed'::"text"]))),
    CONSTRAINT "specialists_salary_mode_check" CHECK (("salary_mode" = ANY (ARRAY['full_month'::"text", 'by_days'::"text", 'by_shifts'::"text"])))
);


ALTER TABLE "public"."specialists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "qty_base" numeric NOT NULL,
    "cost_base" numeric DEFAULT 0 NOT NULL,
    "balance_after" numeric NOT NULL,
    "ref_type" "text",
    "ref_id" "uuid",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stock_movements_kind_check" CHECK (("kind" = ANY (ARRAY['purchase'::"text", 'sale'::"text", 'consume'::"text", 'adjust'::"text", 'writeoff'::"text"])))
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "note" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "telegram_id" bigint NOT NULL,
    "username" "text",
    "first_name" "text",
    "last_name" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "retention_notified_at" timestamp with time zone,
    "promo_opt_out" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_client_segments" AS
 WITH "paid" AS (
         SELECT "bookings"."client_id",
            ("count"(*))::integer AS "visits",
            "max"("bookings"."ends_at") AS "last_visit"
           FROM "public"."bookings"
          WHERE (("bookings"."status" = 'paid'::"public"."booking_status") AND (COALESCE("bookings"."is_synthetic", false) = false) AND ("bookings"."client_id" IS NOT NULL))
          GROUP BY "bookings"."client_id"
        ), "base" AS (
         SELECT "u"."telegram_id" AS "client_id",
            "u"."first_name",
            "u"."last_name",
            "u"."username",
            "u"."created_at" AS "registered_at",
            "u"."retention_notified_at",
            COALESCE("p"."visits", 0) AS "visits",
            "p"."last_visit",
                CASE
                    WHEN ("p"."last_visit" IS NULL) THEN NULL::integer
                    ELSE GREATEST(0, (EXTRACT(day FROM ("now"() - "p"."last_visit")))::integer)
                END AS "days_since_last"
           FROM ("public"."users" "u"
             LEFT JOIN "paid" "p" ON (("p"."client_id" = "u"."telegram_id")))
        )
 SELECT "client_id",
    "first_name",
    "last_name",
    "username",
    "registered_at",
    "retention_notified_at",
    "visits",
    "last_visit",
    "days_since_last",
    "public"."client_segment"("client_id") AS "segment"
   FROM "base" "b";


ALTER VIEW "public"."v_client_segments" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_products" AS
 SELECT "id",
    "kind",
    "name",
    "sku",
    "photo_url",
    "description",
    "base_unit",
    "pack_size",
    "stock",
    "avg_cost",
    "price",
    "low_stock",
    "is_active",
    "created_at",
    ("stock" / NULLIF("pack_size", (0)::numeric)) AS "packs_left",
    (("low_stock" > (0)::numeric) AND ("stock" <= "low_stock")) AS "is_low",
        CASE
            WHEN (("kind" = 'sale'::"text") AND ("price" IS NOT NULL) AND ("avg_cost" > (0)::numeric)) THEN "round"(((("price" - "avg_cost") / "avg_cost") * (100)::numeric), 1)
            ELSE NULL::numeric
        END AS "margin_percent",
        CASE
            WHEN (("kind" = 'sale'::"text") AND ("price" IS NOT NULL)) THEN "round"(("price" - "avg_cost"), 2)
            ELSE NULL::numeric
        END AS "profit_per_unit"
   FROM "public"."products" "p";


ALTER VIEW "public"."v_products" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_shop_products" AS
 SELECT "id",
    "kind",
    "name",
    "photo_url",
    "description",
    "price",
    "face_value",
    "validity_days",
    "stock",
        CASE
            WHEN ("kind" = 'certificate'::"text") THEN true
            ELSE ("stock" > (0)::numeric)
        END AS "in_stock"
   FROM "public"."products" "p"
  WHERE ("is_active" AND ("price" IS NOT NULL) AND ("kind" = ANY (ARRAY['sale'::"text", 'certificate'::"text"])) AND (("kind" = 'certificate'::"text") OR ("stock" > (0)::numeric)));


ALTER VIEW "public"."v_shop_products" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_specialist_documents" AS
 SELECT "d"."id",
    "d"."specialist_id",
    "d"."doc_type",
    "d"."title",
    "d"."file_path",
    "d"."mime_type",
    "d"."size_bytes",
    "d"."expires_at",
    "d"."is_public",
    "d"."created_at",
    "s"."full_name" AS "specialist_name",
        CASE
            WHEN ("d"."expires_at" IS NULL) THEN 'none'::"text"
            WHEN ("d"."expires_at" < CURRENT_DATE) THEN 'expired'::"text"
            WHEN ("d"."expires_at" <= (CURRENT_DATE + ((( SELECT "document_settings"."expiry_warn_days"
               FROM "public"."document_settings"
              WHERE ("document_settings"."id" = 1)) || ' days'::"text"))::interval)) THEN 'expiring'::"text"
            ELSE 'valid'::"text"
        END AS "expiry_status",
        CASE
            WHEN ("d"."expires_at" IS NULL) THEN NULL::integer
            ELSE ("d"."expires_at" - CURRENT_DATE)
        END AS "days_left"
   FROM ("public"."specialist_documents" "d"
     JOIN "public"."specialists" "s" ON (("s"."id" = "d"."specialist_id")));


ALTER VIEW "public"."v_specialist_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waitlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" bigint NOT NULL,
    "service_id" "uuid" NOT NULL,
    "specialist_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "target_date" "date" NOT NULL,
    "slot_start" timestamp with time zone,
    "status" "text" DEFAULT 'waiting'::"text" NOT NULL,
    "offered_slot" timestamp with time zone,
    "offered_at" timestamp with time zone,
    "offer_expires_at" timestamp with time zone,
    "offers_sent" integer DEFAULT 0 NOT NULL,
    "booking_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "slot_required_for_kind_slot" CHECK ((("kind" <> 'slot'::"text") OR ("slot_start" IS NOT NULL))),
    CONSTRAINT "waitlist_kind_check" CHECK (("kind" = ANY (ARRAY['slot'::"text", 'day'::"text"]))),
    CONSTRAINT "waitlist_status_check" CHECK (("status" = ANY (ARRAY['waiting'::"text", 'offered'::"text", 'booked'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."waitlist" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_waitlist" AS
 SELECT "w"."id",
    "w"."status",
    "w"."kind",
    "w"."target_date",
    "w"."slot_start",
    "w"."offered_slot",
    "w"."offer_expires_at",
    "w"."offers_sent",
    "w"."created_at",
    "w"."client_id",
    COALESCE(NULLIF(TRIM(BOTH FROM ((COALESCE("u"."first_name", ''::"text") || ' '::"text") || COALESCE("u"."last_name", ''::"text"))), ''::"text"),
        CASE
            WHEN ("u"."username" IS NOT NULL) THEN ('@'::"text" || "u"."username")
            ELSE ('ID '::"text" || "w"."client_id")
        END) AS "client_name",
    "u"."username" AS "client_username",
    "s"."name" AS "service_name",
    "sp"."full_name" AS "specialist_name",
    ( SELECT ("count"(*) - 1)
           FROM "public"."waitlist" "w2"
          WHERE (("w2"."status" = ANY (ARRAY['waiting'::"text", 'offered'::"text"])) AND ("w2"."specialist_id" = "w"."specialist_id") AND ("w2"."service_id" = "w"."service_id") AND ("w2"."target_date" = "w"."target_date") AND (("w"."kind" = 'day'::"text") OR ("w2"."slot_start" = "w"."slot_start")))) AS "others_waiting"
   FROM ((("public"."waitlist" "w"
     JOIN "public"."services" "s" ON (("s"."id" = "w"."service_id")))
     JOIN "public"."specialists" "sp" ON (("sp"."id" = "w"."specialist_id")))
     LEFT JOIN "public"."users" "u" ON (("u"."telegram_id" = "w"."client_id")))
  WHERE ("w"."status" = ANY (ARRAY['waiting'::"text", 'offered'::"text"]));


ALTER VIEW "public"."v_waitlist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waitlist_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "offer_ttl_min" integer DEFAULT 30 NOT NULL,
    "max_active" integer DEFAULT 3 NOT NULL,
    "max_offers" integer DEFAULT 3 NOT NULL,
    CONSTRAINT "waitlist_settings_id_check" CHECK (("id" = 1))
);


ALTER TABLE "public"."waitlist_settings" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("email");



ALTER TABLE ONLY "public"."booking_reschedules"
    ADD CONSTRAINT "booking_reschedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_no_overlap" EXCLUDE USING "gist" ("specialist_id" WITH =, "tstzrange"("starts_at", "ends_at") WITH &&) WHERE (("status" = ANY (ARRAY['hold'::"public"."booking_status", 'new'::"public"."booking_status", 'confirmed'::"public"."booking_status", 'completed'::"public"."booking_status", 'paid'::"public"."booking_status"])));



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."broadcast_recipients"
    ADD CONSTRAINT "broadcast_recipients_pkey" PRIMARY KEY ("broadcast_id", "client_id");



ALTER TABLE ONLY "public"."broadcasts"
    ADD CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."certificate_accounts"
    ADD CONSTRAINT "certificate_accounts_pkey" PRIMARY KEY ("client_id");



ALTER TABLE ONLY "public"."certificate_transactions"
    ADD CONSTRAINT "certificate_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_settings"
    ADD CONSTRAINT "document_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_client_id_kind_target_id_key" UNIQUE ("client_id", "kind", "target_id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_accounts"
    ADD CONSTRAINT "loyalty_accounts_pkey" PRIMARY KEY ("client_id");



ALTER TABLE ONLY "public"."loyalty_settings"
    ADD CONSTRAINT "loyalty_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_transactions"
    ADD CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_booking_id_type_key" UNIQUE ("booking_id", "type");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_sales"
    ADD CONSTRAINT "product_sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotion_triggers"
    ADD CONSTRAINT "promotion_triggers_pkey" PRIMARY KEY ("promotion_id", "service_id");



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_invoices"
    ADD CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_items"
    ADD CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reschedule_settings"
    ADD CONSTRAINT "reschedule_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retention_settings"
    ADD CONSTRAINT "retention_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_days"
    ADD CONSTRAINT "schedule_days_pkey" PRIMARY KEY ("specialist_id", "date");



ALTER TABLE ONLY "public"."schedule_exceptions"
    ADD CONSTRAINT "schedule_exceptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_exceptions"
    ADD CONSTRAINT "schedule_exceptions_specialist_id_date_key" UNIQUE ("specialist_id", "date");



ALTER TABLE ONLY "public"."service_consumables"
    ADD CONSTRAINT "service_consumables_pkey" PRIMARY KEY ("service_id", "product_id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."specialist_documents"
    ADD CONSTRAINT "specialist_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."specialist_schedules"
    ADD CONSTRAINT "specialist_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."specialist_schedules"
    ADD CONSTRAINT "specialist_schedules_specialist_id_weekday_key" UNIQUE ("specialist_id", "weekday");



ALTER TABLE ONLY "public"."specialist_service_payouts"
    ADD CONSTRAINT "specialist_service_payouts_pkey" PRIMARY KEY ("specialist_id", "service_id");



ALTER TABLE ONLY "public"."specialist_services"
    ADD CONSTRAINT "specialist_services_pkey" PRIMARY KEY ("specialist_id", "service_id");



ALTER TABLE ONLY "public"."specialist_works"
    ADD CONSTRAINT "specialist_works_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."specialists"
    ADD CONSTRAINT "specialists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."specialists"
    ADD CONSTRAINT "specialists_telegram_id_key" UNIQUE ("telegram_id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("telegram_id");



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waitlist_settings"
    ADD CONSTRAINT "waitlist_settings_pkey" PRIMARY KEY ("id");



CREATE INDEX "booking_reschedules_client_idx" ON "public"."booking_reschedules" USING "btree" ("client_id", "created_at" DESC);



CREATE INDEX "bookings_synthetic_idx" ON "public"."bookings" USING "btree" ("is_synthetic", "created_at");



CREATE INDEX "broadcast_recipients_pending_idx" ON "public"."broadcast_recipients" USING "btree" ("broadcast_id", "status") WHERE ("status" = 'pending'::"text");



CREATE INDEX "broadcasts_status_idx" ON "public"."broadcasts" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "cert_tx_client_idx" ON "public"."certificate_transactions" USING "btree" ("client_id", "created_at" DESC);



CREATE INDEX "certificates_activated_by_idx" ON "public"."certificates" USING "btree" ("activated_by");



CREATE INDEX "favorites_client_idx" ON "public"."favorites" USING "btree" ("client_id");



CREATE INDEX "idx_bookings_client" ON "public"."bookings" USING "btree" ("client_id");



CREATE INDEX "idx_bookings_order" ON "public"."bookings" USING "btree" ("order_id");



CREATE INDEX "idx_bookings_specialist_time" ON "public"."bookings" USING "btree" ("specialist_id", "starts_at");



CREATE INDEX "idx_bookings_status" ON "public"."bookings" USING "btree" ("status");



CREATE INDEX "idx_categories_parent" ON "public"."categories" USING "btree" ("parent_id");



CREATE INDEX "idx_exceptions_specialist_date" ON "public"."schedule_exceptions" USING "btree" ("specialist_id", "date");



CREATE INDEX "idx_reviews_specialist_approved" ON "public"."reviews" USING "btree" ("specialist_id") WHERE ("status" = 'approved'::"public"."review_status");



CREATE INDEX "idx_schedules_specialist" ON "public"."specialist_schedules" USING "btree" ("specialist_id");



CREATE INDEX "idx_services_category" ON "public"."services" USING "btree" ("category_id");



CREATE INDEX "idx_spec_services_service" ON "public"."specialist_services" USING "btree" ("service_id");



CREATE INDEX "idx_works_specialist" ON "public"."specialist_works" USING "btree" ("specialist_id");



CREATE INDEX "loyalty_tx_client_idx" ON "public"."loyalty_transactions" USING "btree" ("client_id", "created_at" DESC);



CREATE INDEX "orders_synthetic_idx" ON "public"."orders" USING "btree" ("is_synthetic", "created_at");



CREATE INDEX "product_sales_client_idx" ON "public"."product_sales" USING "btree" ("client_id", "created_at" DESC);



CREATE INDEX "product_sales_spec_idx" ON "public"."product_sales" USING "btree" ("specialist_id", "paid_at");



CREATE INDEX "product_sales_status_idx" ON "public"."product_sales" USING "btree" ("status");



CREATE INDEX "products_kind_idx" ON "public"."products" USING "btree" ("kind", "is_active");



CREATE INDEX "products_low_idx" ON "public"."products" USING "btree" ("id") WHERE ("low_stock" > (0)::numeric);



CREATE INDEX "purchase_invoices_date_idx" ON "public"."purchase_invoices" USING "btree" ("invoice_date" DESC);



CREATE INDEX "purchase_items_invoice_idx" ON "public"."purchase_items" USING "btree" ("invoice_id");



CREATE INDEX "schedule_days_date_idx" ON "public"."schedule_days" USING "btree" ("date");



CREATE INDEX "schedule_days_spec_date_idx" ON "public"."schedule_days" USING "btree" ("specialist_id", "date");



CREATE INDEX "specialist_documents_expiry_idx" ON "public"."specialist_documents" USING "btree" ("expires_at") WHERE ("expires_at" IS NOT NULL);



CREATE INDEX "specialist_documents_spec_idx" ON "public"."specialist_documents" USING "btree" ("specialist_id", "created_at" DESC);



CREATE INDEX "specialists_telegram_idx" ON "public"."specialists" USING "btree" ("telegram_id") WHERE ("telegram_id" IS NOT NULL);



CREATE INDEX "stock_movements_product_idx" ON "public"."stock_movements" USING "btree" ("product_id", "created_at" DESC);



CREATE INDEX "stock_movements_ref_idx" ON "public"."stock_movements" USING "btree" ("ref_type", "ref_id");



CREATE INDEX "waitlist_active_idx" ON "public"."waitlist" USING "btree" ("specialist_id", "service_id", "target_date") WHERE ("status" = 'waiting'::"text");



CREATE INDEX "waitlist_client_idx" ON "public"."waitlist" USING "btree" ("client_id", "status");



CREATE UNIQUE INDEX "waitlist_no_dup_day" ON "public"."waitlist" USING "btree" ("client_id", "specialist_id", "service_id", "target_date") WHERE (("status" = ANY (ARRAY['waiting'::"text", 'offered'::"text"])) AND ("kind" = 'day'::"text"));



CREATE UNIQUE INDEX "waitlist_no_dup_slot" ON "public"."waitlist" USING "btree" ("client_id", "specialist_id", "service_id", "slot_start") WHERE (("status" = ANY (ARRAY['waiting'::"text", 'offered'::"text"])) AND ("kind" = 'slot'::"text"));



CREATE INDEX "waitlist_offer_idx" ON "public"."waitlist" USING "btree" ("offer_expires_at") WHERE ("status" = 'offered'::"text");



CREATE OR REPLACE TRIGGER "booking_paid_consume" AFTER UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."trg_booking_paid_consume"();



CREATE OR REPLACE TRIGGER "trg_bookings_updated" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_loyalty_status" AFTER UPDATE OF "status" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."loyalty_on_status_change"();



CREATE OR REPLACE TRIGGER "trg_reviews_rating" AFTER INSERT OR DELETE OR UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."recompute_specialist_rating"();



CREATE OR REPLACE TRIGGER "trg_specialists_updated" BEFORE UPDATE ON "public"."specialists" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_users_updated" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."booking_reschedules"
    ADD CONSTRAINT "booking_reschedules_from_booking_fkey" FOREIGN KEY ("from_booking") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_reschedules"
    ADD CONSTRAINT "booking_reschedules_to_booking_fkey" FOREIGN KEY ("to_booking") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_cert_id_fkey" FOREIGN KEY ("cert_id") REFERENCES "public"."certificates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."users"("telegram_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "public"."promotions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_rescheduled_from_fkey" FOREIGN KEY ("rescheduled_from") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_rescheduled_to_fkey" FOREIGN KEY ("rescheduled_to") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "public"."specialists"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."broadcast_recipients"
    ADD CONSTRAINT "broadcast_recipients_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."broadcast_recipients"
    ADD CONSTRAINT "broadcast_recipients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."users"("telegram_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."broadcasts"
    ADD CONSTRAINT "broadcasts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."certificate_accounts"
    ADD CONSTRAINT "certificate_accounts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."users"("telegram_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."certificate_transactions"
    ADD CONSTRAINT "certificate_transactions_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."certificate_transactions"
    ADD CONSTRAINT "certificate_transactions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."users"("telegram_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_activated_by_fkey" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("telegram_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."users"("telegram_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_accounts"
    ADD CONSTRAINT "loyalty_accounts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."users"("telegram_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_transactions"
    ADD CONSTRAINT "loyalty_transactions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."users"("telegram_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."users"("telegram_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_sales"
    ADD CONSTRAINT "product_sales_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_sales"
    ADD CONSTRAINT "product_sales_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."users"("telegram_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_sales"
    ADD CONSTRAINT "product_sales_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."product_sales"
    ADD CONSTRAINT "product_sales_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "public"."specialists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promotion_triggers"
    ADD CONSTRAINT "promotion_triggers_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_triggers"
    ADD CONSTRAINT "promotion_triggers_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_gift_service_id_fkey" FOREIGN KEY ("gift_service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_target_category_id_fkey" FOREIGN KEY ("target_category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_target_service_id_fkey" FOREIGN KEY ("target_service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_invoices"
    ADD CONSTRAINT "purchase_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_items"
    ADD CONSTRAINT "purchase_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_items"
    ADD CONSTRAINT "purchase_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."users"("telegram_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "public"."specialists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_days"
    ADD CONSTRAINT "schedule_days_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "public"."specialists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_exceptions"
    ADD CONSTRAINT "schedule_exceptions_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "public"."specialists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_consumables"
    ADD CONSTRAINT "service_consumables_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_consumables"
    ADD CONSTRAINT "service_consumables_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."specialist_documents"
    ADD CONSTRAINT "specialist_documents_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "public"."specialists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."specialist_schedules"
    ADD CONSTRAINT "specialist_schedules_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "public"."specialists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."specialist_service_payouts"
    ADD CONSTRAINT "specialist_service_payouts_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."specialist_service_payouts"
    ADD CONSTRAINT "specialist_service_payouts_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "public"."specialists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."specialist_services"
    ADD CONSTRAINT "specialist_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."specialist_services"
    ADD CONSTRAINT "specialist_services_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "public"."specialists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."specialist_works"
    ADD CONSTRAINT "specialist_works_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "public"."specialists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."users"("telegram_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "public"."specialists"("id") ON DELETE CASCADE;



CREATE POLICY "admin_all" ON "public"."admins" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all" ON "public"."bookings" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all" ON "public"."categories" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all" ON "public"."notifications" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all" ON "public"."orders" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all" ON "public"."promotion_triggers" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all" ON "public"."promotions" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all" ON "public"."reviews" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all" ON "public"."schedule_exceptions" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all" ON "public"."services" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all" ON "public"."specialist_schedules" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all" ON "public"."specialist_services" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all" ON "public"."specialist_works" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all" ON "public"."specialists" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all" ON "public"."users" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all_ssp" ON "public"."specialist_service_payouts" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_booking_reschedules" ON "public"."booking_reschedules" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_broadcast_recipients" ON "public"."broadcast_recipients" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_broadcasts" ON "public"."broadcasts" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_cert_accounts" ON "public"."certificate_accounts" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_cert_tx" ON "public"."certificate_transactions" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_certificates" ON "public"."certificates" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_document_settings" ON "public"."document_settings" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_favorites" ON "public"."favorites" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_invoices" ON "public"."purchase_invoices" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_loyalty_accounts" ON "public"."loyalty_accounts" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_loyalty_settings" ON "public"."loyalty_settings" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_loyalty_tx" ON "public"."loyalty_transactions" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_product_sales" ON "public"."product_sales" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_products" ON "public"."products" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_purchase_items" ON "public"."purchase_items" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_reschedule_settings" ON "public"."reschedule_settings" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_retention_settings" ON "public"."retention_settings" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_service_consumables" ON "public"."service_consumables" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_specialist_documents" ON "public"."specialist_documents" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_stock_movements" ON "public"."stock_movements" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_suppliers" ON "public"."suppliers" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_waitlist" ON "public"."waitlist" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_read_waitlist_settings" ON "public"."waitlist_settings" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_write_schedule_days" ON "public"."schedule_days" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anon_read_categories" ON "public"."categories" FOR SELECT TO "authenticated", "anon" USING ("is_active");



CREATE POLICY "anon_read_promo_triggers" ON "public"."promotion_triggers" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "anon_read_promotions" ON "public"."promotions" FOR SELECT TO "authenticated", "anon" USING ("is_active");



CREATE POLICY "anon_read_reviews" ON "public"."reviews" FOR SELECT TO "authenticated", "anon" USING (("status" = 'approved'::"public"."review_status"));



CREATE POLICY "anon_read_services" ON "public"."services" FOR SELECT TO "authenticated", "anon" USING ("is_active");



CREATE POLICY "anon_read_spec_services" ON "public"."specialist_services" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "anon_read_specialists" ON "public"."specialists" FOR SELECT TO "authenticated", "anon" USING ("is_active");



CREATE POLICY "anon_read_works" ON "public"."specialist_works" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."booking_reschedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."broadcast_recipients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."broadcasts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."certificate_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."certificate_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."certificates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_sales" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotion_triggers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public_read_products" ON "public"."products" FOR SELECT TO "anon" USING ((("kind" = 'sale'::"text") AND ("is_active" = true)));



CREATE POLICY "public_read_schedule_days" ON "public"."schedule_days" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."purchase_invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reschedule_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."retention_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_days" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_exceptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_consumables" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."specialist_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."specialist_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."specialist_service_payouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."specialist_services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."specialist_works" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."specialists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."waitlist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."waitlist_settings" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."bookings";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."product_sales";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."products";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."stock_movements";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."waitlist";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."activate_certificate"("p_client" bigint, "p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."activate_certificate"("p_client" bigint, "p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_certificate"("p_client" bigint, "p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_cron_call"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_cron_call"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_cron_call"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_recalc"("p_broadcast" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_recalc"("p_broadcast" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_recalc"("p_broadcast" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_recipients_for_segments"("p_segments" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_recipients_for_segments"("p_segments" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_recipients_for_segments"("p_segments" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_product_sale"("p_sale" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_product_sale"("p_sale" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_product_sale"("p_sale" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_reschedule"("p_booking" "uuid", "p_client" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_reschedule"("p_booking" "uuid", "p_client" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_reschedule"("p_booking" "uuid", "p_client" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "postgres";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "anon";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "service_role";



GRANT ALL ON FUNCTION "public"."certificate_recalc"("p_client" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."certificate_recalc"("p_client" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."certificate_recalc"("p_client" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."certificates_expire_due"() TO "anon";
GRANT ALL ON FUNCTION "public"."certificates_expire_due"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."certificates_expire_due"() TO "service_role";



GRANT ALL ON FUNCTION "public"."client_segment"("p_client" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."client_segment"("p_client" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."client_segment"("p_client" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."consume_for_booking"("p_booking" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."consume_for_booking"("p_booking" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_for_booking"("p_booking" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_order_with_bookings"("p_client_id" bigint, "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_order_with_bookings"("p_client_id" bigint, "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_order_with_bookings"("p_client_id" bigint, "p_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "postgres";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "anon";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."documents_cron_call"() TO "anon";
GRANT ALL ON FUNCTION "public"."documents_cron_call"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."documents_cron_call"() TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_holds"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_holds"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_holds"() TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_reschedules"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_reschedules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_reschedules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."finalize_reschedule"("p_old_booking" "uuid", "p_new_booking" "uuid", "p_client" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_reschedule"("p_old_booking" "uuid", "p_new_booking" "uuid", "p_client" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_reschedule"("p_old_booking" "uuid", "p_new_booking" "uuid", "p_client" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "postgres";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "anon";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "service_role";



GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_slots"("p_specialist_id" "uuid", "p_service_id" "uuid", "p_date" "date", "p_tz" "text", "p_step_min" integer, "p_busy_ranges" "tstzrange"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_slots"("p_specialist_id" "uuid", "p_service_id" "uuid", "p_date" "date", "p_tz" "text", "p_step_min" integer, "p_busy_ranges" "tstzrange"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_slots"("p_specialist_id" "uuid", "p_service_id" "uuid", "p_date" "date", "p_tz" "text", "p_step_min" integer, "p_busy_ranges" "tstzrange"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_day_slots"("p_specialist_id" "uuid", "p_service_id" "uuid", "p_date" "date", "p_tz" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_day_slots"("p_specialist_id" "uuid", "p_service_id" "uuid", "p_date" "date", "p_tz" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_day_slots"("p_specialist_id" "uuid", "p_service_id" "uuid", "p_date" "date", "p_tz" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "postgres";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "anon";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."issue_certificates_for_sale"("p_sale" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."issue_certificates_for_sale"("p_sale" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_certificates_for_sale"("p_sale" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."join_waitlist"("p_client" bigint, "p_service" "uuid", "p_specialist" "uuid", "p_kind" "text", "p_date" "date", "p_slot" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."join_waitlist"("p_client" bigint, "p_service" "uuid", "p_specialist" "uuid", "p_kind" "text", "p_date" "date", "p_slot" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_waitlist"("p_client" bigint, "p_service" "uuid", "p_specialist" "uuid", "p_kind" "text", "p_date" "date", "p_slot" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."keepalive_cleanup"() TO "anon";
GRANT ALL ON FUNCTION "public"."keepalive_cleanup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."keepalive_cleanup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."keepalive_make_orders"() TO "anon";
GRANT ALL ON FUNCTION "public"."keepalive_make_orders"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."keepalive_make_orders"() TO "service_role";



GRANT ALL ON FUNCTION "public"."keepalive_prune"() TO "anon";
GRANT ALL ON FUNCTION "public"."keepalive_prune"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."keepalive_prune"() TO "service_role";



GRANT ALL ON FUNCTION "public"."leave_waitlist"("p_id" "uuid", "p_client" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."leave_waitlist"("p_id" "uuid", "p_client" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_waitlist"("p_id" "uuid", "p_client" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."link_specialist_by_code"("p_telegram" bigint, "p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."link_specialist_by_code"("p_telegram" bigint, "p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_specialist_by_code"("p_telegram" bigint, "p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."link_specialist_by_phone"("p_telegram" bigint, "p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."link_specialist_by_phone"("p_telegram" bigint, "p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_specialist_by_phone"("p_telegram" bigint, "p_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."loyalty_accrue_on_paid"() TO "anon";
GRANT ALL ON FUNCTION "public"."loyalty_accrue_on_paid"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."loyalty_accrue_on_paid"() TO "service_role";



GRANT ALL ON FUNCTION "public"."loyalty_on_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."loyalty_on_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."loyalty_on_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."loyalty_recalc"("p_client" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."loyalty_recalc"("p_client" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."loyalty_recalc"("p_client" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."my_certificates"("p_client" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."my_certificates"("p_client" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_certificates"("p_client" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."my_waitlist"("p_client" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."my_waitlist"("p_client" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_waitlist"("p_client" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_phone"("p" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_phone"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_phone"("p" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "postgres";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "anon";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "service_role";



GRANT ALL ON FUNCTION "public"."payout_detail"("p_specialist" "uuid", "p_from" "date", "p_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."payout_detail"("p_specialist" "uuid", "p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."payout_detail"("p_specialist" "uuid", "p_from" "date", "p_to" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."payout_report"("p_from" "date", "p_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."payout_report"("p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."payout_report"("p_from" "date", "p_to" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."product_sales_detail"("p_specialist" "uuid", "p_from" "date", "p_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."product_sales_detail"("p_specialist" "uuid", "p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."product_sales_detail"("p_specialist" "uuid", "p_from" "date", "p_to" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_specialist_rating"() TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_specialist_rating"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_specialist_rating"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_retention_notification"("p_client" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."reset_retention_notification"("p_client" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_retention_notification"("p_client" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."retention_cron_call"() TO "anon";
GRANT ALL ON FUNCTION "public"."retention_cron_call"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."retention_cron_call"() TO "service_role";



GRANT ALL ON FUNCTION "public"."save_schedule_days"("p_specialist" "uuid", "p_from" "date", "p_to" "date", "p_days" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."sell_product"("p_product" "uuid", "p_qty" numeric, "p_client" bigint, "p_specialist" "uuid", "p_booking" "uuid", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sell_product"("p_product" "uuid", "p_qty" numeric, "p_client" bigint, "p_specialist" "uuid", "p_booking" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sell_product"("p_product" "uuid", "p_qty" numeric, "p_client" bigint, "p_specialist" "uuid", "p_booking" "uuid", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."specialist_bookings"("p_specialist" "uuid", "p_from" "date", "p_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."specialist_bookings"("p_specialist" "uuid", "p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."specialist_bookings"("p_specialist" "uuid", "p_from" "date", "p_to" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."specialist_earnings"("p_specialist" "uuid", "p_from" "date", "p_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."specialist_earnings"("p_specialist" "uuid", "p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."specialist_earnings"("p_specialist" "uuid", "p_from" "date", "p_to" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."specialist_mark_booking"("p_telegram" bigint, "p_booking" "uuid", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."specialist_mark_booking"("p_telegram" bigint, "p_booking" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."specialist_mark_booking"("p_telegram" bigint, "p_booking" "uuid", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."specialist_shifts_in_period"("p_specialist" "uuid", "p_from" "date", "p_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."specialist_shifts_in_period"("p_specialist" "uuid", "p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."specialist_shifts_in_period"("p_specialist" "uuid", "p_from" "date", "p_to" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."start_reschedule"("p_booking" "uuid", "p_client" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."start_reschedule"("p_booking" "uuid", "p_client" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_reschedule"("p_booking" "uuid", "p_client" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."stock_adjust"("p_product" "uuid", "p_new_stock" numeric, "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."stock_adjust"("p_product" "uuid", "p_new_stock" numeric, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stock_adjust"("p_product" "uuid", "p_new_stock" numeric, "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."stock_consume"("p_product" "uuid", "p_qty" numeric, "p_kind" "text", "p_ref_type" "text", "p_ref_id" "uuid", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."stock_consume"("p_product" "uuid", "p_qty" numeric, "p_kind" "text", "p_ref_type" "text", "p_ref_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stock_consume"("p_product" "uuid", "p_qty" numeric, "p_kind" "text", "p_ref_type" "text", "p_ref_id" "uuid", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."stock_purchase"("p_product" "uuid", "p_packs" numeric, "p_pack_size" numeric, "p_cost_total" numeric, "p_invoice" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."stock_purchase"("p_product" "uuid", "p_packs" numeric, "p_pack_size" numeric, "p_cost_total" numeric, "p_invoice" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stock_purchase"("p_product" "uuid", "p_packs" numeric, "p_pack_size" numeric, "p_cost_total" numeric, "p_invoice" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_booking_paid_consume"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_booking_paid_consume"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_booking_paid_consume"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."waitlist_cron_call"() TO "anon";
GRANT ALL ON FUNCTION "public"."waitlist_cron_call"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."waitlist_cron_call"() TO "service_role";



GRANT ALL ON FUNCTION "public"."waitlist_mark_booked"("p_id" "uuid", "p_client" bigint, "p_booking" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."waitlist_mark_booked"("p_id" "uuid", "p_client" bigint, "p_booking" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."waitlist_mark_booked"("p_id" "uuid", "p_client" bigint, "p_booking" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."waitlist_scan"() TO "anon";
GRANT ALL ON FUNCTION "public"."waitlist_scan"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."waitlist_scan"() TO "service_role";



GRANT ALL ON FUNCTION "public"."whoami_specialist"("p_telegram" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."whoami_specialist"("p_telegram" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."whoami_specialist"("p_telegram" bigint) TO "service_role";
























GRANT ALL ON TABLE "public"."admins" TO "anon";
GRANT ALL ON TABLE "public"."admins" TO "authenticated";
GRANT ALL ON TABLE "public"."admins" TO "service_role";



GRANT ALL ON TABLE "public"."booking_reschedules" TO "anon";
GRANT ALL ON TABLE "public"."booking_reschedules" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_reschedules" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."broadcast_recipients" TO "anon";
GRANT ALL ON TABLE "public"."broadcast_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."broadcast_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."broadcasts" TO "anon";
GRANT ALL ON TABLE "public"."broadcasts" TO "authenticated";
GRANT ALL ON TABLE "public"."broadcasts" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."certificate_accounts" TO "anon";
GRANT ALL ON TABLE "public"."certificate_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."certificate_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."certificate_transactions" TO "anon";
GRANT ALL ON TABLE "public"."certificate_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."certificate_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."certificates" TO "anon";
GRANT ALL ON TABLE "public"."certificates" TO "authenticated";
GRANT ALL ON TABLE "public"."certificates" TO "service_role";



GRANT ALL ON TABLE "public"."document_settings" TO "anon";
GRANT ALL ON TABLE "public"."document_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."document_settings" TO "service_role";



GRANT ALL ON TABLE "public"."favorites" TO "anon";
GRANT ALL ON TABLE "public"."favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."favorites" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_accounts" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_settings" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_settings" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_transactions" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."product_sales" TO "anon";
GRANT ALL ON TABLE "public"."product_sales" TO "authenticated";
GRANT ALL ON TABLE "public"."product_sales" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."promotion_triggers" TO "anon";
GRANT ALL ON TABLE "public"."promotion_triggers" TO "authenticated";
GRANT ALL ON TABLE "public"."promotion_triggers" TO "service_role";



GRANT ALL ON TABLE "public"."promotions" TO "anon";
GRANT ALL ON TABLE "public"."promotions" TO "authenticated";
GRANT ALL ON TABLE "public"."promotions" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_invoices" TO "anon";
GRANT ALL ON TABLE "public"."purchase_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_items" TO "service_role";



GRANT ALL ON TABLE "public"."reschedule_settings" TO "anon";
GRANT ALL ON TABLE "public"."reschedule_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."reschedule_settings" TO "service_role";



GRANT ALL ON TABLE "public"."retention_settings" TO "anon";
GRANT ALL ON TABLE "public"."retention_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."retention_settings" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_days" TO "anon";
GRANT ALL ON TABLE "public"."schedule_days" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_days" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_exceptions" TO "anon";
GRANT ALL ON TABLE "public"."schedule_exceptions" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_exceptions" TO "service_role";



GRANT ALL ON TABLE "public"."service_consumables" TO "anon";
GRANT ALL ON TABLE "public"."service_consumables" TO "authenticated";
GRANT ALL ON TABLE "public"."service_consumables" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON TABLE "public"."specialist_documents" TO "anon";
GRANT ALL ON TABLE "public"."specialist_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."specialist_documents" TO "service_role";



GRANT ALL ON TABLE "public"."specialist_schedules" TO "anon";
GRANT ALL ON TABLE "public"."specialist_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."specialist_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."specialist_service_payouts" TO "anon";
GRANT ALL ON TABLE "public"."specialist_service_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."specialist_service_payouts" TO "service_role";



GRANT ALL ON TABLE "public"."specialist_services" TO "anon";
GRANT ALL ON TABLE "public"."specialist_services" TO "authenticated";
GRANT ALL ON TABLE "public"."specialist_services" TO "service_role";



GRANT ALL ON TABLE "public"."specialist_works" TO "anon";
GRANT ALL ON TABLE "public"."specialist_works" TO "authenticated";
GRANT ALL ON TABLE "public"."specialist_works" TO "service_role";



GRANT ALL ON TABLE "public"."specialists" TO "anon";
GRANT ALL ON TABLE "public"."specialists" TO "authenticated";
GRANT ALL ON TABLE "public"."specialists" TO "service_role";



GRANT ALL ON TABLE "public"."stock_movements" TO "anon";
GRANT ALL ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."v_client_segments" TO "anon";
GRANT ALL ON TABLE "public"."v_client_segments" TO "authenticated";
GRANT ALL ON TABLE "public"."v_client_segments" TO "service_role";



GRANT ALL ON TABLE "public"."v_products" TO "anon";
GRANT ALL ON TABLE "public"."v_products" TO "authenticated";
GRANT ALL ON TABLE "public"."v_products" TO "service_role";



GRANT ALL ON TABLE "public"."v_shop_products" TO "anon";
GRANT ALL ON TABLE "public"."v_shop_products" TO "authenticated";
GRANT ALL ON TABLE "public"."v_shop_products" TO "service_role";



GRANT ALL ON TABLE "public"."v_specialist_documents" TO "anon";
GRANT ALL ON TABLE "public"."v_specialist_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."v_specialist_documents" TO "service_role";



GRANT ALL ON TABLE "public"."waitlist" TO "anon";
GRANT ALL ON TABLE "public"."waitlist" TO "authenticated";
GRANT ALL ON TABLE "public"."waitlist" TO "service_role";



GRANT ALL ON TABLE "public"."v_waitlist" TO "anon";
GRANT ALL ON TABLE "public"."v_waitlist" TO "authenticated";
GRANT ALL ON TABLE "public"."v_waitlist" TO "service_role";



GRANT ALL ON TABLE "public"."waitlist_settings" TO "anon";
GRANT ALL ON TABLE "public"."waitlist_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."waitlist_settings" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

create extension if not exists "pg_net" with schema "public";

drop policy "anon_read_categories" on "public"."categories";

drop policy "anon_read_promo_triggers" on "public"."promotion_triggers";

drop policy "anon_read_promotions" on "public"."promotions";

drop policy "anon_read_reviews" on "public"."reviews";

drop policy "public_read_schedule_days" on "public"."schedule_days";

drop policy "anon_read_services" on "public"."services";

drop policy "anon_read_spec_services" on "public"."specialist_services";

drop policy "anon_read_works" on "public"."specialist_works";

drop policy "anon_read_specialists" on "public"."specialists";


  create policy "anon_read_categories"
  on "public"."categories"
  as permissive
  for select
  to anon, authenticated
using (is_active);



  create policy "anon_read_promo_triggers"
  on "public"."promotion_triggers"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "anon_read_promotions"
  on "public"."promotions"
  as permissive
  for select
  to anon, authenticated
using (is_active);



  create policy "anon_read_reviews"
  on "public"."reviews"
  as permissive
  for select
  to anon, authenticated
using ((status = 'approved'::public.review_status));



  create policy "public_read_schedule_days"
  on "public"."schedule_days"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "anon_read_services"
  on "public"."services"
  as permissive
  for select
  to anon, authenticated
using (is_active);



  create policy "anon_read_spec_services"
  on "public"."specialist_services"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "anon_read_works"
  on "public"."specialist_works"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "anon_read_specialists"
  on "public"."specialists"
  as permissive
  for select
  to anon, authenticated
using (is_active);



  create policy "docs_admin_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'docs'::text) AND public.is_admin()));



  create policy "docs_admin_read"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'docs'::text) AND public.is_admin()));



  create policy "docs_admin_write"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'docs'::text) AND public.is_admin()));



  create policy "media admin delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'media'::text) AND public.is_admin()));



  create policy "media admin insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'media'::text) AND public.is_admin()));



  create policy "media admin update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'media'::text) AND public.is_admin()));



  create policy "media public read"
  on "storage"."objects"
  as permissive
  for select
  to anon, authenticated
using ((bucket_id = 'media'::text));



