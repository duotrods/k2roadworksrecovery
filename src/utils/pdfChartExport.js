// Shared PDF chart-export design, used by NewClientDashboard (and any other
// "Export Charts" button that adopts it later) — one place to change the
// look (bar/pie drawing, card shadow, page header + logo, page layout).
import { jsPDF } from "jspdf";
import logomarkUrl from "../assets/k2iconlogo.svg";

// Brand blue — matches commonChartProps.bar.fill / cartesianGrid.stroke on
// screen and the app's brand-500 Tailwind color, so the PDF's bars/header
// read as the same product as the live dashboard.
const BRAND_RGB = [8, 101, 173]; // #0865ad

// Also used on-screen for the recharts <Pie> <Cell> fills, so pie colors stay
// identical between the live dashboard and the exported PDF. Brand blue
// leads the palette, then a spread of distinct hues for the remaining slices.
export const PIE_COLORS = [
  "#0865ad",
  "#17af93",
  "#f26076",
  "#ff9760",
  "#5459ac",
  "#744577",
  "#4dada8",
  "#3674b5",
  "#95e45d",
  "#eab308",
];

// "#rrggbb" -> [r, g, b] for jsPDF's setFillColor, which takes 0-255 ints.
const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

// Soft drop shadow behind a chart card — mirrors the on-screen shadow-lg —
// built from a few offset, low-opacity layers since jsPDF has no native blur.
const drawCardShadow = (pdf, x, y, width, height) => {
  const layers = [
    { offset: 1.6, opacity: 0.05 },
    { offset: 1, opacity: 0.06 },
    { offset: 0.5, opacity: 0.07 },
  ];
  layers.forEach(({ offset, opacity }) => {
    pdf.saveGraphicsState();
    pdf.setGState(new pdf.GState({ opacity }));
    pdf.setFillColor(15, 23, 42);
    pdf.rect(x + offset * 0.5, y + offset, width, height, "F");
    pdf.restoreGraphicsState();
  });
};

export const drawBarChart = (pdf, data, title, x, y, width, height) => {
  if (!data || data.length === 0) return;

  drawCardShadow(pdf, x, y, width, height);

  // Draw chart background
  pdf.setFillColor(255, 255, 255);
  pdf.rect(x, y, width, height, "F");
  pdf.setDrawColor(229, 231, 235);
  pdf.rect(x, y, width, height, "S");

  // Draw title at the top with better positioning
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(31, 41, 55);
  pdf.text(title, x + width / 2, y + 6, { align: "center" });

  // Adjusted margins — left is wider now to fit the Y-axis value labels
  const margin = { top: 12, right: 10, bottom: 18, left: 16 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Round the axis max up to a clean multiple of the tick count — same
  // approach recharts' default Y-axis uses (e.g. max data value 25 with
  // 4 ticks -> step 7 -> axis tops out at 28), so the PDF axis matches
  // what's shown on screen.
  const rawMax = Math.max(...data.map((d) => d.Number), 1);
  const gridLines = 4;
  const tickStep = Math.max(1, Math.ceil(rawMax / gridLines));
  const maxValue = tickStep * gridLines;

  const barWidth = (chartWidth / data.length) * 0.7;
  const gap = (chartWidth / data.length) * 0.3;

  // Dashed gridlines behind the bars — mirrors recharts' default
  // CartesianGrid, which draws both horizontal (per Y-axis tick) and
  // vertical (per category, at each bar's center) lines. Drawn before the
  // bars, so — same as on screen — a tall bar naturally covers its own
  // vertical line.
  pdf.setDrawColor(...BRAND_RGB);
  pdf.setLineWidth(0.1);
  pdf.setLineDashPattern([1, 1], 0);
  for (let g = 0; g < gridLines; g++) {
    const gridY = y + margin.top + (chartHeight / gridLines) * g;
    pdf.line(x + margin.left, gridY, x + margin.left + chartWidth, gridY);
  }
  data.forEach((item, index) => {
    const barCenterX =
      x + margin.left + index * (barWidth + gap) + barWidth / 2;
    pdf.line(
      barCenterX,
      y + margin.top,
      barCenterX,
      y + margin.top + chartHeight,
    );
  });
  // Dashed top/right border closing off the plot box — same dashed style as
  // the gridlines above, so the right side reads as gridline, not axis.
  pdf.line(
    x + margin.left + chartWidth,
    y + margin.top,
    x + margin.left + chartWidth,
    y + margin.top + chartHeight,
  );
  pdf.line(
    x + margin.left,
    y + margin.top,
    x + margin.left + chartWidth,
    y + margin.top,
  );
  pdf.setLineDashPattern([], 0);

  // Solid X/Y axis lines framing the plot area — recharts draws these by
  // default on both axes, distinct from the dashed gridlines.
  pdf.setDrawColor(153, 153, 153);
  pdf.setLineWidth(0.15);
  pdf.line(
    x + margin.left,
    y + margin.top,
    x + margin.left,
    y + margin.top + chartHeight,
  );
  pdf.line(
    x + margin.left,
    y + margin.top + chartHeight,
    x + margin.left + chartWidth,
    y + margin.top + chartHeight,
  );

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.5);
  pdf.setTextColor(107, 114, 128);
  for (let g = 0; g <= gridLines; g++) {
    const tickValue = maxValue - tickStep * g;
    const tickY = y + margin.top + (chartHeight / gridLines) * g;
    pdf.text(String(tickValue), x + margin.left - 2, tickY + 1, {
      align: "right",
    });
  }

  // Draw bars
  data.forEach((item, index) => {
    const barHeight = (item.Number / maxValue) * chartHeight;
    const barX = x + margin.left + index * (barWidth + gap);
    const barY = y + margin.top + chartHeight - barHeight;

    // Only draw bar if height is valid and greater than 0
    if (
      barHeight > 0 &&
      !isNaN(barHeight) &&
      !isNaN(barX) &&
      !isNaN(barY) &&
      barWidth > 0
    ) {
      pdf.setFillColor(...BRAND_RGB);
      pdf.rect(barX, barY, barWidth, barHeight, "F");
    }

    // Draw value on top of bar
    pdf.setFontSize(8);
    pdf.setTextColor(31, 41, 55);
    const valueY =
      barHeight > 0 ? barY - 2 : y + margin.top + chartHeight - 2;
    pdf.text(String(item.Number), barX + barWidth / 2, valueY, {
      align: "center",
    });

    // Draw label below bar - much closer now
    pdf.setFontSize(7);
    pdf.setTextColor(107, 114, 128);
    const label =
      item.name.length > 12 ? item.name.substring(0, 12) + "..." : item.name;
    const labelY = y + margin.top + chartHeight + 5; // Just 5mm below the chart area
    pdf.text(label, barX + barWidth / 2, labelY, {
      align: "center",
      maxWidth: barWidth,
    });
  });
};

