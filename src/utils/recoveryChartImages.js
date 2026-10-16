// Canvas-drawn PNGs of the two charts on the client's recovery report
// (Monthly Recoveries columns + Clearance Rate line). ExcelJS can't create
// native Excel charts, so they're embedded as images.

const SCALE = 2; // draw at 2x so the images stay sharp when zoomed in Excel
const FONT = "Calibri, Arial, sans-serif";
const AXIS = "#595959";
const GRID = "#d9d9d9";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "Sep-26", matching Excel's mmm-yy (toLocaleDateString gives "Sept" in en-GB).
const monthLabel = (d) => `${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;

const makeCanvas = (width, height, title) => {
  const canvas = document.createElement("canvas");
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = GRID;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  ctx.fillStyle = "#1f1f1f";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold 17px ${FONT}`;
  ctx.fillText(title, width / 2, 24);
  return { canvas, ctx };
};

// Shared plot frame: horizontal gridlines + y labels + rotated month labels.
const drawFrame = (ctx, plot, ticks, formatTick, labels) => {
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = AXIS;
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  const y = (v) => plot.bottom - ((v - ticks.min) / (ticks.max - ticks.min)) * (plot.bottom - plot.top);
  for (let v = ticks.min; v <= ticks.max + 1e-9; v += ticks.step) {
    ctx.beginPath();
    ctx.moveTo(plot.left, y(v));
    ctx.lineTo(plot.right, y(v));
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(formatTick(v), plot.left - 6, y(v));
  }
  const slot = (plot.right - plot.left) / labels.length;
  labels.forEach((label, i) => {
    ctx.save();
    ctx.translate(plot.left + slot * (i + 0.5), plot.bottom + 8);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = AXIS;
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });
  return { y, slot };
};

const niceStep = (max) => {
  const rough = max / 6;
  const pow = 10 ** Math.floor(Math.log10(rough || 1));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) || pow * 10;
};

export const monthlyRecoveriesChartPng = (months) => {
  const width = 760;
  const height = 330;
  const { canvas, ctx } = makeCanvas(width, height, "Monthly Recoveries");
  const plot = { left: 46, right: width - 14, top: 48, bottom: height - 62 };
  const step = niceStep(Math.max(...months.map((m) => m.recoveries), 1));
  const max = Math.ceil(Math.max(...months.map((m) => m.recoveries), 1) / step) * step;
  const { y, slot } = drawFrame(ctx, plot, { min: 0, max, step }, String, months.map((m) => monthLabel(m.month)));

  const barW = Math.min(slot * 0.55, 26);
  months.forEach((m, i) => {
    if (!m.recoveries) return;
    const x = plot.left + slot * (i + 0.5) - barW / 2;
    const top = y(m.recoveries);
    const gradient = ctx.createLinearGradient(0, top, 0, plot.bottom);
    gradient.addColorStop(0, "#4aa8e0");
    gradient.addColorStop(1, "#0a8ad0");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, top, barW, plot.bottom - top);
    ctx.fillStyle = "#1f1f1f";
    ctx.font = `10px ${FONT}`;
    ctx.textAlign = "center";
    // Tiny bars have no room for an inside label — put it above instead.
    const inside = plot.bottom - top > 18;
    ctx.fillText(String(m.recoveries), x + barW / 2, inside ? top + 10 : top - 8);
  });
  return canvas.toDataURL("image/png");
};

export const clearanceRateChartPng = (months) => {
  const width = 760;
  const height = 330;
  const { canvas, ctx } = makeCanvas(width, height, "Clearance Rate");
  const plot = { left: 50, right: width - 14, top: 48, bottom: height - 62 };
  const rates = months.map((m) => m.clearance).filter((r) => r !== null);
  const low = Math.floor((Math.min(...rates, 1) * 100 - 2) / 2) * 2;
  const min = Math.max(0, Math.min(low, 98)) / 100;
  const { y, slot } = drawFrame(
    ctx,
    plot,
    { min, max: 1.02, step: 0.02 },
    (v) => `${Math.round(v * 100)}%`,
    months.map((m) => monthLabel(m.month)),
  );

  // Line breaks across months with no measurable jobs rather than dropping to 0.
  ctx.strokeStyle = "#1f5f87";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  let drawing = false;
  ctx.beginPath();
  months.forEach((m, i) => {
    if (m.clearance === null) {
      drawing = false;
      return;
    }
    const px = plot.left + slot * (i + 0.5);
    if (drawing) ctx.lineTo(px, y(m.clearance));
    else ctx.moveTo(px, y(m.clearance));
    drawing = true;
  });
  ctx.stroke();

  ctx.fillStyle = "#404040";
  ctx.font = `10px ${FONT}`;
  ctx.textAlign = "center";
  months.forEach((m, i) => {
    if (m.clearance === null) return;
    const px = plot.left + slot * (i + 0.5);
    // 100% points sit on the top gridline: label above; others below the line.
    const dy = m.clearance >= 0.995 ? -9 : 12;
    ctx.fillText(`${Math.round(m.clearance * 100)}%`, px, y(m.clearance) + dy);
  });
  return canvas.toDataURL("image/png");
};
