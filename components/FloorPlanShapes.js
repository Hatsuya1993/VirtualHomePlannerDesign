import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";
import { colors } from "../utils/theme";

const VIEW = "0 0 120 100";
const STROKE = colors.line;
const WALL_W = 4;
const BG = colors.surfaceAlt;

// A door: gap in the wall + swing arc + leaf. Geometry derives from two
// points — `hinge` (the pivot jamb) and `open` (the leaf tip). `flip`
// mirrors the swing to the other side of the leaf.
const Door = ({ hinge, open, flip }) => {
    const [hx, hy] = hinge;
    const [ox, oy] = open;
    const dx = ox - hx;
    const dy = oy - hy;
    const cx = flip ? hx + dy : hx - dy;
    const cy = flip ? hy - dx : hy + dx;
    const sweep = flip ? 1 : 0;
    const r = Math.hypot(dx, dy);

    return (
        <G>
            <Line x1={hx} y1={hy} x2={cx} y2={cy} stroke={BG} strokeWidth={WALL_W + 2} />
            <Path
                d={`M${cx},${cy} A${r},${r} 0 0 ${sweep} ${ox},${oy}`}
                fill="none"
                stroke={STROKE}
                strokeWidth={1.6}
            />
            <Line
                x1={hx}
                y1={hy}
                x2={ox}
                y2={oy}
                stroke={STROKE}
                strokeWidth={1.6}
                strokeLinecap="round"
            />
        </G>
    );
};

// A window: gap in the wall with a thin pane line.
const Window = ({ at }) => {
    const [x1, y1, x2, y2] = at;
    return (
        <G>
            <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={BG} strokeWidth={WALL_W + 2} />
            <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={STROKE} strokeWidth={1.2} />
        </G>
    );
};

// Top-view bed: frame + pillow + blanket edge.
const Bed = ({ x, y }) => (
    <G>
        <Rect x={x} y={y} width={14} height={10} rx={1.5} fill="none" stroke={STROKE} strokeWidth={1.6} />
        <Rect x={x + 1.8} y={y + 1.8} width={3} height={6.4} rx={1} fill="none" stroke={STROKE} strokeWidth={1.1} />
        <Line x1={x + 7} y1={y} x2={x + 7} y2={y + 10} stroke={STROKE} strokeWidth={1.1} />
    </G>
);

// Toilet: tank + bowl.
const Toilet = ({ x, y }) => (
    <G>
        <Rect x={x} y={y} width={7} height={2.6} rx={0.8} fill="none" stroke={STROKE} strokeWidth={1.4} />
        <Ellipse cx={x + 3.5} cy={y + 6.4} rx={2.7} ry={3.2} fill="none" stroke={STROKE} strokeWidth={1.4} />
    </G>
);

// Bathtub: tub outline + basin + drain.
const Bath = ({ x, y }) => (
    <G>
        <Rect x={x} y={y} width={15} height={9} rx={2.5} fill="none" stroke={STROKE} strokeWidth={1.6} />
        <Rect x={x + 2} y={y + 2} width={10} height={5} rx={1.5} fill="none" stroke={STROKE} strokeWidth={1.1} />
        <Circle cx={x + 12.4} cy={y + 4.5} r={1} fill={STROKE} />
    </G>
);

const DashedWall = ({ at }) => {
    const [x1, y1, x2, y2] = at;
    return (
        <Line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={STROKE}
            strokeWidth={1.6}
            strokeDasharray="3,2.5"
        />
    );
};

