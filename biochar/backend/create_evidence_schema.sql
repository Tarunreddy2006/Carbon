-- 1. Drop existing tables if they exist in reverse dependency order
DROP TABLE IF EXISTS public.evidence_ai_results CASCADE;
DROP TABLE IF EXISTS public.evidence_reviews CASCADE;
DROP TABLE IF EXISTS public.evidence_files CASCADE;
DROP TABLE IF EXISTS public.evidence_audit_logs CASCADE;
DROP TABLE IF EXISTS public.evidence CASCADE;

-- 2. Create public.evidence
CREATE TABLE public.evidence (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid,
  entity_type text NOT NULL, -- 'feedstock', 'pyrolysis', 'batch', 'sample', 'test', 'storage', 'distribution', 'application', 'monitoring', etc.
  entity_id uuid NOT NULL,
  activity text,
  uploaded_by uuid,
  uploaded_by_role text,
  capture_timestamp timestamp with time zone,
  upload_timestamp timestamp with time zone DEFAULT now(),
  latitude double precision,
  longitude double precision,
  altitude double precision,
  device_information jsonb,
  media_type text,
  filename text,
  original_filename text,
  storage_path text,
  file_size bigint,
  mime_type text,
  bucket_name text,
  object_key text,
  storage_provider text,
  sha256_hash text,
  upload_status text NOT NULL DEFAULT 'Pending',
  verification_status text NOT NULL DEFAULT 'Draft', -- 'Draft', 'Uploaded', 'Pending Review', 'Approved', 'Rejected', 'Locked'
  reviewer_id uuid,
  reviewed_at timestamp with time zone,
  uploaded_at timestamp with time zone,
  remarks text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT evidence_pkey PRIMARY KEY (id),
  CONSTRAINT evidence_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT evidence_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL,
  CONSTRAINT evidence_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT evidence_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for evidence performance
CREATE INDEX idx_evidence_org_id ON public.evidence(organization_id);
CREATE INDEX idx_evidence_project_id ON public.evidence(project_id);
CREATE INDEX idx_evidence_entity ON public.evidence(entity_type, entity_id);
CREATE INDEX idx_evidence_status ON public.evidence(verification_status);

-- 3. Create public.evidence_files
CREATE TABLE public.evidence_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL,
  file_role text NOT NULL, -- 'original', 'compressed', 'thumbnail'
  filename text NOT NULL,
  storage_path text NOT NULL,
  file_size bigint,
  mime_type text,
  sha256_hash text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT evidence_files_pkey PRIMARY KEY (id),
  CONSTRAINT evidence_files_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.evidence(id) ON DELETE CASCADE
);

CREATE INDEX idx_evidence_files_evidence_id ON public.evidence_files(evidence_id);

-- 4. Create public.evidence_reviews
CREATE TABLE public.evidence_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  review_time timestamp with time zone DEFAULT now(),
  action text NOT NULL, -- 'Approve', 'Reject', 'Lock'
  comments text,
  previous_status text,
  new_status text,
  CONSTRAINT evidence_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT evidence_reviews_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.evidence(id) ON DELETE CASCADE,
  CONSTRAINT evidence_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX idx_evidence_reviews_evidence_id ON public.evidence_reviews(evidence_id);

-- 5. Create public.evidence_ai_results
CREATE TABLE public.evidence_ai_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL,
  detected_objects jsonb,
  confidence numeric,
  duplicate_detection_score numeric,
  metadata_extraction jsonb,
  anomaly_flags jsonb,
  gps_validation jsonb,
  timestamp_validation jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT evidence_ai_results_pkey PRIMARY KEY (id),
  CONSTRAINT evidence_ai_results_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.evidence(id) ON DELETE CASCADE
);

CREATE INDEX idx_evidence_ai_results_evidence_id ON public.evidence_ai_results(evidence_id);

-- 6. Create public.evidence_audit_logs
CREATE TABLE public.evidence_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evidence_id uuid,
  user_id uuid,
  action text NOT NULL, -- 'upload', 'edit', 'review', 'approve', 'reject', 'delete', 'download'
  ip_address text,
  details jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT evidence_audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT evidence_audit_logs_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.evidence(id) ON DELETE SET NULL,
  CONSTRAINT evidence_audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_evidence_audit_logs_evidence_id ON public.evidence_audit_logs(evidence_id);

-- 7. Enable Row Level Security (RLS) on all new tables
ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_ai_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_audit_logs ENABLE ROW LEVEL SECURITY;

-- 8. Create RLS Policies

-- For evidence
CREATE POLICY "Users can view evidence in their organization"
ON public.evidence FOR SELECT TO authenticated
USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can insert evidence in their organization"
ON public.evidence FOR INSERT TO authenticated
WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update evidence in their organization"
ON public.evidence FOR UPDATE TO authenticated
USING (organization_id = public.get_user_organization_id())
WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete evidence in their organization"
ON public.evidence FOR DELETE TO authenticated
USING (organization_id = public.get_user_organization_id());

-- For evidence_files
CREATE POLICY "Users can view evidence_files in their organization"
ON public.evidence_files FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.evidence e
    WHERE e.id = evidence_files.evidence_id
      AND e.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can insert evidence_files in their organization"
