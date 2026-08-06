-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  registration_number text,
  gst_number text,
  email text,
  phone text,
  website text,
  address text,
  city text,
  state text,
  country text,
  logo_url text,
  subscription_plan text DEFAULT 'Free'::text,
  subscription_status text DEFAULT 'Active'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT organizations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  first_name text,
  last_name text,
  phone text,
  avatar_url text,
  organization_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.roles (
  id integer NOT NULL DEFAULT nextval('roles_id_seq'::regclass),
  name text NOT NULL UNIQUE,
  description text,
  CONSTRAINT roles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.organization_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  user_id uuid,
  role_id integer,
  invited_by uuid,
  joined_at timestamp with time zone DEFAULT now(),
  CONSTRAINT organization_members_pkey PRIMARY KEY (id),
  CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT organization_members_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id),
  CONSTRAINT organization_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id)
);
CREATE TABLE public.invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  email text,
  role_id integer,
  invited_by uuid,
  token text,
  expires_at timestamp with time zone,
  accepted boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT invitations_pkey PRIMARY KEY (id),
  CONSTRAINT invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT invitations_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id),
  CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id)
);
CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  methodology text,
  project_type text DEFAULT 'Biochar'::text,
  description text,
  country text,
  state text,
  district text,
  latitude double precision,
  longitude double precision,
  start_date date,
  end_date date,
  status text DEFAULT 'Draft'::text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.feedstock_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  batch_code text NOT NULL UNIQUE,
  feedstock_type text NOT NULL,
  supplier_name text,
  supplier_contact text,
  origin_location text,
  received_date date,
  weight_kg numeric,
  moisture_percent numeric,
  transport_distance_km numeric,
  remarks text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT feedstock_batches_pkey PRIMARY KEY (id),
  CONSTRAINT feedstock_batches_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT feedstock_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.pyrolysis_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  feedstock_batch_id uuid NOT NULL,
  run_number text,
  reactor_name text,
  operator_name text,
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  average_temperature numeric,
  maximum_temperature numeric,
  residence_time_minutes integer,
  electricity_kwh numeric,
  fuel_used_liters numeric,
  remarks text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pyrolysis_runs_pkey PRIMARY KEY (id),
  CONSTRAINT pyrolysis_runs_feedstock_batch_id_fkey FOREIGN KEY (feedstock_batch_id) REFERENCES public.feedstock_batches(id)
);
CREATE TABLE public.biochar_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pyrolysis_run_id uuid NOT NULL,
  batch_code text UNIQUE,
  weight_kg numeric,
  storage_location text,
  status text DEFAULT 'In Storage'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT biochar_batches_pkey PRIMARY KEY (id),
  CONSTRAINT biochar_batches_pyrolysis_run_id_fkey FOREIGN KEY (pyrolysis_run_id) REFERENCES public.pyrolysis_runs(id)
);
CREATE TABLE public.project_sites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  site_name text NOT NULL,
  address text,
  latitude double precision,
  longitude double precision,
  area_hectares numeric,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT project_sites_pkey PRIMARY KEY (id),
  CONSTRAINT project_sites_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.project_team (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  user_id uuid,
  role text,
  assigned_at timestamp with time zone DEFAULT now(),
  CONSTRAINT project_team_pkey PRIMARY KEY (id),
  CONSTRAINT project_team_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT project_team_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.project_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  file_name text,
  file_url text,
  document_type text,
  uploaded_by uuid,
  uploaded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT project_documents_pkey PRIMARY KEY (id),
  CONSTRAINT project_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT project_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)
);
CREATE TABLE public.feedstock_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text,
  description text,
  CONSTRAINT feedstock_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.feedstock_suppliers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  supplier_name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  country text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT feedstock_suppliers_pkey PRIMARY KEY (id),
  CONSTRAINT feedstock_suppliers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.feedstock_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  batch_id uuid,
  vehicle_number text,
  driver_name text,
  delivery_date timestamp with time zone,
  gross_weight numeric,
  tare_weight numeric,
  net_weight numeric,
  verified boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT feedstock_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT feedstock_deliveries_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.feedstock_batches(id)
);
CREATE TABLE public.feedstock_quality (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  batch_id uuid,
  moisture_percent numeric,
  ash_percent numeric,
  contamination_percent numeric,
  inspection_notes text,
  inspected_by uuid,
  inspected_at timestamp with time zone DEFAULT now(),
  CONSTRAINT feedstock_quality_pkey PRIMARY KEY (id),
  CONSTRAINT feedstock_quality_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.feedstock_batches(id),
  CONSTRAINT feedstock_quality_inspected_by_fkey FOREIGN KEY (inspected_by) REFERENCES auth.users(id)
);
CREATE TABLE public.plants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid,
  plant_name text NOT NULL,
  address text,
  latitude double precision,
  longitude double precision,
  capacity_tpd numeric,
  status text DEFAULT 'Active'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT plants_pkey PRIMARY KEY (id),
  CONSTRAINT plants_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT plants_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.reactors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plant_id uuid,
  reactor_name text,
  manufacturer text,
  model text,
  reactor_type text,
  maximum_temperature numeric,
  capacity_kg_hour numeric,
  installation_date date,
  status text DEFAULT 'Operational'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reactors_pkey PRIMARY KEY (id),
  CONSTRAINT reactors_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES public.plants(id)
);
CREATE TABLE public.plant_operators (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plant_id uuid,
  user_id uuid,
  designation text,
  active boolean DEFAULT true,
  CONSTRAINT plant_operators_pkey PRIMARY KEY (id),
  CONSTRAINT plant_operators_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES public.plants(id),
  CONSTRAINT plant_operators_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.reactor_sensor_logs (
  id bigint NOT NULL DEFAULT nextval('reactor_sensor_logs_id_seq'::regclass),
  reactor_id uuid,
  pyrolysis_run_id uuid,
  sensor_name text,
  sensor_value numeric,
  unit text,
  recorded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reactor_sensor_logs_pkey PRIMARY KEY (id),
  CONSTRAINT reactor_sensor_logs_reactor_id_fkey FOREIGN KEY (reactor_id) REFERENCES public.reactors(id),
  CONSTRAINT reactor_sensor_logs_pyrolysis_run_id_fkey FOREIGN KEY (pyrolysis_run_id) REFERENCES public.pyrolysis_runs(id)
);
CREATE TABLE public.fuel_consumption (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pyrolysis_run_id uuid,
  fuel_type text,
  quantity numeric,
  unit text,
  recorded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT fuel_consumption_pkey PRIMARY KEY (id),
  CONSTRAINT fuel_consumption_pyrolysis_run_id_fkey FOREIGN KEY (pyrolysis_run_id) REFERENCES public.pyrolysis_runs(id)
);
CREATE TABLE public.electricity_consumption (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pyrolysis_run_id uuid,
  kwh numeric,
  source text,
  recorded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT electricity_consumption_pkey PRIMARY KEY (id),
  CONSTRAINT electricity_consumption_pyrolysis_run_id_fkey FOREIGN KEY (pyrolysis_run_id) REFERENCES public.pyrolysis_runs(id)
);
CREATE TABLE public.reactor_maintenance (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reactor_id uuid,
  maintenance_type text,
  description text,
  performed_by text,
  maintenance_date date,
  next_due_date date,
  CONSTRAINT reactor_maintenance_pkey PRIMARY KEY (id),
  CONSTRAINT reactor_maintenance_reactor_id_fkey FOREIGN KEY (reactor_id) REFERENCES public.reactors(id)
);
CREATE TABLE public.biochar_batch_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  biochar_batch_id uuid,
  pyrolysis_run_id uuid,
  weight_contributed_kg numeric,
  CONSTRAINT biochar_batch_runs_pkey PRIMARY KEY (id),
  CONSTRAINT biochar_batch_runs_biochar_batch_id_fkey FOREIGN KEY (biochar_batch_id) REFERENCES public.biochar_batches(id),
  CONSTRAINT biochar_batch_runs_pyrolysis_run_id_fkey FOREIGN KEY (pyrolysis_run_id) REFERENCES public.pyrolysis_runs(id)
);
CREATE TABLE public.storage_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  location_name text NOT NULL,
  address text,
  latitude double precision,
  longitude double precision,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT storage_locations_pkey PRIMARY KEY (id),
  CONSTRAINT storage_locations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.biochar_inventory (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  biochar_batch_id uuid,
  storage_location_id uuid,
  quantity_kg numeric,
  available_kg numeric,
  reserved_kg numeric,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT biochar_inventory_pkey PRIMARY KEY (id),
  CONSTRAINT biochar_inventory_biochar_batch_id_fkey FOREIGN KEY (biochar_batch_id) REFERENCES public.biochar_batches(id),
  CONSTRAINT biochar_inventory_storage_location_id_fkey FOREIGN KEY (storage_location_id) REFERENCES public.storage_locations(id)
);
CREATE TABLE public.inventory_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  biochar_batch_id uuid,
  from_location uuid,
  to_location uuid,
  quantity_kg numeric,
  movement_type text,
  moved_by uuid,
  moved_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inventory_movements_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_movements_biochar_batch_id_fkey FOREIGN KEY (biochar_batch_id) REFERENCES public.biochar_batches(id),
  CONSTRAINT inventory_movements_from_location_fkey FOREIGN KEY (from_location) REFERENCES public.storage_locations(id),
  CONSTRAINT inventory_movements_to_location_fkey FOREIGN KEY (to_location) REFERENCES public.storage_locations(id),
  CONSTRAINT inventory_movements_moved_by_fkey FOREIGN KEY (moved_by) REFERENCES auth.users(id)
);
CREATE TABLE public.shipments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  biochar_batch_id uuid,
  shipment_number text UNIQUE,
  destination text,
  transport_company text,
  vehicle_number text,
  shipped_weight_kg numeric,
  shipped_date date,
  status text DEFAULT 'Pending'::text,
  CONSTRAINT shipments_pkey PRIMARY KEY (id),
  CONSTRAINT shipments_biochar_batch_id_fkey FOREIGN KEY (biochar_batch_id) REFERENCES public.biochar_batches(id)
);
CREATE TABLE public.biochar_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  biochar_batch_id uuid,
  application_site text,
  latitude double precision,
  longitude double precision,
  application_rate_kg_ha numeric,
  area_hectares numeric,
  application_date date,
  applied_by text,
  remarks text,
  CONSTRAINT biochar_applications_pkey PRIMARY KEY (id),
  CONSTRAINT biochar_applications_biochar_batch_id_fkey FOREIGN KEY (biochar_batch_id) REFERENCES public.biochar_batches(id)
);
CREATE TABLE public.laboratories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  laboratory_name text NOT NULL,
  accreditation_number text,
  contact_person text,
  email text,
  phone text,
  address text,
  country text,
  website text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT laboratories_pkey PRIMARY KEY (id),
  CONSTRAINT laboratories_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.biochar_samples (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  biochar_batch_id uuid NOT NULL,
  sample_code text NOT NULL UNIQUE,
  collected_by uuid,
  collection_date date,
  sampling_method text,
  sample_weight_grams numeric,
  remarks text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT biochar_samples_pkey PRIMARY KEY (id),
  CONSTRAINT biochar_samples_biochar_batch_id_fkey FOREIGN KEY (biochar_batch_id) REFERENCES public.biochar_batches(id),
  CONSTRAINT biochar_samples_collected_by_fkey FOREIGN KEY (collected_by) REFERENCES auth.users(id)
);
CREATE TABLE public.laboratory_tests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sample_id uuid NOT NULL,
  laboratory_id uuid,
  test_reference text,
  received_date date,
  completed_date date,
  analyst_name text,
  status text DEFAULT 'Pending'::text,
  remarks text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT laboratory_tests_pkey PRIMARY KEY (id),
  CONSTRAINT laboratory_tests_sample_id_fkey FOREIGN KEY (sample_id) REFERENCES public.biochar_samples(id),
  CONSTRAINT laboratory_tests_laboratory_id_fkey FOREIGN KEY (laboratory_id) REFERENCES public.laboratories(id)
);
CREATE TABLE public.laboratory_parameters (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  parameter_name text UNIQUE,
  unit text,
  description text,
  CONSTRAINT laboratory_parameters_pkey PRIMARY KEY (id)
);
CREATE TABLE public.laboratory_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  laboratory_test_id uuid,
  parameter_id uuid,
  measured_value numeric,
  detection_limit numeric,
  pass boolean,
  remarks text,
  CONSTRAINT laboratory_results_pkey PRIMARY KEY (id),
  CONSTRAINT laboratory_results_laboratory_test_id_fkey FOREIGN KEY (laboratory_test_id) REFERENCES public.laboratory_tests(id),
  CONSTRAINT laboratory_results_parameter_id_fkey FOREIGN KEY (parameter_id) REFERENCES public.laboratory_parameters(id)
);
CREATE TABLE public.laboratory_certificates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  laboratory_test_id uuid,
  certificate_number text,
  certificate_url text,
  issue_date date,
  expiry_date date,
  CONSTRAINT laboratory_certificates_pkey PRIMARY KEY (id),
  CONSTRAINT laboratory_certificates_laboratory_test_id_fkey FOREIGN KEY (laboratory_test_id) REFERENCES public.laboratory_tests(id)
);
CREATE TABLE public.laboratory_approvals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  laboratory_test_id uuid,
  approved_by uuid,
  approval_status text DEFAULT 'Pending'::text,
  approval_date date,
  comments text,
  CONSTRAINT laboratory_approvals_pkey PRIMARY KEY (id),
  CONSTRAINT laboratory_approvals_laboratory_test_id_fkey FOREIGN KEY (laboratory_test_id) REFERENCES public.laboratory_tests(id),
  CONSTRAINT laboratory_approvals_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id)
);
CREATE TABLE public.evidence_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text UNIQUE,
  description text,
  CONSTRAINT evidence_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.evidence (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  evidence_type_id uuid,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  title text,
  description text,
  uploaded_by uuid,
  uploaded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT evidence_pkey PRIMARY KEY (id),
  CONSTRAINT evidence_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT evidence_evidence_type_id_fkey FOREIGN KEY (evidence_type_id) REFERENCES public.evidence_types(id),
  CONSTRAINT evidence_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)
);
CREATE TABLE public.evidence_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evidence_id uuid,
  file_name text,
  file_url text,
  file_size bigint,
  mime_type text,
  checksum text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT evidence_files_pkey PRIMARY KEY (id),
  CONSTRAINT evidence_files_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.evidence(id)
);
CREATE TABLE public.gps_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evidence_id uuid,
  latitude double precision,
  longitude double precision,
  altitude double precision,
  accuracy_m numeric,
  recorded_at timestamp with time zone,
  CONSTRAINT gps_records_pkey PRIMARY KEY (id),
  CONSTRAINT gps_records_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.evidence(id)
);
CREATE TABLE public.photo_metadata (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evidence_file_id uuid,
  width integer,
  height integer,
  camera_make text,
  camera_model text,
  captured_at timestamp with time zone,
  CONSTRAINT photo_metadata_pkey PRIMARY KEY (id),
  CONSTRAINT photo_metadata_evidence_file_id_fkey FOREIGN KEY (evidence_file_id) REFERENCES public.evidence_files(id)
);
CREATE TABLE public.digital_signatures (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evidence_id uuid,
  signed_by uuid,
  signature_url text,
  signed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT digital_signatures_pkey PRIMARY KEY (id),
  CONSTRAINT digital_signatures_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.evidence(id),
  CONSTRAINT digital_signatures_signed_by_fkey FOREIGN KEY (signed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.evidence_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evidence_id uuid,
  reviewer uuid,
  status text,
  comments text,
  reviewed_at timestamp with time zone,
  CONSTRAINT evidence_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT evidence_reviews_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.evidence(id),
  CONSTRAINT evidence_reviews_reviewer_fkey FOREIGN KEY (reviewer) REFERENCES auth.users(id)
);
CREATE TABLE public.monitoring_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  name text NOT NULL,
  description text,
  frequency text,
  methodology text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT monitoring_plans_pkey PRIMARY KEY (id),
  CONSTRAINT monitoring_plans_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.monitoring_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  monitoring_plan_id uuid,
  entity_type text,
  entity_id uuid,
  monitored_by uuid,
  monitoring_date timestamp with time zone,
  status text DEFAULT 'Completed'::text,
  remarks text,
  CONSTRAINT monitoring_events_pkey PRIMARY KEY (id),
  CONSTRAINT monitoring_events_monitoring_plan_id_fkey FOREIGN KEY (monitoring_plan_id) REFERENCES public.monitoring_plans(id),
  CONSTRAINT monitoring_events_monitored_by_fkey FOREIGN KEY (monitored_by) REFERENCES auth.users(id)
);
CREATE TABLE public.monitoring_observations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  monitoring_event_id uuid,
  parameter_name text,
  observed_value text,
  expected_value text,
  unit text,
  pass boolean,
  remarks text,
  CONSTRAINT monitoring_observations_pkey PRIMARY KEY (id),
  CONSTRAINT monitoring_observations_monitoring_event_id_fkey FOREIGN KEY (monitoring_event_id) REFERENCES public.monitoring_events(id)
);
CREATE TABLE public.monitoring_checklists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  monitoring_plan_id uuid,
  checklist_item text,
  mandatory boolean DEFAULT true,
  display_order integer,
  CONSTRAINT monitoring_checklists_pkey PRIMARY KEY (id),
  CONSTRAINT monitoring_checklists_monitoring_plan_id_fkey FOREIGN KEY (monitoring_plan_id) REFERENCES public.monitoring_plans(id)
);
CREATE TABLE public.monitoring_issues (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  monitoring_event_id uuid,
  severity text,
  issue_type text,
  description text,
  status text DEFAULT 'Open'::text,
  reported_by uuid,
  reported_at timestamp with time zone DEFAULT now(),
  CONSTRAINT monitoring_issues_pkey PRIMARY KEY (id),
  CONSTRAINT monitoring_issues_monitoring_event_id_fkey FOREIGN KEY (monitoring_event_id) REFERENCES public.monitoring_events(id),
  CONSTRAINT monitoring_issues_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES auth.users(id)
);
CREATE TABLE public.corrective_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  issue_id uuid,
  action_description text,
  assigned_to uuid,
  due_date date,
  completed_date date,
  status text DEFAULT 'Open'::text,
  CONSTRAINT corrective_actions_pkey PRIMARY KEY (id),
  CONSTRAINT corrective_actions_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES public.monitoring_issues(id),
  CONSTRAINT corrective_actions_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id)
);
CREATE TABLE public.monitoring_schedule (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  monitoring_plan_id uuid,
  scheduled_date date,
  assigned_to uuid,
  completed boolean DEFAULT false,
  CONSTRAINT monitoring_schedule_pkey PRIMARY KEY (id),
  CONSTRAINT monitoring_schedule_monitoring_plan_id_fkey FOREIGN KEY (monitoring_plan_id) REFERENCES public.monitoring_plans(id),
  CONSTRAINT monitoring_schedule_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id)
);
CREATE TABLE public.calculation_methods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  method_name text NOT NULL,
  methodology text,
  version text,
  description text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT calculation_methods_pkey PRIMARY KEY (id)
);
CREATE TABLE public.carbon_calculations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  biochar_batch_id uuid,
  calculation_method_id uuid,
  calculation_date date,
  version integer DEFAULT 1,
  status text DEFAULT 'Draft'::text,
  calculated_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT carbon_calculations_pkey PRIMARY KEY (id),
  CONSTRAINT carbon_calculations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT carbon_calculations_biochar_batch_id_fkey FOREIGN KEY (biochar_batch_id) REFERENCES public.biochar_batches(id),
  CONSTRAINT carbon_calculations_calculation_method_id_fkey FOREIGN KEY (calculation_method_id) REFERENCES public.calculation_methods(id),
  CONSTRAINT carbon_calculations_calculated_by_fkey FOREIGN KEY (calculated_by) REFERENCES auth.users(id)
);
CREATE TABLE public.calculation_inputs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  carbon_calculation_id uuid,
  input_name text,
  input_value numeric,
  unit text,
  source text,
  remarks text,
  CONSTRAINT calculation_inputs_pkey PRIMARY KEY (id),
  CONSTRAINT calculation_inputs_carbon_calculation_id_fkey FOREIGN KEY (carbon_calculation_id) REFERENCES public.carbon_calculations(id)
);
CREATE TABLE public.calculation_outputs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  carbon_calculation_id uuid,
  output_name text,
  output_value numeric,
  unit text,
  CONSTRAINT calculation_outputs_pkey PRIMARY KEY (id),
  CONSTRAINT calculation_outputs_carbon_calculation_id_fkey FOREIGN KEY (carbon_calculation_id) REFERENCES public.carbon_calculations(id)
);
CREATE TABLE public.emission_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  carbon_calculation_id uuid,
  source_name text,
  emission_value numeric,
  unit text,
  remarks text,
  CONSTRAINT emission_sources_pkey PRIMARY KEY (id),
  CONSTRAINT emission_sources_carbon_calculation_id_fkey FOREIGN KEY (carbon_calculation_id) REFERENCES public.carbon_calculations(id)
);
CREATE TABLE public.carbon_credit_estimates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  carbon_calculation_id uuid,
  gross_removal numeric,
  deductions numeric,
  net_removal numeric,
  estimated_credits numeric,
  unit text DEFAULT 'tCO2e'::text,
  CONSTRAINT carbon_credit_estimates_pkey PRIMARY KEY (id),
  CONSTRAINT carbon_credit_estimates_carbon_calculation_id_fkey FOREIGN KEY (carbon_calculation_id) REFERENCES public.carbon_calculations(id)
);
CREATE TABLE public.calculation_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  carbon_calculation_id uuid,
  version integer,
  change_description text,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT calculation_versions_pkey PRIMARY KEY (id),
  CONSTRAINT calculation_versions_carbon_calculation_id_fkey FOREIGN KEY (carbon_calculation_id) REFERENCES public.carbon_calculations(id),
  CONSTRAINT calculation_versions_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.registries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registry_name text NOT NULL,
  website text,
  contact_email text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT registries_pkey PRIMARY KEY (id)
);
CREATE TABLE public.registry_methodologies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registry_id uuid,
  methodology_code text,
  methodology_name text,
  version text,
  active boolean DEFAULT true,
  CONSTRAINT registry_methodologies_pkey PRIMARY KEY (id),
  CONSTRAINT registry_methodologies_registry_id_fkey FOREIGN KEY (registry_id) REFERENCES public.registries(id)
);
CREATE TABLE public.registry_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  registry_id uuid,
  methodology_id uuid,
  report_number text UNIQUE,
  reporting_period_start date,
  reporting_period_end date,
  report_status text DEFAULT 'Draft'::text,
  generated_by uuid,
  generated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT registry_reports_pkey PRIMARY KEY (id),
  CONSTRAINT registry_reports_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT registry_reports_registry_id_fkey FOREIGN KEY (registry_id) REFERENCES public.registries(id),
  CONSTRAINT registry_reports_methodology_id_fkey FOREIGN KEY (methodology_id) REFERENCES public.registry_methodologies(id),
  CONSTRAINT registry_reports_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES auth.users(id)
);
CREATE TABLE public.report_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registry_report_id uuid,
  section_name text,
  content jsonb,
  completed boolean DEFAULT false,
  CONSTRAINT report_sections_pkey PRIMARY KEY (id),
  CONSTRAINT report_sections_registry_report_id_fkey FOREIGN KEY (registry_report_id) REFERENCES public.registry_reports(id)
);
CREATE TABLE public.report_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registry_report_id uuid,
  file_name text,
  file_url text,
  attachment_type text,
  uploaded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT report_attachments_pkey PRIMARY KEY (id),
  CONSTRAINT report_attachments_registry_report_id_fkey FOREIGN KEY (registry_report_id) REFERENCES public.registry_reports(id)
);
CREATE TABLE public.report_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registry_report_id uuid,
  submitted_by uuid,
  submission_date timestamp with time zone,
  submission_status text,
  registry_reference text,
  remarks text,
  CONSTRAINT report_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT report_submissions_registry_report_id_fkey FOREIGN KEY (registry_report_id) REFERENCES public.registry_reports(id),
  CONSTRAINT report_submissions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id)
);
CREATE TABLE public.report_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registry_report_id uuid,
  version integer,
  changes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT report_versions_pkey PRIMARY KEY (id),
  CONSTRAINT report_versions_registry_report_id_fkey FOREIGN KEY (registry_report_id) REFERENCES public.registry_reports(id),
  CONSTRAINT report_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.verification_cases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registry_report_id uuid NOT NULL,
  verification_number text UNIQUE,
  verification_type text,
  status text DEFAULT 'Pending'::text,
  verification_start date,
  verification_end date,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT verification_cases_pkey PRIMARY KEY (id),
  CONSTRAINT verification_cases_registry_report_id_fkey FOREIGN KEY (registry_report_id) REFERENCES public.registry_reports(id)
);
CREATE TABLE public.verification_organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  accreditation text,
  contact_email text,
  website text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT verification_organizations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.auditors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  verification_organization_id uuid,
  user_id uuid,
  designation text,
  accreditation_number text,
  active boolean DEFAULT true,
  CONSTRAINT auditors_pkey PRIMARY KEY (id),
  CONSTRAINT auditors_verification_organization_id_fkey FOREIGN KEY (verification_organization_id) REFERENCES public.verification_organizations(id),
  CONSTRAINT auditors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.verification_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  verification_case_id uuid,
  auditor_id uuid,
  assigned_date date,
  role text,
  CONSTRAINT verification_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT verification_assignments_verification_case_id_fkey FOREIGN KEY (verification_case_id) REFERENCES public.verification_cases(id),
  CONSTRAINT verification_assignments_auditor_id_fkey FOREIGN KEY (auditor_id) REFERENCES public.auditors(id)
);
CREATE TABLE public.verification_findings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  verification_case_id uuid,
  severity text,
  category text,
  title text,
  description text,
  status text DEFAULT 'Open'::text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT verification_findings_pkey PRIMARY KEY (id),
  CONSTRAINT verification_findings_verification_case_id_fkey FOREIGN KEY (verification_case_id) REFERENCES public.verification_cases(id),
  CONSTRAINT verification_findings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.finding_evidence (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  finding_id uuid,
  evidence_id uuid,
  remarks text,
  CONSTRAINT finding_evidence_pkey PRIMARY KEY (id),
  CONSTRAINT finding_evidence_finding_id_fkey FOREIGN KEY (finding_id) REFERENCES public.verification_findings(id),
  CONSTRAINT finding_evidence_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.evidence(id)
);
CREATE TABLE public.finding_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  finding_id uuid,
  responded_by uuid,
  response text,
  responded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT finding_responses_pkey PRIMARY KEY (id),
  CONSTRAINT finding_responses_finding_id_fkey FOREIGN KEY (finding_id) REFERENCES public.verification_findings(id),
  CONSTRAINT finding_responses_responded_by_fkey FOREIGN KEY (responded_by) REFERENCES auth.users(id)
);
CREATE TABLE public.verification_corrective_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  finding_id uuid,
  action_description text,
  assigned_to uuid,
  due_date date,
  completion_date date,
  status text DEFAULT 'Open'::text,
  CONSTRAINT verification_corrective_actions_pkey PRIMARY KEY (id),
  CONSTRAINT verification_corrective_actions_finding_id_fkey FOREIGN KEY (finding_id) REFERENCES public.verification_findings(id),
  CONSTRAINT verification_corrective_actions_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id)
);
CREATE TABLE public.verification_decisions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  verification_case_id uuid,
  decision text,
  decision_date date,
  decided_by uuid,
  comments text,
  CONSTRAINT verification_decisions_pkey PRIMARY KEY (id),
  CONSTRAINT verification_decisions_verification_case_id_fkey FOREIGN KEY (verification_case_id) REFERENCES public.verification_cases(id),
  CONSTRAINT verification_decisions_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.auditors(id)
);
CREATE TABLE public.notification_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  CONSTRAINT notification_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  user_id uuid,
  notification_type_id uuid,
  title text,
  message text,
  entity_type text,
  entity_id uuid,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT notifications_notification_type_id_fkey FOREIGN KEY (notification_type_id) REFERENCES public.notification_types(id)
);
CREATE TABLE public.notification_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  email_enabled boolean DEFAULT true,
  push_enabled boolean DEFAULT true,
  in_app_enabled boolean DEFAULT true,
  sms_enabled boolean DEFAULT false,
  CONSTRAINT notification_preferences_pkey PRIMARY KEY (id),
  CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  title text,
  description text,
  assigned_to uuid,
  entity_type text,
  entity_id uuid,
  due_date date,
  priority text,
  status text DEFAULT 'Pending'::text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id),
  CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.task_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid,
  commented_by uuid,
  comment text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT task_comments_pkey PRIMARY KEY (id),
  CONSTRAINT task_comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id),
  CONSTRAINT task_comments_commented_by_fkey FOREIGN KEY (commented_by) REFERENCES auth.users(id)
);
CREATE TABLE public.workflow_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  workflow_name text,
  entity_type text,
  active boolean DEFAULT true,
  CONSTRAINT workflow_definitions_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_definitions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.workflow_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workflow_id uuid,
  step_name text,
  display_order integer,
  assigned_role text,
  mandatory boolean DEFAULT true,
  CONSTRAINT workflow_steps_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflow_definitions(id)
);
CREATE TABLE public.workflow_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workflow_id uuid,
  entity_type text,
  entity_id uuid,
  current_step integer,
  status text DEFAULT 'Running'::text,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  CONSTRAINT workflow_executions_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_executions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflow_definitions(id)
);
CREATE TABLE public.workflow_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  execution_id uuid,
  step_name text,
  completed_by uuid,
  completed_at timestamp with time zone DEFAULT now(),
  remarks text,
  CONSTRAINT workflow_history_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_history_execution_id_fkey FOREIGN KEY (execution_id) REFERENCES public.workflow_executions(id),
  CONSTRAINT workflow_history_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  integration_name text,
  integration_type text,
  provider text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT integrations_pkey PRIMARY KEY (id),
  CONSTRAINT integrations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  key_name text,
  api_key_hash text,
  active boolean DEFAULT true,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT api_keys_pkey PRIMARY KEY (id),
  CONSTRAINT api_keys_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.webhooks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  webhook_name text,
  endpoint_url text,
  secret text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT webhooks_pkey PRIMARY KEY (id),
  CONSTRAINT webhooks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.webhook_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  webhook_id uuid,
  event_name text,
  payload jsonb,
  response_code integer,
  delivered_at timestamp with time zone,
  CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT webhook_deliveries_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES public.webhooks(id)
);
CREATE TABLE public.iot_devices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  device_name text,
  device_type text,
  serial_number text,
  active boolean DEFAULT true,
  registered_at timestamp with time zone DEFAULT now(),
  CONSTRAINT iot_devices_pkey PRIMARY KEY (id),
  CONSTRAINT iot_devices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.iot_readings (
  id bigint NOT NULL DEFAULT nextval('iot_readings_id_seq'::regclass),
  device_id uuid,
  recorded_at timestamp with time zone DEFAULT now(),
  metric_name text,
  metric_value numeric,
  unit text,
  CONSTRAINT iot_readings_pkey PRIMARY KEY (id),
  CONSTRAINT iot_readings_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.iot_devices(id)
);
CREATE TABLE public.gps_devices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  device_name text,
  imei text,
  active boolean DEFAULT true,
  CONSTRAINT gps_devices_pkey PRIMARY KEY (id),
  CONSTRAINT gps_devices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.gps_tracking (
  id bigint NOT NULL DEFAULT nextval('gps_tracking_id_seq'::regclass),
  device_id uuid,
  latitude double precision,
  longitude double precision,
  altitude double precision,
  speed numeric,
  recorded_at timestamp with time zone,
  CONSTRAINT gps_tracking_pkey PRIMARY KEY (id),
  CONSTRAINT gps_tracking_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.gps_devices(id)
);
CREATE TABLE public.laboratory_integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  laboratory_id uuid,
  integration_name text,
  api_endpoint text,
  active boolean DEFAULT true,
  CONSTRAINT laboratory_integrations_pkey PRIMARY KEY (id),
  CONSTRAINT laboratory_integrations_laboratory_id_fkey FOREIGN KEY (laboratory_id) REFERENCES public.laboratories(id)
);
CREATE POLICY "Allow authenticated users to create organizations"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (true);
CREATE POLICY "Users can view their own organization context"
ON public.organizations
FOR SELECT
TO authenticated
USING (
    id IN (
        SELECT organization_id
        FROM public.profiles
        WHERE id = auth.uid()
    )
);
CREATE POLICY "Allow users to insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = id
);
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    auth.uid() = id
);
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
    auth.uid() = id
)
WITH CHECK (
    auth.uid() = id
);
CREATE POLICY "Allow authenticated users to view system roles"
ON public.roles
FOR SELECT
TO authenticated
USING (true);
CREATE POLICY "Allow users to establish their own workspace membership"
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id
);
CREATE POLICY "Users can view their own memberships"
ON public.organization_members
FOR SELECT
TO authenticated
USING (
    auth.uid() = user_id
);
ALTER TABLE public.organization_members
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';
ALTER TABLE public.organization_members
ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.organization_members
ADD COLUMN IF NOT EXISTS invited_by UUID;
ALTER TABLE public.organization_members
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.organization_members
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.organization_members
ADD CONSTRAINT organization_members_invited_by_fkey
FOREIGN KEY (invited_by)
REFERENCES public.profiles(id)
ON DELETE SET NULL;
ALTER TABLE public.organization_members
ADD CONSTRAINT organization_members_user_fkey
FOREIGN KEY (user_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;
ALTER TABLE public.organization_members
ADD CONSTRAINT organization_members_unique_member
UNIQUE (organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user
ON public.organization_members(user_id);

CREATE INDEX IF NOT EXISTS idx_org_members_org
ON public.organization_members(organization_id);

CREATE INDEX IF NOT EXISTS idx_org_members_role
ON public.organization_members(role_id);
ALTER TABLE public.organization_members
ALTER COLUMN status
SET DEFAULT 'Active';

-- -----------------------------------------------------
-- Row Level Security (RLS) Policies for Biochar Schema
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

-- projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view projects in their organization"
ON public.projects FOR SELECT TO authenticated
USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can insert projects in their organization"
ON public.projects FOR INSERT TO authenticated
WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update projects in their organization"
ON public.projects FOR UPDATE TO authenticated
USING (organization_id = public.get_user_organization_id())
WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete projects in their organization"
ON public.projects FOR DELETE TO authenticated
USING (organization_id = public.get_user_organization_id());

-- invitations
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invitations in their organization"
ON public.invitations FOR SELECT TO authenticated
USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can insert invitations in their organization"
ON public.invitations FOR INSERT TO authenticated
WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update invitations in their organization"
ON public.invitations FOR UPDATE TO authenticated
USING (organization_id = public.get_user_organization_id())
WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete invitations in their organization"
ON public.invitations FOR DELETE TO authenticated
USING (organization_id = public.get_user_organization_id());

-- feedstock_batches
ALTER TABLE public.feedstock_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view feedstock_batches in their organization"
ON public.feedstock_batches FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = feedstock_batches.project_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can insert feedstock_batches in their organization"
ON public.feedstock_batches FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = feedstock_batches.project_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can update feedstock_batches in their organization"
ON public.feedstock_batches FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = feedstock_batches.project_id
      AND p.organization_id = public.get_user_organization_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = feedstock_batches.project_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can delete feedstock_batches in their organization"
ON public.feedstock_batches FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = feedstock_batches.project_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

-- pyrolysis_runs
ALTER TABLE public.pyrolysis_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view pyrolysis_runs in their organization"
ON public.pyrolysis_runs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.feedstock_batches fb
    JOIN public.projects p ON p.id = fb.project_id
    WHERE fb.id = pyrolysis_runs.feedstock_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can insert pyrolysis_runs in their organization"
ON public.pyrolysis_runs FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.feedstock_batches fb
    JOIN public.projects p ON p.id = fb.project_id
    WHERE fb.id = pyrolysis_runs.feedstock_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can update pyrolysis_runs in their organization"
ON public.pyrolysis_runs FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.feedstock_batches fb
    JOIN public.projects p ON p.id = fb.project_id
    WHERE fb.id = pyrolysis_runs.feedstock_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.feedstock_batches fb
    JOIN public.projects p ON p.id = fb.project_id
    WHERE fb.id = pyrolysis_runs.feedstock_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can delete pyrolysis_runs in their organization"
ON public.pyrolysis_runs FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.feedstock_batches fb
    JOIN public.projects p ON p.id = fb.project_id
    WHERE fb.id = pyrolysis_runs.feedstock_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

-- biochar_batches
ALTER TABLE public.biochar_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view biochar_batches in their organization"
ON public.biochar_batches FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pyrolysis_runs pr
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE pr.id = biochar_batches.pyrolysis_run_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can insert biochar_batches in their organization"
ON public.biochar_batches FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pyrolysis_runs pr
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE pr.id = biochar_batches.pyrolysis_run_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can update biochar_batches in their organization"
ON public.biochar_batches FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pyrolysis_runs pr
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE pr.id = biochar_batches.pyrolysis_run_id
      AND p.organization_id = public.get_user_organization_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pyrolysis_runs pr
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE pr.id = biochar_batches.pyrolysis_run_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can delete biochar_batches in their organization"
ON public.biochar_batches FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pyrolysis_runs pr
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE pr.id = biochar_batches.pyrolysis_run_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

-- biochar_samples
ALTER TABLE public.biochar_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view biochar_samples in their organization"
ON public.biochar_samples FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.biochar_batches bb
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bb.id = biochar_samples.biochar_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can insert biochar_samples in their organization"
ON public.biochar_samples FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.biochar_batches bb
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bb.id = biochar_samples.biochar_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can update biochar_samples in their organization"
ON public.biochar_samples FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.biochar_batches bb
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bb.id = biochar_samples.biochar_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.biochar_batches bb
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bb.id = biochar_samples.biochar_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can delete biochar_samples in their organization"
ON public.biochar_samples FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.biochar_batches bb
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bb.id = biochar_samples.biochar_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

-- laboratory_tests
ALTER TABLE public.laboratory_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view laboratory_tests in their organization"
ON public.laboratory_tests FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.biochar_samples bs
    JOIN public.biochar_batches bb ON bb.id = bs.biochar_batch_id
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bs.id = laboratory_tests.sample_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can insert laboratory_tests in their organization"
ON public.laboratory_tests FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.biochar_samples bs
    JOIN public.biochar_batches bb ON bb.id = bs.biochar_batch_id
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bs.id = laboratory_tests.sample_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can update laboratory_tests in their organization"
ON public.laboratory_tests FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.biochar_samples bs
    JOIN public.biochar_batches bb ON bb.id = bs.biochar_batch_id
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bs.id = laboratory_tests.sample_id
      AND p.organization_id = public.get_user_organization_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.biochar_samples bs
    JOIN public.biochar_batches bb ON bb.id = bs.biochar_batch_id
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bs.id = laboratory_tests.sample_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can delete laboratory_tests in their organization"
ON public.laboratory_tests FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.biochar_samples bs
    JOIN public.biochar_batches bb ON bb.id = bs.biochar_batch_id
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bs.id = laboratory_tests.sample_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

-- laboratory_certificates
ALTER TABLE public.laboratory_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view laboratory_certificates in their organization"
ON public.laboratory_certificates FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.laboratory_tests lt
    JOIN public.biochar_samples bs ON bs.id = lt.sample_id
    JOIN public.biochar_batches bb ON bb.id = bs.biochar_batch_id
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE lt.id = laboratory_certificates.laboratory_test_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can insert laboratory_certificates in their organization"
ON public.laboratory_certificates FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.laboratory_tests lt
    JOIN public.biochar_samples bs ON bs.id = lt.sample_id
    JOIN public.biochar_batches bb ON bb.id = bs.biochar_batch_id
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE lt.id = laboratory_certificates.laboratory_test_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can update laboratory_certificates in their organization"
ON public.laboratory_certificates FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.laboratory_tests lt
    JOIN public.biochar_samples bs ON bs.id = lt.sample_id
    JOIN public.biochar_batches bb ON bb.id = bs.biochar_batch_id
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE lt.id = laboratory_certificates.laboratory_test_id
      AND p.organization_id = public.get_user_organization_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.laboratory_tests lt
    JOIN public.biochar_samples bs ON bs.id = lt.sample_id
    JOIN public.biochar_batches bb ON bb.id = bs.biochar_batch_id
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE lt.id = laboratory_certificates.laboratory_test_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can delete laboratory_certificates in their organization"
ON public.laboratory_certificates FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.laboratory_tests lt
    JOIN public.biochar_samples bs ON bs.id = lt.sample_id
    JOIN public.biochar_batches bb ON bb.id = bs.biochar_batch_id
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE lt.id = laboratory_certificates.laboratory_test_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

-- laboratory_results
ALTER TABLE public.laboratory_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view laboratory_results in their organization"
ON public.laboratory_results FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.laboratory_tests lt
    JOIN public.biochar_samples bs ON bs.id = lt.sample_id
    JOIN public.biochar_batches bb ON bb.id = bs.biochar_batch_id
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE lt.id = laboratory_results.laboratory_test_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can insert laboratory_results in their organization"
ON public.laboratory_results FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.laboratory_tests lt
    JOIN public.biochar_samples bs ON bs.id = lt.sample_id
    JOIN public.biochar_batches bb ON bb.id = bs.biochar_batch_id
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE lt.id = laboratory_results.laboratory_test_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can update laboratory_results in their organization"
ON public.laboratory_results FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.laboratory_tests lt
    JOIN public.biochar_samples bs ON bs.id = lt.sample_id
    JOIN public.biochar_batches bb ON bb.id = bs.biochar_batch_id
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE lt.id = laboratory_results.laboratory_test_id
      AND p.organization_id = public.get_user_organization_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.laboratory_tests lt
    JOIN public.biochar_samples bs ON bs.id = lt.sample_id
    JOIN public.biochar_batches bb ON bb.id = bs.biochar_batch_id
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE lt.id = laboratory_results.laboratory_test_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can delete laboratory_results in their organization"
ON public.laboratory_results FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.laboratory_tests lt
    JOIN public.biochar_samples bs ON bs.id = lt.sample_id
    JOIN public.biochar_batches bb ON bb.id = bs.biochar_batch_id
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE lt.id = laboratory_results.laboratory_test_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

-- shipments
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view shipments in their organization"
ON public.shipments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.biochar_batches bb
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bb.id = shipments.biochar_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can insert shipments in their organization"
ON public.shipments FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.biochar_batches bb
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bb.id = shipments.biochar_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can update shipments in their organization"
ON public.shipments FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.biochar_batches bb
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bb.id = shipments.biochar_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.biochar_batches bb
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bb.id = shipments.biochar_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can delete shipments in their organization"
ON public.shipments FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.biochar_batches bb
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bb.id = shipments.biochar_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

-- biochar_applications
ALTER TABLE public.biochar_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view biochar_applications in their organization"
ON public.biochar_applications FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.biochar_batches bb
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bb.id = biochar_applications.biochar_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can insert biochar_applications in their organization"
ON public.biochar_applications FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.biochar_batches bb
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bb.id = biochar_applications.biochar_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can update biochar_applications in their organization"
ON public.biochar_applications FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.biochar_batches bb
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bb.id = biochar_applications.biochar_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.biochar_batches bb
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bb.id = biochar_applications.biochar_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can delete biochar_applications in their organization"
ON public.biochar_applications FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.biochar_batches bb
    JOIN public.pyrolysis_runs pr ON pr.id = bb.pyrolysis_run_id
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE bb.id = biochar_applications.biochar_batch_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

-- reactor_sensor_logs
ALTER TABLE public.reactor_sensor_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reactor_sensor_logs in their organization"
ON public.reactor_sensor_logs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pyrolysis_runs pr
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE pr.id = reactor_sensor_logs.pyrolysis_run_id
      AND p.organization_id = public.get_user_organization_id()
  )
);