// "Start from Blank" outlines with entry door, windows, and (for rounded)
// vertex dots along the curve.
const OUTLINES = {
    rectangular: {
        path: "M20,25 L100,25 L100,80 L20,80 Z",
        doors: [{ hinge: [34, 25], open: [34, 37], flip: true }],
        windows: [[40, 80, 54, 80], [66, 80, 80, 80]],
    },
    lshape: {
        path: "M20,25 L70,25 L70,50 L100,50 L100,80 L20,80 Z",
        doors: [{ hinge: [20, 38], open: [32, 38] }],
        windows: [[34, 25, 46, 25], [100, 58, 100, 70], [56, 80, 70, 80]],
    },
    tshape: {
        path: "M40,22 L80,22 L80,45 L102,45 L102,80 L18,80 L18,45 L40,45 Z",
        doors: [{ hinge: [52, 80], open: [52, 68] }],
        windows: [[48, 22, 60, 22], [102, 54, 102, 66]],
    },
    cut: {
        path: "M20,25 L82,25 L100,43 L100,80 L20,80 Z",
        doors: [{ hinge: [32, 80], open: [32, 68] }],
        windows: [[36, 25, 50, 25], [100, 52, 100, 64]],
    },
    rounded: {
        path: "M20,80 L20,50 Q20,25 60,25 Q100,25 100,50 L100,80 Z",
        doors: [{ hinge: [52, 80], open: [52, 68] }],
        windows: [[30, 80, 42, 80], [76, 80, 88, 80]],
        dots: [[20, 50], [30, 31.3], [60, 25], [90, 31.3], [100, 50]],
    },
    zshape: {
        path: "M20,25 L72,25 L72,48 L100,48 L100,80 L48,80 L48,58 L20,58 Z",
        doors: [{ hinge: [20, 34], open: [32, 34] }],
        windows: [[32, 25, 46, 25], [100, 56, 100, 68]],
    },
};

export const RoomOutline = ({ variant }) => {
    const shape = OUTLINES[variant] ?? OUTLINES.rectangular;
    return (
        <Svg width="100%" height="100%" viewBox={VIEW}>
            <Path
                d={shape.path}
                fill="none"
                stroke={STROKE}
                strokeWidth={WALL_W}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            {(shape.windows ?? []).map((w, i) => (
                <Window key={`w${i}`} at={w} />
            ))}
            {(shape.doors ?? []).map((d, i) => (
                <Door key={`d${i}`} {...d} />
            ))}
            {(shape.dots ?? []).map(([x, y], i) => (
                <Circle key={`p${i}`} cx={x} cy={y} r={2.4} fill={STROKE} stroke={BG} strokeWidth={1.2} />
            ))}
        </Svg>
    );
};

// Apartment plan thumbnail: shell + interior walls + dashed walls +
// windows + doors + furniture glyphs.
export const PlanThumb = ({
    shell,
    walls = [],
    dashedWalls = [],
    doors = [],
    windows = [],
    beds = [],
    toilets = [],
    baths = [],
}) => {
    const [sx, sy, sw, sh] = shell;
    return (
        <Svg width="100%" height="100%" viewBox={VIEW}>
            <Rect
                x={sx}
                y={sy}
                width={sw}
                height={sh}
                fill="none"
                stroke={STROKE}
                strokeWidth={WALL_W}
                strokeLinejoin="round"
            />
            {walls.map(([x1, y1, x2, y2], i) => (
                <Line
                    key={`w${i}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={STROKE}
                    strokeWidth={3}
                    strokeLinecap="round"
                />
            ))}
            {dashedWalls.map((d, i) => (
                <DashedWall key={`dw${i}`} at={d} />
            ))}
            {windows.map((w, i) => (
                <Window key={`win${i}`} at={w} />
            ))}
            {doors.map((d, i) => (
                <Door key={`d${i}`} {...d} />
            ))}
            {beds.map(([x, y], i) => (
                <Bed key={`b${i}`} x={x} y={y} />
            ))}
            {toilets.map(([x, y], i) => (
                <Toilet key={`t${i}`} x={x} y={y} />
            ))}
            {baths.map(([x, y], i) => (
                <Bath key={`bt${i}`} x={x} y={y} />
            ))}
        </Svg>
    );
};

// Pencil glyph for "Draw Walls From Scratch" — square left open where
// the pencil sits, like the template.
export const DrawGlyph = () => (
    <Svg width="100%" height="100%" viewBox={VIEW}>
        <Path
            d="M72,24 L26,24 L26,78 L72,78"
            fill="none"
            stroke={STROKE}
            strokeWidth={WALL_W}
            strokeLinejoin="round"
            strokeLinecap="round"
        />
        <Path
            d="M62,62 L84,36 L93,44 L71,70 L60,72 Z"
            fill="none"
            stroke={STROKE}
            strokeWidth={2.2}
            strokeLinejoin="round"
        />
        <Line x1={80.5} y1={40.5} x2={89} y2={48} stroke={STROKE} strokeWidth={1.6} />
    </Svg>
);