ON public.evidence_files FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.evidence e
    WHERE e.id = evidence_files.evidence_id
      AND e.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can update evidence_files in their organization"
ON public.evidence_files FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.evidence e
    WHERE e.id = evidence_files.evidence_id
      AND e.organization_id = public.get_user_organization_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.evidence e
    WHERE e.id = evidence_files.evidence_id
      AND e.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can delete evidence_files in their organization"
ON public.evidence_files FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.evidence e
    WHERE e.id = evidence_files.evidence_id
      AND e.organization_id = public.get_user_organization_id()
  )
);

-- For evidence_reviews
CREATE POLICY "Users can view evidence_reviews in their organization"
ON public.evidence_reviews FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.evidence e
    WHERE e.id = evidence_reviews.evidence_id
      AND e.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can insert evidence_reviews in their organization"
ON public.evidence_reviews FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.evidence e
    WHERE e.id = evidence_reviews.evidence_id
      AND e.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can update evidence_reviews in their organization"
ON public.evidence_reviews FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.evidence e
    WHERE e.id = evidence_reviews.evidence_id
      AND e.organization_id = public.get_user_organization_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.evidence e
    WHERE e.id = evidence_reviews.evidence_id
      AND e.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can delete evidence_reviews in their organization"
ON public.evidence_reviews FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.evidence e
    WHERE e.id = evidence_reviews.evidence_id
      AND e.organization_id = public.get_user_organization_id()
  )
);

-- For evidence_ai_results
CREATE POLICY "Users can view evidence_ai_results in their organization"
ON public.evidence_ai_results FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.evidence e
    WHERE e.id = evidence_ai_results.evidence_id
      AND e.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can insert evidence_ai_results in their organization"
ON public.evidence_ai_results FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.evidence e
    WHERE e.id = evidence_ai_results.evidence_id
      AND e.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can update evidence_ai_results in their organization"
ON public.evidence_ai_results FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.evidence e
    WHERE e.id = evidence_ai_results.evidence_id
      AND e.organization_id = public.get_user_organization_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.evidence e
    WHERE e.id = evidence_ai_results.evidence_id
      AND e.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can delete evidence_ai_results in their organization"
ON public.evidence_ai_results FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.evidence e
    WHERE e.id = evidence_ai_results.evidence_id
      AND e.organization_id = public.get_user_organization_id()
  )
);

-- For evidence_audit_logs
CREATE POLICY "Users can view evidence_audit_logs in their organization"
ON public.evidence_audit_logs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.evidence e
    WHERE e.id = evidence_audit_logs.evidence_id
      AND e.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can insert evidence_audit_logs in their organization"
ON public.evidence_audit_logs FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.evidence e
    WHERE e.id = evidence_audit_logs.evidence_id
      AND e.organization_id = public.get_user_organization_id()
  )
);

-- ──────────────────────────────────────────────────────────────────────────────
-- Mass Balance & Anomaly Engine Extensions
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.feedstock_batches ADD COLUMN IF NOT EXISTS wet_weight_kg double precision;
ALTER TABLE public.feedstock_batches ADD COLUMN IF NOT EXISTS dry_weight_kg double precision;
ALTER TABLE public.feedstock_batches ADD COLUMN IF NOT EXISTS water_weight_kg double precision;
ALTER TABLE public.feedstock_batches ADD COLUMN IF NOT EXISTS expected_yield_percent double precision DEFAULT 30.0;
ALTER TABLE public.feedstock_batches ADD COLUMN IF NOT EXISTS moisture_measurement_method text;

ALTER TABLE public.biochar_batches ADD COLUMN IF NOT EXISTS produced_weight_kg double precision;
ALTER TABLE public.biochar_batches ADD COLUMN IF NOT EXISTS calculated_yield_percent double precision;
ALTER TABLE public.biochar_batches ADD COLUMN IF NOT EXISTS mass_balance_status text NOT NULL DEFAULT 'Pending';
ALTER TABLE public.biochar_batches ADD COLUMN IF NOT EXISTS anomaly_status text NOT NULL DEFAULT 'Normal';
ALTER TABLE public.biochar_batches ADD COLUMN IF NOT EXISTS anomaly_reason text;

CREATE TABLE IF NOT EXISTS public.mass_balance_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid UNIQUE,
  min_yield_percent double precision NOT NULL DEFAULT 15.0,
  max_yield_percent double precision NOT NULL DEFAULT 50.0,
  max_moisture_percent double precision NOT NULL DEFAULT 65.0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT mass_balance_configs_pkey PRIMARY KEY (id),
  CONSTRAINT mass_balance_configs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.mass_balance_anomalies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  project_id uuid,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  severity text NOT NULL,
  category text NOT NULL,
  human_readable_explanation text NOT NULL,
  status text NOT NULL DEFAULT 'Active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  resolved_by uuid,
  CONSTRAINT mass_balance_anomalies_pkey PRIMARY KEY (id),
  CONSTRAINT mass_balance_anomalies_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT mass_balance_anomalies_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL,
  CONSTRAINT mass_balance_anomalies_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_mb_anomalies_status ON public.mass_balance_anomalies(status);
CREATE INDEX IF NOT EXISTS idx_mb_anomalies_org_id ON public.mass_balance_anomalies(organization_id);