// Mirrors the on-screen pie chart (Pie/Cell from recharts) for whichever
// charts are toggled to pie view — jsPDF has no native pie primitive, so
// each slice is drawn as a filled polygon approximating its arc.
export const drawPieChart = (pdf, data, title, x, y, width, height) => {
  if (!data || data.length === 0) return;

  drawCardShadow(pdf, x, y, width, height);

  pdf.setFillColor(255, 255, 255);
  pdf.rect(x, y, width, height, "F");
  pdf.setDrawColor(229, 231, 235);
  pdf.rect(x, y, width, height, "S");

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(31, 41, 55);
  pdf.text(title, x + width / 2, y + 6, { align: "center" });

  const total = data.reduce((sum, d) => sum + (d.Number || 0), 0);
  if (total <= 0) return;

  // Centered pie with room on every side for a label + leader line radiating
  // outward from each slice's own edge — mirrors recharts' default Pie
  // label/labelLine, which places labels around the circle itself rather
  // than stacked in a side legend pointing back at it.
  const margin = { top: 12, bottom: 6, side: 26 };
  const plotWidth = width - margin.side * 2;
  const plotHeight = height - margin.top - margin.bottom;
  const radius = Math.max(Math.min(plotWidth / 2 - 4, plotHeight / 2 - 4), 4);
  const centerX = x + width / 2;
  const centerY = y + margin.top + plotHeight / 2;

  let startAngle = -Math.PI / 2;
  data.forEach((item, i) => {
    const value = item.Number || 0;
    if (value <= 0) return;
    const sliceAngle = (value / total) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;
    const midAngle = startAngle + sliceAngle / 2;

    const [r, g, b] = hexToRgb(PIE_COLORS[i % PIE_COLORS.length]);
    pdf.setFillColor(r, g, b);

    // Polygon: center -> points along the arc -> back to center (closed).
    const steps = Math.max(2, Math.ceil((sliceAngle / (Math.PI * 2)) * 60));
    const arcPoints = [];
    for (let s = 0; s <= steps; s++) {
      const angle = startAngle + (sliceAngle * s) / steps;
      arcPoints.push([
        centerX + radius * Math.cos(angle),
        centerY + radius * Math.sin(angle),
      ]);
    }
    const segments = [];
    let prev = [centerX, centerY];
    arcPoints.forEach((point) => {
      segments.push([point[0] - prev[0], point[1] - prev[1]]);
      prev = point;
    });
    pdf.lines(segments, centerX, centerY, [1, 1], "F", true);

    // Leader line + label at this slice's own bisector angle — a short
    // radial segment off the pie's edge, then a short horizontal segment
    // (bending left or right, whichever side the angle faces) into the
    // label text. Same shape as recharts' default label connector, so a
    // downloaded chart looks like the one on screen instead of a list of
    // lines crossing over to a distant legend.
    const edgePoint = [
      centerX + radius * Math.cos(midAngle),
      centerY + radius * Math.sin(midAngle),
    ];
    const bendPoint = [
      centerX + (radius + 4) * Math.cos(midAngle),
      centerY + (radius + 4) * Math.sin(midAngle),
    ];
    const side = Math.cos(midAngle) >= 0 ? 1 : -1;
    const labelPoint = [bendPoint[0] + side * 6, bendPoint[1]];

    pdf.setDrawColor(140, 140, 140);
    pdf.setLineWidth(0.15);
    pdf.setLineDashPattern([], 0);
    pdf.line(edgePoint[0], edgePoint[1], bendPoint[0], bendPoint[1]);
    pdf.line(bendPoint[0], bendPoint[1], labelPoint[0], labelPoint[1]);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(55, 65, 81);
    const pct = Math.round((value / total) * 100);
    const rawLabel = `${item.name} (${pct}%)`;
    const label =
      rawLabel.length > 22 ? rawLabel.slice(0, 19) + "..." : rawLabel;
    pdf.text(label, labelPoint[0] + side * 1, labelPoint[1], {
      align: side > 0 ? "left" : "right",
    });

    startAngle = endAngle;
  });
};

