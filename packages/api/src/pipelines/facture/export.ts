/**
 * Facture Export Template
 *
 * Generate CSV export for supplier invoices
 * T035: Facture pipeline
 */

interface InvoiceData {
  id: string;
  supplier_name: string;
  supplier_code: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_ht: number;
  tva_rate: number;
  tva_amount: number;
  total_ttc: number;
  payment_status: string;
}

interface ExportOptions {
  batchId: string;
  batchLabel: string;
  documents: InvoiceData[];
  exportDate: string;
}

/**
 * Generate CSV export for facture batch
 */
export function generateFactureCSV(options: ExportOptions): string {
  const { batchId, batchLabel, documents, exportDate } = options;

  const lines: string[] = [
    `# Export Factures - ${batchLabel}`,
    `# Lot: ${batchId}`,
    `# Date d'export: ${exportDate}`,
    `# Nombre de factures: ${documents.length}`,
    '',
  ];

  // CSV Header
  const headers = [
    'N° Facture',
    'Fournisseur',
    'Code Fournisseur',
    'Date Facture',
    'Date Échéance',
    'Total HT (TND)',
    'Taux TVA (%)',
    'TVA (TND)',
    'Total TTC (TND)',
    'Statut Paiement',
  ];
  lines.push(headers.join(';'));

  // Data rows
  for (const doc of documents) {
    const row = [
      doc.invoice_number,
      doc.supplier_name,
      doc.supplier_code,
      doc.invoice_date,
      doc.due_date,
      doc.total_ht.toFixed(2),
      (doc.tva_rate * 100).toFixed(0),
      doc.tva_amount.toFixed(2),
      doc.total_ttc.toFixed(2),
      doc.payment_status === 'overdue' ? 'EN RETARD' : doc.payment_status === 'due_soon' ? 'BIENTÔT DÛ' : 'OK',
    ];
    lines.push(row.join(';'));
  }

  // Totals
  const totals = documents.reduce(
    (acc, doc) => ({
      ht: acc.ht + doc.total_ht,
      tva: acc.tva + doc.tva_amount,
      ttc: acc.ttc + doc.total_ttc,
    }),
    { ht: 0, tva: 0, ttc: 0 }
  );

  lines.push('');
  lines.push(['TOTAL', '', '', '', '', totals.ht.toFixed(2), '', totals.tva.toFixed(2), totals.ttc.toFixed(2), ''].join(';'));

  return lines.join('\n');
}

/**
 * Generate supplier summary
 */
export function generateSupplierSummary(documents: InvoiceData[]): {
  by_supplier: Array<{
    supplier_name: string;
    supplier_code: string;
    invoice_count: number;
    total_ht: number;
    total_ttc: number;
  }>;
  by_tva_rate: Array<{
    tva_rate: number;
    total_ht: number;
    total_tva: number;
  }>;
} {
  // Group by supplier
  const supplierMap = new Map<string, {
    supplier_name: string;
    supplier_code: string;
    invoice_count: number;
    total_ht: number;
    total_ttc: number;
  }>();

  for (const doc of documents) {
    const key = doc.supplier_code;
    const existing = supplierMap.get(key);
    if (existing) {
      existing.invoice_count++;
      existing.total_ht += doc.total_ht;
      existing.total_ttc += doc.total_ttc;
    } else {
      supplierMap.set(key, {
        supplier_name: doc.supplier_name,
        supplier_code: doc.supplier_code,
        invoice_count: 1,
        total_ht: doc.total_ht,
        total_ttc: doc.total_ttc,
      });
    }
  }

  // Group by TVA rate
  const tvaMap = new Map<number, { total_ht: number; total_tva: number }>();

  for (const doc of documents) {
    const rate = doc.tva_rate;
    const existing = tvaMap.get(rate);
    if (existing) {
      existing.total_ht += doc.total_ht;
      existing.total_tva += doc.tva_amount;
    } else {
      tvaMap.set(rate, {
        total_ht: doc.total_ht,
        total_tva: doc.tva_amount,
      });
    }
  }

  return {
    by_supplier: Array.from(supplierMap.values()).sort((a, b) => b.total_ttc - a.total_ttc),
    by_tva_rate: Array.from(tvaMap.entries())
      .map(([tva_rate, data]) => ({ tva_rate, ...data }))
      .sort((a, b) => b.tva_rate - a.tva_rate),
  };
}
