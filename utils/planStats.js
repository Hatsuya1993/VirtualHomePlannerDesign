import { chainRoom } from "./roomGeometry";
import { formatArea, formatLength } from "./units";

const polygonArea = (poly) => {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
    }
    return Math.abs(a / 2);
};

// Derive plan metrics from the walls (all lengths in feet, area in ft²).
export const computeStats = (walls, pixelsPerFoot) => {
    const { polygon, closed } = chainRoom(walls);
    const areaFt2 =
        polygon.length >= 3 ? polygonArea(polygon) / (pixelsPerFoot * pixelsPerFoot) : 0;

    let perimeterPx = 0;
    let doors = 0;
    let windows = 0;
    let openings = 0;
    for (const w of walls) {
        perimeterPx += Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
        for (const o of w.openings || []) {
            if (o.kind === "door") doors += 1;
            else if (o.kind === "window") windows += 1;
            else openings += 1;
        }
    }

    const xs = walls.flatMap((w) => [w.x1, w.x2]);
    const ys = walls.flatMap((w) => [w.y1, w.y2]);
    const widthFt = xs.length ? (Math.max(...xs) - Math.min(...xs)) / pixelsPerFoot : 0;
    const heightFt = ys.length ? (Math.max(...ys) - Math.min(...ys)) / pixelsPerFoot : 0;

    return {
        areaFt2,
        perimeterFt: perimeterPx / pixelsPerFoot,
        widthFt,
        heightFt,
        wallCount: walls.length,
        doors,
        windows,
        openings,
        closed,
    };
};

// The stat rows shown in the Stats sheet and PDF, formatted in the chosen unit.
export const statRows = (stats, units) => [
    { label: "Floor area", value: formatArea(stats.areaFt2, units) },
    {
        label: "Dimensions",
        value: `${formatLength(stats.widthFt * 12, units)} × ${formatLength(stats.heightFt * 12, units)}`,
    },
    { label: "Perimeter", value: formatLength(stats.perimeterFt * 12, units) },
    { label: "Walls", value: String(stats.wallCount) },
    { label: "Doors", value: String(stats.doors) },
    { label: "Windows", value: String(stats.windows) },
    { label: "Openings", value: String(stats.openings) },
];

export const buildShareText = (stats, units) => {
    const rows = statRows(stats, units)
        .map((r) => `${r.label}: ${r.value}`)
        .join("\n");
    return `My Floor Plan — Virtual Home Planner\n\n${rows}`;
};

// A printable HTML document embedding a PNG snapshot of the plan plus a stats
// table. `pngBase64` is the canvas capture (no data: prefix).
export const buildPlanHtml = (stats, units, pngBase64) => {
    const rows = statRows(stats, units)
        .map(
            (r) =>
                `<tr><td class="l">${r.label}</td><td class="v">${r.value}</td></tr>`
        )
        .join("");
    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111827; padding: 28px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #6B7280; margin: 0 0 20px; font-size: 13px; }
  .plan { text-align: center; margin: 18px 0 24px; }
  .plan img { max-width: 100%; border: 1px solid #E5E7EB; border-radius: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 15px; }
  td { padding: 12px 4px; border-bottom: 1px solid #E5E7EB; }
  td.l { color: #6B7280; }
  td.v { text-align: right; font-weight: 700; }
</style></head><body>
  <h1>Floor Plan</h1>
  <p class="sub">Virtual Home Planner</p>
  ${pngBase64 ? `<div class="plan"><img src="data:image/png;base64,${pngBase64}" /></div>` : ""}
  <table>${rows}</table>
</body></html>`;
};
