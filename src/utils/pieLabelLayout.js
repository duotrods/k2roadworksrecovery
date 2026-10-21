// Label layout for a pie chart with one outside label + leader line per slice.
//
// Recharts' built-in outside labels sit at each slice's own angle, so labels
// near 12 and 6 o'clock run off the card and neighbouring small slices
// collide. Here labels are stacked in a column on each side of the pie,
// spread so none overlap, and kept inside the box.
//
// The pie is also rotated: a run of small slices bunched at the top or bottom
// forces their labels far from the slices, and the leader lines then cut
// across the pie and each other. Trying a set of start angles and keeping the
// one whose labels sit closest to their slices puts that run on the left or
// right edge instead, where the lines can fan out cleanly.

const TWO_LINE_H = 34;
const ONE_LINE_H = 17;
// Above this many labels on one side, two-line labels push each other too far.
const MAX_TWO_LINE_PER_SIDE = 5;
const PAD = 6;
const START_ANGLES = [90, 75, 105, 60, 120, 45, 135, 30, 150, 15, 165, 0, 180,
  -15, 195, -30, 210, -45, 225, -60, 240, -75, 255, -90];

const distToSegment = (px, py, [ax, ay], [bx, by]) => {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

// Order-preserving 1-D placement: each label wants `want`; overlapping
// neighbours are merged into a block centred on the block's average wish and
// clamped to [minY, maxY]. Unlike a simple push-down pass this spreads a
// crowded group both ways around its slices instead of only downwards.
const spread = (items, lineH, minY, maxY) => {
  const blocks = [];
  items.forEach((item) => {
    let block = { n: 1, sum: item.want };
    const position = (b) =>
      Math.max(minY, Math.min(maxY - (b.n - 1) * lineH, b.sum / b.n));
    block.pos = position(block);
    while (blocks.length) {
      const prev = blocks[blocks.length - 1];
      if (prev.pos + prev.n * lineH <= block.pos) break;
      blocks.pop();
      block = { n: prev.n + block.n, sum: prev.sum + block.sum - prev.n * lineH * block.n };
      block.pos = position(block);
    }
    blocks.push(block);
  });
  let i = 0;
  blocks.forEach((b) => {
    for (let k = 0; k < b.n; k++) items[i++].y = b.pos + k * lineH;
  });
};

const place = (values, total, geo, startAngle) => {
  const { cx, cy, radius, height } = geo;
  const elbow = radius + 12;
  const textX = radius + 26;

  let cum = 0;
  const items = values.map((value, index) => {
    const mid = ((startAngle - (360 * (cum + value / 2)) / total) * Math.PI) / 180;
    cum += value;
    const cos = Math.cos(mid);
    const sin = Math.sin(mid);
    return {
      index,
      value,
      right: cos >= 0,
      edge: [cx + radius * cos, cy - radius * sin],
      bend: [cx + elbow * cos, cy - elbow * sin],
      want: cy - (radius + 18) * sin,
    };
  });

  const sides = [items.filter((i) => i.right), items.filter((i) => !i.right)];
  const twoLine = sides.every((side) => side.length <= MAX_TWO_LINE_PER_SIDE);
  const lineH = twoLine ? TWO_LINE_H : ONE_LINE_H;
  const capacity = Math.max(1, Math.floor((height - PAD * 2) / lineH));

  const labels = {};
  let cost = 0;
  sides.forEach((side) => {
    // More slices than rows on this side: label the biggest, leave the rest to the tooltip.
    const kept =
      side.length > capacity
        ? [...side].sort((a, b) => b.value - a.value).slice(0, capacity)
        : side;
    cost += (side.length - kept.length) * 500;
    kept.sort((a, b) => a.want - b.want);
    spread(kept, lineH, PAD + lineH / 2, height - PAD - lineH / 2);
    kept.forEach((item) => {
      const x = item.right ? cx + textX : cx - textX;
      const lineEnd = [x + (item.right ? -5 : 5), item.y];
      cost += Math.abs(item.y - item.want);
      // A leader that would cut across the pie is the thing to avoid most.
      if (distToSegment(cx, cy, item.bend, lineEnd) < radius + 3) cost += 1000;
      labels[item.index] = { right: item.right, edge: item.edge, bend: item.bend, lineEnd, x, y: item.y };
    });
  });

  return { cost, twoLine, lineH, labels, startAngle };
};

// values: slice values in draw order (all > 0). Returns
// { cx, cy, radius, startAngle, twoLine, lineH, maxChars, labels: { [index]: {x, y, right, edge, bend, lineEnd} } }.
// Draw the pie clockwise from startAngle (recharts: startAngle, endAngle = startAngle - 360).
export function layoutPieLabels(values, width, height) {
  const total = values.reduce((sum, v) => sum + v, 0);
  const sideWidth = Math.min(170, Math.max(84, width * 0.3));
  const radius = Math.max(36, Math.min(height / 2 - 26, width / 2 - sideWidth - 22));
  const geo = { cx: width / 2, cy: height / 2, radius, height };

  let best = null;
  START_ANGLES.forEach((startAngle) => {
    const candidate = place(values, total, geo, startAngle);
    // Strictly better only, so the conventional 12 o'clock start wins ties.
    if (!best || candidate.cost < best.cost - 0.5) best = candidate;
  });

  // ~6.2px per character at 12px text; whatever is left beside the pie.
  const maxChars = Math.max(6, Math.floor((width / 2 - radius - 30) / 6.2));
  return { cx: geo.cx, cy: geo.cy, radius, maxChars, ...best };
}
