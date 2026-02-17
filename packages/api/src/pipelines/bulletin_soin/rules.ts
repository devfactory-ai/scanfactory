import type { RuleStep, DocumentData, RuleResult, PipelineContext, Anomaly } from '../../core/pipeline/types';
import { ruleRegistry } from '../../core/pipeline/registry';

// ============================================================================
// Bulletin de Soin Specific Rules
// ============================================================================

/**
 * Company Lookup Rule
 * Finds insurance company from extracted company_name or policy number prefix
 */
const companyLookupRule: RuleStep = {
  type: 'bs_company_lookup',

  async execute(
    doc: DocumentData,
    _config: Record<string, unknown>,
    ctx: PipelineContext
  ): Promise<RuleResult> {
    const companyName = doc.extracted_data.company_name as string | undefined;
    const policyNumber = doc.extracted_data.policy_number as string | undefined;

    let company: Record<string, unknown> | null = null;

    // Try by name first
    if (companyName) {
      company = await ctx.db
        .prepare(
          `SELECT * FROM bs_companies
           WHERE active = 1 AND (LOWER(name) LIKE LOWER('%' || ? || '%') OR code = ?)
           LIMIT 1`
        )
        .bind(companyName, companyName.toUpperCase())
        .first();
    }

    // Try by policy prefix
    if (!company && policyNumber) {
      company = await ctx.db
        .prepare(
          `SELECT c.* FROM bs_companies c
           JOIN bs_contracts ct ON c.id = ct.company_id
           WHERE c.active = 1 AND ? LIKE (ct.policy_prefix || '%')
           ORDER BY LENGTH(ct.policy_prefix) DESC
           LIMIT 1`
        )
        .bind(policyNumber)
        .first();
    }

    if (!company) {
      return {
        success: true,
        anomalies: [
          {
            type: 'company_not_found',
            message: `Compagnie d'assurance non trouvée: "${companyName || policyNumber}"`,
            severity: 'warning',
          },
        ],
      };
    }

    return {
      success: true,
      computed: {
        company_id: company.id,
        company_code: company.code,
        company_name_resolved: company.name,
        lot_max_bulletins: company.lot_max_bulletins,
        lot_max_days: company.lot_max_days,
      },
    };
  },
};

/**
 * Contract Lookup Rule
 * Finds contract and conditions based on policy number
 */
const contractLookupRule: RuleStep = {
  type: 'bs_contract_lookup',

  async execute(
    doc: DocumentData,
    _config: Record<string, unknown>,
    ctx: PipelineContext
  ): Promise<RuleResult> {
    const policyNumber = doc.extracted_data.policy_number as string | undefined;
    const companyId = doc.computed_data.company_id as string | undefined;

    if (!policyNumber) {
      return {
        success: true,
        anomalies: [
          {
            type: 'missing_policy',
            message: 'Numéro de police manquant',
            severity: 'warning',
            field: 'policy_number',
          },
        ],
      };
    }

    // Find contract by policy prefix
    let query = `
      SELECT c.*, co.name as company_name
      FROM bs_contracts c
      JOIN bs_companies co ON c.company_id = co.id
      WHERE c.active = 1 AND ? LIKE (c.policy_prefix || '%')
    `;
    const params: unknown[] = [policyNumber];

    if (companyId) {
      query += ' AND c.company_id = ?';
      params.push(companyId);
    }

    query += ' ORDER BY LENGTH(c.policy_prefix) DESC LIMIT 1';

    const contract = await ctx.db.prepare(query).bind(...params).first<{
      id: string;
      company_id: string;
      policy_prefix: string;
      category: string;
      valid_from: string;
      valid_to: string | null;
    }>();

    if (!contract) {
      return {
        success: true,
        anomalies: [
          {
            type: 'contract_not_found',
            message: `Contrat non trouvé pour la police: "${policyNumber}"`,
            severity: 'warning',
            field: 'policy_number',
          },
        ],
      };
    }

    // Check contract validity
    const anomalies: Anomaly[] = [];
    const today = new Date().toISOString().split('T')[0];

    if (contract.valid_from && contract.valid_from > today) {
      anomalies.push({
        type: 'contract_not_started',
        message: `Contrat non encore valide (début: ${contract.valid_from})`,
        severity: 'error',
      });
    }

    if (contract.valid_to && contract.valid_to < today) {
      anomalies.push({
        type: 'contract_expired',
        message: `Contrat expiré (fin: ${contract.valid_to})`,
        severity: 'error',
      });
    }

    return {
      success: true,
      computed: {
        contract_id: contract.id,
        contract_category: contract.category,
        contract_valid_from: contract.valid_from,
        contract_valid_to: contract.valid_to,
      },
      anomalies: anomalies.length > 0 ? anomalies : undefined,
    };
  },
};

