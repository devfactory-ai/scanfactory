/**
 * Facture Pipeline Rules
 *
 * Invoice processing rules for supplier invoices
 * T035: Facture pipeline
 */

import type { RuleStep, DocumentData, RuleResult, PipelineContext, Anomaly } from '../../core/pipeline/types';
import { ruleRegistry } from '../../core/pipeline/registry';

/**
 * Supplier Lookup Rule
 * Finds supplier from extracted supplier name or code
 */
const supplierLookupRule: RuleStep = {
  type: 'facture_supplier_lookup',

  async execute(
    doc: DocumentData,
    _config: Record<string, unknown>,
    ctx: PipelineContext
  ): Promise<RuleResult> {
    const supplierName = doc.extracted_data.supplier_name as string | undefined;
    const supplierCode = doc.extracted_data.supplier_code as string | undefined;

    // Try to find supplier in lookup table
    const lookupTable = await ctx.db
      .prepare(
        `SELECT id FROM lookup_tables WHERE name = 'suppliers' AND pipeline_id = ?`
      )
      .bind(ctx.pipeline.id)
      .first<{ id: string }>();

    if (!lookupTable) {
      return {
        success: true,
        anomalies: [{
          type: 'config_error',
          message: 'Table des fournisseurs non configurée',
          severity: 'warning',
        }],
      };
    }

    let entry: { key: string; data: string } | null = null;

    // Try by code first
    if (supplierCode) {
      entry = await ctx.db
        .prepare(
          `SELECT key, data FROM lookup_entries
           WHERE table_id = ? AND active = 1 AND key = ?`
        )
        .bind(lookupTable.id, supplierCode)
        .first();
    }

    // Try fuzzy match by name
    if (!entry && supplierName) {
      entry = await ctx.db
        .prepare(
          `SELECT key, data FROM lookup_entries
           WHERE table_id = ? AND active = 1
           AND json_extract(data, '$.name') LIKE ?
           LIMIT 1`
        )
        .bind(lookupTable.id, `%${supplierName}%`)
        .first();
    }

    if (!entry) {
      return {
        success: true,
        anomalies: [{
          type: 'supplier_not_found',
          message: `Fournisseur non trouvé: "${supplierName || supplierCode}"`,
          severity: 'warning',
          field: 'supplier_name',
        }],
      };
    }

    const supplierData = JSON.parse(entry.data);

    return {
      success: true,
      computed: {
        supplier_id: entry.key,
        supplier_code: supplierData.code,
        supplier_name_resolved: supplierData.name,
        supplier_tva_id: supplierData.tva_id,
      },
    };
  },
};

/**
 * TVA Validation Rule
 * Validates TVA rate and calculates totals
 */
const tvaValidationRule: RuleStep = {
  type: 'facture_tva_validation',

  async execute(
    doc: DocumentData,
    _config: Record<string, unknown>,
    _ctx: PipelineContext
  ): Promise<RuleResult> {
    const totalHt = parseFloat(String(doc.extracted_data.total_ht ?? 0));
    const tvaAmount = parseFloat(String(doc.extracted_data.tva_amount ?? 0));
    const totalTtc = parseFloat(String(doc.extracted_data.total_ttc ?? 0));
    const tvaRate = parseFloat(String(doc.extracted_data.tva_rate ?? 0));

    const anomalies: Anomaly[] = [];

    // Valid Tunisian TVA rates
    const validTvaRates = [0, 0.07, 0.13, 0.19];

    // Validate TVA rate
    if (tvaRate > 0 && !validTvaRates.includes(tvaRate)) {
      anomalies.push({
        type: 'invalid_tva_rate',
        message: `Taux de TVA invalide: ${(tvaRate * 100).toFixed(0)}% (valides: 0%, 7%, 13%, 19%)`,
        severity: 'warning',
        field: 'tva_rate',
      });
    }

    // Calculate expected values
    const expectedTva = totalHt * tvaRate;
    const expectedTtc = totalHt + expectedTva;

    // Check TVA amount consistency
    if (tvaAmount > 0 && Math.abs(tvaAmount - expectedTva) > 0.1) {
      anomalies.push({
        type: 'tva_mismatch',
        message: `Montant TVA incohérent: ${tvaAmount.toFixed(2)} TND (attendu: ${expectedTva.toFixed(2)} TND)`,
        severity: 'warning',
        field: 'tva_amount',
      });
    }

    // Check total TTC consistency
    if (totalTtc > 0 && Math.abs(totalTtc - expectedTtc) > 0.1) {
      anomalies.push({
        type: 'total_mismatch',
        message: `Total TTC incohérent: ${totalTtc.toFixed(2)} TND (attendu: ${expectedTtc.toFixed(2)} TND)`,
        severity: 'warning',
        field: 'total_ttc',
      });
    }

    return {
      success: true,
      computed: {
        calculated_tva: Math.round(expectedTva * 100) / 100,
        calculated_ttc: Math.round(expectedTtc * 100) / 100,
        tva_rate_percent: Math.round(tvaRate * 100),
      },
      anomalies: anomalies.length > 0 ? anomalies : undefined,
    };
  },
};

