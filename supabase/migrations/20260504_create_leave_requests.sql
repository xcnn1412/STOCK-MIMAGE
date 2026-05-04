-- ============================================================================
-- leave_requests — staff leave requests (personal / sick / vacation)
-- Lives next to staff_checkins. Each request covers an inclusive date range
-- and goes through a pending → approved/rejected admin review flow.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- ลากิจ / ลาป่วย / ลาพักร้อน
  leave_type    text NOT NULL CHECK (leave_type IN ('personal', 'sick', 'vacation')),

  -- inclusive range; total_days supports half-day (0.5) leave entries
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  total_days    numeric(4,1) NOT NULL CHECK (total_days > 0),

  reason         text,
  attachment_url text,  -- e.g. doctor's note for sick leave

  -- review workflow
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by    uuid REFERENCES public.profiles(id),
  reviewed_at    timestamptz,
  review_note    text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT leave_requests_valid_range CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_user_id ON public.leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status  ON public.leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates   ON public.leave_requests(start_date, end_date);

-- updated_at trigger — reuse the shared helper if present, otherwise create it
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leave_requests_set_updated_at ON public.leave_requests;
CREATE TRIGGER leave_requests_set_updated_at
BEFORE UPDATE ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- RLS — most queries in this app go through service role, so the policy
-- only needs to cover client-direct reads (currently none, but enable for
-- defense in depth).
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leave_requests_self_read ON public.leave_requests;
CREATE POLICY leave_requests_self_read ON public.leave_requests
  FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.leave_requests IS
  'คำขอลางาน — ลากิจ / ลาป่วย / ลาพักร้อน, มี approval workflow';
