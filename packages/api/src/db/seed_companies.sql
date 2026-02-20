-- ═══════════════════════════════════════════════════════════════════════════
-- ScanFactory Production Seed Data
-- T034: Configure 5 Insurance Companies (Tunisia)
-- T035: Facture Pipeline Configuration
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ PIPELINES ═══

-- Bulletin de Soin Pipeline (if not exists)
INSERT OR REPLACE INTO pipelines (id, name, display_name, description, ocr_schema, rule_steps, batch_config, field_display, active)
VALUES (
  '01HPBULLETINSOIN',
  'bulletin_soin',
  'Bulletin de Soin',
  'Traitement des bulletins de soins pour remboursement assurance maladie',
  'bulletin_soin',
  '[
    {"name": "company_lookup", "type": "bs_company_lookup", "config": {}},
    {"name": "contract_lookup", "type": "bs_contract_lookup", "config": {}},
    {"name": "conditions_lookup", "type": "bs_conditions_lookup", "config": {}},
    {"name": "pct_match", "type": "bs_pct_match", "config": {}},
    {"name": "reimbursement_calc", "type": "bs_reimbursement_calc", "config": {}},
    {"name": "annual_ceiling_check", "type": "bs_annual_ceiling_check", "config": {}},
    {"name": "anomaly_detection", "type": "bs_anomaly_detection", "config": {}}
  ]',
  '{"group_by": "company_id", "max_count": 50, "max_days": 7, "export_template": "bordereau_pdf"}',
  '{"groups": [
    {"name": "Assuré", "fields": ["patient_name", "patient_cin", "policy_number"]},
    {"name": "Soins", "fields": ["care_date", "service_type", "practitioner_name"]},
    {"name": "Montants", "fields": ["invoiced_amount", "reimbursement_amount", "ticket_moderateur"]}
  ]}',
  1
);

-- Facture Pipeline (T035)
INSERT OR REPLACE INTO pipelines (id, name, display_name, description, ocr_schema, rule_steps, batch_config, field_display, active)
VALUES (
  '01HPFACTURE0001',
  'facture',
  'Facture',
  'Traitement des factures fournisseurs',
  'efactura_tn',
  '[
    {"name": "supplier_lookup", "type": "lookup", "config": {"table": "suppliers", "match_field": "supplier_name", "fuzzy": true}},
    {"name": "tva_validation", "type": "validate", "config": {"rules": [
      {"field": "tva_rate", "type": "enum", "values": [0, 0.07, 0.13, 0.19]},
      {"field": "total_ttc", "type": "computed", "formula": "total_ht * (1 + tva_rate)"}
    ]}},
    {"name": "duplicate_check", "type": "anomaly", "config": {"type": "duplicate", "fields": ["supplier_id", "invoice_number"], "window_days": 365}}
  ]',
  '{"group_by": "supplier_id", "max_count": 100, "max_days": 30, "export_template": "facture_csv"}',
  '{"groups": [
    {"name": "Fournisseur", "fields": ["supplier_name", "supplier_code", "invoice_number"]},
    {"name": "Dates", "fields": ["invoice_date", "due_date"]},
    {"name": "Montants", "fields": ["total_ht", "tva_amount", "total_ttc"]}
  ]}',
  1
);

-- ═══ INSURANCE COMPANIES (5 Major Tunisian Companies) ═══

