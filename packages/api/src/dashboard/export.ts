/**
 * Dashboard Report Export
 *
 * Generates PDF and Excel exports for reports
 * T028: Report export
 */

import type { Env } from '../index';
import { generateULID } from '../lib/ulid';

interface ReportData {
  period: string;
  pipeline_name: string;
  document_count: number;
  validated_count: number;
  rejected_count: number;
  pending_count: number;
  total_reimbursement: number;
  avg_confidence: number;
}

interface ExportOptions {
  format: 'csv' | 'excel';
  title: string;
  filters: Record<string, string | undefined>;
  data: ReportData[];
}

/**
 * Generate CSV content from report data
 */
export function generateCSV(options: ExportOptions): string {
  const { title, filters, data } = options;

  // Header section
  const lines: string[] = [
    `# ${title}`,
    `# Généré le: ${new Date().toISOString()}`,
    `# Filtres: ${Object.entries(filters)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ') || 'Aucun'}`,
    '',
  ];

  // Column headers
  const headers = [
    'Période',
    'Pipeline',
    'Documents',
    'Validés',
    'Rejetés',
    'En attente',
    'Total Remboursement (TND)',
    'Confiance Moyenne (%)',
  ];
  lines.push(headers.join(';'));

  // Data rows
  for (const row of data) {
    lines.push(
      [
        row.period,
        row.pipeline_name,
        row.document_count,
        row.validated_count,
        row.rejected_count,
        row.pending_count,
        row.total_reimbursement.toFixed(2),
        (row.avg_confidence * 100).toFixed(1),
      ].join(';')
    );
  }

  // Summary section
  const totals = data.reduce(
    (acc, row) => ({
      documents: acc.documents + row.document_count,
      validated: acc.validated + row.validated_count,
      rejected: acc.rejected + row.rejected_count,
      pending: acc.pending + row.pending_count,
      reimbursement: acc.reimbursement + row.total_reimbursement,
    }),
    { documents: 0, validated: 0, rejected: 0, pending: 0, reimbursement: 0 }
  );

  lines.push('');
  lines.push(
    [
      'TOTAL',
      '-',
      totals.documents,
      totals.validated,
      totals.rejected,
      totals.pending,
      totals.reimbursement.toFixed(2),
      '-',
    ].join(';')
  );

  return lines.join('\n');
}

/**
 * Generate Excel-compatible XML (SpreadsheetML)
 * This creates an XML file that Excel can open directly
 */
export function generateExcelXML(options: ExportOptions): string {
  const { title, filters, data } = options;

  const filterText = Object.entries(filters)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ') || 'Aucun';

  const totals = data.reduce(
    (acc, row) => ({
      documents: acc.documents + row.document_count,
      validated: acc.validated + row.validated_count,
      rejected: acc.rejected + row.rejected_count,
      pending: acc.pending + row.pending_count,
      reimbursement: acc.reimbursement + row.total_reimbursement,
    }),
    { documents: 0, validated: 0, rejected: 0, pending: 0, reimbursement: 0 }
  );

  const escapeXml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const dataRows = data
    .map(
      (row) => `
      <Row>
        <Cell><Data ss:Type="String">${escapeXml(row.period)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(row.pipeline_name)}</Data></Cell>
        <Cell><Data ss:Type="Number">${row.document_count}</Data></Cell>
        <Cell><Data ss:Type="Number">${row.validated_count}</Data></Cell>
        <Cell><Data ss:Type="Number">${row.rejected_count}</Data></Cell>
        <Cell><Data ss:Type="Number">${row.pending_count}</Data></Cell>
        <Cell><Data ss:Type="Number">${row.total_reimbursement.toFixed(2)}</Data></Cell>
        <Cell><Data ss:Type="Number">${(row.avg_confidence * 100).toFixed(1)}</Data></Cell>
      </Row>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#CCCCCC" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Title">
      <Font ss:Bold="1" ss:Size="14"/>
    </Style>
    <Style ss:ID="Total">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#E6E6E6" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Rapport">
    <Table>
      <Column ss:Width="100"/>
      <Column ss:Width="120"/>
      <Column ss:Width="80"/>
      <Column ss:Width="80"/>
      <Column ss:Width="80"/>
      <Column ss:Width="80"/>
      <Column ss:Width="120"/>
      <Column ss:Width="100"/>

      <Row ss:StyleID="Title">
        <Cell ss:MergeAcross="7"><Data ss:Type="String">${escapeXml(title)}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:MergeAcross="7"><Data ss:Type="String">Généré le: ${new Date().toISOString()}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:MergeAcross="7"><Data ss:Type="String">Filtres: ${escapeXml(filterText)}</Data></Cell>
      </Row>
      <Row/>

      <Row ss:StyleID="Header">
        <Cell><Data ss:Type="String">Période</Data></Cell>
        <Cell><Data ss:Type="String">Pipeline</Data></Cell>
        <Cell><Data ss:Type="String">Documents</Data></Cell>
        <Cell><Data ss:Type="String">Validés</Data></Cell>
        <Cell><Data ss:Type="String">Rejetés</Data></Cell>
        <Cell><Data ss:Type="String">En attente</Data></Cell>
        <Cell><Data ss:Type="String">Remboursement (TND)</Data></Cell>
        <Cell><Data ss:Type="String">Confiance (%)</Data></Cell>
      </Row>

      ${dataRows}

      <Row ss:StyleID="Total">
        <Cell><Data ss:Type="String">TOTAL</Data></Cell>
        <Cell><Data ss:Type="String">-</Data></Cell>
        <Cell><Data ss:Type="Number">${totals.documents}</Data></Cell>
        <Cell><Data ss:Type="Number">${totals.validated}</Data></Cell>
        <Cell><Data ss:Type="Number">${totals.rejected}</Data></Cell>
        <Cell><Data ss:Type="Number">${totals.pending}</Data></Cell>
        <Cell><Data ss:Type="Number">${totals.reimbursement.toFixed(2)}</Data></Cell>
        <Cell><Data ss:Type="String">-</Data></Cell>
      </Row>
    </Table>
  </Worksheet>
</Workbook>`;
}

/**
 * Store export in R2 and return download URL
 */
export async function storeExport(
  env: Env,
  content: string,
  format: 'csv' | 'excel',
  filename: string
): Promise<{ key: string; url: string }> {
  const exportId = generateULID();
  const extension = format === 'excel' ? 'xls' : 'csv';
  const key = `reports/${exportId}/${filename}.${extension}`;
  const contentType =
    format === 'excel'
      ? 'application/vnd.ms-excel'
      : 'text/csv; charset=utf-8';

  await env.EXPORTS.put(key, content, {
    httpMetadata: {
      contentType,
      contentDisposition: `attachment; filename="${filename}.${extension}"`,
    },
    customMetadata: {
      createdAt: new Date().toISOString(),
      format,
    },
  });

  // Generate signed URL (valid for 1 hour)
  // Note: In production, you'd use signed URLs. For now, return the key.
  return {
    key,
    url: `/api/dashboard/exports/${exportId}/${filename}.${extension}`,
  };
}
