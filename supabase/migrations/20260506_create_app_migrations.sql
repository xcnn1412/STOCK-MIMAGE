-- ============================================================================
-- _app_migrations — per-instance tracking table for cross-instance schema sync.
--
-- Records which migration files have been applied to THIS database. Used by
-- /checkupdate to compute "pending migrations" (master manifest − local
-- applied). Populated once per migration via a server action after the SQL
-- is applied via Supabase Studio.
--
-- The bootstrap INSERTs below mark every migration that existed at the time
-- this file was authored as already-applied. Re-running this file is safe
-- (idempotent: ON CONFLICT DO NOTHING).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public._app_migrations (
  filename   text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text,
  -- md5 of file content at apply time — lets the dashboard flag drift if
  -- a master migration file is edited after being recorded as applied.
  checksum   text
);

CREATE INDEX IF NOT EXISTS idx_app_migrations_applied_at
  ON public._app_migrations (applied_at DESC);

COMMENT ON TABLE public._app_migrations IS
  'Per-instance log of applied migration filenames — used by /checkupdate to surface pending migrations. Populated by a server action after each manual apply.';

-- Optional read access for anon — the data is non-sensitive (just filenames
-- + timestamps). Uncomment if you want the dashboard to read it via anon key.
-- (Server-side reads via service role still work without this.)
ALTER TABLE public._app_migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_migrations_read ON public._app_migrations;
CREATE POLICY app_migrations_read ON public._app_migrations
  FOR SELECT USING (true);

-- ─── Bootstrap: mark every existing migration as applied ──────────────
-- These rows record the snapshot of migrations that existed at the time
-- this tracking table was introduced. Each instance will get the same
-- list because the migration files are version-controlled in master.
INSERT INTO public._app_migrations (filename, applied_at, applied_by) VALUES
  ('20260225_add_revenue_vat_wht.sql',                  now(), 'bootstrap'),
  ('20260225_add_vat_mode.sql',                         now(), 'bootstrap'),
  ('20260225_create_crm.sql',                           now(), 'bootstrap'),
  ('20260225_create_job_costs.sql',                     now(), 'bootstrap'),
  ('20260226_add_events_module.sql',                    now(), 'bootstrap'),
  ('20260226_category_detail_source.sql',               now(), 'bootstrap'),
  ('20260226_cost_item_title.sql',                      now(), 'bootstrap'),
  ('20260226_crm_installments.sql',                     now(), 'bootstrap'),
  ('20260226_crm_tags.sql',                             now(), 'bootstrap'),
  ('20260226_expense_claims.sql',                       now(), 'bootstrap'),
  ('20260226_expense_claims_fields.sql',                now(), 'bootstrap'),
  ('20260226_finance_categories.sql',                   now(), 'bootstrap'),
  ('20260226_finance_category_items.sql',               now(), 'bootstrap'),
  ('20260226_finance_custom_lists.sql',                 now(), 'bootstrap'),
  ('20260226_finance_vehicles.sql',                     now(), 'bootstrap'),
  ('20260226_fix_expense_fk.sql',                       now(), 'bootstrap'),
  ('20260226_fix_rls_policies.sql',                     now(), 'bootstrap'),
  ('20260228_crm_installments_normalize.sql',           now(), 'bootstrap'),
  ('20260302_create_jobs.sql',                          now(), 'bootstrap'),
  ('20260303_create_job_checklists.sql',                now(), 'bootstrap'),
  ('20260303_dynamic_job_types.sql',                    now(), 'bootstrap'),
  ('20260303_simplify_job_tags.sql',                    now(), 'bootstrap'),
  ('20260303_split_assigned_columns.sql',               now(), 'bootstrap'),
  ('20260305_add_missing_fk_indexes.sql',               now(), 'bootstrap'),
  ('20260305_create_notifications_table.sql',           now(), 'bootstrap'),
  ('20260305_drop_unused_indexes.sql',                  now(), 'bootstrap'),
  ('20260305_enable_rls_missing_tables.sql',            now(), 'bootstrap'),
  ('20260305_fix_duplicate_policies_and_initplan.sql',  now(), 'bootstrap'),
  ('20260310_create_ticket_attachments_bucket.sql',     now(), 'bootstrap'),
  ('20260317_add_staff_work_settings.sql',              now(), 'bootstrap'),
  ('20260317_create_checkin_photos_bucket.sql',         now(), 'bootstrap'),
  ('20260319_ai_analysis_history.sql',                  now(), 'bootstrap'),
  ('20260326_staff_junction_tables.sql',                now(), 'bootstrap'),
  ('20260328_add_expense_claims_paid_by_fk.sql',        now(), 'bootstrap'),
  ('20260402_add_evaluated_by_fk.sql',                  now(), 'bootstrap'),
  ('20260402_add_kpi_evaluation_replies.sql',           now(), 'bootstrap'),
  ('20260408_add_crm_notification_types.sql',           now(), 'bootstrap'),
  ('20260414_add_pending_month_end_status.sql',         now(), 'bootstrap'),
  ('20260414_expense_claims_workflow.sql',              now(), 'bootstrap'),
  ('20260423_add_advance_claim_type.sql',               now(), 'bootstrap'),
  ('20260423_add_advance_spent_items.sql',              now(), 'bootstrap'),
  ('20260423_seed_advance_test_cases.sql',              now(), 'bootstrap'),
  ('20260424_add_refund_confirmed_status.sql',          now(), 'bootstrap'),
  ('20260427_add_funding_source_and_tax_invoice_numbers.sql', now(), 'bootstrap'),
  ('20260504_create_leave_requests.sql',                now(), 'bootstrap'),
  ('20260505_add_schema_introspect_rpc.sql',            now(), 'bootstrap'),
  -- This file itself — recording it so applying twice is also a no-op.
  ('20260506_create_app_migrations.sql',                now(), 'bootstrap')
ON CONFLICT (filename) DO NOTHING;
