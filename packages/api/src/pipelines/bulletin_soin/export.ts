import type { Env } from '../../index';
import { generateId } from '../../lib/ulid';

interface Document {
  id: string;
  extracted_data: string;
  computed_data: string | null;
  created_at: string;
}

interface ExportData {
  patient_name: string;
  patient_cin: string;
  care_date: string;
  service_type: string;
  practitioner_name: string;
  invoiced_amount: number;
  reimbursement_amount: number;
  ticket_moderateur: number;
}

/**
 * Generate bordereau export for a bulletin_soin batch
 * Returns: { pdfKey, csvKey, excelKey }
 */
export async function generateBordereauExport(
  env: Env,
  batchId: string
): Promise<{ pdfKey: string; csvKey: string }> {
  // Get batch info
  const batch = await env.DB
    .prepare(
      `SELECT b.*, p.display_name as pipeline_name
       FROM batches b
       JOIN pipelines p ON b.pipeline_id = p.id
       WHERE b.id = ?`
    )
    .bind(batchId)
    .first<{
      id: string;
      group_key: string;
      group_label: string;
      document_count: number;
      pipeline_name: string;
    }>();

  if (!batch) {
    throw new Error(`Batch not found: ${batchId}`);
  }

  // Get all validated documents in batch
  const documents = await env.DB
    .prepare(
      `SELECT id, extracted_data, computed_data, created_at
       FROM documents
       WHERE batch_id = ? AND status = 'validated'
       ORDER BY created_at ASC`
    )
    .bind(batchId)
    .all<Document>();

  const rows: ExportData[] = [];
  let totalInvoiced = 0;
  let totalReimbursement = 0;
  let totalTicket = 0;

  for (const doc of documents.results ?? []) {
    const extracted = JSON.parse(doc.extracted_data);
    const computed = doc.computed_data ? JSON.parse(doc.computed_data) : {};

    const invoicedAmount = parseFloat(String(extracted.invoiced_amount ?? 0));
    const reimbursementAmount = parseFloat(String(computed.reimbursement_amount ?? 0));
    const ticketModerateur = parseFloat(String(computed.ticket_moderateur ?? 0));

    rows.push({
      patient_name: String(extracted.patient_name ?? ''),
      patient_cin: String(extracted.patient_cin ?? ''),
      care_date: String(extracted.care_date ?? ''),
      service_type: String(extracted.service_type ?? ''),
      practitioner_name: String(extracted.practitioner_name ?? ''),
      invoiced_amount: invoicedAmount,
      reimbursement_amount: reimbursementAmount,
      ticket_moderateur: ticketModerateur,
    });

    totalInvoiced += invoicedAmount;
    totalReimbursement += reimbursementAmount;
    totalTicket += ticketModerateur;
  }

  // Generate CSV
  const csvContent = generateCSV(batch, rows, totalInvoiced, totalReimbursement, totalTicket);
  const csvKey = `exports/bulletin_soin/${batchId}/bordereau_${generateId('exp')}.csv`;
  await env.EXPORTS.put(csvKey, csvContent, {
    httpMetadata: { contentType: 'text/csv; charset=utf-8' },
  });

  // Generate HTML for PDF (will be converted to PDF by external service or browser)
  const htmlContent = generateBordereauHTML(batch, rows, totalInvoiced, totalReimbursement, totalTicket);
  const pdfKey = `exports/bulletin_soin/${batchId}/bordereau_${generateId('exp')}.html`;
  await env.EXPORTS.put(pdfKey, htmlContent, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
  });

  return { pdfKey, csvKey };
}

