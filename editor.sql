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