/**
 * Conditions Lookup Rule
 * Finds reimbursement conditions for the service type
 */
const conditionsLookupRule: RuleStep = {
  type: 'bs_conditions_lookup',

  async execute(
    doc: DocumentData,
    _config: Record<string, unknown>,
    ctx: PipelineContext
  ): Promise<RuleResult> {
    const contractId = doc.computed_data.contract_id as string | undefined;
    const serviceType = doc.extracted_data.service_type as string | undefined;

    if (!contractId) {
      return { success: true }; // Previous step failed
    }

    const normalizedServiceType = normalizeServiceType(serviceType);

    const conditions = await ctx.db
      .prepare(
        `SELECT * FROM bs_conditions
         WHERE contract_id = ? AND service_type = ?
         LIMIT 1`
      )
      .bind(contractId, normalizedServiceType)
      .first<{
        reimbursement_rate: number;
        ceiling_per_act: number | null;
        ceiling_annual: number | null;
        waiting_days: number;
        special_conditions: string | null;
      }>();

    if (!conditions) {
      return {
        success: true,
        computed: {
          reimbursement_rate: 0,
        },
        anomalies: [
          {
            type: 'conditions_not_found',
            message: `Conditions non trouvées pour le type de service: "${serviceType}"`,
            severity: 'warning',
            field: 'service_type',
          },
        ],
      };
    }

    return {
      success: true,
      computed: {
        reimbursement_rate: conditions.reimbursement_rate,
        ceiling_per_act: conditions.ceiling_per_act,
        ceiling_annual: conditions.ceiling_annual,
        waiting_days: conditions.waiting_days,
        special_conditions: conditions.special_conditions,
      },
    };
  },
};

/**
 * PCT Medication Match Rule
 * Matches medications with PCT reference prices
 */
const pctMatchRule: RuleStep = {
  type: 'bs_pct_match',

  async execute(
    doc: DocumentData,
    _config: Record<string, unknown>,
    ctx: PipelineContext
  ): Promise<RuleResult> {
    const medications = doc.extracted_data.medications as Array<{ name: string; quantity?: number; price?: number }> | undefined;

    if (!medications || !Array.isArray(medications) || medications.length === 0) {
      return { success: true };
    }

    const pctMatches: Array<{
      name: string;
      pct_name: string;
      pct_price: number;
      quantity: number;
      declared_price: number;
      pct_total: number;
    }> = [];

    let totalPctPrice = 0;

    for (const med of medications) {
      if (!med.name) continue;

      // Fuzzy match medication name
      const pctMed = await ctx.db
        .prepare(
          `SELECT name_commercial, price_ttc FROM bs_pct_medications
           WHERE LOWER(name_commercial) LIKE LOWER('%' || ? || '%')
           AND (valid_to IS NULL OR valid_to >= date('now'))
           LIMIT 1`
        )
        .bind(med.name)
        .first<{ name_commercial: string; price_ttc: number }>();

      const quantity = med.quantity ?? 1;
      const declaredPrice = med.price ?? 0;

      if (pctMed) {
        const pctTotal = pctMed.price_ttc * quantity;
        totalPctPrice += pctTotal;

        pctMatches.push({
          name: med.name,
          pct_name: pctMed.name_commercial,
          pct_price: pctMed.price_ttc,
          quantity,
          declared_price: declaredPrice,
          pct_total: pctTotal,
        });
      } else {
        // No PCT match - use declared price
        totalPctPrice += declaredPrice;

        pctMatches.push({
          name: med.name,
          pct_name: '',
          pct_price: 0,
          quantity,
          declared_price: declaredPrice,
          pct_total: declaredPrice,
        });
      }
    }

    return {
      success: true,
      computed: {
        pct_matches: pctMatches,
        total_pct_price: totalPctPrice,
      },
    };
  },
};

