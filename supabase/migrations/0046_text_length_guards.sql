-- ============================================================================
-- 0046_text_length_guards
-- Ceilings on every free-text column that a browser can write into.
--
-- The write RPCs are SECURITY DEFINER and take their text params straight from
-- the caller; `members.display_name` is also writable directly (the self-update
-- RLS policy + guard trigger allow it). Zod caps these in the server actions,
-- but a hand-rolled PostgREST call skips that layer, so a member could store a
-- multi-megabyte note / display name. These are abuse backstops, not precise
-- validation — generous round numbers, well under anything a human would type.
--
-- Added NOT VALID so the migration never fails on a legacy row; every INSERT and
-- UPDATE from here on is still checked. Run VALIDATE later once the data is
-- known clean if a fully-trusted constraint is wanted.
-- ============================================================================

alter table members
  add constraint members_display_name_max_len
  check (length(display_name) <= 80) not valid;

alter table orders
  add constraint orders_note_max_len
    check (note is null or length(note) <= 1000) not valid,
  add constraint orders_payment_note_max_len
    check (payment_note is null or length(payment_note) <= 1000) not valid,
  add constraint orders_distribution_note_max_len
    check (distribution_note is null or length(distribution_note) <= 1000) not valid,
  add constraint orders_cancel_reason_max_len
    check (cancel_reason is null or length(cancel_reason) <= 1000) not valid;

alter table production_logs
  add constraint production_logs_note_max_len
    check (note is null or length(note) <= 1000) not valid,
  add constraint production_logs_review_note_max_len
    check (review_note is null or length(review_note) <= 1000) not valid;

alter table member_submissions
  add constraint member_submissions_note_max_len
    check (note is null or length(note) <= 1000) not valid,
  add constraint member_submissions_review_note_max_len
    check (review_note is null or length(review_note) <= 1000) not valid;

alter table cash_entries
  add constraint cash_entries_note_max_len
    check (note is null or length(note) <= 2000) not valid;

alter table items
  add constraint items_description_max_len
    check (description is null or length(description) <= 4000) not valid,
  add constraint items_sku_max_len
    check (sku is null or length(sku) <= 100) not valid,
  add constraint items_image_url_max_len
    check (image_url is null or length(image_url) <= 2000) not valid;

alter table suppliers
  add constraint suppliers_name_max_len
    check (length(name) <= 300) not valid,
  add constraint suppliers_contact_max_len
    check (contact is null or length(contact) <= 300) not valid,
  add constraint suppliers_notes_max_len
    check (notes is null or length(notes) <= 4000) not valid;

alter table relations
  add constraint relations_name_max_len
    check (length(name) <= 300) not valid,
  add constraint relations_notes_max_len
    check (notes is null or length(notes) <= 4000) not valid;

alter table organization_settings
  add constraint organization_settings_org_name_max_len
    check (length(org_name) <= 200) not valid,
  add constraint organization_settings_logo_url_max_len
    check (logo_url is null or length(logo_url) <= 2000) not valid;