/**
 * Duplicate Invoice Detection Rule
 * Checks for duplicate invoices based on supplier and invoice number
 */
const duplicateDetectionRule: RuleStep = {
  type: 'facture_duplicate_check',

  async execute(
    doc: DocumentData,
    _config: Record<string, unknown>,
    ctx: PipelineContext
  ): Promise<RuleResult> {
    const invoiceNumber = doc.extracted_data.invoice_number as string | undefined;
    const supplierId = doc.computed_data.supplier_id as string | undefined;

    if (!invoiceNumber) {
      return {
        success: true,
        anomalies: [{
          type: 'missing_invoice_number',
          message: 'Numéro de facture manquant',
          severity: 'warning',
          field: 'invoice_number',
        }],
      };
    }

    // Check for duplicates in the last year
    const duplicate = await ctx.db
      .prepare(
        `SELECT id, created_at FROM documents
         WHERE id != ?
         AND pipeline_id = ?
         AND json_extract(extracted_data, '$.invoice_number') = ?
         ${supplierId ? "AND json_extract(computed_data, '$.supplier_id') = ?" : ''}
         AND status != 'rejected'
         AND created_at >= date('now', '-365 days')
         LIMIT 1`
      )
      .bind(
        doc.id,
        ctx.pipeline.id,
        invoiceNumber,
        ...(supplierId ? [supplierId] : [])
      )
      .first<{ id: string; created_at: string }>();

    if (duplicate) {
      return {
        success: true,
        anomalies: [{
          type: 'duplicate_invoice',
          message: `Facture en double détectée (n° ${invoiceNumber}, existante du ${duplicate.created_at})`,
          severity: 'error',
        }],
        metadata: {
          duplicate_document_id: duplicate.id,
        },
      };
    }

    return { success: true };
  },
};

/**
 * Due Date Validation Rule
 * Checks invoice dates and calculates payment status
 */
const dueDateValidationRule: RuleStep = {
  type: 'facture_due_date_check',

  async execute(
    doc: DocumentData,
    _config: Record<string, unknown>,
    _ctx: PipelineContext
  ): Promise<RuleResult> {
    const invoiceDate = doc.extracted_data.invoice_date as string | undefined;
    const dueDate = doc.extracted_data.due_date as string | undefined;

    const anomalies: Anomaly[] = [];
    const today = new Date().toISOString().split('T')[0];

    // Check if due date is in the past
    if (dueDate && dueDate < today) {
      const daysPast = Math.floor(
        (new Date().getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      anomalies.push({
        type: 'overdue',
        message: `Facture en retard de ${daysPast} jours (échéance: ${dueDate})`,
        severity: daysPast > 30 ? 'error' : 'warning',
        field: 'due_date',
      });
    }

    // Check if invoice date is in the future
    if (invoiceDate && invoiceDate > today) {
      anomalies.push({
        type: 'future_date',
        message: `Date de facture dans le futur: ${invoiceDate}`,
        severity: 'warning',
        field: 'invoice_date',
      });
    }

    // Check if due date is before invoice date
    if (invoiceDate && dueDate && dueDate < invoiceDate) {
      anomalies.push({
        type: 'invalid_dates',
        message: `Date d'échéance (${dueDate}) antérieure à la date de facture (${invoiceDate})`,
        severity: 'error',
      });
    }

    // Calculate days until due
    let daysUntilDue = 0;
    if (dueDate) {
      daysUntilDue = Math.floor(
        (new Date(dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    return {
      success: true,
      computed: {
        days_until_due: daysUntilDue,
        payment_status: daysUntilDue < 0 ? 'overdue' : daysUntilDue <= 7 ? 'due_soon' : 'ok',
      },
      anomalies: anomalies.length > 0 ? anomalies : undefined,
    };
  },
};

// Register all facture specific rules
ruleRegistry.register('facture_supplier_lookup', supplierLookupRule);
ruleRegistry.register('facture_tva_validation', tvaValidationRule);
ruleRegistry.register('facture_duplicate_check', duplicateDetectionRule);
ruleRegistry.register('facture_due_date_check', dueDateValidationRule);

export {
  supplierLookupRule,
  tvaValidationRule,
  duplicateDetectionRule,
  dueDateValidationRule,
};
