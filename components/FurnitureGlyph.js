import { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";
import { catalogEntry, PX_PER_IN, shade } from "../utils/furnitureCatalog";

// Top-view drawing of one furniture piece, in its own local frame: centered on
// (0, 0), width along x, depth along y, "front" facing +y. The caller wraps it
// in a translate/rotate group. `sw` is the base stroke width in content units
// (so lines stay crisp regardless of zoom).
export const FurnitureGlyph = ({ item, sw = 1 }) => {
    const entry = catalogEntry(item.type);
    const W = Math.max(2, item.w * PX_PER_IN);
    const D = Math.max(2, item.d * PX_PER_IN);
    const color = item.color || entry.color;
    const draw = GLYPHS[entry.shape] ?? GLYPHS.box;
    return <G>{draw({ W, D, color, sw, item, entry })}</G>;
};

const OUTLINE = "#4A4037";

// Base outline style shared by most shapes.
const st = (sw, color, k = 1) => ({
    stroke: shade(color, -0.45),
    strokeWidth: sw * k,
    strokeLinejoin: "round",
});

const seatCount = (wIn) => Math.max(1, Math.min(4, Math.round(wIn / 30)));

// Rounded rectangle helper in local coordinates (x/y = top-left).
const R = ({ x, y, w, h, r = 0, fill, ...rest }) => (
    <Rect
        x={x}
        y={y}
        width={Math.max(0.1, w)}
        height={Math.max(0.1, h)}
        rx={Math.min(r, w / 2, h / 2)}
        fill={fill}
        {...rest}
    />
);

// Row of cushions between x0..x1, y0..y1.
const cushions = (key, n, x0, x1, y0, y1, fill, s, gap) => {
    const cw = (x1 - x0 - gap * (n - 1)) / n;
    return Array.from({ length: n }, (_, i) => (
        <R
            key={`${key}${i}`}
            x={x0 + i * (cw + gap)}
            y={y0}
            w={cw}
            h={y1 - y0}
            r={Math.min(cw, y1 - y0) * 0.18}
            fill={fill}
            {...s}
        />
    ));
};

const GLYPHS = {
    box: ({ W, D, color, sw }) => (
        <R x={-W / 2} y={-D / 2} w={W} h={D} r={2} fill={color} {...st(sw, color)} />
    ),

    sofa: ({ W, D, color, sw, item }) => {
        const s = st(sw, color);
        const back = Math.min(D * 0.26, 9);
        const arm = Math.min(W * 0.11, 7);
        const dark = shade(color, -0.14);
        return (
            <>
                <R x={-W / 2} y={-D / 2} w={W} h={D} r={4} fill={dark} {...s} />
                <R x={-W / 2} y={-D / 2} w={W} h={back} r={3} fill={shade(color, -0.2)} {...s} />
                <R x={-W / 2} y={-D / 2} w={arm} h={D} r={3} fill={shade(color, -0.08)} {...s} />
                <R x={W / 2 - arm} y={-D / 2} w={arm} h={D} r={3} fill={shade(color, -0.08)} {...s} />
                {cushions(
                    "c",
                    seatCount(item.w),
                    -W / 2 + arm + 1,
                    W / 2 - arm - 1,
                    -D / 2 + back + 1,
                    D / 2 - 1.5,
                    shade(color, 0.12),
                    st(sw, color, 0.7),
                    1.2
                )}
            </>
        );
    },

    sectional: ({ W, D, color, sw }) => {
        const s = st(sw, color);
        const seatD = Math.min(D * 0.45, 36 * PX_PER_IN);
        const back = Math.min(seatD * 0.26, 9);
        const arm = Math.min(W * 0.07, 7);
        const chaiseW = Math.min(W * 0.4, seatD);
        const L = `M${-W / 2},${-D / 2} H${W / 2} V${D / 2} H${W / 2 - chaiseW} V${-D / 2 + seatD} H${-W / 2} Z`;
        const mainX0 = -W / 2 + arm + 1;
        const mainX1 = W / 2 - chaiseW;
        return (
            <>
                <Path d={L} fill={shade(color, -0.14)} {...s} />
                <R x={-W / 2} y={-D / 2} w={W} h={back} r={3} fill={shade(color, -0.22)} {...s} />
                <R x={W / 2 - arm} y={-D / 2} w={arm} h={D} r={3} fill={shade(color, -0.1)} {...s} />
                <R x={-W / 2} y={-D / 2} w={arm} h={seatD} r={3} fill={shade(color, -0.1)} {...s} />
                {cushions(
                    "m",
                    Math.max(1, Math.round((mainX1 - mainX0) / (28 * PX_PER_IN))),
                    mainX0,
                    mainX1 - 0.6,
                    -D / 2 + back + 1,
                    -D / 2 + seatD - 1.5,
                    shade(color, 0.12),
                    st(sw, color, 0.7),
                    1.2
                )}
                <R
                    x={W / 2 - chaiseW + 0.6}
                    y={-D / 2 + back + 1}
                    w={chaiseW - arm - 1.6}
                    h={D - back - 2.5}
                    r={3}
                    fill={shade(color, 0.12)}
                    {...st(sw, color, 0.7)}
                />
            </>
        );
    },

    armchair: ({ W, D, color, sw }) => {
        const s = st(sw, color);
        const back = Math.min(D * 0.26, 8);
        const arm = Math.min(W * 0.2, 6);
        return (
            <>
                <R x={-W / 2} y={-D / 2} w={W} h={D} r={5} fill={shade(color, -0.14)} {...s} />
                <R x={-W / 2} y={-D / 2} w={W} h={back} r={4} fill={shade(color, -0.22)} {...s} />
                <R x={-W / 2} y={-D / 2} w={arm} h={D} r={4} fill={shade(color, -0.08)} {...s} />
                <R x={W / 2 - arm} y={-D / 2} w={arm} h={D} r={4} fill={shade(color, -0.08)} {...s} />
                <R
                    x={-W / 2 + arm + 0.8}
                    y={-D / 2 + back + 0.8}
                    w={W - 2 * arm - 1.6}
                    h={D - back - 2}
                    r={3}
                    fill={shade(color, 0.12)}
                    {...st(sw, color, 0.7)}
                />
            </>
        );
    },

    ottoman: ({ W, D, color, sw }) => {
        const dots = [];
        for (let i = 1; i <= 3; i++) {
            for (let j = 1; j <= 2; j++) {
                dots.push(
                    <Circle
                        key={`${i}${j}`}
                        cx={-W / 2 + (W * i) / 4}
                        cy={-D / 2 + (D * j) / 3}
                        r={Math.min(W, D) * 0.03 + 0.4}
                        fill={shade(color, -0.35)}
                    />
                );
            }
        }
        return (
            <>
                <R x={-W / 2} y={-D / 2} w={W} h={D} r={Math.min(W, D) * 0.2} fill={color} {...st(sw, color)} />
                {dots}
            </>
        );
    },

    table: ({ W, D, color, sw }) => (
        <>
            <R x={-W / 2} y={-D / 2} w={W} h={D} r={2.5} fill={color} {...st(sw, color)} />
            <R
                x={-W / 2 + Math.min(W, D) * 0.1}
                y={-D / 2 + Math.min(W, D) * 0.1}
                w={W - Math.min(W, D) * 0.2}
                h={D - Math.min(W, D) * 0.2}
                r={1.5}
                fill="none"
                stroke={shade(color, 0.25)}
                strokeWidth={sw * 0.7}
            />
        </>
    ),

    roundTable: ({ W, D, color, sw }) => (
        <>
            <Ellipse cx={0} cy={0} rx={W / 2} ry={D / 2} fill={color} {...st(sw, color)} />
            <Ellipse
                cx={0}
                cy={0}
                rx={W * 0.36}
                ry={D * 0.36}
                fill="none"
                stroke={shade(color, 0.25)}
                strokeWidth={sw * 0.7}
            />
        </>
    ),

    tv: ({ W, D, color, sw }) => (
        <>
            <R x={-W * 0.18} y={-D * 0.1} w={W * 0.36} h={D * 0.6} r={1} fill="#4A4F57" {...st(sw, "#4A4F57", 0.6)} />
            <R x={-W / 2} y={-D / 2} w={W} h={Math.max(1.2, D * 0.25)} r={0.6} fill={color} {...st(sw, color)} />
        </>
    ),

    cabinet: ({ W, D, color, sw, entry }) => {
        const s = st(sw, color);
        const variant = entry.variant;
        const front = Math.min(D * 0.12, 2.2);
        const n = variant === "drawers" ? Math.max(1, Math.min(3, Math.round(W / 22))) : 2;
        const handles = [];
        for (let i = 0; i < n; i++) {
            const cx = -W / 2 + (W * (i + 0.5)) / n;
            handles.push(
                <Line
                    key={i}
                    x1={cx - Math.min(W / n, 14) * 0.2}
                    y1={D / 2 + 0.9}
                    x2={cx + Math.min(W / n, 14) * 0.2}
                    y2={D / 2 + 0.9}
                    stroke={OUTLINE}
                    strokeWidth={sw * 1.1}
                    strokeLinecap="round"
                />
            );
        }
        return (
            <>
                <R x={-W / 2} y={-D / 2} w={W} h={D} r={1.2} fill={color} {...s} />
                <Line
                    x1={-W / 2}
                    y1={D / 2 - front}
                    x2={W / 2}
                    y2={D / 2 - front}
                    stroke={shade(color, -0.3)}
                    strokeWidth={sw * 0.7}
                />
                {variant === "media" && (
                    <R
                        x={-W * 0.3}
                        y={-D * 0.25}
                        w={W * 0.6}
                        h={D * 0.4}
                        r={1}
                        fill={shade(color, -0.25)}
                    />
                )}
                {handles}
            </>
        );
    },

    bookshelf: ({ W, D, color, sw }) => {
        const books = [];
        const palette = ["#B5523B", "#3E6A8A", "#D4A24C", "#5E8C61", "#7B5E8A", "#C9C2B6"];
        const n = Math.max(3, Math.round(W / 4));
        const bw = (W - 3) / n;
        for (let i = 0; i < n; i++) {
            const depth = (D - 3) * (0.6 + ((i * 37) % 10) / 25);
            books.push(
                <Rect
                    key={i}
                    x={-W / 2 + 1.5 + i * bw}
                    y={D / 2 - 1.5 - depth}
                    width={bw * 0.85}
                    height={depth}
                    fill={palette[(i * 7) % palette.length]}
                />
            );
        }
        return (
            <>
                <R x={-W / 2} y={-D / 2} w={W} h={D} r={1} fill={shade(color, -0.1)} {...st(sw, color)} />
                {books}
            </>
        );
    },

    wardrobe: ({ W, D, color, sw }) => {
        const hangers = [];
        const n = Math.max(3, Math.round(W / 5));
        for (let i = 0; i < n; i++) {
            const x = -W / 2 + ((i + 0.5) * W) / n;
            hangers.push(
                <Line
                    key={i}
                    x1={x - D * 0.12}
                    y1={-D * 0.28}
                    x2={x + D * 0.12}
                    y2={D * 0.28}
                    stroke={shade(color, -0.35)}
                    strokeWidth={sw * 0.7}
                />
            );
        }
        return (
            <>
                <R x={-W / 2} y={-D / 2} w={W} h={D} r={1.2} fill={color} {...st(sw, color)} />
                <Line x1={-W / 2 + 2} y1={0} x2={W / 2 - 2} y2={0} stroke={shade(color, -0.45)} strokeWidth={sw} />
                {hangers}
                <Line x1={0} y1={D / 2 - 2} x2={0} y2={D / 2} stroke={OUTLINE} strokeWidth={sw * 0.8} />
            </>
        );
    },

    fireplace: ({ W, D, color, sw }) => (
        <>
            <R x={-W / 2} y={-D / 2} w={W} h={D} r={1} fill={color} {...st(sw, color)} />
            <R x={-W * 0.3} y={-D / 2 + 1} w={W * 0.6} h={D * 0.55} r={1} fill="#3A3330" />
            <Path
                d={`M${-W * 0.12},${-D * 0.02} Q0,${-D * 0.45} ${W * 0.12},${-D * 0.02} Z`}
                fill="#F2913D"
            />
            <R x={-W / 2 - 2} y={D / 2 - 1} w={W + 4} h={3} r={1} fill={shade(color, -0.2)} {...st(sw, color, 0.6)} />
        </>
    ),

    piano: ({ W, D, color, sw }) => {
        const keysD = Math.min(D * 0.35, 6);
        const keys = [];
        const n = Math.max(8, Math.round(W / 2.2));
        for (let i = 1; i < n; i++) {
            const x = -W / 2 + 2 + ((W - 4) * i) / n;
            keys.push(
                <Line key={i} x1={x} y1={D / 2 - keysD} x2={x} y2={D / 2} stroke="#888" strokeWidth={sw * 0.4} />
            );
        }
        return (
            <>
                <R x={-W / 2} y={-D / 2} w={W} h={D - keysD} r={1.5} fill={color} {...st(sw, "#777")} />
                <R x={-W / 2 + 2} y={D / 2 - keysD} w={W - 4} h={keysD} r={0.5} fill="#F7F5F0" stroke="#555" strokeWidth={sw * 0.6} />
                {keys}
            </>
        );
    },

    floorLamp: ({ W, D, color, sw }) => (
        <>
            <Ellipse cx={0} cy={0} rx={W / 2} ry={D / 2} fill={color} {...st(sw, color)} />
            <Ellipse cx={0} cy={0} rx={W * 0.32} ry={D * 0.32} fill="#FFF6DA" stroke={shade(color, -0.3)} strokeWidth={sw * 0.6} />
            <Circle cx={0} cy={0} r={Math.min(W, D) * 0.07} fill="#6B6B6B" />
        </>
    ),

    plant: ({ W, D, color, sw }) => {
        const leaves = [];
        const n = 7;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const r = Math.min(W, D) * 0.28;
            leaves.push(
                <Ellipse
                    key={i}
                    cx={Math.cos(a) * r}
                    cy={Math.sin(a) * r}
                    rx={Math.min(W, D) * 0.24}
                    ry={Math.min(W, D) * 0.12}
                    transform={`rotate(${(a * 180) / Math.PI} ${Math.cos(a) * r} ${Math.sin(a) * r})`}
                    fill={i % 2 ? color : shade(color, 0.18)}
                    stroke={shade(color, -0.35)}
                    strokeWidth={sw * 0.5}
                />
            );
        }
        return (
            <>
                <Circle cx={0} cy={0} r={Math.min(W, D) * 0.3} fill="#B86F4B" stroke="#7A4630" strokeWidth={sw * 0.6} />
                {leaves}
                <Circle cx={0} cy={0} r={Math.min(W, D) * 0.12} fill={shade(color, -0.2)} />
            </>
        );
    },

    rug: ({ W, D, color, sw }) => {
        const inset = Math.min(W, D) * 0.08;
        const fringe = [];
        const n = Math.max(4, Math.round(D / 3));
        for (let i = 0; i <= n; i++) {
            const y = -D / 2 + (D * i) / n;
            fringe.push(
                <Line key={`l${i}`} x1={-W / 2 - 2} y1={y} x2={-W / 2} y2={y} stroke={shade(color, -0.2)} strokeWidth={sw * 0.5} />,
                <Line key={`r${i}`} x1={W / 2} y1={y} x2={W / 2 + 2} y2={y} stroke={shade(color, -0.2)} strokeWidth={sw * 0.5} />
            );
        }
        return (
            <>
                {fringe}
                <R x={-W / 2} y={-D / 2} w={W} h={D} r={1} fill={color} opacity={0.92} stroke={shade(color, -0.25)} strokeWidth={sw * 0.6} />
                <R
                    x={-W / 2 + inset}
                    y={-D / 2 + inset}
                    w={W - inset * 2}
                    h={D - inset * 2}
                    r={1}
                    fill="none"
                    stroke={shade(color, -0.25)}
                    strokeWidth={sw * 1.2}
                />
                <Ellipse cx={0} cy={0} rx={W * 0.16} ry={D * 0.16} fill="none" stroke={shade(color, 0.3)} strokeWidth={sw} />
            </>
        );
    },

    roundRug: ({ W, D, color, sw }) => (
        <>
            <Ellipse cx={0} cy={0} rx={W / 2} ry={D / 2} fill={color} opacity={0.92} stroke={shade(color, -0.25)} strokeWidth={sw * 0.6} />
            <Ellipse cx={0} cy={0} rx={W * 0.4} ry={D * 0.4} fill="none" stroke={shade(color, -0.25)} strokeWidth={sw * 1.2} />
            <Ellipse cx={0} cy={0} rx={W * 0.18} ry={D * 0.18} fill="none" stroke={shade(color, 0.3)} strokeWidth={sw} />
        </>
    ),

    bed: ({ W, D, color, sw, item }) => {
        const head = Math.min(D * 0.06, 5);
        const pillowsN = item.w >= 50 ? 2 : 1;
        const pillowD = Math.min(D * 0.14, 12);
        const blanketY = -D / 2 + head + pillowD + D * 0.07;
        return (
            <>
                <R x={-W / 2} y={-D / 2} w={W} h={D} r={2} fill="#F7F4EE" {...st(sw, "#B8AE9F")} />
                <R x={-W / 2} y={-D / 2} w={W} h={head} r={1.5} fill="#7A5C43" {...st(sw, "#7A5C43")} />
                {cushions(
                    "p",
                    pillowsN,
                    -W / 2 + W * 0.08,
                    W / 2 - W * 0.08,
                    -D / 2 + head + 2,
                    -D / 2 + head + 2 + pillowD,
                    "#FFFFFF",
                    st(sw, "#C9C2B6", 0.7),
                    W * 0.06
                )}
                <R x={-W / 2} y={blanketY} w={W} h={D / 2 - blanketY} r={2} fill={color} {...st(sw, color)} />
                <Line
                    x1={-W / 2}
                    y1={blanketY + D * 0.08}
                    x2={W / 2}
                    y2={blanketY + D * 0.08}
                    stroke={shade(color, 0.25)}
                    strokeWidth={sw * 1.2}
                />
            </>
        );
    },

    bunkBed: (p) => {
        const { W, D, sw } = p;
        const ladderW = Math.min(W * 0.2, 7);
        const rungs = [];
        for (let i = 1; i <= 4; i++) {
            const y = D * 0.05 + (i * D * 0.35) / 5;
            rungs.push(
                <Line key={i} x1={W / 2} y1={y} x2={W / 2 + ladderW} y2={y} stroke="#5B4636" strokeWidth={sw} />
            );
        }
        return (
            <>
                {GLYPHS.bed({ ...p, color: "#7FA7C9" })}
                <R x={-W / 2} y={-D / 2} w={W} h={D} r={1} fill="none" stroke={p.color} strokeWidth={sw * 2} />
                <Line x1={W / 2} y1={D * 0.05} x2={W / 2 + ladderW} y2={D * 0.05} stroke="#5B4636" strokeWidth={sw} />
                <Line x1={W / 2 + ladderW} y1={D * 0.05} x2={W / 2 + ladderW} y2={D * 0.4} stroke="#5B4636" strokeWidth={sw} />
                {rungs}
            </>
        );
    },

    crib: ({ W, D, color, sw }) => {
        const slats = [];
        const step = 2.2;
        for (let x = -W / 2 + step; x < W / 2 - step / 2; x += step) {
            slats.push(<Line key={`t${x}`} x1={x} y1={-D / 2} x2={x} y2={-D / 2 + 1.6} stroke={shade(color, -0.4)} strokeWidth={sw * 0.5} />);
            slats.push(<Line key={`b${x}`} x1={x} y1={D / 2 - 1.6} x2={x} y2={D / 2} stroke={shade(color, -0.4)} strokeWidth={sw * 0.5} />);
        }
        return (
            <>
                <R x={-W / 2} y={-D / 2} w={W} h={D} r={1.5} fill={color} {...st(sw, color)} />
                <R x={-W / 2 + 1.6} y={-D / 2 + 1.6} w={W - 3.2} h={D - 3.2} r={1} fill="#DDEBF3" stroke={shade(color, -0.3)} strokeWidth={sw * 0.6} />
                {slats}
            </>
        );
    },

    bench: ({ W, D, color, sw, entry }) => {
        if (entry.variant === "upholstered") {
            return GLYPHS.ottoman({ W, D, color, sw });
        }
        const slats = [];
        const n = Math.max(2, Math.round(D / 3));
        for (let i = 1; i < n; i++) {
            const y = -D / 2 + (D * i) / n;
            slats.push(<Line key={i} x1={-W / 2 + 1} y1={y} x2={W / 2 - 1} y2={y} stroke={shade(color, -0.3)} strokeWidth={sw * 0.6} />);
        }
        return (
            <>
                <R x={-W / 2} y={-D / 2} w={W} h={D} r={1.5} fill={color} {...st(sw, color)} />
                {slats}
            </>
        );
    },

    chair: ({ W, D, color, sw }) => {
        const back = Math.min(D * 0.18, 3.5);
        return (
            <>
                <R x={-W / 2 + 0.5} y={-D / 2 + back * 0.5} w={W - 1} h={D - back * 0.5} r={2} fill={shade(color, 0.12)} {...st(sw, color)} />
                <R x={-W / 2} y={-D / 2} w={W} h={back} r={1.5} fill={shade(color, -0.12)} {...st(sw, color)} />
            </>
        );
    },

    stool: ({ W, D, color, sw }) => (
        <>
            <Ellipse cx={0} cy={0} rx={W / 2} ry={D / 2} fill="none" stroke={shade(color, -0.1)} strokeWidth={sw * 1.2} />
            <Ellipse cx={0} cy={0} rx={W * 0.36} ry={D * 0.36} fill={shade(color, 0.15)} {...st(sw, color)} />
        </>
    ),

    counter: ({ W, D, color, sw, entry }) => {
        const top = entry.variant === "island" ? "#E9E6E1" : "#DAD6CF";
        return (
            <>
                <R x={-W / 2} y={-D / 2} w={W} h={D} r={1} fill={top} {...st(sw, "#A8A39A")} />
                <Line
                    x1={-W / 2}
                    y1={D / 2 - 1.6}
                    x2={W / 2}
                    y2={D / 2 - 1.6}
                    stroke={color}
                    strokeWidth={sw * 2}
                />
                {entry.variant === "island" && (
                    <Line x1={-W / 2} y1={-D / 2 + 1.6} x2={W / 2} y2={-D / 2 + 1.6} stroke={color} strokeWidth={sw * 2} />
                )}
            </>
        );
    },

    sink: ({ W, D, color, sw, entry }) => (
        <>
            {GLYPHS.counter({ W, D, color, sw, entry })}
            <R x={-W * 0.36} y={-D * 0.28} w={W * 0.72} h={D * 0.6} r={3} fill="#C3C8CE" stroke="#7D848C" strokeWidth={sw * 0.8} />
            <Line x1={0} y1={-D * 0.28} x2={0} y2={D * 0.32} stroke="#7D848C" strokeWidth={sw * 0.5} />
            <Circle cx={0} cy={-D * 0.38} r={Math.min(W, D) * 0.05} fill="#8A9097" />
        </>
    ),

    stove: ({ W, D, color, sw }) => {
        const r = Math.min(W, D) * 0.15;
        const pts = [
            [-W * 0.23, -D * 0.2],
            [W * 0.23, -D * 0.2],
            [-W * 0.23, D * 0.18],
            [W * 0.23, D * 0.18],
        ];
        return (
            <>
                <R x={-W / 2} y={-D / 2} w={W} h={D} r={1} fill={color} {...st(sw, color)} />
                <R x={-W / 2 + 1} y={-D / 2 + 1} w={W - 2} h={D - 2} r={1} fill="#26292D" />
                {pts.map(([x, y], i) => (
                    <G key={i}>
                        <Circle cx={x} cy={y} r={r} fill="none" stroke="#8A9097" strokeWidth={sw} />
                        <Circle cx={x} cy={y} r={r * 0.45} fill="none" stroke="#6B7076" strokeWidth={sw * 0.7} />
                    </G>
                ))}
            </>
        );
    },

    fridge: ({ W, D, color, sw }) => (
        <>
            <R x={-W / 2} y={-D / 2} w={W} h={D} r={1.5} fill={color} {...st(sw, color)} />
            <Line x1={0} y1={-D / 2 + 1} x2={0} y2={D / 2} stroke={shade(color, -0.35)} strokeWidth={sw * 0.8} />
            <Line x1={-W / 2} y1={D / 2 - 2} x2={W / 2} y2={D / 2 - 2} stroke={shade(color, -0.3)} strokeWidth={sw * 0.6} />
            <Line x1={-W * 0.08} y1={D / 2 + 0.8} x2={-W * 0.02} y2={D / 2 + 0.8} stroke={OUTLINE} strokeWidth={sw * 1.4} strokeLinecap="round" />
            <Line x1={W * 0.02} y1={D / 2 + 0.8} x2={W * 0.08} y2={D / 2 + 0.8} stroke={OUTLINE} strokeWidth={sw * 1.4} strokeLinecap="round" />
        </>
    ),

    dishwasher: ({ W, D, color, sw }) => (
        <>
            <R x={-W / 2} y={-D / 2} w={W} h={D} r={1} fill="#DAD6CF" {...st(sw, "#A8A39A")} />
            <R x={-W / 2 + 1} y={D / 2 - 2.4} w={W - 2} h={2.4} r={0.5} fill={color} />
            <Line x1={-W * 0.3} y1={D / 2 + 0.8} x2={W * 0.3} y2={D / 2 + 0.8} stroke={OUTLINE} strokeWidth={sw * 1.2} strokeLinecap="round" />
            <Path d={`M${-W * 0.3},${-D * 0.3} L${W * 0.3},${D * 0.2} M${W * 0.3},${-D * 0.3} L${-W * 0.3},${D * 0.2}`} stroke="#B9B4AB" strokeWidth={sw * 0.5} />
        </>
    ),

    toilet: ({ W, D, color, sw }) => {
        const tankD = D * 0.28;
        return (
            <>
                <R x={-W / 2} y={-D / 2} w={W} h={tankD} r={1.5} fill={color} {...st(sw, "#9AA1A9")} />
                <Ellipse cx={0} cy={-D / 2 + tankD + (D - tankD) * 0.5} rx={W * 0.42} ry={(D - tankD) * 0.5} fill={color} {...st(sw, "#9AA1A9")} />
                <Ellipse cx={0} cy={-D / 2 + tankD + (D - tankD) * 0.52} rx={W * 0.26} ry={(D - tankD) * 0.32} fill="#DDE8EE" stroke="#9AA1A9" strokeWidth={sw * 0.6} />
            </>
        );
    },

    bathtub: ({ W, D, color, sw }) => {
        const rim = Math.min(W, D) * 0.12;
        return (
            <>
                <R x={-W / 2} y={-D / 2} w={W} h={D} r={3} fill={color} {...st(sw, "#9AA1A9")} />
                <R x={-W / 2 + rim} y={-D / 2 + rim} w={W - rim * 2} h={D - rim * 2} r={Math.min(W, D) * 0.3} fill="#D6E7F0" stroke="#9AA1A9" strokeWidth={sw * 0.7} />
                <Circle cx={-W / 2 + rim * 2.2} cy={0} r={Math.min(W, D) * 0.04} fill="#8A9097" />
                <Circle cx={-W / 2 + rim * 0.5} cy={0} r={Math.min(W, D) * 0.05} fill="#8A9097" />
            </>
        );
    },

    shower: ({ W, D, color, sw }) => (
        <>
            <R x={-W / 2} y={-D / 2} w={W} h={D} r={1} fill={color} {...st(sw, "#9AA1A9")} />
            <Line x1={-W / 2} y1={-D / 2} x2={W / 2} y2={D / 2} stroke="#9AA1A9" strokeWidth={sw * 0.6} />
            <Line x1={W / 2} y1={-D / 2} x2={-W / 2} y2={D / 2} stroke="#9AA1A9" strokeWidth={sw * 0.6} />
            <Circle cx={0} cy={0} r={Math.min(W, D) * 0.06} fill="#FFFFFF" stroke="#7D848C" strokeWidth={sw * 0.6} />
            <Line x1={-W / 2} y1={D / 2} x2={W / 2} y2={D / 2} stroke="#7FB6D4" strokeWidth={sw * 2} />
            <Circle cx={0} cy={-D / 2 + 2.5} r={Math.min(W, D) * 0.07} fill="#B8BEC5" />
        </>
    ),

    vanity: ({ W, D, color, sw }) => (
        <>
            <R x={-W / 2} y={-D / 2} w={W} h={D} r={1} fill="#EEEBE6" {...st(sw, "#A8A39A")} />
            <Line x1={-W / 2} y1={D / 2 - 1.4} x2={W / 2} y2={D / 2 - 1.4} stroke={color} strokeWidth={sw * 2} />
            <Ellipse cx={0} cy={D * 0.04} rx={W * 0.26} ry={D * 0.28} fill="#FFFFFF" stroke="#9AA1A9" strokeWidth={sw * 0.8} />
            <Circle cx={0} cy={-D * 0.36} r={Math.min(W, D) * 0.05} fill="#8A9097" />
        </>
    ),

    washer: ({ W, D, color, sw }) => (
        <>
            <R x={-W / 2} y={-D / 2} w={W} h={D} r={2} fill={color} {...st(sw, "#9AA1A9")} />
            <Circle cx={0} cy={D * 0.04} r={Math.min(W, D) * 0.32} fill="#DCE3E8" stroke="#8A9097" strokeWidth={sw} />
            <Line x1={-W / 2 + 1} y1={-D * 0.36} x2={W / 2 - 1} y2={-D * 0.36} stroke="#9AA1A9" strokeWidth={sw * 0.6} />
        </>
    ),

    desk: ({ W, D, color, sw, entry }) => (
        <>
            <R x={-W / 2} y={-D / 2} w={W} h={D} r={1.5} fill={color} {...st(sw, color)} />
            {entry.variant === "vanity" ? (
                <R x={-W * 0.3} y={-D / 2 + 0.5} w={W * 0.6} h={1.2} r={0.5} fill="#BFD6E2" stroke="#8A9097" strokeWidth={sw * 0.5} />
            ) : (
                <>
                    <R x={-W * 0.18} y={-D * 0.32} w={W * 0.36} h={Math.max(1, D * 0.06)} r={0.4} fill="#26292D" />
                    <R x={-W * 0.04} y={-D * 0.26} w={W * 0.08} h={D * 0.08} fill="#4A4F57" />
                    <R x={-W * 0.15} y={D * 0.05} w={W * 0.3} h={D * 0.14} r={0.6} fill="#E6E8EB" stroke="#8A9097" strokeWidth={sw * 0.5} />
                </>
            )}
        </>
    ),

    officeChair: ({ W, D, color, sw }) => {
        const spokes = [];
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            spokes.push(
                <Line
                    key={i}
                    x1={0}
                    y1={0}
                    x2={(Math.cos(a) * W) / 2}
                    y2={(Math.sin(a) * D) / 2}
                    stroke="#55595F"
                    strokeWidth={sw * 1.4}
                    strokeLinecap="round"
                />
            );
        }
        return (
            <>
                {spokes}
                <R x={-W * 0.32} y={-D * 0.26} w={W * 0.64} h={D * 0.62} r={W * 0.16} fill={shade(color, 0.15)} {...st(sw, color)} />
                <Path
                    d={`M${-W * 0.36},${-D * 0.28} Q0,${-D * 0.5} ${W * 0.36},${-D * 0.28}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={sw * 3}
                    strokeLinecap="round"
                />
            </>
        );
    },

    treadmill: ({ W, D, color, sw }) => (
        <>
            <R x={-W / 2} y={-D / 2} w={W} h={D} r={3} fill={color} {...st(sw, "#555")} />
            <R x={-W * 0.36} y={-D * 0.3} w={W * 0.72} h={D * 0.76} r={1.5} fill="#4A4F57" />
            <R x={-W / 2} y={-D / 2} w={W} h={D * 0.12} r={2} fill="#3B3F45" />
        </>
    ),

    lounger: ({ W, D, color, sw }) => {
        const slats = [];
        for (let i = 1; i < 6; i++) {
            const y = -D / 2 + (D * 0.3 * i) / 6;
            slats.push(<Line key={i} x1={-W / 2 + 1.5} y1={y} x2={W / 2 - 1.5} y2={y} stroke={shade(color, -0.25)} strokeWidth={sw * 0.6} />);
        }
        return (
            <>
                <R x={-W / 2} y={-D / 2} w={W} h={D} r={2.5} fill={shade(color, -0.2)} {...st(sw, color)} />
                <R x={-W / 2 + 1} y={-D / 2 + 1} w={W - 2} h={D - 2} r={2} fill={color} />
                {slats}
                <Line x1={-W / 2 + 1} y1={-D / 2 + D * 0.32} x2={W / 2 - 1} y2={-D / 2 + D * 0.32} stroke={shade(color, -0.35)} strokeWidth={sw} />
            </>
        );
    },

    grill: ({ W, D, color, sw }) => {
        const grate = [];
        for (let i = 1; i < 7; i++) {
            const x = -W * 0.28 + (W * 0.56 * i) / 7;
            grate.push(<Line key={i} x1={x} y1={-D * 0.35} x2={x} y2={D * 0.35} stroke="#8A9097" strokeWidth={sw * 0.5} />);
        }
        return (
            <>
                <R x={-W / 2} y={-D * 0.4} w={W} h={D * 0.8} r={1} fill="#8A9097" {...st(sw, "#555")} />
                <R x={-W * 0.3} y={-D / 2} w={W * 0.6} h={D} r={3} fill={color} {...st(sw, "#555")} />
                {grate}
            </>
        );
    },

    mirror: ({ W, D, color, sw }) => (
        <>
            <R x={-W / 2} y={-D / 2} w={W} h={D} r={0.6} fill={color} {...st(sw, color)} />
            <Line x1={-W / 2 + 1} y1={D / 2 - 0.4} x2={W / 2 - 1} y2={D / 2 - 0.4} stroke="#CFE3EE" strokeWidth={sw * 1.4} />
        </>
    ),
};
