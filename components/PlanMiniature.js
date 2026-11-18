import Svg, { Line, Polygon } from "react-native-svg";
import { footprintCorners, shade, sortForDrawing } from "../utils/furnitureCatalog";
import { roomOutline } from "../utils/roomGeometry";

// A small thumbnail of a saved plan, rendered from its walls. Uses a viewBox so
// it scales to whatever box it's dropped in without pixel measurement.
export const PlanMiniature = ({ walls, furniture, floor = "#EBDDC4", wall = "#4C7CA8" }) => {
    if (!walls || walls.length === 0) return null;

    const xs = walls.flatMap((w) => [w.x1, w.x2]);
    const ys = walls.flatMap((w) => [w.y1, w.y2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const bw = maxX - minX || 1;
    const bh = maxY - minY || 1;
    const pad = Math.max(bw, bh) * 0.08;
    const sw = Math.max(bw, bh) * 0.02; // stroke scaled to the plan size

    const outline = roomOutline(walls);
    const floorPts = outline
        ? outline.map((p) => `${p.x},${p.y}`).join(" ")
        : "";

    return (
        <Svg
            width="100%"
            height="100%"
            viewBox={`${minX - pad} ${minY - pad} ${bw + pad * 2} ${bh + pad * 2}`}
            preserveAspectRatio="xMidYMid meet"
        >
            {floorPts ? <Polygon points={floorPts} fill={floor} /> : null}
            {sortForDrawing(furniture ?? []).map((f) => (
                <Polygon
                    key={f.id}
                    points={footprintCorners(f)
                        .map((p) => `${p.x},${p.y}`)
                        .join(" ")}
                    fill={f.color}
                    stroke={shade(f.color, -0.35)}
                    strokeWidth={sw * 0.25}
                />
            ))}
            {walls.map((w, i) => (
                <Line
                    key={i}
                    x1={w.x1}
                    y1={w.y1}
                    x2={w.x2}
                    y2={w.y2}
                    stroke={wall}
                    strokeWidth={sw}
                    strokeLinecap="round"
                />
            ))}
        </Svg>
    );
};