function generateCSV(
  batch: { group_label: string; document_count: number },
  rows: ExportData[],
  totalInvoiced: number,
  totalReimbursement: number,
  totalTicket: number
): string {
  const headers = [
    'N°',
    'Nom Patient',
    'CIN',
    'Date Soins',
    'Type Service',
    'Praticien',
    'Montant Facturé',
    'Remboursement',
    'Ticket Modérateur',
  ];

  const csvRows = [headers.join(';')];

  rows.forEach((row, index) => {
    csvRows.push([
      index + 1,
      `"${row.patient_name}"`,
      row.patient_cin,
      row.care_date,
      row.service_type,
      `"${row.practitioner_name}"`,
      row.invoiced_amount.toFixed(3),
      row.reimbursement_amount.toFixed(3),
      row.ticket_moderateur.toFixed(3),
    ].join(';'));
  });

  // Add totals row
  csvRows.push([
    '',
    'TOTAL',
    '',
    '',
    '',
    '',
    totalInvoiced.toFixed(3),
    totalReimbursement.toFixed(3),
    totalTicket.toFixed(3),
  ].join(';'));

  return '\ufeff' + csvRows.join('\n'); // BOM for Excel UTF-8
}

function generateBordereauHTML(
  batch: { group_label: string; document_count: number },
  rows: ExportData[],
  totalInvoiced: number,
  totalReimbursement: number,
  totalTicket: number
): string {
  const today = new Date().toLocaleDateString('fr-TN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const tableRows = rows
    .map(
      (row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(row.patient_name)}</td>
        <td>${row.patient_cin}</td>
        <td>${row.care_date}</td>
        <td>${row.service_type}</td>
        <td>${escapeHtml(row.practitioner_name)}</td>
        <td class="amount">${formatAmount(row.invoiced_amount)}</td>
        <td class="amount">${formatAmount(row.reimbursement_amount)}</td>
        <td class="amount">${formatAmount(row.ticket_moderateur)}</td>
      </tr>
    `
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Bordereau - ${escapeHtml(batch.group_label)}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      font-size: 12px;
      margin: 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .header h1 {
      font-size: 18px;
      margin-bottom: 5px;
    }
    .header h2 {
      font-size: 14px;
      font-weight: normal;
      color: #666;
    }
    .info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .info-block {
      border: 1px solid #ccc;
      padding: 10px;
      width: 45%;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th, td {
      border: 1px solid #ccc;
      padding: 6px 8px;
      text-align: left;
    }
    th {
      background-color: #f0f0f0;
      font-weight: bold;
    }
    .amount {
      text-align: right;
      font-family: monospace;
    }
    .total-row {
      font-weight: bold;
      background-color: #f9f9f9;
    }
    .footer {
      margin-top: 30px;
      display: flex;
      justify-content: space-between;
    }
    .signature {
      width: 200px;
      text-align: center;
      border-top: 1px solid #000;
      padding-top: 5px;
      margin-top: 50px;
    }
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>BORDEREAU DE REMBOURSEMENT</h1>
    <h2>Bulletin de Soin</h2>
  </div>

  <div class="info">
    <div class="info-block">
      <strong>Compagnie:</strong> ${escapeHtml(batch.group_label)}<br>
      <strong>Nombre de documents:</strong> ${batch.document_count}
    </div>
    <div class="info-block">
      <strong>Date d'édition:</strong> ${today}<br>
      <strong>Référence:</strong> ${batch.group_label.substring(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>N°</th>
        <th>Nom Patient</th>
        <th>CIN</th>
        <th>Date Soins</th>
        <th>Type</th>
        <th>Praticien</th>
        <th>Facturé (TND)</th>
        <th>Remb. (TND)</th>
        <th>Ticket (TND)</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
      <tr class="total-row">
        <td colspan="6">TOTAL</td>
        <td class="amount">${formatAmount(totalInvoiced)}</td>
        <td class="amount">${formatAmount(totalReimbursement)}</td>
        <td class="amount">${formatAmount(totalTicket)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <div>
      <p>Montant total à rembourser: <strong>${formatAmount(totalReimbursement)} TND</strong></p>
    </div>
    <div class="signature">
      Signature et cachet
    </div>
  </div>

  <script class="no-print">
    // Auto-print when opened
    // window.onload = function() { window.print(); }
  </script>
</body>
</html>
  `.trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatAmount(amount: number): string {
  return amount.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
