// Excel export for dashboards — the spreadsheet counterpart of
// pdfChartExport. ExcelJS is large, so it's loaded only when an export runs.

import { clearanceRateChartPng, monthlyRecoveriesChartPng } from "./recoveryChartImages";

const BRAND = "FF0865AD";
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" } };
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
const THIN_BORDER = {
  top: { style: "thin", color: { argb: "FFD1D5DB" } },
  bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
  left: { style: "thin", color: { argb: "FFD1D5DB" } },
  right: { style: "thin", color: { argb: "FFD1D5DB" } },
};

// Writes a styled header row + body rows starting at the sheet's next row.
const addTable = (sheet, headers, rows) => {
  const header = sheet.addRow(headers);
  header.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.border = THIN_BORDER;
  });
  rows.forEach((values) => {
    sheet.addRow(values).eachCell((cell) => {
      cell.border = THIN_BORDER;
    });
  });
};

// Turns chart data ([{ name, Number }]) into rows with a share-of-total column
// (stored as a fraction and formatted as %, so Excel can still sum/sort it).
const chartRows = (data) => {
  const total = data.reduce((sum, d) => sum + (Number(d.Number) || 0), 0);
  return data.map((d) => [d.name, Number(d.Number) || 0, total ? (Number(d.Number) || 0) / total : 0]);
};

const NAVY = "FF0F2A4A";
const BLACK_BORDER = {
  top: { style: "thin" },
  bottom: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
};

// The client's own monthly reporting layout: month table with clearance rates
// (combined / lights / heavies), totals underneath, and the two charts beside it.
const addRecoveryReportSheet = (workbook, { months, totalRecoveries, overallClearance }) => {
  const sheet = workbook.addWorksheet("Recovery Report", { views: [{ showGridLines: true }] });
  sheet.columns = [
    { width: 12 },
    { width: 19 },
    { width: 15 },
    { width: 11 },
    { width: 11 },
    { width: 46 },
    { width: 4 },
  ];

  const header = sheet.addRow(["Month", "No of recoveries", "Clearance rate", "Lights", "Heavies", "Actions on challenges"]);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.border = BLACK_BORDER;
  });

  months.forEach((m) => {
    // ExcelJS serialises dates as UTC, so use UTC midnight — local midnight
    // would land on the previous month for anyone east of UTC (e.g. BST).
    const monthUtc = new Date(Date.UTC(m.month.getFullYear(), m.month.getMonth(), 1));
    const row = sheet.addRow([monthUtc, m.recoveries, m.clearance ?? "N/A", m.lights ?? "N/A", m.heavies ?? "N/A", ""]);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = BLACK_BORDER;
      cell.alignment = { horizontal: col === 6 ? "left" : "right", vertical: "middle" };
      if (col >= 3 && col <= 5) cell.numFmt = "0%";
    });
    row.getCell(1).numFmt = "mmm-yy";
  });

  sheet.addRow([]);
  sheet.addRow(["Total Recoveries", totalRecoveries]).getCell(1).font = { bold: true };
  sheet.addRow([]);
  const rate = sheet.addRow(["Clearance Rate", overallClearance ?? "N/A", "Running total"]);
  rate.eachCell((cell, col) => {
    cell.font = { bold: true };
    cell.border = { bottom: { style: "thin" } };
    if (col === 2) {
      cell.numFmt = "0.00%";
      cell.alignment = { horizontal: "right" };
    }
  });

  // Charts to the right of the table (col H onward), stacked.
  const place = (png, row) => {
    const id = workbook.addImage({ base64: png, extension: "png" });
    sheet.addImage(id, { tl: { col: 7, row }, ext: { width: 760, height: 330 } });
  };
  place(monthlyRecoveriesChartPng(months), 1);
  place(clearanceRateChartPng(months), 18);
};

/**
 * @param {object} opts
 * @param {string} opts.reportTitle
 * @param {string} opts.subtitle          e.g. "M3 - M3 Jct 9 - Balfour Beatty"
 * @param {string} opts.dateRangeText
 * @param {{ label: string, value: number }[]} opts.kpis
 * @param {{ title: string, data: { name: string, Number: number }[] }[]} opts.charts
 * @param {object} [opts.recoveryReport] result of monthlyRecoverySummary; adds the
 *   client-style "Recovery Report" sheet (month table + charts) as the first sheet
 * @param {string} opts.fileName
 */
export const exportDashboardToExcel = async ({
  reportTitle,
  subtitle,
  dateRangeText,
  kpis,
  charts,
  recoveryReport,
  fileName,
}) => {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  if (recoveryReport) addRecoveryReportSheet(workbook, recoveryReport);

  // Summary: report details + KPI cards.
  const summary = workbook.addWorksheet("Summary");
  summary.columns = [{ width: 32 }, { width: 18 }];
  summary.addRow([reportTitle]).font = { bold: true, size: 16, color: { argb: BRAND } };
  summary.addRow([subtitle]).font = { bold: true };
  summary.addRow(["Date range", dateRangeText]);
  summary.addRow(["Generated", new Date().toLocaleString("en-GB")]);
  summary.addRow([]);
  addTable(summary, ["KPI", "Value"], kpis.map((k) => [k.label, k.value]));

  // Chart data: one stacked table per chart, in dashboard order.
  const chartSheet = workbook.addWorksheet("Chart Data");
  chartSheet.columns = [{ width: 32 }, { width: 12 }, { width: 12 }];
  charts.forEach(({ title, data }, i) => {
    if (i > 0) chartSheet.addRow([]);
    chartSheet.addRow([title]).font = { bold: true, size: 13, color: { argb: BRAND } };
    if (!data.length) {
      chartSheet.addRow(["No data"]).font = { italic: true, color: { argb: "FF6B7280" } };
      return;
    }
    const firstBodyRow = chartSheet.rowCount + 2;
    addTable(chartSheet, ["Category", "Count", "% of total"], chartRows(data));
    for (let r = firstBodyRow; r <= chartSheet.rowCount; r++) {
      chartSheet.getCell(r, 3).numFmt = "0%";
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};