// Rasterizes an SVG (as an import URL) into a PNG data URL via canvas —
// jsPDF's addImage doesn't accept SVG directly. Rendered well above the
// final placement size so it stays crisp when printed.
const svgToPngDataUrl = async (svgUrl, pixelWidth, pixelHeight) => {
  const response = await fetch(svgUrl);
  const svgText = await response.text();
  const blob = new Blob([svgText], { type: "image/svg+xml" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.getContext("2d").drawImage(img, 0, 0, pixelWidth, pixelHeight);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

// Cached across calls in the same session — the logo never changes, so
// every export after the first reuses this instead of re-fetching/rasterizing.
let cachedLogoPromise = null;
const getLogoDataUrl = () => {
  if (!cachedLogoPromise) {
    cachedLogoPromise = svgToPngDataUrl(logomarkUrl, 300, 308).catch(
      (error) => {
        console.warn("Failed to load logo for PDF export:", error);
        return null;
      },
    );
  }
  return cachedLogoPromise;
};

/**
 * Builds and saves a multi-page landscape PDF: brand-blue header (logo +
 * title + subtitle + date range + stats) followed by the given charts, 4 per
 * page in a 2x2 grid, each drawn as a bar or pie chart depending on
 * chartTypesRef.
 *
 * @param {object} options
 * @param {string} options.reportTitle - Big header title, e.g. "Dashboard Report"
 * @param {string} options.subtitle - Smaller header line under the title, e.g. scheme name
 * @param {string} options.dateRangeText - Right-aligned header line 1
 * @param {string} options.statsText - Right-aligned header line 2
 * @param {{data: Array, title: string, key?: string}[]} options.charts
 * @param {React.MutableRefObject<Record<string,'bar'|'pie'>>} [options.chartTypesRef] -
 *   Optional; when a chart's key maps to "pie" it's drawn as a pie chart, otherwise bar.
 * @param {string} options.fileName
 */
export async function exportChartsToPDF({
  reportTitle,
  subtitle,
  dateRangeText,
  statsText,
  charts,
  chartTypesRef,
  fileName,
}) {
  const pdf = new jsPDF({
    orientation: "l",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const headerHeight = 25;

  const logoAspect = 200 / 205; // width / height, from the SVG viewBox
  const logoHeight = 15;
  const logoWidth = logoHeight * logoAspect;
  const logoX = 15;
  const logoY = (headerHeight - logoHeight) / 2;
  const titleX = logoX + logoWidth + 5;

  const logoDataUrl = await getLogoDataUrl();

  const drawPageHeader = () => {
    pdf.setFillColor(...BRAND_RGB);
    pdf.rect(0, 0, pdfWidth, headerHeight, "F");

    if (logoDataUrl) {
      pdf.addImage(logoDataUrl, "PNG", logoX, logoY, logoWidth, logoHeight);
    }

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text(reportTitle, titleX, 12);

    pdf.setFontSize(11);
    pdf.setFont("helvetica", "normal");
    pdf.text(subtitle, titleX, 19);

    pdf.text(dateRangeText, pdfWidth - 15, 12, { align: "right" });
    pdf.text(statsText, pdfWidth - 15, 19, { align: "right" });
  };

  drawPageHeader();

  // Content area — 4 charts per page in a 2x2 grid.
  const contentStartY = headerHeight + 10;
  const chartGap = 8;
  const chartWidth = (pdfWidth - 30 - chartGap) / 2;
  const chartHeight = (pdfHeight - contentStartY - 15 - chartGap) / 2;
  const positions = [
    { x: 15, y: contentStartY },
    { x: 15 + chartWidth + chartGap, y: contentStartY },
    { x: 15, y: contentStartY + chartHeight + chartGap },
    { x: 15 + chartWidth + chartGap, y: contentStartY + chartHeight + chartGap },
  ];

  let chartsOnPage = 0;

  charts.forEach((chart) => {
    if (chart.data && chart.data.length > 0) {
      if (chartsOnPage === 4) {
        pdf.addPage();
        drawPageHeader();
        chartsOnPage = 0;
      }

      const type = chartTypesRef?.current?.[chart.key];
      const drawFn = type === "pie" ? drawPieChart : drawBarChart;

      const pos = positions[chartsOnPage];
      drawFn(pdf, chart.data, chart.title, pos.x, pos.y, chartWidth, chartHeight);

      chartsOnPage++;
    }
  });

  pdf.save(fileName);
}