CREATE POLICY "Users can insert reactor_sensor_logs in their organization"
ON public.reactor_sensor_logs FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pyrolysis_runs pr
    JOIN public.feedstock_batches fb ON fb.id = pr.feedstock_batch_id
    JOIN public.projects p ON p.id = fb.project_id
    WHERE pr.id = reactor_sensor_logs.pyrolysis_run_id
      AND p.organization_id = public.get_user_organization_id()
  )
);
-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.spatial_ref_sys (
  srid integer NOT NULL CHECK (srid > 0 AND srid <= 998999),
  auth_name character varying,
  auth_srid integer,
  srtext character varying,
  proj4text character varying,
  CONSTRAINT spatial_ref_sys_pkey PRIMARY KEY (srid)
);
CREATE TABLE public.alembic_version (
  version_num character varying NOT NULL,
  CONSTRAINT alembic_version_pkey PRIMARY KEY (version_num)
);
CREATE TABLE public.carbon_credits (
  id uuid NOT NULL,
  parcel_id uuid,
  vintage_year character varying NOT NULL,
  unique_code character varying,
  estimated_co2e double precision NOT NULL,
  status USER-DEFINED,
  created_at timestamp without time zone,
  data_hash character varying,
  raw_payload jsonb,
  CONSTRAINT carbon_credits_pkey PRIMARY KEY (id),
  CONSTRAINT carbon_credits_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.parcels(id)
);
CREATE TABLE public.farmers (
  id uuid NOT NULL,
  username character varying,
  password_hash character varying,
  mobile_number character varying,
  region character varying,
  created_at timestamp without time zone,
  CONSTRAINT farmers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.institutions (
  id uuid NOT NULL,
  username character varying,
  password_hash character varying,
  company_name character varying,
  tax_id character varying,
  registry_tier character varying,
  created_at timestamp without time zone,
  CONSTRAINT institutions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.parcels (
  id uuid NOT NULL,
  farm_id character varying,
  boundary USER-DEFINED NOT NULL,
  source_type character varying,
  calculated_area_ha double precision,
  created_at timestamp without time zone,
  user_id character varying,
  CONSTRAINT parcels_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ecoregions (
  id integer NOT NULL DEFAULT nextval('ecoregions_id_seq'::regclass),
  biome_name character varying NOT NULL,
  geom USER-DEFINED NOT NULL,
  CONSTRAINT ecoregions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bulk_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id character varying NOT NULL,
  filename character varying NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'PENDING'::job_status_enum,
  total_rows integer NOT NULL DEFAULT 0,
  processed_rows integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamp with time zone,
  CONSTRAINT bulk_jobs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bulk_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  row_index integer NOT NULL,
  parcel_label character varying,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  radius_meters double precision NOT NULL DEFAULT 500.0,
  custom_geometry jsonb,
  status USER-DEFINED NOT NULL DEFAULT 'PENDING'::job_status_enum,
  error_message text,
  calculated_area_ha double precision,
  ndvi_mean double precision,
  co2_equivalent_tons double precision,
  confidence_score double precision,
  CONSTRAINT bulk_items_pkey PRIMARY KEY (id),
  CONSTRAINT fk_bulk_items_job_id FOREIGN KEY (job_id) REFERENCES public.bulk_jobs(id)
);
CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  registration_number text,
  gst_number text,
  email text,
  phone text,
  website text,
  address text,
  city text,
  state text,
  country text,
  logo_url text,
  subscription_plan text DEFAULT 'Free'::text,
  subscription_status text DEFAULT 'Active'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT organizations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  first_name text,
  last_name text,
  phone text,
  avatar_url text,
  organization_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.roles (
  id integer NOT NULL DEFAULT nextval('roles_id_seq'::regclass),
  name text NOT NULL UNIQUE,
  description text,
  CONSTRAINT roles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.organization_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  user_id uuid,
  role_id integer,
  invited_by uuid,
  joined_at timestamp with time zone DEFAULT now(),
  status character varying DEFAULT 'Active'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT organization_members_pkey PRIMARY KEY (id),
  CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT organization_members_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id),
  CONSTRAINT organization_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id),
  CONSTRAINT organization_members_user_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  email text,
  role_id integer,
  invited_by uuid,
  token text,
  expires_at timestamp with time zone,
  accepted boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT invitations_pkey PRIMARY KEY (id),
  CONSTRAINT invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT invitations_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id),
  CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id)
);
CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  methodology text,
  project_type text DEFAULT 'Biochar'::text,
  description text,
  country text,
  state text,
  district text,
  latitude double precision,
  longitude double precision,
  start_date date,
  end_date date,
  status text DEFAULT 'Draft'::text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.feedstock_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  batch_code text NOT NULL UNIQUE,
  feedstock_type text NOT NULL,
  supplier_name text,
  supplier_contact text,
  origin_location text,
  received_date date,
  weight_kg numeric,
  moisture_percent numeric,
  transport_distance_km numeric,
  remarks text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  wet_weight_kg numeric,
  dry_weight_kg numeric,
  water_weight_kg numeric,
  expected_yield_percent double precision DEFAULT 30.0,
  moisture_measurement_method text,
  feedstock_lot_number text,
  feedstock_category text,
  biomass_species text,
  biomass_source_type text,
  harvest_date date,
  collection_date date,
  storage_days integer NOT NULL DEFAULT 0,
  storage_location text,
  contamination_status boolean NOT NULL DEFAULT false,
  contamination_notes text,
  visual_quality_grade text NOT NULL DEFAULT 'Grade A'::text,
  quality_status text NOT NULL DEFAULT 'Optimal'::text,
  quality_score double precision,
  CONSTRAINT feedstock_batches_pkey PRIMARY KEY (id),
  CONSTRAINT feedstock_batches_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT feedstock_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.pyrolysis_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  feedstock_batch_id uuid NOT NULL,
  run_number text,
  reactor_name text,
  operator_name text,
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  average_temperature numeric,
  maximum_temperature numeric,
  residence_time_minutes integer,
  electricity_kwh numeric,
  fuel_used_liters numeric,
  remarks text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pyrolysis_runs_pkey PRIMARY KEY (id),
  CONSTRAINT pyrolysis_runs_feedstock_batch_id_fkey FOREIGN KEY (feedstock_batch_id) REFERENCES public.feedstock_batches(id)
);
CREATE TABLE public.biochar_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pyrolysis_run_id uuid NOT NULL,
  batch_code text UNIQUE,
  weight_kg numeric,
  storage_location text,
  status text DEFAULT 'In Storage'::text,
  created_at timestamp with time zone DEFAULT now(),
  net_sequestration_tco2e double precision DEFAULT 0.0,
  produced_weight_kg numeric,
  calculated_yield_percent numeric,
  mass_balance_status text,
  anomaly_status text,
  anomaly_reason text,
  peak_temperature double precision,
  average_temperature double precision,
  residence_time_minutes integer,
  cooling_duration integer,
  quality_status text NOT NULL DEFAULT 'Pending'::text,
  validation_status text NOT NULL DEFAULT 'Pending'::text,
  laboratory_ready boolean NOT NULL DEFAULT false,
  anomaly_count integer NOT NULL DEFAULT 0,
  validation_score double precision,
  CONSTRAINT biochar_batches_pkey PRIMARY KEY (id),
  CONSTRAINT biochar_batches_pyrolysis_run_id_fkey FOREIGN KEY (pyrolysis_run_id) REFERENCES public.pyrolysis_runs(id)
);
CREATE TABLE public.project_sites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  site_name text NOT NULL,
  address text,
  latitude double precision,
  longitude double precision,
  area_hectares numeric,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT project_sites_pkey PRIMARY KEY (id),
  CONSTRAINT project_sites_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.project_team (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  user_id uuid,
  role text,
  assigned_at timestamp with time zone DEFAULT now(),
  CONSTRAINT project_team_pkey PRIMARY KEY (id),
  CONSTRAINT project_team_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT project_team_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.project_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  file_name text,
  file_url text,
  document_type text,
  uploaded_by uuid,
  uploaded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT project_documents_pkey PRIMARY KEY (id),
  CONSTRAINT project_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT project_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)
);
CREATE TABLE public.feedstock_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text,
  description text,
  CONSTRAINT feedstock_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.feedstock_suppliers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  supplier_name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  country text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT feedstock_suppliers_pkey PRIMARY KEY (id),
  CONSTRAINT feedstock_suppliers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.feedstock_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  batch_id uuid,
  vehicle_number text,
  driver_name text,
  delivery_date timestamp with time zone,
  gross_weight numeric,
  tare_weight numeric,
  net_weight numeric,
  verified boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT feedstock_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT feedstock_deliveries_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.feedstock_batches(id)
);
CREATE TABLE public.feedstock_quality (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  batch_id uuid,
  moisture_percent numeric,
  ash_percent numeric,
  contamination_percent numeric,
  inspection_notes text,
  inspected_by uuid,
  inspected_at timestamp with time zone DEFAULT now(),
  CONSTRAINT feedstock_quality_pkey PRIMARY KEY (id),
  CONSTRAINT feedstock_quality_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.feedstock_batches(id),
  CONSTRAINT feedstock_quality_inspected_by_fkey FOREIGN KEY (inspected_by) REFERENCES auth.users(id)
);
CREATE TABLE public.plants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid,
  plant_name text NOT NULL,
  address text,
  latitude double precision,
  longitude double precision,
  capacity_tpd numeric,
  status text DEFAULT 'Active'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT plants_pkey PRIMARY KEY (id),
  CONSTRAINT plants_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT plants_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.reactors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plant_id uuid,
  reactor_name text,
  manufacturer text,
  model text,
  reactor_type text,
  maximum_temperature numeric,
  capacity_kg_hour numeric,
  installation_date date,
  status text DEFAULT 'Operational'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reactors_pkey PRIMARY KEY (id),
  CONSTRAINT reactors_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES public.plants(id)
);
CREATE TABLE public.plant_operators (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plant_id uuid,
  user_id uuid,
  designation text,
  active boolean DEFAULT true,
  CONSTRAINT plant_operators_pkey PRIMARY KEY (id),
  CONSTRAINT plant_operators_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES public.plants(id),
  CONSTRAINT plant_operators_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.reactor_sensor_logs (
  id bigint NOT NULL DEFAULT nextval('reactor_sensor_logs_id_seq'::regclass),
  reactor_id uuid,
  pyrolysis_run_id uuid,
  sensor_name text,
  sensor_value numeric,
  unit text,
  recorded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reactor_sensor_logs_pkey PRIMARY KEY (id),
  CONSTRAINT reactor_sensor_logs_reactor_id_fkey FOREIGN KEY (reactor_id) REFERENCES public.reactors(id),
  CONSTRAINT reactor_sensor_logs_pyrolysis_run_id_fkey FOREIGN KEY (pyrolysis_run_id) REFERENCES public.pyrolysis_runs(id)
);
CREATE TABLE public.fuel_consumption (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pyrolysis_run_id uuid,
  fuel_type text,
  quantity numeric,
  unit text,
  recorded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT fuel_consumption_pkey PRIMARY KEY (id),
  CONSTRAINT fuel_consumption_pyrolysis_run_id_fkey FOREIGN KEY (pyrolysis_run_id) REFERENCES public.pyrolysis_runs(id)
);
CREATE TABLE public.electricity_consumption (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pyrolysis_run_id uuid,
  kwh numeric,
  source text,
  recorded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT electricity_consumption_pkey PRIMARY KEY (id),
  CONSTRAINT electricity_consumption_pyrolysis_run_id_fkey FOREIGN KEY (pyrolysis_run_id) REFERENCES public.pyrolysis_runs(id)
);
CREATE TABLE public.reactor_maintenance (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reactor_id uuid,
  maintenance_type text,
  description text,
  performed_by text,
  maintenance_date date,
  next_due_date date,
  CONSTRAINT reactor_maintenance_pkey PRIMARY KEY (id),
  CONSTRAINT reactor_maintenance_reactor_id_fkey FOREIGN KEY (reactor_id) REFERENCES public.reactors(id)
);
CREATE TABLE public.biochar_batch_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  biochar_batch_id uuid,
  pyrolysis_run_id uuid,
  weight_contributed_kg numeric,
  CONSTRAINT biochar_batch_runs_pkey PRIMARY KEY (id),
  CONSTRAINT biochar_batch_runs_biochar_batch_id_fkey FOREIGN KEY (biochar_batch_id) REFERENCES public.biochar_batches(id),
  CONSTRAINT biochar_batch_runs_pyrolysis_run_id_fkey FOREIGN KEY (pyrolysis_run_id) REFERENCES public.pyrolysis_runs(id)
);
CREATE TABLE public.storage_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  location_name text NOT NULL,
  address text,
  latitude double precision,
  longitude double precision,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT storage_locations_pkey PRIMARY KEY (id),
  CONSTRAINT storage_locations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.biochar_inventory (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  biochar_batch_id uuid,
  storage_location_id uuid,
  quantity_kg numeric,
  available_kg numeric,
  reserved_kg numeric,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT biochar_inventory_pkey PRIMARY KEY (id),
  CONSTRAINT biochar_inventory_biochar_batch_id_fkey FOREIGN KEY (biochar_batch_id) REFERENCES public.biochar_batches(id),
  CONSTRAINT biochar_inventory_storage_location_id_fkey FOREIGN KEY (storage_location_id) REFERENCES public.storage_locations(id)
);
CREATE TABLE public.inventory_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  biochar_batch_id uuid,
  from_location uuid,
  to_location uuid,
  quantity_kg numeric,
  movement_type text,
  moved_by uuid,
  moved_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inventory_movements_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_movements_biochar_batch_id_fkey FOREIGN KEY (biochar_batch_id) REFERENCES public.biochar_batches(id),
  CONSTRAINT inventory_movements_from_location_fkey FOREIGN KEY (from_location) REFERENCES public.storage_locations(id),
  CONSTRAINT inventory_movements_to_location_fkey FOREIGN KEY (to_location) REFERENCES public.storage_locations(id),
  CONSTRAINT inventory_movements_moved_by_fkey FOREIGN KEY (moved_by) REFERENCES auth.users(id)
);
CREATE TABLE public.shipments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  biochar_batch_id uuid,
  shipment_number text UNIQUE,
  destination text,
  transport_company text,
  vehicle_number text,
  shipped_weight_kg numeric,
  shipped_date date,
  status text DEFAULT 'Pending'::text,
  CONSTRAINT shipments_pkey PRIMARY KEY (id),
  CONSTRAINT shipments_biochar_batch_id_fkey FOREIGN KEY (biochar_batch_id) REFERENCES public.biochar_batches(id)
);
CREATE TABLE public.biochar_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  biochar_batch_id uuid,
  application_site text,
  latitude double precision,
  longitude double precision,
  application_rate_kg_ha numeric,
  area_hectares numeric,
  application_date date,
  applied_by text,
  remarks text,
  delivery_ticket_id text UNIQUE,
  farmer_id text,
  shipped_mass_tons double precision,
  photo_evidence_url text,
  attestation_timestamp timestamp with time zone,
  CONSTRAINT biochar_applications_pkey PRIMARY KEY (id),
  CONSTRAINT biochar_applications_biochar_batch_id_fkey FOREIGN KEY (biochar_batch_id) REFERENCES public.biochar_batches(id)
);
CREATE TABLE public.laboratories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  laboratory_name text NOT NULL,
  accreditation_number text,
  contact_person text,
  email text,
  phone text,
  address text,
  country text,
  website text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT laboratories_pkey PRIMARY KEY (id),
  CONSTRAINT laboratories_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.biochar_samples (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  biochar_batch_id uuid NOT NULL,
  sample_code text NOT NULL UNIQUE,
  collected_by uuid,
  collection_date date,
  sampling_method text,
  sample_weight_grams numeric,
  remarks text,
  created_at timestamp with time zone DEFAULT now(),
  sampling_date date,
  sample_collection_date date,
  sample_collected_by uuid,
  laboratory_status text NOT NULL DEFAULT 'Pending'::text,
  validation_status text NOT NULL DEFAULT 'Pending'::text,
  risk_level text NOT NULL DEFAULT 'Low'::text,
  validation_score double precision,
  laboratory_notes text,
  CONSTRAINT biochar_samples_pkey PRIMARY KEY (id),
  CONSTRAINT biochar_samples_biochar_batch_id_fkey FOREIGN KEY (biochar_batch_id) REFERENCES public.biochar_batches(id),
  CONSTRAINT biochar_samples_collected_by_fkey FOREIGN KEY (collected_by) REFERENCES auth.users(id),
  CONSTRAINT biochar_samples_sample_collected_by_fkey FOREIGN KEY (sample_collected_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.laboratory_tests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sample_id uuid NOT NULL,
  laboratory_id uuid,
  test_reference text,
  received_date date,
  completed_date date,
  analyst_name text,
  status text DEFAULT 'Pending'::text,
  remarks text,
  created_at timestamp with time zone DEFAULT now(),
  test_date date,
  validation_status text NOT NULL DEFAULT 'Pending'::text,
  CONSTRAINT laboratory_tests_pkey PRIMARY KEY (id),
  CONSTRAINT laboratory_tests_sample_id_fkey FOREIGN KEY (sample_id) REFERENCES public.biochar_samples(id),
  CONSTRAINT laboratory_tests_laboratory_id_fkey FOREIGN KEY (laboratory_id) REFERENCES public.laboratories(id)
);
CREATE TABLE public.laboratory_parameters (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  parameter_name text UNIQUE,
  unit text,
  description text,
  CONSTRAINT laboratory_parameters_pkey PRIMARY KEY (id)
);
CREATE TABLE public.laboratory_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  laboratory_test_id uuid,
  parameter_id uuid,
  measured_value numeric,
  detection_limit numeric,
  pass boolean,
  remarks text,
  CONSTRAINT laboratory_results_pkey PRIMARY KEY (id),
  CONSTRAINT laboratory_results_laboratory_test_id_fkey FOREIGN KEY (laboratory_test_id) REFERENCES public.laboratory_tests(id),
  CONSTRAINT laboratory_results_parameter_id_fkey FOREIGN KEY (parameter_id) REFERENCES public.laboratory_parameters(id)
);
CREATE TABLE public.laboratory_certificates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  laboratory_test_id uuid,
  certificate_number text,
  certificate_url text,
  issue_date date,
  expiry_date date,
  batch_id uuid,
  organic_carbon_percentage double precision,
  molar_hc_ratio double precision,
  verification_tier text,
  certificate_hash text,
  uploaded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT laboratory_certificates_pkey PRIMARY KEY (id),
  CONSTRAINT laboratory_certificates_laboratory_test_id_fkey FOREIGN KEY (laboratory_test_id) REFERENCES public.laboratory_tests(id),
  CONSTRAINT laboratory_certificates_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.biochar_batches(id)
);
CREATE TABLE public.laboratory_approvals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  laboratory_test_id uuid,
  approved_by uuid,
  approval_status text DEFAULT 'Pending'::text,
  approval_date date,
  comments text,
  CONSTRAINT laboratory_approvals_pkey PRIMARY KEY (id),
  CONSTRAINT laboratory_approvals_laboratory_test_id_fkey FOREIGN KEY (laboratory_test_id) REFERENCES public.laboratory_tests(id),
  CONSTRAINT laboratory_approvals_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id)
);
CREATE TABLE public.evidence_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text UNIQUE,
  description text,
  CONSTRAINT evidence_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.gps_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evidence_id uuid,
  latitude double precision,
  longitude double precision,
  altitude double precision,
  accuracy_m numeric,
  recorded_at timestamp with time zone,
  CONSTRAINT gps_records_pkey PRIMARY KEY (id)
);
CREATE TABLE public.photo_metadata (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evidence_file_id uuid,
  width integer,
  height integer,
  camera_make text,
  camera_model text,
  captured_at timestamp with time zone,
  CONSTRAINT photo_metadata_pkey PRIMARY KEY (id)
);
CREATE TABLE public.digital_signatures (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evidence_id uuid,
  signed_by uuid,
  signature_url text,
  signed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT digital_signatures_pkey PRIMARY KEY (id),
  CONSTRAINT digital_signatures_signed_by_fkey FOREIGN KEY (signed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.monitoring_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  name text NOT NULL,
  description text,
  frequency text,
  methodology text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT monitoring_plans_pkey PRIMARY KEY (id),
  CONSTRAINT monitoring_plans_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.monitoring_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  monitoring_plan_id uuid,
  entity_type text,
  entity_id uuid,
  monitored_by uuid,
  monitoring_date timestamp with time zone,
  status text DEFAULT 'Completed'::text,
  remarks text,
  CONSTRAINT monitoring_events_pkey PRIMARY KEY (id),
  CONSTRAINT monitoring_events_monitoring_plan_id_fkey FOREIGN KEY (monitoring_plan_id) REFERENCES public.monitoring_plans(id),
  CONSTRAINT monitoring_events_monitored_by_fkey FOREIGN KEY (monitored_by) REFERENCES auth.users(id)
);
CREATE TABLE public.monitoring_observations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  monitoring_event_id uuid,
  parameter_name text,
  observed_value text,
  expected_value text,
  unit text,
  pass boolean,
  remarks text,
  CONSTRAINT monitoring_observations_pkey PRIMARY KEY (id),
  CONSTRAINT monitoring_observations_monitoring_event_id_fkey FOREIGN KEY (monitoring_event_id) REFERENCES public.monitoring_events(id)
);
CREATE TABLE public.monitoring_checklists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  monitoring_plan_id uuid,
  checklist_item text,
  mandatory boolean DEFAULT true,
  display_order integer,
  CONSTRAINT monitoring_checklists_pkey PRIMARY KEY (id),
  CONSTRAINT monitoring_checklists_monitoring_plan_id_fkey FOREIGN KEY (monitoring_plan_id) REFERENCES public.monitoring_plans(id)
);
CREATE TABLE public.monitoring_issues (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  monitoring_event_id uuid,
  severity text,
  issue_type text,
  description text,
  status text DEFAULT 'Open'::text,
  reported_by uuid,
  reported_at timestamp with time zone DEFAULT now(),
  CONSTRAINT monitoring_issues_pkey PRIMARY KEY (id),
  CONSTRAINT monitoring_issues_monitoring_event_id_fkey FOREIGN KEY (monitoring_event_id) REFERENCES public.monitoring_events(id),
  CONSTRAINT monitoring_issues_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES auth.users(id)
);
CREATE TABLE public.corrective_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  issue_id uuid,
  action_description text,
  assigned_to uuid,
  due_date date,
  completed_date date,
  status text DEFAULT 'Open'::text,
  CONSTRAINT corrective_actions_pkey PRIMARY KEY (id),
  CONSTRAINT corrective_actions_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES public.monitoring_issues(id),
  CONSTRAINT corrective_actions_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id)
);
CREATE TABLE public.monitoring_schedule (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  monitoring_plan_id uuid,
  scheduled_date date,
  assigned_to uuid,
  completed boolean DEFAULT false,
  CONSTRAINT monitoring_schedule_pkey PRIMARY KEY (id),
  CONSTRAINT monitoring_schedule_monitoring_plan_id_fkey FOREIGN KEY (monitoring_plan_id) REFERENCES public.monitoring_plans(id),
  CONSTRAINT monitoring_schedule_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id)
);
CREATE TABLE public.calculation_methods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  method_name text NOT NULL,
  methodology text,
  version text,
  description text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT calculation_methods_pkey PRIMARY KEY (id)
);
CREATE TABLE public.carbon_calculations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  biochar_batch_id uuid,
  calculation_method_id uuid,
  calculation_date date,
  version integer DEFAULT 1,
  status text DEFAULT 'Draft'::text,
  calculated_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT carbon_calculations_pkey PRIMARY KEY (id),
  CONSTRAINT carbon_calculations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT carbon_calculations_biochar_batch_id_fkey FOREIGN KEY (biochar_batch_id) REFERENCES public.biochar_batches(id),
  CONSTRAINT carbon_calculations_calculation_method_id_fkey FOREIGN KEY (calculation_method_id) REFERENCES public.calculation_methods(id),
  CONSTRAINT carbon_calculations_calculated_by_fkey FOREIGN KEY (calculated_by) REFERENCES auth.users(id)
);
CREATE TABLE public.calculation_inputs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  carbon_calculation_id uuid,
  input_name text,
  input_value numeric,
  unit text,
  source text,
  remarks text,
  CONSTRAINT calculation_inputs_pkey PRIMARY KEY (id),
  CONSTRAINT calculation_inputs_carbon_calculation_id_fkey FOREIGN KEY (carbon_calculation_id) REFERENCES public.carbon_calculations(id)
);
CREATE TABLE public.calculation_outputs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  carbon_calculation_id uuid,
  output_name text,
  output_value numeric,
  unit text,
  CONSTRAINT calculation_outputs_pkey PRIMARY KEY (id),
  CONSTRAINT calculation_outputs_carbon_calculation_id_fkey FOREIGN KEY (carbon_calculation_id) REFERENCES public.carbon_calculations(id)
);
CREATE TABLE public.emission_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  carbon_calculation_id uuid,
  source_name text,
  emission_value numeric,
  unit text,
  remarks text,
  CONSTRAINT emission_sources_pkey PRIMARY KEY (id),
  CONSTRAINT emission_sources_carbon_calculation_id_fkey FOREIGN KEY (carbon_calculation_id) REFERENCES public.carbon_calculations(id)
);
CREATE TABLE public.carbon_credit_estimates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  carbon_calculation_id uuid,
  gross_removal numeric,
  deductions numeric,
  net_removal numeric,
  estimated_credits numeric,
  unit text DEFAULT 'tCO2e'::text,
  CONSTRAINT carbon_credit_estimates_pkey PRIMARY KEY (id),
  CONSTRAINT carbon_credit_estimates_carbon_calculation_id_fkey FOREIGN KEY (carbon_calculation_id) REFERENCES public.carbon_calculations(id)
);
CREATE TABLE public.calculation_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  carbon_calculation_id uuid,
  version integer,
  change_description text,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT calculation_versions_pkey PRIMARY KEY (id),
  CONSTRAINT calculation_versions_carbon_calculation_id_fkey FOREIGN KEY (carbon_calculation_id) REFERENCES public.carbon_calculations(id),
  CONSTRAINT calculation_versions_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.registries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registry_name text NOT NULL,
  website text,
  contact_email text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT registries_pkey PRIMARY KEY (id)
);
CREATE TABLE public.registry_methodologies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registry_id uuid,
  methodology_code text,
  methodology_name text,
  version text,
  active boolean DEFAULT true,
  CONSTRAINT registry_methodologies_pkey PRIMARY KEY (id),
  CONSTRAINT registry_methodologies_registry_id_fkey FOREIGN KEY (registry_id) REFERENCES public.registries(id)
);
CREATE TABLE public.registry_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  registry_id uuid,
  methodology_id uuid,
  report_number text UNIQUE,
  reporting_period_start date,
  reporting_period_end date,
  report_status text DEFAULT 'Draft'::text,
  generated_by uuid,
  generated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT registry_reports_pkey PRIMARY KEY (id),
  CONSTRAINT registry_reports_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT registry_reports_registry_id_fkey FOREIGN KEY (registry_id) REFERENCES public.registries(id),
  CONSTRAINT registry_reports_methodology_id_fkey FOREIGN KEY (methodology_id) REFERENCES public.registry_methodologies(id),
  CONSTRAINT registry_reports_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES auth.users(id)
);
CREATE TABLE public.report_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registry_report_id uuid,
  section_name text,
  content jsonb,
  completed boolean DEFAULT false,
  CONSTRAINT report_sections_pkey PRIMARY KEY (id),
  CONSTRAINT report_sections_registry_report_id_fkey FOREIGN KEY (registry_report_id) REFERENCES public.registry_reports(id)
);
CREATE TABLE public.report_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registry_report_id uuid,
  file_name text,
  file_url text,
  attachment_type text,
  uploaded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT report_attachments_pkey PRIMARY KEY (id),
  CONSTRAINT report_attachments_registry_report_id_fkey FOREIGN KEY (registry_report_id) REFERENCES public.registry_reports(id)
);
CREATE TABLE public.report_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registry_report_id uuid,
  submitted_by uuid,
  submission_date timestamp with time zone,
  submission_status text,
  registry_reference text,
  remarks text,
  CONSTRAINT report_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT report_submissions_registry_report_id_fkey FOREIGN KEY (registry_report_id) REFERENCES public.registry_reports(id),
  CONSTRAINT report_submissions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id)
);
CREATE TABLE public.report_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registry_report_id uuid,
  version integer,
  changes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT report_versions_pkey PRIMARY KEY (id),
  CONSTRAINT report_versions_registry_report_id_fkey FOREIGN KEY (registry_report_id) REFERENCES public.registry_reports(id),
  CONSTRAINT report_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.verification_cases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registry_report_id uuid NOT NULL,
  verification_number text UNIQUE,
  verification_type text,
  status text DEFAULT 'Pending'::text,
  verification_start date,
  verification_end date,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT verification_cases_pkey PRIMARY KEY (id),
  CONSTRAINT verification_cases_registry_report_id_fkey FOREIGN KEY (registry_report_id) REFERENCES public.registry_reports(id)
);
CREATE TABLE public.verification_organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  accreditation text,
  contact_email text,
  website text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT verification_organizations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.auditors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  verification_organization_id uuid,
  user_id uuid,
  designation text,
  accreditation_number text,
  active boolean DEFAULT true,
  CONSTRAINT auditors_pkey PRIMARY KEY (id),
  CONSTRAINT auditors_verification_organization_id_fkey FOREIGN KEY (verification_organization_id) REFERENCES public.verification_organizations(id),
  CONSTRAINT auditors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.verification_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  verification_case_id uuid,
  auditor_id uuid,
  assigned_date date,
  role text,
  CONSTRAINT verification_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT verification_assignments_verification_case_id_fkey FOREIGN KEY (verification_case_id) REFERENCES public.verification_cases(id),
  CONSTRAINT verification_assignments_auditor_id_fkey FOREIGN KEY (auditor_id) REFERENCES public.auditors(id)
);
CREATE TABLE public.verification_findings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  verification_case_id uuid,
  severity text,
  category text,
  title text,
  description text,
  status text DEFAULT 'Open'::text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT verification_findings_pkey PRIMARY KEY (id),
  CONSTRAINT verification_findings_verification_case_id_fkey FOREIGN KEY (verification_case_id) REFERENCES public.verification_cases(id),
  CONSTRAINT verification_findings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.finding_evidence (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  finding_id uuid,
  evidence_id uuid,
  remarks text,
  CONSTRAINT finding_evidence_pkey PRIMARY KEY (id),
  CONSTRAINT finding_evidence_finding_id_fkey FOREIGN KEY (finding_id) REFERENCES public.verification_findings(id)
);
CREATE TABLE public.finding_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  finding_id uuid,
  responded_by uuid,
  response text,
  responded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT finding_responses_pkey PRIMARY KEY (id),
  CONSTRAINT finding_responses_finding_id_fkey FOREIGN KEY (finding_id) REFERENCES public.verification_findings(id),
  CONSTRAINT finding_responses_responded_by_fkey FOREIGN KEY (responded_by) REFERENCES auth.users(id)
);
CREATE TABLE public.verification_corrective_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  finding_id uuid,
  action_description text,
  assigned_to uuid,
  due_date date,
  completion_date date,
  status text DEFAULT 'Open'::text,
  CONSTRAINT verification_corrective_actions_pkey PRIMARY KEY (id),
  CONSTRAINT verification_corrective_actions_finding_id_fkey FOREIGN KEY (finding_id) REFERENCES public.verification_findings(id),
  CONSTRAINT verification_corrective_actions_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id)
);
CREATE TABLE public.verification_decisions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  verification_case_id uuid,
  decision text,
  decision_date date,
  decided_by uuid,
  comments text,
  CONSTRAINT verification_decisions_pkey PRIMARY KEY (id),
  CONSTRAINT verification_decisions_verification_case_id_fkey FOREIGN KEY (verification_case_id) REFERENCES public.verification_cases(id),
  CONSTRAINT verification_decisions_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.auditors(id)
);
CREATE TABLE public.notification_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  CONSTRAINT notification_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  user_id uuid,
  notification_type_id uuid,
  title text,
  message text,
  entity_type text,
  entity_id uuid,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT notifications_notification_type_id_fkey FOREIGN KEY (notification_type_id) REFERENCES public.notification_types(id)
);
CREATE TABLE public.notification_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  email_enabled boolean DEFAULT true,
  push_enabled boolean DEFAULT true,
  in_app_enabled boolean DEFAULT true,
  sms_enabled boolean DEFAULT false,
  CONSTRAINT notification_preferences_pkey PRIMARY KEY (id),
  CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  title text,
  description text,
  assigned_to uuid,
  entity_type text,
  entity_id uuid,
  due_date date,
  priority text,
  status text DEFAULT 'Pending'::text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id),
  CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.task_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid,
  commented_by uuid,
  comment text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT task_comments_pkey PRIMARY KEY (id),
  CONSTRAINT task_comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id),
  CONSTRAINT task_comments_commented_by_fkey FOREIGN KEY (commented_by) REFERENCES auth.users(id)
);
CREATE TABLE public.workflow_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  workflow_name text,
  entity_type text,
  active boolean DEFAULT true,
  CONSTRAINT workflow_definitions_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_definitions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.workflow_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workflow_id uuid,
  step_name text,
  display_order integer,
  assigned_role text,
  mandatory boolean DEFAULT true,
  CONSTRAINT workflow_steps_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflow_definitions(id)
);
CREATE TABLE public.workflow_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workflow_id uuid,
  entity_type text,
  entity_id uuid,
  current_step integer,
  status text DEFAULT 'Running'::text,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  CONSTRAINT workflow_executions_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_executions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflow_definitions(id)
);
CREATE TABLE public.workflow_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  execution_id uuid,
  step_name text,
  completed_by uuid,
  completed_at timestamp with time zone DEFAULT now(),
  remarks text,
  CONSTRAINT workflow_history_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_history_execution_id_fkey FOREIGN KEY (execution_id) REFERENCES public.workflow_executions(id),
  CONSTRAINT workflow_history_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  integration_name text,
  integration_type text,
  provider text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT integrations_pkey PRIMARY KEY (id),
  CONSTRAINT integrations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  key_name text,
  api_key_hash text,
  active boolean DEFAULT true,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT api_keys_pkey PRIMARY KEY (id),
  CONSTRAINT api_keys_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.webhooks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  webhook_name text,
  endpoint_url text,
  secret text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT webhooks_pkey PRIMARY KEY (id),
  CONSTRAINT webhooks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.webhook_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  webhook_id uuid,
  event_name text,
  payload jsonb,
  response_code integer,
  delivered_at timestamp with time zone,
  CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT webhook_deliveries_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES public.webhooks(id)
);
CREATE TABLE public.iot_devices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  device_name text,
  device_type text,
  serial_number text,
  active boolean DEFAULT true,
  registered_at timestamp with time zone DEFAULT now(),
  CONSTRAINT iot_devices_pkey PRIMARY KEY (id),
  CONSTRAINT iot_devices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.iot_readings (
  id bigint NOT NULL DEFAULT nextval('iot_readings_id_seq'::regclass),
  device_id uuid,
  recorded_at timestamp with time zone DEFAULT now(),
  metric_name text,
  metric_value numeric,
  unit text,
  CONSTRAINT iot_readings_pkey PRIMARY KEY (id),
  CONSTRAINT iot_readings_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.iot_devices(id)
);
CREATE TABLE public.gps_devices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  device_name text,
  imei text,
  active boolean DEFAULT true,
  CONSTRAINT gps_devices_pkey PRIMARY KEY (id),
  CONSTRAINT gps_devices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.gps_tracking (
  id bigint NOT NULL DEFAULT nextval('gps_tracking_id_seq'::regclass),
  device_id uuid,
  latitude double precision,
  longitude double precision,
  altitude double precision,
  speed numeric,
  recorded_at timestamp with time zone,
  CONSTRAINT gps_tracking_pkey PRIMARY KEY (id),
  CONSTRAINT gps_tracking_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.gps_devices(id)
);
CREATE TABLE public.laboratory_integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  laboratory_id uuid,
  integration_name text,
  api_endpoint text,
  active boolean DEFAULT true,
  CONSTRAINT laboratory_integrations_pkey PRIMARY KEY (id),
  CONSTRAINT laboratory_integrations_laboratory_id_fkey FOREIGN KEY (laboratory_id) REFERENCES public.laboratories(id)
);
CREATE TABLE public.integration_logs (
  id bigint NOT NULL DEFAULT nextval('integration_logs_id_seq'::regclass),
  integration_id uuid,
  direction text,
  status text,
  payload jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT integration_logs_pkey PRIMARY KEY (id),
  CONSTRAINT integration_logs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id)
);
CREATE TABLE public.subscription_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  monthly_price numeric,
  yearly_price numeric,
  currency text DEFAULT 'USD'::text,
  max_projects integer,
  max_users integer,
  max_storage_gb integer,
  support_level text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subscription_plans_pkey PRIMARY KEY (id)
);
CREATE TABLE public.organization_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  plan_id uuid,
  start_date date,
  end_date date,
  renewal_date date,
  status text DEFAULT 'Trial'::text,
  billing_cycle text,
  external_subscription_id text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT organization_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT organization_subscriptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT organization_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id)
);
CREATE TABLE public.usage_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  metric_name text,
  metric_value numeric,
  metric_date date,
  CONSTRAINT usage_metrics_pkey PRIMARY KEY (id),
  CONSTRAINT usage_metrics_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_subscription_id uuid,
  invoice_number text UNIQUE,
  invoice_date date,
  due_date date,
  subtotal numeric,
  tax numeric,
  total numeric,
  currency text,
  status text DEFAULT 'Pending'::text,
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_organization_subscription_id_fkey FOREIGN KEY (organization_subscription_id) REFERENCES public.organization_subscriptions(id)
);
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid,
  payment_provider text,
  transaction_reference text,
  amount numeric,
  payment_date timestamp with time zone,
  status text,
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id)
);
CREATE TABLE public.invoice_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid,
  description text,
  quantity numeric,
  unit_price numeric,
  total numeric,
  CONSTRAINT invoice_items_pkey PRIMARY KEY (id),
  CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id)
);
CREATE TABLE public.coupons (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text UNIQUE,
  discount_type text,
  discount_value numeric,
  valid_until date,
  active boolean DEFAULT true,
  CONSTRAINT coupons_pkey PRIMARY KEY (id)
);
CREATE TABLE public.system_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  setting_key text UNIQUE,
  setting_value text,
  description text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT system_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.organization_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  setting_key text,
  setting_value text,
  CONSTRAINT organization_settings_pkey PRIMARY KEY (id),
  CONSTRAINT organization_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.feature_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  feature_name text UNIQUE,
  description text,
  enabled boolean DEFAULT false,
  CONSTRAINT feature_flags_pkey PRIMARY KEY (id)
);
CREATE TABLE public.organization_features (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  feature_flag_id uuid,
  enabled boolean DEFAULT true,
  CONSTRAINT organization_features_pkey PRIMARY KEY (id),
  CONSTRAINT organization_features_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT organization_features_feature_flag_id_fkey FOREIGN KEY (feature_flag_id) REFERENCES public.feature_flags(id)
);
CREATE TABLE public.audit_logs (
  id bigint NOT NULL DEFAULT nextval('audit_logs_id_seq'::regclass),
  organization_id uuid,
  user_id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.login_history (
  id bigint NOT NULL DEFAULT nextval('login_history_id_seq'::regclass),
  user_id uuid,
  login_time timestamp with time zone,
  ip_address text,
  browser text,
  operating_system text,
  success boolean,
  CONSTRAINT login_history_pkey PRIMARY KEY (id),
  CONSTRAINT login_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.api_rate_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  requests_per_minute integer,
  requests_per_day integer,
  CONSTRAINT api_rate_limits_pkey PRIMARY KEY (id),
  CONSTRAINT api_rate_limits_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.announcements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text,
  message text,
  published_at timestamp with time zone,
  expires_at timestamp with time zone,
  CONSTRAINT announcements_pkey PRIMARY KEY (id)
);
CREATE TABLE public.support_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  created_by uuid,
  subject text,
  description text,
  priority text,
  status text DEFAULT 'Open'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT support_tickets_pkey PRIMARY KEY (id),
  CONSTRAINT support_tickets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT support_tickets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.support_ticket_replies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid,
  replied_by uuid,
  message text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT support_ticket_replies_pkey PRIMARY KEY (id),
  CONSTRAINT support_ticket_replies_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id),
  CONSTRAINT support_ticket_replies_replied_by_fkey FOREIGN KEY (replied_by) REFERENCES auth.users(id)
);
CREATE TABLE public.kpi_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  kpi_name text UNIQUE,
  description text,
  unit text,
  category text,
  CONSTRAINT kpi_definitions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.organization_kpis (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  kpi_id uuid,
  period date,
  value numeric,
  CONSTRAINT organization_kpis_pkey PRIMARY KEY (id),
  CONSTRAINT organization_kpis_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT organization_kpis_kpi_id_fkey FOREIGN KEY (kpi_id) REFERENCES public.kpi_definitions(id)
);
CREATE TABLE public.dashboard_widgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  widget_name text,
  position_x integer,
  position_y integer,
  width integer,
  height integer,
  configuration jsonb,
  CONSTRAINT dashboard_widgets_pkey PRIMARY KEY (id),
  CONSTRAINT dashboard_widgets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.saved_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  report_name text,
  report_type text,
  configuration jsonb,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT saved_reports_pkey PRIMARY KEY (id),
  CONSTRAINT saved_reports_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT saved_reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.report_exports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  report_id uuid,
  export_type text,
  file_url text,
  exported_by uuid,
  exported_at timestamp with time zone DEFAULT now(),
  CONSTRAINT report_exports_pkey PRIMARY KEY (id),
  CONSTRAINT report_exports_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.saved_reports(id),
  CONSTRAINT report_exports_exported_by_fkey FOREIGN KEY (exported_by) REFERENCES auth.users(id)
);
CREATE TABLE public.dashboard_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  snapshot_date date,
  dashboard_data jsonb,
  CONSTRAINT dashboard_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT dashboard_snapshots_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.activity_timeline (
  id bigint NOT NULL DEFAULT nextval('activity_timeline_id_seq'::regclass),
  organization_id uuid,
  event_name text,
  entity_type text,
  entity_id uuid,
  user_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT activity_timeline_pkey PRIMARY KEY (id),
  CONSTRAINT activity_timeline_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT activity_timeline_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.performance_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  metric_name text,
  metric_value numeric,
  recorded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT performance_metrics_pkey PRIMARY KEY (id),
  CONSTRAINT performance_metrics_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.mass_balance_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid UNIQUE,
  min_yield_percent double precision NOT NULL DEFAULT 15.0,
  max_yield_percent double precision NOT NULL DEFAULT 50.0,
  max_moisture_percent double precision NOT NULL DEFAULT 65.0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT mass_balance_configs_pkey PRIMARY KEY (id),
  CONSTRAINT mass_balance_configs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.mass_balance_anomalies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  project_id uuid,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  severity text NOT NULL,
  category text NOT NULL,
  human_readable_explanation text NOT NULL,
  status text NOT NULL DEFAULT 'Active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  resolved_by uuid,
  CONSTRAINT mass_balance_anomalies_pkey PRIMARY KEY (id),
  CONSTRAINT mass_balance_anomalies_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT mass_balance_anomalies_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT mass_balance_anomalies_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.laboratory_validation_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid UNIQUE,
  min_peak_temperature double precision NOT NULL DEFAULT 450.0,
  min_residence_time_minutes integer NOT NULL DEFAULT 30,
  max_moisture_percent double precision NOT NULL DEFAULT 65.0,
  required_evidence_types jsonb,
  required_laboratory_fields jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT laboratory_validation_configs_pkey PRIMARY KEY (id),
  CONSTRAINT laboratory_validation_configs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.laboratory_validation_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  project_id uuid,
  batch_id uuid NOT NULL,
  rule_triggered text NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  validation_score double precision NOT NULL,
  risk_level text NOT NULL,
  details jsonb,
  evaluated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT laboratory_validation_logs_pkey PRIMARY KEY (id),
  CONSTRAINT laboratory_validation_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT laboratory_validation_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT laboratory_validation_logs_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.biochar_batches(id),
  CONSTRAINT laboratory_validation_logs_evaluated_by_fkey FOREIGN KEY (evaluated_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.feedstock_intelligence_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid UNIQUE,
  max_moisture_percent double precision NOT NULL DEFAULT 25.0,
  max_storage_days integer NOT NULL DEFAULT 60,
  min_supplier_score double precision NOT NULL DEFAULT 70.0,
  contamination_strict boolean NOT NULL DEFAULT true,
  quality_weights jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT feedstock_intelligence_configs_pkey PRIMARY KEY (id),
  CONSTRAINT feedstock_intelligence_configs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.feedstock_intelligence_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  project_id uuid,
  feedstock_id uuid NOT NULL,
  supplier_id uuid,
  rule_triggered text NOT NULL,
  quality_score double precision NOT NULL,
  quality_status text NOT NULL,
  recommendation text,
  details jsonb,
  evaluated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT feedstock_intelligence_logs_pkey PRIMARY KEY (id),
  CONSTRAINT feedstock_intelligence_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT feedstock_intelligence_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT feedstock_intelligence_logs_feedstock_id_fkey FOREIGN KEY (feedstock_id) REFERENCES public.feedstock_batches(id),
  CONSTRAINT feedstock_intelligence_logs_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.feedstock_suppliers(id),
  CONSTRAINT feedstock_intelligence_logs_evaluated_by_fkey FOREIGN KEY (evaluated_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.chain_of_custody_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  project_id uuid,
  event_type text NOT NULL,
  parent_entity_type text,
  parent_entity_id uuid,
  child_entity_type text,
  child_entity_id uuid,
  quantity double precision,
  quantity_unit text NOT NULL DEFAULT 'kg'::text,
  operator_id uuid,
  site_id uuid,
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'Verified'::text,
  notes text,
  CONSTRAINT chain_of_custody_events_pkey PRIMARY KEY (id),
  CONSTRAINT chain_of_custody_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT chain_of_custody_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT chain_of_custody_events_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.evidence (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid,
  entity_type text NOT NULL,
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
  upload_status text NOT NULL DEFAULT 'Pending'::text,
  verification_status text NOT NULL DEFAULT 'Draft'::text,
  reviewer_id uuid,
  reviewed_at timestamp with time zone,
  uploaded_at timestamp with time zone,
  remarks text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT evidence_pkey PRIMARY KEY (id),
  CONSTRAINT evidence_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT evidence_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT evidence_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id),
  CONSTRAINT evidence_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id)
);
CREATE TABLE public.evidence_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL,
  file_role text NOT NULL,
  filename text NOT NULL,
  storage_path text NOT NULL,
  file_size bigint,
  mime_type text,
  sha256_hash text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT evidence_files_pkey PRIMARY KEY (id),
  CONSTRAINT evidence_files_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.evidence(id)
);
CREATE TABLE public.evidence_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  review_time timestamp with time zone DEFAULT now(),
  action text NOT NULL,
  comments text,
  previous_status text,
  new_status text,
  CONSTRAINT evidence_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT evidence_reviews_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.evidence(id),
  CONSTRAINT evidence_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id)
);
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
  CONSTRAINT evidence_ai_results_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.evidence(id)
);
CREATE TABLE public.evidence_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evidence_id uuid,
  user_id uuid,
  action text NOT NULL,
  ip_address text,
  details jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT evidence_audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT evidence_audit_logs_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.evidence(id),
  CONSTRAINT evidence_audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);