-- 1. STAR (Société Tunisienne d'Assurances et de Réassurances)
INSERT OR REPLACE INTO bs_companies (id, name, code, lot_max_bulletins, lot_max_days, active)
VALUES ('01HCSTAR0000001', 'STAR Assurances', 'STAR', 50, 7, 1);

-- 2. GAT (Groupe des Assurances de Tunisie)
INSERT OR REPLACE INTO bs_companies (id, name, code, lot_max_bulletins, lot_max_days, active)
VALUES ('01HCGAT00000001', 'GAT Assurances', 'GAT', 40, 5, 1);

-- 3. COMAR (Compagnie Méditerranéenne d'Assurances et de Réassurances)
INSERT OR REPLACE INTO bs_companies (id, name, code, lot_max_bulletins, lot_max_days, active)
VALUES ('01HCCOMAR000001', 'COMAR', 'COMAR', 60, 7, 1);

-- 4. CARTE (Compagnie d'Assurances et de Réassurances Tuniso-Européenne)
INSERT OR REPLACE INTO bs_companies (id, name, code, lot_max_bulletins, lot_max_days, active)
VALUES ('01HCCARTE000001', 'CARTE Assurances', 'CARTE', 45, 7, 1);

-- 5. AMI (Assurances Mutuelles d'Investissement)
INSERT OR REPLACE INTO bs_companies (id, name, code, lot_max_bulletins, lot_max_days, active)
VALUES ('01HCAMI00000001', 'AMI Assurances', 'AMI', 50, 10, 1);

-- ═══ CONTRACTS ═══

-- STAR Contracts
INSERT OR REPLACE INTO bs_contracts (id, company_id, policy_prefix, category, valid_from, valid_to, active)
VALUES
  ('01HCTSTAR001001', '01HCSTAR0000001', 'STAR-IND-', 'Individuel', '2024-01-01', NULL, 1),
  ('01HCTSTAR002001', '01HCSTAR0000001', 'STAR-GRP-', 'Groupe', '2024-01-01', NULL, 1),
  ('01HCTSTAR003001', '01HCSTAR0000001', 'STAR-PME-', 'PME', '2024-01-01', NULL, 1);

-- GAT Contracts
INSERT OR REPLACE INTO bs_contracts (id, company_id, policy_prefix, category, valid_from, valid_to, active)
VALUES
  ('01HCTGAT0001001', '01HCGAT00000001', 'GAT-STD-', 'Standard', '2024-01-01', NULL, 1),
  ('01HCTGAT0002001', '01HCGAT00000001', 'GAT-PRM-', 'Premium', '2024-01-01', NULL, 1);

-- COMAR Contracts
INSERT OR REPLACE INTO bs_contracts (id, company_id, policy_prefix, category, valid_from, valid_to, active)
VALUES
  ('01HCTCOMAR01001', '01HCCOMAR000001', 'COM-FAM-', 'Famille', '2024-01-01', NULL, 1),
  ('01HCTCOMAR02001', '01HCCOMAR000001', 'COM-ENT-', 'Entreprise', '2024-01-01', NULL, 1);

-- CARTE Contracts
INSERT OR REPLACE INTO bs_contracts (id, company_id, policy_prefix, category, valid_from, valid_to, active)
VALUES
  ('01HCTCARTE01001', '01HCCARTE000001', 'CRT-BAS-', 'Basique', '2024-01-01', NULL, 1),
  ('01HCTCARTE02001', '01HCCARTE000001', 'CRT-COM-', 'Complet', '2024-01-01', NULL, 1);

-- AMI Contracts
INSERT OR REPLACE INTO bs_contracts (id, company_id, policy_prefix, category, valid_from, valid_to, active)
VALUES
  ('01HCTAMI0001001', '01HCAMI00000001', 'AMI-MUT-', 'Mutuelle', '2024-01-01', NULL, 1),
  ('01HCTAMI0002001', '01HCAMI00000001', 'AMI-PRO-', 'Professionnel', '2024-01-01', NULL, 1);

-- ═══ CONDITIONS (Reimbursement rates and ceilings) ═══

-- STAR Individual Conditions
INSERT OR REPLACE INTO bs_conditions (id, contract_id, service_type, reimbursement_rate, ceiling_per_act, ceiling_annual, waiting_days)
VALUES
  ('01HCDSTAR01CON1', '01HCTSTAR001001', 'consultation', 0.80, 50, 1000, 0),
  ('01HCDSTAR01PHA1', '01HCTSTAR001001', 'pharmacie', 0.70, NULL, 2000, 0),
  ('01HCDSTAR01HOS1', '01HCTSTAR001001', 'hospitalisation', 0.90, 500, 10000, 30),
  ('01HCDSTAR01LAB1', '01HCTSTAR001001', 'laboratoire', 0.75, 100, 1500, 0),
  ('01HCDSTAR01RAD1', '01HCTSTAR001001', 'radiologie', 0.70, 200, 2000, 0),
  ('01HCDSTAR01DEN1', '01HCTSTAR001001', 'dentaire', 0.60, 80, 800, 90),
  ('01HCDSTAR01OPT1', '01HCTSTAR001001', 'optique', 0.50, 150, 300, 180);

-- STAR Group Conditions (better rates)
INSERT OR REPLACE INTO bs_conditions (id, contract_id, service_type, reimbursement_rate, ceiling_per_act, ceiling_annual, waiting_days)
VALUES
  ('01HCDSTAR02CON1', '01HCTSTAR002001', 'consultation', 0.85, 60, 1500, 0),
  ('01HCDSTAR02PHA1', '01HCTSTAR002001', 'pharmacie', 0.80, NULL, 3000, 0),
  ('01HCDSTAR02HOS1', '01HCTSTAR002001', 'hospitalisation', 0.95, 800, 15000, 15),
  ('01HCDSTAR02LAB1', '01HCTSTAR002001', 'laboratoire', 0.80, 150, 2000, 0),
  ('01HCDSTAR02RAD1', '01HCTSTAR002001', 'radiologie', 0.80, 300, 3000, 0);

-- GAT Standard Conditions
INSERT OR REPLACE INTO bs_conditions (id, contract_id, service_type, reimbursement_rate, ceiling_per_act, ceiling_annual, waiting_days)
VALUES
  ('01HCDGAT001CON1', '01HCTGAT0001001', 'consultation', 0.75, 45, 900, 0),
  ('01HCDGAT001PHA1', '01HCTGAT0001001', 'pharmacie', 0.65, NULL, 1800, 0),
  ('01HCDGAT001HOS1', '01HCTGAT0001001', 'hospitalisation', 0.85, 400, 8000, 30),
  ('01HCDGAT001LAB1', '01HCTGAT0001001', 'laboratoire', 0.70, 80, 1200, 0);

-- GAT Premium Conditions
INSERT OR REPLACE INTO bs_conditions (id, contract_id, service_type, reimbursement_rate, ceiling_per_act, ceiling_annual, waiting_days)
VALUES
  ('01HCDGAT002CON1', '01HCTGAT0002001', 'consultation', 0.90, 80, 2000, 0),
  ('01HCDGAT002PHA1', '01HCTGAT0002001', 'pharmacie', 0.85, NULL, 5000, 0),
  ('01HCDGAT002HOS1', '01HCTGAT0002001', 'hospitalisation', 1.00, 1000, 20000, 0),
  ('01HCDGAT002LAB1', '01HCTGAT0002001', 'laboratoire', 0.90, 200, 3000, 0),
  ('01HCDGAT002RAD1', '01HCTGAT0002001', 'radiologie', 0.90, 400, 4000, 0),
  ('01HCDGAT002DEN1', '01HCTGAT0002001', 'dentaire', 0.80, 150, 1500, 30),
  ('01HCDGAT002OPT1', '01HCTGAT0002001', 'optique', 0.70, 250, 500, 90);

-- COMAR Family Conditions
INSERT OR REPLACE INTO bs_conditions (id, contract_id, service_type, reimbursement_rate, ceiling_per_act, ceiling_annual, waiting_days)
VALUES
  ('01HCDCOMAR1CON1', '01HCTCOMAR01001', 'consultation', 0.80, 55, 1200, 0),
  ('01HCDCOMAR1PHA1', '01HCTCOMAR01001', 'pharmacie', 0.75, NULL, 2500, 0),
  ('01HCDCOMAR1HOS1', '01HCTCOMAR01001', 'hospitalisation', 0.90, 600, 12000, 15);

-- CARTE Basic Conditions
INSERT OR REPLACE INTO bs_conditions (id, contract_id, service_type, reimbursement_rate, ceiling_per_act, ceiling_annual, waiting_days)
VALUES
  ('01HCDCARTE1CON1', '01HCTCARTE01001', 'consultation', 0.70, 40, 800, 0),
  ('01HCDCARTE1PHA1', '01HCTCARTE01001', 'pharmacie', 0.60, NULL, 1500, 0),
  ('01HCDCARTE1HOS1', '01HCTCARTE01001', 'hospitalisation', 0.80, 350, 6000, 45);

-- CARTE Complete Conditions
INSERT OR REPLACE INTO bs_conditions (id, contract_id, service_type, reimbursement_rate, ceiling_per_act, ceiling_annual, waiting_days)
VALUES
  ('01HCDCARTE2CON1', '01HCTCARTE02001', 'consultation', 0.85, 70, 1800, 0),
  ('01HCDCARTE2PHA1', '01HCTCARTE02001', 'pharmacie', 0.80, NULL, 4000, 0),
  ('01HCDCARTE2HOS1', '01HCTCARTE02001', 'hospitalisation', 0.95, 900, 18000, 0),
  ('01HCDCARTE2LAB1', '01HCTCARTE02001', 'laboratoire', 0.85, 180, 2500, 0),
  ('01HCDCARTE2RAD1', '01HCTCARTE02001', 'radiologie', 0.85, 350, 3500, 0);

-- AMI Mutual Conditions
INSERT OR REPLACE INTO bs_conditions (id, contract_id, service_type, reimbursement_rate, ceiling_per_act, ceiling_annual, waiting_days)
VALUES
  ('01HCDAMI001CON1', '01HCTAMI0001001', 'consultation', 0.80, 50, 1000, 0),
  ('01HCDAMI001PHA1', '01HCTAMI0001001', 'pharmacie', 0.70, NULL, 2000, 0),
  ('01HCDAMI001HOS1', '01HCTAMI0001001', 'hospitalisation', 0.85, 450, 9000, 30);

-- ═══ SAMPLE PCT MEDICATIONS ═══

INSERT OR REPLACE INTO bs_pct_medications (id, name_commercial, dci, dosage, price_ttc, therapeutic_class, valid_from)
VALUES
  ('01HMPCT00000001', 'DOLIPRANE', 'Paracétamol', '500mg', 2.50, 'Antalgique', '2024-01-01'),
  ('01HMPCT00000002', 'DOLIPRANE', 'Paracétamol', '1000mg', 3.80, 'Antalgique', '2024-01-01'),
  ('01HMPCT00000003', 'EFFERALGAN', 'Paracétamol', '500mg', 3.20, 'Antalgique', '2024-01-01'),
  ('01HMPCT00000004', 'DAFALGAN', 'Paracétamol', '500mg', 2.90, 'Antalgique', '2024-01-01'),
  ('01HMPCT00000005', 'ADVIL', 'Ibuprofène', '200mg', 4.50, 'Anti-inflammatoire', '2024-01-01'),
  ('01HMPCT00000006', 'NUROFEN', 'Ibuprofène', '400mg', 5.80, 'Anti-inflammatoire', '2024-01-01'),
  ('01HMPCT00000007', 'AMOXIL', 'Amoxicilline', '500mg', 8.50, 'Antibiotique', '2024-01-01'),
  ('01HMPCT00000008', 'AUGMENTIN', 'Amoxicilline/Acide clavulanique', '1g', 15.00, 'Antibiotique', '2024-01-01'),
  ('01HMPCT00000009', 'CLAMOXYL', 'Amoxicilline', '1g', 12.00, 'Antibiotique', '2024-01-01'),
  ('01HMPCT00000010', 'FLAGYL', 'Métronidazole', '500mg', 6.50, 'Antiparasitaire', '2024-01-01'),
  ('01HMPCT00000011', 'OMEPRAZOLE', 'Oméprazole', '20mg', 7.80, 'Anti-ulcéreux', '2024-01-01'),
  ('01HMPCT00000012', 'INEXIUM', 'Esoméprazole', '40mg', 25.00, 'Anti-ulcéreux', '2024-01-01'),
  ('01HMPCT00000013', 'VENTOLINE', 'Salbutamol', '100mcg', 8.90, 'Bronchodilatateur', '2024-01-01'),
  ('01HMPCT00000014', 'SERETIDE', 'Fluticasone/Salmétérol', '250/50mcg', 45.00, 'Antiasthmatique', '2024-01-01'),
  ('01HMPCT00000015', 'GLUCOPHAGE', 'Metformine', '850mg', 6.00, 'Antidiabétique', '2024-01-01'),
  ('01HMPCT00000016', 'DIAMICRON', 'Gliclazide', '30mg', 12.50, 'Antidiabétique', '2024-01-01'),
  ('01HMPCT00000017', 'LIPITOR', 'Atorvastatine', '20mg', 28.00, 'Hypolipémiant', '2024-01-01'),
  ('01HMPCT00000018', 'CRESTOR', 'Rosuvastatine', '10mg', 35.00, 'Hypolipémiant', '2024-01-01'),
  ('01HMPCT00000019', 'AMLOR', 'Amlodipine', '5mg', 15.00, 'Antihypertenseur', '2024-01-01'),
  ('01HMPCT00000020', 'COVERSYL', 'Périndopril', '5mg', 22.00, 'Antihypertenseur', '2024-01-01');

-- ═══ SAMPLE PRACTITIONERS ═══

INSERT OR REPLACE INTO bs_practitioners (id, name, specialty, cnam_code, active)
VALUES
  ('01HPRAC0000001', 'Dr. Mohamed Ben Ali', 'Médecine générale', 'MG001', 1),
  ('01HPRAC0000002', 'Dr. Fatma Trabelsi', 'Cardiologie', 'CA001', 1),
  ('01HPRAC0000003', 'Dr. Ahmed Hammami', 'Gastro-entérologie', 'GE001', 1),
  ('01HPRAC0000004', 'Dr. Leila Bouazizi', 'Pédiatrie', 'PE001', 1),
  ('01HPRAC0000005', 'Dr. Karim Sassi', 'Ophtalmologie', 'OP001', 1),
  ('01HPRAC0000006', 'Dr. Sonia Mejri', 'Dermatologie', 'DE001', 1),
  ('01HPRAC0000007', 'Dr. Hichem Jebali', 'Orthopédie', 'OR001', 1),
  ('01HPRAC0000008', 'Dr. Nadia Chaabane', 'Gynécologie', 'GY001', 1),
  ('01HPRAC0000009', 'Dr. Slim Khelifi', 'Neurologie', 'NE001', 1),
  ('01HPRAC0000010', 'Dr. Amira Gharbi', 'Endocrinologie', 'EN001', 1);

-- ═══ LOOKUP TABLES FOR FACTURE PIPELINE ═══

INSERT OR REPLACE INTO lookup_tables (id, name, pipeline_id, description)
VALUES ('01HLTSUPP000001', 'suppliers', '01HPFACTURE0001', 'Fournisseurs pour le pipeline factures');

-- Sample suppliers
INSERT OR REPLACE INTO lookup_entries (id, table_id, key, data, active, valid_from)
VALUES
  ('01HLESUPP000001', '01HLTSUPP000001', 'FOURNI001', '{"name": "Fournitures Tunis SARL", "code": "FT001", "tva_id": "1234567A", "address": "Rue de la Liberté, Tunis"}', 1, '2024-01-01'),
  ('01HLESUPP000002', '01HLTSUPP000001', 'BUREAU002', '{"name": "Bureau Plus", "code": "BP002", "tva_id": "2345678B", "address": "Avenue Habib Bourguiba, Sfax"}', 1, '2024-01-01'),
  ('01HLESUPP000003', '01HLTSUPP000001', 'TECH003', '{"name": "Tech Solutions", "code": "TS003", "tva_id": "3456789C", "address": "Zone Industrielle, Sousse"}', 1, '2024-01-01'),
  ('01HLESUPP000004', '01HLTSUPP000001', 'IMPRIM04', '{"name": "Imprimerie Nationale", "code": "IN004", "tva_id": "4567890D", "address": "Rue Ibn Khaldoun, Tunis"}', 1, '2024-01-01'),
  ('01HLESUPP000005', '01HLTSUPP000001', 'MAINT005', '{"name": "Maintenance Pro", "code": "MP005", "tva_id": "5678901E", "address": "Avenue de France, Tunis"}', 1, '2024-01-01');
