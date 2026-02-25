-- Revenue VAT + WHT columns on job_cost_events
-- revenue_vat_mode: 'none' | 'included' | 'excluded'
-- revenue_wht_rate: 0-5 (percent)
ALTER TABLE job_cost_events
ADD COLUMN IF NOT EXISTS revenue_vat_mode TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS revenue_wht_rate NUMERIC DEFAULT 0;
