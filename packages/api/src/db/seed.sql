-- ═══════════════════════════════════════════════════════════════════════════
-- ScanFactory Seed Data
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ USERS ═══
-- Password: "admin123" hashed with bcrypt (placeholder - will be hashed at runtime)
INSERT INTO users (id, email, password_hash, name, role, phone, active) VALUES
  ('usr_admin_001', 'admin@devfactory.tn', '$2a$10$placeholder_hash_admin', 'Administrateur', 'admin', '+21699000001', 1),
  ('usr_oper_001', 'operateur@devfactory.tn', '$2a$10$placeholder_hash_operator', 'Opérateur Test', 'operator', '+21699000002', 1);

-- ═══ PIPELINE: BULLETIN DE SOIN ═══
INSERT INTO pipelines (id, name, display_name, description, ocr_schema, rule_steps, batch_config, field_display, active) VALUES
  ('pip_bulletin_soin',
   'bulletin_soin',
   'Bulletin de Soin',
   'Traitement des bulletins de soin pour assurances maladie',
   'bulletin_soin',
   '[
     {"name": "company_lookup", "type": "lookup", "config": {"table": "bs_companies", "field": "company_name", "match_field": "name"}},
     {"name": "contract_lookup", "type": "lookup", "config": {"table": "bs_contracts", "field": "policy_number", "match_field": "policy_prefix", "match_type": "prefix"}},
     {"name": "conditions_lookup", "type": "lookup", "config": {"table": "bs_conditions", "field": "service_type"}},
     {"name": "pct_match", "type": "lookup", "config": {"table": "bs_pct_medications", "field": "medications", "match_field": "name_commercial", "match_type": "fuzzy"}},
     {"name": "reimbursement_calc", "type": "compute", "config": {"formula": "min(invoiced_amount * reimbursement_rate, ceiling_per_act, pct_price)"}},
     {"name": "ceiling_check", "type": "validate", "config": {"rule": "annual_total <= ceiling_annual"}},
     {"name": "duplicate_check", "type": "anomaly", "config": {"fields": ["patient_cin", "care_date", "company_name"], "window_days": 30}}
   ]',
   '{"group_by": "company_id", "max_count": 50, "max_days": 7, "export_template": "bordereau_pdf"}',
   '{"groups": [
     {"name": "patient", "label": "Patient", "fields": ["patient_name", "patient_cin", "patient_birthdate"]},
     {"name": "company", "label": "Compagnie", "fields": ["company_name", "policy_number"]},
     {"name": "care", "label": "Soins", "fields": ["care_date", "care_type", "practitioner_name"]},
     {"name": "amounts", "label": "Montants", "fields": ["invoiced_amount", "reimbursement_amount"]}
   ]}',
   1);

-- ═══ INSURANCE COMPANIES (bs_companies) ═══
INSERT INTO bs_companies (id, name, code, lot_max_bulletins, lot_max_days, active) VALUES
  ('comp_star', 'STAR', 'STAR', 50, 7, 1),
  ('comp_gat', 'GAT Assurances', 'GAT', 40, 5, 1);

-- ═══ CONTRACTS (bs_contracts) ═══
INSERT INTO bs_contracts (id, company_id, policy_prefix, category, valid_from, valid_to, active) VALUES
  ('ctr_star_001', 'comp_star', 'STAR-IND', 'Individuel', '2024-01-01', '2026-12-31', 1),
  ('ctr_star_002', 'comp_star', 'STAR-GRP', 'Groupe', '2024-01-01', '2026-12-31', 1),
  ('ctr_gat_001', 'comp_gat', 'GAT-FAM', 'Famille', '2024-01-01', '2026-12-31', 1),
  ('ctr_gat_002', 'comp_gat', 'GAT-ENT', 'Entreprise', '2024-01-01', '2026-12-31', 1);