/**
 * Reimbursement Calculator Rule
 * Calculates reimbursement amount based on conditions and PCT
 */
const reimbursementCalcRule: RuleStep = {
  type: 'bs_reimbursement_calc',

  async execute(
    doc: DocumentData,
    _config: Record<string, unknown>,
    _ctx: PipelineContext
  ): Promise<RuleResult> {
    const invoicedAmount = parseFloat(String(doc.extracted_data.invoiced_amount ?? 0));
    const reimbursementRate = parseFloat(String(doc.computed_data.reimbursement_rate ?? 0));
    const ceilingPerAct = doc.computed_data.ceiling_per_act as number | null;
    const totalPctPrice = parseFloat(String(doc.computed_data.total_pct_price ?? invoicedAmount));

    // Calculate base reimbursement
    let baseReimbursement = invoicedAmount * reimbursementRate;

    // Apply ceiling per act
    if (ceilingPerAct && baseReimbursement > ceilingPerAct) {
      baseReimbursement = ceilingPerAct;
    }

    // Apply PCT limit (can't reimburse more than PCT price)
    const reimbursementAmount = Math.min(baseReimbursement, totalPctPrice * reimbursementRate);

    // Calculate ticket modérateur (patient's share)
    const ticketModerateur = invoicedAmount - reimbursementAmount;

    return {
      success: true,
      computed: {
        base_reimbursement: baseReimbursement,
        reimbursement_amount: Math.round(reimbursementAmount * 100) / 100,
        ticket_moderateur: Math.round(ticketModerateur * 100) / 100,
      },
    };
  },
};

/**
 * Annual Ceiling Check Rule
 * Checks if annual ceiling has been reached
 */
const annualCeilingCheckRule: RuleStep = {
  type: 'bs_annual_ceiling_check',

  async execute(
    doc: DocumentData,
    _config: Record<string, unknown>,
    ctx: PipelineContext
  ): Promise<RuleResult> {
    const ceilingAnnual = doc.computed_data.ceiling_annual as number | null;
    const reimbursementAmount = parseFloat(String(doc.computed_data.reimbursement_amount ?? 0));
    const patientCin = doc.extracted_data.patient_cin as string | undefined;
    const companyId = doc.computed_data.company_id as string | undefined;

    if (!ceilingAnnual || !patientCin || !companyId) {
      return { success: true };
    }

    // Get year-to-date reimbursements for this patient/company
    const currentYear = new Date().getFullYear();
    const ytdResult = await ctx.db
      .prepare(
        `SELECT COALESCE(SUM(json_extract(computed_data, '$.reimbursement_amount')), 0) as total
         FROM documents
         WHERE status = 'validated'
         AND json_extract(extracted_data, '$.patient_cin') = ?
         AND json_extract(computed_data, '$.company_id') = ?
         AND strftime('%Y', created_at) = ?`
      )
      .bind(patientCin, companyId, String(currentYear))
      .first<{ total: number }>();

    const ytdTotal = ytdResult?.total ?? 0;
    const projectedTotal = ytdTotal + reimbursementAmount;

    const anomalies: Anomaly[] = [];

    if (projectedTotal > ceilingAnnual) {
      const remaining = Math.max(0, ceilingAnnual - ytdTotal);
      anomalies.push({
        type: 'annual_ceiling_exceeded',
        message: `Plafond annuel dépassé (${projectedTotal.toFixed(2)} / ${ceilingAnnual.toFixed(2)} TND). Reste disponible: ${remaining.toFixed(2)} TND`,
        severity: 'warning',
      });

      return {
        success: true,
        computed: {
          annual_total_before: ytdTotal,
          annual_total_after: projectedTotal,
          annual_remaining: remaining,
          reimbursement_amount: Math.min(reimbursementAmount, remaining),
        },
        anomalies,
      };
    }

    return {
      success: true,
      computed: {
        annual_total_before: ytdTotal,
        annual_total_after: projectedTotal,
        annual_remaining: ceilingAnnual - projectedTotal,
      },
    };
  },
};

/**
 * Healthcare-Specific Anomaly Detection Rule
 */
