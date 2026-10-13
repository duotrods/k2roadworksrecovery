// Excel export for dashboards — the spreadsheet counterpart of
// pdfChartExport. ExcelJS is large, so it's loaded only when an export runs.

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

/**
 * @param {object} opts
 * @param {string} opts.reportTitle
 * @param {string} opts.subtitle          e.g. "M3 - M3 Jct 9 - Balfour Beatty"
 * @param {string} opts.dateRangeText
 * @param {{ label: string, value: number }[]} opts.kpis
 * @param {{ title: string, data: { name: string, Number: number }[] }[]} opts.charts
 * @param {string} opts.fileName
 */
export const exportDashboardToExcel = async ({
  reportTitle,
  subtitle,
  dateRangeText,
  kpis,
  charts,
  fileName,
}) => {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

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