-- ═══ CONDITIONS (bs_conditions) ═══
INSERT INTO bs_conditions (id, contract_id, service_type, reimbursement_rate, ceiling_per_act, ceiling_annual, waiting_days, special_conditions) VALUES
  -- STAR Individual
  ('cond_star_001_med', 'ctr_star_001', 'consultation', 0.80, 50.00, 2000.00, 0, NULL),
  ('cond_star_001_pharm', 'ctr_star_001', 'pharmacie', 0.70, 100.00, 1500.00, 0, NULL),
  ('cond_star_001_hosp', 'ctr_star_001', 'hospitalisation', 0.90, 5000.00, 20000.00, 30, 'Délai de carence 30 jours'),
  -- STAR Group
  ('cond_star_002_med', 'ctr_star_002', 'consultation', 0.85, 60.00, 3000.00, 0, NULL),
  ('cond_star_002_pharm', 'ctr_star_002', 'pharmacie', 0.75, 150.00, 2500.00, 0, NULL),
  ('cond_star_002_hosp', 'ctr_star_002', 'hospitalisation', 0.95, 8000.00, 30000.00, 15, 'Délai de carence 15 jours'),
  -- GAT Family
  ('cond_gat_001_med', 'ctr_gat_001', 'consultation', 0.75, 45.00, 1800.00, 0, NULL),
  ('cond_gat_001_pharm', 'ctr_gat_001', 'pharmacie', 0.65, 80.00, 1200.00, 0, NULL),
  ('cond_gat_001_hosp', 'ctr_gat_001', 'hospitalisation', 0.85, 4000.00, 15000.00, 30, NULL),
  -- GAT Enterprise
  ('cond_gat_002_med', 'ctr_gat_002', 'consultation', 0.90, 70.00, 4000.00, 0, NULL),
  ('cond_gat_002_pharm', 'ctr_gat_002', 'pharmacie', 0.80, 200.00, 3000.00, 0, NULL),
  ('cond_gat_002_hosp', 'ctr_gat_002', 'hospitalisation', 1.00, 10000.00, 50000.00, 0, 'Couverture complète');

-- ═══ PCT MEDICATIONS (bs_pct_medications) ═══
INSERT INTO bs_pct_medications (id, name_commercial, dci, dosage, price_ttc, therapeutic_class, valid_from) VALUES
  ('pct_001', 'Doliprane', 'Paracétamol', '1000mg', 3.50, 'Antalgiques', '2024-01-01'),
  ('pct_002', 'Augmentin', 'Amoxicilline/Acide clavulanique', '1g', 18.90, 'Antibiotiques', '2024-01-01'),
  ('pct_003', 'Voltarène', 'Diclofénac', '75mg', 8.20, 'Anti-inflammatoires', '2024-01-01'),
  ('pct_004', 'Glucophage', 'Metformine', '850mg', 6.50, 'Antidiabétiques', '2024-01-01'),
  ('pct_005', 'Amlor', 'Amlodipine', '10mg', 12.30, 'Antihypertenseurs', '2024-01-01');

-- ═══ PRACTITIONERS (bs_practitioners) ═══
INSERT INTO bs_practitioners (id, name, specialty, cnam_code, active) VALUES
  ('prac_001', 'Dr. Mohamed Ben Ali', 'Médecine Générale', 'CNAM-MG-001', 1),
  ('prac_002', 'Dr. Fatma Trabelsi', 'Cardiologie', 'CNAM-CARD-002', 1),
  ('prac_003', 'Dr. Ahmed Bouazizi', 'Pédiatrie', 'CNAM-PED-003', 1);

-- ═══ LOOKUP TABLES (generic) ═══
INSERT INTO lookup_tables (id, name, pipeline_id, description) VALUES
  ('lt_companies', 'companies', 'pip_bulletin_soin', 'Insurance companies for bulletin de soin'),
  ('lt_pct', 'pct_medications', 'pip_bulletin_soin', 'PCT medication reference prices');