const bsAnomalyDetectionRule: RuleStep = {
  type: 'bs_anomaly_detection',

  async execute(
    doc: DocumentData,
    _config: Record<string, unknown>,
    ctx: PipelineContext
  ): Promise<RuleResult> {
    const anomalies: Anomaly[] = [];

    // Check waiting period
    const waitingDays = doc.computed_data.waiting_days as number | undefined;
    const careDate = doc.extracted_data.care_date as string | undefined;
    const contractValidFrom = doc.computed_data.contract_valid_from as string | undefined;

    if (waitingDays && waitingDays > 0 && careDate && contractValidFrom) {
      const careDateObj = new Date(careDate);
      const contractStartObj = new Date(contractValidFrom);
      const daysSinceContract = Math.floor(
        (careDateObj.getTime() - contractStartObj.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceContract < waitingDays) {
        anomalies.push({
          type: 'waiting_period',
          message: `Période de carence non écoulée (${daysSinceContract}/${waitingDays} jours)`,
          severity: 'error',
        });
      }
    }

    // Check practitioner
    const practitionerName = doc.extracted_data.practitioner_name as string | undefined;
    if (practitionerName) {
      const practitioner = await ctx.db
        .prepare(
          `SELECT * FROM bs_practitioners
           WHERE active = 1 AND (LOWER(name) LIKE LOWER('%' || ? || '%') OR cnam_code = ?)
           LIMIT 1`
        )
        .bind(practitionerName, practitionerName)
        .first();

      if (!practitioner) {
        anomalies.push({
          type: 'unknown_practitioner',
          message: `Praticien non reconnu: "${practitionerName}"`,
          severity: 'info',
          field: 'practitioner_name',
        });
      }
    }

    // Check for duplicates (same patient, same date, same company)
    const patientCin = doc.extracted_data.patient_cin as string | undefined;
    const companyId = doc.computed_data.company_id as string | undefined;

    if (patientCin && careDate && companyId) {
      const duplicate = await ctx.db
        .prepare(
          `SELECT id FROM documents
           WHERE id != ?
           AND json_extract(extracted_data, '$.patient_cin') = ?
           AND json_extract(extracted_data, '$.care_date') = ?
           AND json_extract(computed_data, '$.company_id') = ?
           AND status != 'rejected'
           LIMIT 1`
        )
        .bind(doc.id, patientCin, careDate, companyId)
        .first<{ id: string }>();

      if (duplicate) {
        anomalies.push({
          type: 'potential_duplicate',
          message: `Document potentiellement en double (même patient, même date, même compagnie)`,
          severity: 'warning',
        });
      }
    }

    return {
      success: true,
      anomalies: anomalies.length > 0 ? anomalies : undefined,
    };
  },
};

// Helper function to normalize service type
function normalizeServiceType(serviceType: string | undefined): string {
  if (!serviceType) return 'consultation';

  const normalized = serviceType.toLowerCase().trim();

  if (normalized.includes('consult') || normalized.includes('visite')) {
    return 'consultation';
  }
  if (normalized.includes('pharma') || normalized.includes('medic')) {
    return 'pharmacie';
  }
  if (normalized.includes('hosp') || normalized.includes('clinique')) {
    return 'hospitalisation';
  }
  if (normalized.includes('labo') || normalized.includes('analyse')) {
    return 'laboratoire';
  }
  if (normalized.includes('radio') || normalized.includes('imagerie')) {
    return 'radiologie';
  }

  return 'consultation';
}

// Register all bulletin_soin specific rules
ruleRegistry.register('bs_company_lookup', companyLookupRule);
ruleRegistry.register('bs_contract_lookup', contractLookupRule);
ruleRegistry.register('bs_conditions_lookup', conditionsLookupRule);
ruleRegistry.register('bs_pct_match', pctMatchRule);
ruleRegistry.register('bs_reimbursement_calc', reimbursementCalcRule);
ruleRegistry.register('bs_annual_ceiling_check', annualCeilingCheckRule);
ruleRegistry.register('bs_anomaly_detection', bsAnomalyDetectionRule);

export {
  companyLookupRule,
  contractLookupRule,
  conditionsLookupRule,
  pctMatchRule,
  reimbursementCalcRule,
  annualCeilingCheckRule,
  bsAnomalyDetectionRule,
};
