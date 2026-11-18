import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Linking,
    Pressable,
    Share,
    StyleSheet,
    Text,
    View,
} from "react-native";
import * as StoreReview from "expo-store-review";
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import Svg, {
    Circle,
    ClipPath,
    Defs,
    G,
    Image as SvgImage,
    Line,
    Path,
    Polygon,
    Rect,
    Text as SvgText,
} from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { PromptModal } from "../../components/PromptModal";
import { GapWarningBanner } from "../../components/GapWarningBanner";
import { StatsSheet } from "../../components/StatsSheet";
import { WallSizeSheet } from "../../components/WallSizeSheet";
import { FurnitureGlyph } from "../../components/FurnitureGlyph";
import { FurnitureSheet } from "../../components/FurnitureSheet";
import { FurnitureEditSheet } from "../../components/FurnitureEditSheet";
import {
    catalogEntry,
    cloneFurniture,
    createFurniture,
    footprintPx,
    furnitureLayer,
    hitTestFurniture,
    normDeg,
    pointInFurniture,
    PX_PER_IN,
    sortForDrawing,
    toContent as furnitureToContent,
    toLocal as furnitureToLocal,
} from "../../utils/furnitureCatalog";
import { formatLength } from "../../utils/units";
import { clashMessage, computeClashes } from "../../utils/furnitureClash";
import { usePinchPanZoom } from "../../hooks/usePinchPanZoom";
import { useUnits } from "../../context/UnitsContext";
import {
    chainRoom,
    collectEndpoints,
    findCornerGroup,
    hitTestWall,
    openEndpoints,
    projectOntoSegment,
    roomOutline,
    snapPoint,
    wallsHaveGap,
} from "../../utils/roomGeometry";
import { buildPlanHtml, buildShareText, computeStats } from "../../utils/planStats";
import { useAuth } from "../../context/AuthContext";
import { renameDesign, saveDesign, updateDesign } from "../../utils/designs";
import { useEntitlements } from "../../context/EntitlementsContext";
import { FloorSheet } from "../../components/FloorSheet";
import { defaultFloorName, floorsFromParams, makeFloor, outerWallsOf } from "../../utils/floors";
import { report } from "../../utils/report";
import { colors, radius } from "../../utils/theme";

const WALL_COLOR = "#4C7CA8";
const SELECTED_COLOR = colors.info;
const GAP_HIGHLIGHT = "#EF4444"; // red marker for the loose wall ends causing a gap
const WALL_WIDTH = 9;
const HIT_RADIUS = 24; // screen-space tap tolerance for selecting a wall
const HANDLE_RADIUS = 26; // screen-space tap tolerance for grabbing a wall endpoint / opening
const SNAP_RADIUS = 26; // screen-space snap tolerance while dragging an endpoint
const MIN_SPLIT_DIST = 14; // screen-space minimum distance from either end when splitting a wall
const MENU_WIDTH = 280;
const MENU_HEIGHT = 74;
const ADD_MENU_WIDTH = 200;
const ADD_MENU_ITEM_HEIGHT = 52;
const PIXELS_PER_FOOT = 26; // assumed drawing scale (no calibration step exists yet)
const TAP_MOVE_THRESHOLD = 8; // screen-space movement below which a handle press counts as a tap, not a drag
const MIN_OPENING_WIDTH = 18; // content-space minimum width when resizing a window/door
const OPENING_END_MARGIN = 6; // screen-space keep-away from the wall's own ends when resizing
const OPENING_MENU_WIDTH = 336;
const FURNITURE_MENU_WIDTH = 320;
const ROTATE_HANDLE_GAP = 40; // screen-space distance of the rotate knob behind a selected piece
const RESIZE_HANDLE_SIZE = 10; // screen-space side of a resize handle square
const RESIZE_HANDLE_HIT = 18; // screen-space grab radius of a resize handle
const RESIZE_HANDLE_HIT_INSIDE = 9; // tighter radius when the touch is inside the piece (so small pieces stay movable)
const MIN_FURNITURE_IN = 4; // smallest width/depth a piece can be dragged down to
// Resize handles on the selected outline: corners resize both ways, edge
// midpoints one way. (hx, hy) is the side in the piece's local frame.
const RESIZE_HANDLES = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
];
// Pieces whose width and depth stay equal when resized (matches the edit sheet).
const ROUND_SHAPES = new Set(["roundTable", "roundRug", "stool"]);
const ROTATE_SNAP_DEG = 15; // rotation snaps to multiples of this when within ROTATE_SNAP_TOL
const ROTATE_SNAP_TOL = 5;
const FURNITURE_COLOR = "#7C5CFA"; // selection outline for furniture

const OPENING_DEFAULTS = {
    window: { width: 46 },
    door: { width: 40, hinge: "a", flip: false },
    opening: { width: 40 },
};

// Cycle order for the door "Rotate" action — covers all 4 hinge/swing combos.
const DOOR_ROTATE_CYCLE = [
    { hinge: "a", flip: false },
    { hinge: "a", flip: true },
    { hinge: "b", flip: true },
    { hinge: "b", flip: false },
];

const ADD_ACTIONS = [
    { key: "split", icon: "swap-horizontal-outline", label: "Split wall" },
    { key: "window", icon: "browsers-outline", label: "Add Window" },
    { key: "door", icon: "exit-outline", label: "Add Door" },
    { key: "opening", icon: "scan-outline", label: "Add Opening" },
];
const ADD_MENU_HEIGHT = ADD_ACTIONS.length * ADD_MENU_ITEM_HEIGHT + 16;

const WINDOW_ACTIONS = [
    { key: "size", icon: "resize-outline", label: "Size" },
    { key: "copy", icon: "copy-outline", label: "Copy" },
    { key: "delete", icon: "trash-outline", label: "Delete" },
];
const DOOR_ACTIONS = [
    { key: "size", icon: "resize-outline", label: "Size" },
    { key: "copy", icon: "copy-outline", label: "Copy" },
    { key: "rotate", icon: "reload-outline", label: "Rotate" },
    { key: "flip", icon: "swap-horizontal-outline", label: "Flip" },
    { key: "delete", icon: "trash-outline", label: "Delete" },
];

const FURNITURE_ACTIONS = [
    { key: "rotate", icon: "reload-outline", label: "Rotate" },
    { key: "edit", icon: "options-outline", label: "Edit" },
    { key: "copy", icon: "copy-outline", label: "Copy" },
    { key: "delete", icon: "trash-outline", label: "Delete" },
];

// Header "•••" overflow menu (Profile Settings intentionally omitted).
const MORE_ACTIONS = [
    { key: "measure", lib: "mci", icon: "ruler", label: "Measure with a ruler" },
    { key: "help", lib: "ion", icon: "help-circle-outline", label: "Help and Feedback" },
    { key: "love", lib: "ion", icon: "heart-outline", label: "I Love It!" },
    { key: "upgrade", lib: "mci", icon: "crown-outline", label: "Upgrade to PRO+" },
];

const SHARE_ACTIONS = [
    { key: "share", icon: "share-outline", label: "Share" },
    { key: "copy", icon: "copy-outline", label: "Save a Copy" },
    { key: "image", icon: "image-outline", label: "Image" },
    { key: "stats", icon: "stats-chart-outline", label: "Stats" },
    { key: "pdf", icon: "document-text-outline", label: "PDF" },
];

// Deterministic RNG so the floor pattern is stable across renders.
const mulberry32 = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const PLANK_COLORS = ["#D9C09F", "#D3B893", "#DEC7A8", "#CFB28C", "#E2CCAF"];
const ROW_H = 14;

// Generate wood planks covering a bounding box (to be clipped to the room).
const buildPlanks = (bbox) => {
    const rng = mulberry32(1993);
    const planks = [];
    for (let y = bbox.minY; y < bbox.maxY; y += ROW_H) {
        let x = bbox.minX - rng() * 60;
        while (x < bbox.maxX) {
            const w = 55 + rng() * 70;
            planks.push({
                x,
                y,
                w: w - 1.2,
                h: ROW_H - 1.2,
                color: PLANK_COLORS[Math.floor(rng() * PLANK_COLORS.length)],
            });
            x += w;
        }
    }
    return planks;
};

// The two end points of an opening (window or door) along its wall, plus the
// wall's unit direction/normal — shared by window-tick and door-swing glyphs.
const openingSpan = (w, op) => {
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const cx = w.x1 + dx * op.t;
    const cy = w.y1 + dy * op.t;
    const hx = ux * (op.width / 2);
    const hy = uy * (op.width / 2);
    return {
        len,
        nx: -uy,
        ny: ux,
        a: { x: cx - hx, y: cy - hy },
        b: { x: cx + hx, y: cy + hy },
    };
};

// Door swing geometry: which end is the hinge, where the leaf sits when
// closed (flat in the gap) vs. open (rotated 90° into the room).
const doorSwing = (w, door) => {
    const { a, b } = openingSpan(w, door);
    const hinge = door.hinge === "a" ? a : b;
    const closedTip = door.hinge === "a" ? b : a;
    const cvx = closedTip.x - hinge.x;
    const cvy = closedTip.y - hinge.y;
    const ovx = door.flip ? cvy : -cvy;
    const ovy = door.flip ? -cvx : cvx;
    return {
        hinge,
        closedTip,
        openTip: { x: hinge.x + ovx, y: hinge.y + ovy },
        sweep: door.flip ? 1 : 0,
    };
};

// Read-only preview of the traced room: wood floor fill, blue walls with
// corner knobs, over the faded source photo.
export const PlanPreviewScreen = ({ navigation, route }) => {
    const imageUri = route.params?.imageUri;
    const { user } = useAuth();
    const [walls, setWalls] = useState(route.params?.walls ?? []);
    // When opened from an existing saved design, re-saving updates it in place.
    const [savedId, setSavedId] = useState(route.params?.designId ?? null);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState(route.params?.designName || "Untitled plan");
    const [canvas, setCanvas] = useState({ w: 0, h: 0 });
    const [selectedWall, setSelectedWall] = useState(null);
    const [sizeSheetVisible, setSizeSheetVisible] = useState(false);
    const [renameVisible, setRenameVisible] = useState(false);
    const [addMenuVisible, setAddMenuVisible] = useState(false);
    const [splitMode, setSplitMode] = useState(false);
    const [addOpeningKind, setAddOpeningKind] = useState(null); // null | "window" | "door"
    const [selectedOpening, setSelectedOpening] = useState(null); // { wallIndex, openingIndex } | null
    const [resizingOpening, setResizingOpening] = useState(null); // { wallIndex, openingIndex } | null
    const [moreMenuVisible, setMoreMenuVisible] = useState(false);
    const [shareMenuVisible, setShareMenuVisible] = useState(false);
    const [statsVisible, setStatsVisible] = useState(false);
    // Placed furniture: { id, type, x, y, rot, w, d, h, elev, color } — see
    // utils/furnitureCatalog.js. Positions share the walls' content space.
    const [furniture, setFurniture] = useState(route.params?.furniture ?? []);
    const [selectedFurniture, setSelectedFurniture] = useState(null); // piece id | null
    const [furnitureSheetVisible, setFurnitureSheetVisible] = useState(false);
    const [furnitureEditVisible, setFurnitureEditVisible] = useState(false);
    const [clashWarningVisible, setClashWarningVisible] = useState(false);
    const { units } = useUnits();
    const { pro } = useEntitlements();
    // Multi-floor: `floors` holds every floor; the one being edited lives in
    // the `walls`/`furniture` state above (its entry in `floors` is synced on
    // floor switch / save / navigation via syncedFloors()).
    const [floors, setFloors] = useState(() => floorsFromParams(route.params));
    const [floorIndex, setFloorIndex] = useState(() =>
        Math.min(route.params?.floorIndex ?? 0, floorsFromParams(route.params).length - 1)
    );
    const [floorSheetVisible, setFloorSheetVisible] = useState(false);
    const [renamingFloor, setRenamingFloor] = useState(null); // floor index | null
    const svgRef = useRef(null);

    // Undo/redo history for wall + furniture edits. `wallsRef`/`furnitureRef`
    // always hold the latest committed state so snapshots taken inside event
    // handlers are current. History entries are { walls, furniture }.
    const wallsRef = useRef(walls);
    wallsRef.current = walls;
    const furnitureRef = useRef(furniture);
    furnitureRef.current = furniture;
    const undoStack = useRef([]);
    const redoStack = useRef([]);
    const pendingSnapRef = useRef(null); // pre-drag state, committed only if the drag actually edits
    const [, forceHist] = useState(0);
    const bumpHist = () => forceHist((n) => n + 1);

    // Record a walls state as an undo point, discarding any redo history (a new
    // edit forks the timeline).
    const pushUndo = (state) => {
        undoStack.current.push(state);
        if (undoStack.current.length > 50) undoStack.current.shift();
        redoStack.current = [];
        bumpHist();
    };

    const currentState = () => ({
        walls: wallsRef.current,
        furniture: furnitureRef.current,
    });
    const restoreState = (st) => {
        wallsRef.current = st.walls;
        furnitureRef.current = st.furniture;
        setWalls(st.walls);
        setFurniture(st.furniture);
    };

    // Snapshot the current state before a discrete (non-drag) mutation.
    const snapshot = () => pushUndo(currentState());

    const clearSelectionState = () => {
        setSelectedWall(null);
        setSelectedOpening(null);
        setResizingOpening(null);
        setAddMenuVisible(false);
        setSplitMode(false);
        setAddOpeningKind(null);
        setSelectedFurniture(null);
        setFurnitureEditVisible(false);
    };

    const undo = () => {
        if (undoStack.current.length === 0) return;
        redoStack.current.push(currentState());
        restoreState(undoStack.current.pop());
        clearSelectionState();
        bumpHist();
    };

    const redo = () => {
        if (redoStack.current.length === 0) return;
        undoStack.current.push(currentState());
        restoreState(redoStack.current.pop());
        clearSelectionState();
        bumpHist();
    };

    const canUndo = undoStack.current.length > 0;
    const canRedo = redoStack.current.length > 0;

    // Capture the on-screen plan canvas to a base64 PNG (no data: prefix).
    const capturePng = () =>
        new Promise((resolve) => {
            if (!svgRef.current?.toDataURL) return resolve(null);
            svgRef.current.toDataURL((data) => resolve(data));
        });

    const shareStats = () => computeStats(walls, PIXELS_PER_FOOT);

    const handleShareAction = async (key) => {
        setShareMenuVisible(false);
        try {
            if (key === "stats") {
                setStatsVisible(true);
                return;
            }
            if (key === "share") {
                await Share.share({ message: buildShareText(shareStats(), units) });
                return;
            }
            if (key === "image") {
                const png = await capturePng();
                if (!png) return Alert.alert("Image", "Could not capture the plan.");
                const file = new File(Paths.cache, `floorplan-${Date.now()}.png`);
                file.create();
                file.write(png, { encoding: "base64" });
                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(file.uri, {
                        mimeType: "image/png",
                        UTI: "public.png",
                        dialogTitle: "Share floor plan image",
                    });
                }
                return;
            }
            if (key === "pdf") {
                const png = await capturePng();
                const html = buildPlanHtml(shareStats(), units, png);
                const { uri } = await Print.printToFileAsync({ html });
                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(uri, {
                        mimeType: "application/pdf",
                        UTI: "com.adobe.pdf",
                        dialogTitle: "Share floor plan PDF",
                    });
                }
                return;
            }
            if (key === "copy") {
                const file = new File(Paths.document, `floorplan-copy-${Date.now()}.json`);
                file.create();
                file.write(
                    JSON.stringify(
                        {
                            walls,
                            furniture,
                            floors: syncedFloors(),
                            savedAt: new Date().toISOString(),
                        },
                        null,
                        2
                    )
                );
                Alert.alert("Saved a Copy", "A copy of this plan was saved to your device.");
                return;
            }
        } catch (e) {
            report(e, { feature: "share", action: key });
            Alert.alert("Something went wrong", String(e?.message ?? e));
        }
    };

    // While armed, the next tap adds a new node at the point pressed along
    // the selected wall, splitting it into two walls joined there.
    const performSplit = (contentPoint) => {
        setSplitMode(false);
        setSelectedOpening(null);
        setResizingOpening(null);
        if (selectedWall === null) return;
        const w = walls[selectedWall];
        const hit = hitTestWall([w], contentPoint, HIT_RADIUS / transform.s);
        if (hit === null) return; // tapped too far from the wall — cancel

        const a = { x: w.x1, y: w.y1 };
        const b = { x: w.x2, y: w.y2 };
        const mid = projectOntoSegment(contentPoint, a, b);
        const minDist = MIN_SPLIT_DIST / transform.s;
        if (Math.hypot(mid.x - a.x, mid.y - a.y) < minDist) return;
        if (Math.hypot(mid.x - b.x, mid.y - b.y) < minDist) return;

        snapshot();
        setWalls((ws) => {
            const next = [...ws];
            next.splice(
                selectedWall,
                1,
                { x1: a.x, y1: a.y, x2: mid.x, y2: mid.y },
                { x1: mid.x, y1: mid.y, x2: b.x, y2: b.y }
            );
            return next;
        });
        setSelectedWall(null);
    };

    // While armed, the next tap places a window or door on the selected wall
    // at the point pressed, clamped so it never overlaps either wall end.
    const performAddOpening = (kind, contentPoint) => {
        setAddOpeningKind(null);
        if (selectedWall === null) return;
        const w = walls[selectedWall];
        const hit = hitTestWall([w], contentPoint, HIT_RADIUS / transform.s);
        if (hit === null) return; // tapped too far from the wall — cancel

        const defaults = OPENING_DEFAULTS[kind];
        const dx = w.x2 - w.x1;
        const dy = w.y2 - w.y1;
        const lenSq = dx * dx + dy * dy;
        const len = Math.sqrt(lenSq);
        const halfFrac = defaults.width / 2 / len;
        if (halfFrac >= 0.5) return; // wall too short to fit this opening

        let t = ((contentPoint.x - w.x1) * dx + (contentPoint.y - w.y1) * dy) / lenSq;
        t = Math.max(halfFrac, Math.min(1 - halfFrac, t));

        snapshot();
        setWalls((ws) =>
            ws.map((ww, i) =>
                i !== selectedWall
                    ? ww
                    : {
                          ...ww,
                          openings: [...(ww.openings ?? []), { kind, t, ...defaults }],
                      }
            )
        );
    };

    const handleTap = (contentPoint) => {
        if (splitMode) {
            performSplit(contentPoint);
            return;
        }
        if (addOpeningKind) {
            performAddOpening(addOpeningKind, contentPoint);
            return;
        }
        if (resizingOpening) {
            setResizingOpening(null);
            return;
        }
        const hit = hitTestWall(walls, contentPoint, HIT_RADIUS / transform.s);
        // A tap that misses every wall may land on a rug (rugs aren't grabbed
        // by hitTestHandle until selected).
        const rug =
            hit === null ? hitTestFurniture(furniture, contentPoint, 2 / transform.s) : null;
        setSelectedWall(hit);
        setSelectedOpening(null);
        setSelectedFurniture(rug ? rug.id : null);
        setAddMenuVisible(false);
        setMoreMenuVisible(false);
    };

    const selectedPiece = selectedFurniture
        ? furniture.find((f) => f.id === selectedFurniture) ?? null
        : null;

    // Content-space position of a piece's rotate knob: a constant screen
    // distance behind its back edge, so it stays grabbable at any zoom.
    // Content-space position of a resize handle on a piece's outline.
    const resizeHandlePos = (f, hx, hy) => {
        const { w, d } = footprintPx(f);
        return furnitureToContent(f, { x: (hx * w) / 2, y: (hy * d) / 2 });
    };

    const rotateKnobPos = (f) => {
        const { d } = footprintPx(f);
        return furnitureToContent(f, { x: 0, y: -d / 2 - ROTATE_HANDLE_GAP / transform.s });
    };

    // Any window/door is directly grabbable/tappable regardless of whether
    // its wall happens to be selected yet — checked before wall selection
    // state, so a single tap on an opening always hits it (rather than first
    // requiring the wall to be selected). Falls back to the selected wall's
    // own endpoint handles for corner-dragging. Both are disabled during
    // split/add-opening mode so a tap near a handle can't be hijacked into a
    // drag instead of registering as the point being placed.
    const hitTestHandle = (contentPoint) => {
        if (splitMode || addOpeningKind) return null;
        const r = HANDLE_RADIUS / transform.s;

        // While resizing, only that opening's two end-handles are grabbable —
        // a tap anywhere else falls through to onTap, which exits the mode.
        if (resizingOpening) {
            const w = walls[resizingOpening.wallIndex];
            const op = w?.openings?.[resizingOpening.openingIndex];
            if (!w || !op) return null;
            const { a, b } = openingSpan(w, op);
            if (Math.hypot(contentPoint.x - a.x, contentPoint.y - a.y) <= r) {
                return { kind: "openingEnd", ...resizingOpening, end: "a" };
            }
            if (Math.hypot(contentPoint.x - b.x, contentPoint.y - b.y) <= r) {
                return { kind: "openingEnd", ...resizingOpening, end: "b" };
            }
            return null;
        }

        // The selected piece's rotate knob, then the piece itself (so a piece
        // sitting on a rug stays grabbable once selected).
        if (selectedPiece) {
            const knob = rotateKnobPos(selectedPiece);
            if (Math.hypot(contentPoint.x - knob.x, contentPoint.y - knob.y) <= r) {
                return { kind: "furnitureRotate", id: selectedPiece.id };
            }
            // Resize handles: the nearest one within reach. A touch inside the
            // piece needs to be right on a handle, so small pieces can still
            // be dragged around by their body.
            const inside = pointInFurniture(selectedPiece, contentPoint, -4 / transform.s);
            const reach =
                (inside ? RESIZE_HANDLE_HIT_INSIDE : RESIZE_HANDLE_HIT) / transform.s;
            let best = null;
            for (const [hx, hy] of RESIZE_HANDLES) {
                const hp = resizeHandlePos(selectedPiece, hx, hy);
                const dist = Math.hypot(contentPoint.x - hp.x, contentPoint.y - hp.y);
                if (dist <= reach && (!best || dist < best.dist)) best = { hx, hy, dist };
            }
            if (best) {
                return {
                    kind: "furnitureResize",
                    id: selectedPiece.id,
                    hx: best.hx,
                    hy: best.hy,
                    start: { ...selectedPiece },
                };
            }
            if (pointInFurniture(selectedPiece, contentPoint, 2 / transform.s)) {
                return {
                    kind: "furniture",
                    id: selectedPiece.id,
                    offset: {
                        x: selectedPiece.x - contentPoint.x,
                        y: selectedPiece.y - contentPoint.y,
                    },
                };
            }
        }

        for (let wi = 0; wi < walls.length; wi++) {
            const w = walls[wi];
            if (!w.openings) continue;
            for (let i = 0; i < w.openings.length; i++) {
                const op = w.openings[i];
                const cx = w.x1 + (w.x2 - w.x1) * op.t;
                const cy = w.y1 + (w.y2 - w.y1) * op.t;
                if (Math.hypot(contentPoint.x - cx, contentPoint.y - cy) <= r) {
                    return { kind: "opening", wallIndex: wi, openingIndex: i };
                }
            }
        }

        const w = selectedWall !== null ? walls[selectedWall] : null;
        if (w) {
            let anchor = null;
            if (Math.hypot(contentPoint.x - w.x1, contentPoint.y - w.y1) <= r) {
                anchor = { x: w.x1, y: w.y1 };
            } else if (Math.hypot(contentPoint.x - w.x2, contentPoint.y - w.y2) <= r) {
                anchor = { x: w.x2, y: w.y2 };
            }
            if (anchor) return findCornerGroup(walls, anchor);
        }

        // Any piece of furniture: press-and-drag moves it, a tap selects it.
        // Rugs are skipped until selected so a big rug doesn't swallow
        // one-finger panning (tapping one still selects it, via onTap).
        const piece = hitTestFurniture(
            furniture.filter((f) => furnitureLayer(f) > 0),
            contentPoint,
            2 / transform.s
        );
        if (piece) {
            return {
                kind: "furniture",
                id: piece.id,
                offset: { x: piece.x - contentPoint.x, y: piece.y - contentPoint.y },
            };
        }
        return null;
    };

    const handleDragMove = (target, contentPoint) => {
        if (!target) return;

        if (target.kind === "furniture") {
            setFurniture((fs) =>
                fs.map((f) =>
                    f.id === target.id
                        ? {
                              ...f,
                              x: contentPoint.x + target.offset.x,
                              y: contentPoint.y + target.offset.y,
                          }
                        : f
                )
            );
            return;
        }

        if (target.kind === "furnitureResize") {
            // Work in the piece's local frame as it was when the drag began,
            // keeping the opposite side(s) fixed so it grows where you pull.
            const f0 = target.start;
            const { hx, hy } = target;
            const round = ROUND_SHAPES.has(catalogEntry(f0.type).shape);
            const l = furnitureToLocal(f0, contentPoint);
            const { w: W0, d: D0 } = footprintPx(f0);
            const minPx = MIN_FURNITURE_IN * PX_PER_IN;
            let wIn = f0.w;
            let dIn = f0.d;
            if (hx) wIn = Math.round(Math.max(minPx, hx * l.x + W0 / 2) / PX_PER_IN);
            if (hy) dIn = Math.round(Math.max(minPx, hy * l.y + D0 / 2) / PX_PER_IN);
            if (round) {
                const v = hx && hy ? Math.max(wIn, dIn) : hx ? wIn : dIn;
                wIn = v;
                dIn = v;
            }
            const W = wIn * PX_PER_IN;
            const D = dIn * PX_PER_IN;
            const center = furnitureToContent(f0, {
                x: hx ? (hx * (W - W0)) / 2 : 0,
                y: hy ? (hy * (D - D0)) / 2 : 0,
            });
            setFurniture((fs) =>
                fs.map((f) =>
                    f.id === target.id
                        ? { ...f, w: wIn, d: dIn, x: center.x, y: center.y }
                        : f
                )
            );
            return;
        }

        if (target.kind === "furnitureRotate") {
            setFurniture((fs) =>
                fs.map((f) => {
                    if (f.id !== target.id) return f;
                    // The knob sits on the piece's local -y axis, i.e. at
                    // (rot - 90°) on screen — so the drag angle + 90° is rot.
                    let deg =
                        (Math.atan2(contentPoint.y - f.y, contentPoint.x - f.x) * 180) /
                            Math.PI +
                        90;
                    const snapped = Math.round(deg / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG;
                    deg = Math.abs(deg - snapped) <= ROTATE_SNAP_TOL ? snapped : Math.round(deg);
                    return { ...f, rot: normDeg(deg) };
                })
            );
            return;
        }

        if (target.kind === "openingEnd") {
            setWalls((ws) =>
                ws.map((w, i) => {
                    if (i !== target.wallIndex) return w;
                    const dx = w.x2 - w.x1;
                    const dy = w.y2 - w.y1;
                    const lenSq = dx * dx + dy * dy;
                    const len = Math.sqrt(lenSq);
                    const op = w.openings[target.openingIndex];
                    const halfFrac = op.width / 2 / len;
                    const fixedT =
                        target.end === "a" ? op.t + halfFrac : op.t - halfFrac;

                    let draggedT =
                        ((contentPoint.x - w.x1) * dx + (contentPoint.y - w.y1) * dy) /
                        lenSq;
                    const margin = OPENING_END_MARGIN / transform.s / len;
                    draggedT = Math.max(margin, Math.min(1 - margin, draggedT));
                    const minWidthFrac = MIN_OPENING_WIDTH / len;
                    if (target.end === "a") {
                        draggedT = Math.min(draggedT, fixedT - minWidthFrac);
                    } else {
                        draggedT = Math.max(draggedT, fixedT + minWidthFrac);
                    }

                    const t1 = target.end === "a" ? draggedT : fixedT;
                    const t2 = target.end === "a" ? fixedT : draggedT;
                    const newT = (t1 + t2) / 2;
                    const newWidth = Math.abs(t2 - t1) * len;
                    const openings = w.openings.map((op2, oi) =>
                        oi === target.openingIndex
                            ? { ...op2, t: newT, width: newWidth }
                            : op2
                    );
                    return { ...w, openings };
                })
            );
            return;
        }

        if (target.kind === "opening") {
            const w = walls[target.wallIndex];
            if (!w) return;
            const dx = w.x2 - w.x1;
            const dy = w.y2 - w.y1;
            const lenSq = dx * dx + dy * dy;
            const len = Math.sqrt(lenSq);
            const op = w.openings[target.openingIndex];
            const halfFrac = op.width / 2 / len;
            let t = ((contentPoint.x - w.x1) * dx + (contentPoint.y - w.y1) * dy) / lenSq;
            t = Math.max(halfFrac, Math.min(1 - halfFrac, t));
            setWalls((ws) =>
                ws.map((ww, i) => {
                    if (i !== target.wallIndex) return ww;
                    const openings = ww.openings.map((op2, oi) =>
                        oi === target.openingIndex ? { ...op2, t } : op2
                    );
                    return { ...ww, openings };
                })
            );
            return;
        }

        const group = target;
        if (group.length === 0) return;
        const { point } = snapPoint(
            contentPoint,
            collectEndpoints(walls, group),
            SNAP_RADIUS / transform.s
        );
        setWalls((ws) =>
            ws.map((w, i) => {
                const hitsX1 = group.some((g) => g.index === i && g.end === 1);
                const hitsX2 = group.some((g) => g.index === i && g.end === 2);
                if (!hitsX1 && !hitsX2) return w;
                return {
                    ...w,
                    ...(hitsX1 ? { x1: point.x, y1: point.y } : {}),
                    ...(hitsX2 ? { x2: point.x, y2: point.y } : {}),
                };
            })
        );
    };

    // An opening handle that was pressed but barely moved counts as a tap on
    // it — select it (opening its own context menu) rather than treating the
    // negligible movement as a drag. Also selects its parent wall so it
    // highlights, even if the wall wasn't already selected.
    // Remember the pre-drag state so a genuine drag can be recorded as one undo
    // step (and a tap that merely nudged a handle can be rolled back).
    const handleDragStart = () => {
        pendingSnapRef.current = currentState();
    };

    const handleDragEnd = (target, _contentPoint, gs) => {
        const pre = pendingSnapRef.current;
        pendingSnapRef.current = null;
        const changed =
            pre !== null &&
            (wallsRef.current !== pre.walls || furnitureRef.current !== pre.furniture);
        const isTap = gs && Math.hypot(gs.dx, gs.dy) < TAP_MOVE_THRESHOLD;

        if (changed && !isTap) {
            pushUndo(pre); // genuine drag → one undo point at the pre-drag state
        } else if (changed && isTap) {
            restoreState(pre); // barely-moved handle press → undo the nudge
        }

        // Touching a piece (tap or drag) selects it and shows its menu.
        if (target?.kind === "furniture") {
            setSelectedFurniture(target.id);
            setSelectedWall(null);
            setSelectedOpening(null);
            setResizingOpening(null);
            setAddMenuVisible(false);
            return;
        }

        if (
            target?.kind === "opening" &&
            gs &&
            Math.hypot(gs.dx, gs.dy) < TAP_MOVE_THRESHOLD
        ) {
            setSelectedWall(target.wallIndex);
            setSelectedOpening({
                wallIndex: target.wallIndex,
                openingIndex: target.openingIndex,
            });
            setSelectedFurniture(null);
            setAddMenuVisible(false);
        }
    };

    const { transform, panHandlers, fitTo } = usePinchPanZoom({
        // Allow zooming out far enough to fit large imported/AI plans on screen
        // (a whole-home plan can be ~2000px wide, needing a scale well below the
        // default 0.5 floor).
        minScale: 0.1,
        maxScale: 8,
        onTap: handleTap,
        hitTest: hitTestHandle,
        onDragStart: handleDragStart,
        onDragMove: handleDragMove,
        onDragEnd: handleDragEnd,
    });

    // Fit the whole plan on screen once, after the canvas is measured — so
    // larger (multi-room) plans aren't shown zoomed past the screen edges.
    const fittedRef = useRef(false);
    useEffect(() => {
        if (fittedRef.current || canvas.w === 0 || walls.length === 0) return;
        const xs = walls.flatMap((w) => [w.x1, w.x2]);
        const ys = walls.flatMap((w) => [w.y1, w.y2]);
        fitTo(
            {
                minX: Math.min(...xs),
                maxX: Math.max(...xs),
                minY: Math.min(...ys),
                maxY: Math.max(...ys),
            },
            canvas.w,
            canvas.h
        );
        fittedRef.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvas.w, canvas.h, walls.length]);

    const { polygon } = chainRoom(walls);
    // Gate the 3D switch on whether any wall has a dangling end — this allows
    // interior/divider walls, unlike chainRoom's stricter `closed` flag.
    const hasGap = walls.length > 0 && wallsHaveGap(walls);
    const pointsAttr = polygon.map((p) => `${p.x},${p.y}`).join(" ");
    // The wood floor fills the room's outer boundary — traced robustly so it
    // still works for split-node and interior/divider rooms (where the simple
    // chain tracer would fail). Only drawn when the room is sealed (no gaps).
    const floorPolygon = !hasGap ? roomOutline(walls) : null;
    const floorPoints = floorPolygon
        ? floorPolygon.map((p) => `${p.x},${p.y}`).join(" ")
        : "";
    const [warningVisible, setWarningVisible] = useState(() => hasGap);
    // While warning about a gap, mark the loose wall ends so the user can see
    // exactly where the room is open. Updates live as they drag ends together.
    const gapEnds = warningVisible && hasGap ? openEndpoints(walls) : [];
    // Furniture clashing with other furniture, walls or doors — outlined in
    // red live, and (like a gap) blocks switching to 3D until resolved.
    const clashes = computeClashes(walls, furniture);
    const hasClash = clashes.ids.size > 0;

    const selected = selectedWall !== null ? walls[selectedWall] : null;
    const menuPos =
        selected && canvas.w
            ? (() => {
                  const midX = (selected.x1 + selected.x2) / 2;
                  const midY = (selected.y1 + selected.y2) / 2;
                  const screenX = transform.tx + midX * transform.s;
                  const screenY = transform.ty + midY * transform.s;

                  // Float the menu just above the wall so it doesn't cover
                  // the very line the user is trying to look at — flip below
                  // when there isn't enough room above.
                  const GAP = 16;
                  let top = screenY - MENU_HEIGHT - GAP;
                  if (top < 12) top = screenY + GAP;

                  return {
                      left: Math.max(
                          12,
                          Math.min(screenX - MENU_WIDTH / 2, canvas.w - MENU_WIDTH - 12)
                      ),
                      top: Math.max(12, Math.min(top, canvas.h - MENU_HEIGHT - 12)),
                  };
              })()
            : null;

    const addMenuPos =
        addMenuVisible && menuPos
            ? (() => {
                  let top = menuPos.top + MENU_HEIGHT + 8;
                  if (top + ADD_MENU_HEIGHT > canvas.h - 12) {
                      top = menuPos.top - ADD_MENU_HEIGHT - 8;
                  }
                  return {
                      left: Math.max(
                          12,
                          Math.min(menuPos.left, canvas.w - ADD_MENU_WIDTH - 12)
                      ),
                      top: Math.max(12, top),
                  };
              })()
            : null;

    const selectedOpeningData = selectedOpening
        ? walls[selectedOpening.wallIndex]?.openings?.[selectedOpening.openingIndex]
        : null;
    const selectedOpeningWall = selectedOpening ? walls[selectedOpening.wallIndex] : null;
    const openingActions =
        selectedOpeningData?.kind === "door" ? DOOR_ACTIONS : WINDOW_ACTIONS;

    const openingMenuPos =
        selectedOpeningData && selectedOpeningWall && canvas.w
            ? (() => {
                  const cx =
                      selectedOpeningWall.x1 +
                      (selectedOpeningWall.x2 - selectedOpeningWall.x1) *
                          selectedOpeningData.t;
                  const cy =
                      selectedOpeningWall.y1 +
                      (selectedOpeningWall.y2 - selectedOpeningWall.y1) *
                          selectedOpeningData.t;
                  const screenX = transform.tx + cx * transform.s;
                  const screenY = transform.ty + cy * transform.s;

                  const GAP = 16;
                  let top = screenY - MENU_HEIGHT - GAP;
                  if (top < 12) top = screenY + GAP;

                  return {
                      left: Math.max(
                          12,
                          Math.min(
                              screenX - OPENING_MENU_WIDTH / 2,
                              canvas.w - OPENING_MENU_WIDTH - 12
                          )
                      ),
                      top: Math.max(12, Math.min(top, canvas.h - MENU_HEIGHT - 12)),
                  };
              })()
            : null;

    const deleteSelectedOpening = () => {
        if (!selectedOpening) return;
        snapshot();
        setWalls((ws) =>
            ws.map((w, i) =>
                i !== selectedOpening.wallIndex
                    ? w
                    : {
                          ...w,
                          openings: w.openings.filter(
                              (_, oi) => oi !== selectedOpening.openingIndex
                          ),
                      }
            )
        );
        setSelectedOpening(null);
        setResizingOpening(null);
    };

    const copySelectedOpening = () => {
        if (!selectedOpening) return;
        snapshot();
        setWalls((ws) =>
            ws.map((w, i) => {
                if (i !== selectedOpening.wallIndex) return w;
                const orig = w.openings[selectedOpening.openingIndex];
                const dx = w.x2 - w.x1;
                const dy = w.y2 - w.y1;
                const len = Math.hypot(dx, dy) || 1;
                const halfFrac = orig.width / 2 / len;
                const offsetFrac = (orig.width + 10) / len;

                // Try placing the duplicate on either side of the original;
                // keep only positions that don't overlap it once clamped to
                // the wall's own bounds, and prefer whichever sits closer.
                const candidates = [orig.t + offsetFrac, orig.t - offsetFrac]
                    .map((t) => Math.max(halfFrac, Math.min(1 - halfFrac, t)))
                    .filter((t) => Math.abs(t - orig.t) * len >= orig.width)
                    .sort((a, b) => Math.abs(a - orig.t) - Math.abs(b - orig.t));

                if (candidates.length === 0) return w; // no room for a non-overlapping copy

                return {
                    ...w,
                    openings: [...w.openings, { ...orig, t: candidates[0] }],
                };
            })
        );
        setSelectedOpening(null);
        setResizingOpening(null);
    };

    const rotateSelectedDoor = () => {
        if (!selectedOpening) return;
        snapshot();
        setWalls((ws) =>
            ws.map((w, i) => {
                if (i !== selectedOpening.wallIndex) return w;
                const openings = w.openings.map((op, oi) => {
                    if (oi !== selectedOpening.openingIndex) return op;
                    const idx = DOOR_ROTATE_CYCLE.findIndex(
                        (c) => c.hinge === op.hinge && c.flip === op.flip
                    );
                    const next = DOOR_ROTATE_CYCLE[(idx + 1) % DOOR_ROTATE_CYCLE.length];
                    return { ...op, ...next };
                });
                return { ...w, openings };
            })
        );
    };

    // Mirror the door's swing to the opposite side of the wall.
    const flipSelectedDoor = () => {
        if (!selectedOpening) return;
        snapshot();
        setWalls((ws) =>
            ws.map((w, i) => {
                if (i !== selectedOpening.wallIndex) return w;
                const openings = w.openings.map((op, oi) =>
                    oi === selectedOpening.openingIndex ? { ...op, flip: !op.flip } : op
                );
                return { ...w, openings };
            })
        );
    };

    // --- Furniture -------------------------------------------------------

    // Drop a new piece at the center of what's currently on screen and select it.
    const addFurniture = (type) => {
        setFurnitureSheetVisible(false);
        const cx = canvas.w ? (canvas.w / 2 - transform.tx) / transform.s : 0;
        const cy = canvas.h ? (canvas.h / 2 - transform.ty) / transform.s : 0;
        const piece = createFurniture(type, cx, cy);
        snapshot();
        setFurniture((fs) => [...fs, piece]);
        setSelectedWall(null);
        setSelectedOpening(null);
        setResizingOpening(null);
        setAddMenuVisible(false);
        setSelectedFurniture(piece.id);
    };

    const updateSelectedFurniture = (patch) => {
        if (!selectedFurniture) return;
        snapshot();
        setFurniture((fs) =>
            fs.map((f) => (f.id === selectedFurniture ? { ...f, ...patch } : f))
        );
    };

    const rotateSelectedFurniture = () => {
        if (!selectedPiece) return;
        // Step to the next quarter turn (so an odd angle squares back up).
        const next = (Math.floor(normDeg(selectedPiece.rot || 0) / 90) + 1) * 90;
        updateSelectedFurniture({ rot: normDeg(next) });
    };

    const copySelectedFurniture = () => {
        if (!selectedPiece) return;
        const copy = cloneFurniture(selectedPiece);
        snapshot();
        setFurniture((fs) => [...fs, copy]);
        setSelectedFurniture(copy.id);
    };

    const deleteSelectedFurniture = () => {
        if (!selectedFurniture) return;
        snapshot();
        setFurniture((fs) => fs.filter((f) => f.id !== selectedFurniture));
        setSelectedFurniture(null);
        setFurnitureEditVisible(false);
    };

    const handleFurnitureAction = (key) => {
        if (key === "rotate") rotateSelectedFurniture();
        else if (key === "edit") setFurnitureEditVisible(true);
        else if (key === "copy") copySelectedFurniture();
        else if (key === "delete") deleteSelectedFurniture();
    };

    const furnitureMenuPos =
        selectedPiece && canvas.w
            ? (() => {
                  // Anchor above the piece's topmost on-screen point.
                  const { w, d } = footprintPx(selectedPiece);
                  const corners = [
                      { x: -w / 2, y: -d / 2 },
                      { x: w / 2, y: -d / 2 },
                      { x: w / 2, y: d / 2 },
                      { x: -w / 2, y: d / 2 },
                  ].map((p) => furnitureToContent(selectedPiece, p));
                  const minY = Math.min(...corners.map((p) => p.y));
                  const maxY = Math.max(...corners.map((p) => p.y));
                  const screenX = transform.tx + selectedPiece.x * transform.s;
                  const topY = transform.ty + minY * transform.s;
                  const botY = transform.ty + maxY * transform.s;

                  // Leave room above for the rotate knob; flip below if needed.
                  const GAP = 16 + ROTATE_HANDLE_GAP;
                  let top = topY - MENU_HEIGHT - GAP;
                  if (top < 12) top = botY + 28;

                  return {
                      left: Math.max(
                          12,
                          Math.min(
                              screenX - FURNITURE_MENU_WIDTH / 2,
                              canvas.w - FURNITURE_MENU_WIDTH - 12
                          )
                      ),
                      top: Math.max(12, Math.min(top, canvas.h - MENU_HEIGHT - 12)),
                  };
              })()
            : null;

    const deleteSelectedWall = () => {
        if (selectedWall === null) return;
        snapshot();
        setWalls((ws) => ws.filter((_, i) => i !== selectedWall));
        setSelectedWall(null);
        setSelectedOpening(null);
        setResizingOpening(null);
        setAddMenuVisible(false);
    };

    const applyWallSize = ({ lengthIn, heightIn, thicknessIn }) => {
        if (selectedWall === null) return;
        snapshot();
        setWalls((ws) =>
            ws.map((w, i) => {
                if (i !== selectedWall) return w;
                const dx = w.x2 - w.x1;
                const dy = w.y2 - w.y1;
                const curLen = Math.hypot(dx, dy) || 1;
                const newLenPx = (lengthIn / 12) * PIXELS_PER_FOOT;
                const ux = dx / curLen;
                const uy = dy / curLen;
                return {
                    ...w,
                    x2: w.x1 + ux * newLenPx,
                    y2: w.y1 + uy * newLenPx,
                    heightIn,
                    thicknessIn,
                };
            })
        );
    };

    // --- Floors --------------------------------------------------------

    // Every floor, with the one being edited updated from the live state.
    const syncedFloors = () =>
        floors.map((f, i) =>
            i === floorIndex ? { ...f, walls: wallsRef.current, furniture: furnitureRef.current } : f
        );

    // Make floor `i` the one being edited. Undo history covers one floor at a
    // time, so it's cleared on a switch.
    const loadFloor = (fs, i) => {
        setFloors(fs);
        setFloorIndex(i);
        wallsRef.current = fs[i].walls;
        furnitureRef.current = fs[i].furniture;
        setWalls(fs[i].walls);
        setFurniture(fs[i].furniture);
        clearSelectionState();
        undoStack.current = [];
        redoStack.current = [];
        pendingSnapRef.current = null;
        setWarningVisible(false);
        setClashWarningVisible(false);
        bumpHist();
    };

    const selectFloor = (i) => {
        setFloorSheetVisible(false);
        if (i === floorIndex) return;
        loadFloor(syncedFloors(), i);
    };

    // Adding floors is a PRO feature. A new floor goes on top of the building
    // and starts with the top floor's outer walls (or blank).
    const addFloor = (blank) => {
        if (!pro) {
            setFloorSheetVisible(false);
            navigation.navigate("Paywall");
            return;
        }
        const fs = syncedFloors();
        const top = fs[fs.length - 1];
        const next = makeFloor(fs.length, blank ? [] : outerWallsOf(top.walls), []);
        setFloorSheetVisible(false);
        loadFloor([...fs, next], fs.length);
    };

    const setFloorHeight = (i, heightIn) =>
        setFloors((fs) => fs.map((f, j) => (j === i ? { ...f, heightIn } : f)));

    const applyFloorRename = (text) => {
        const next = (text || "").trim();
        const i = renamingFloor;
        if (i === null || !next) return;
        setFloors((fs) => fs.map((f, j) => (j === i ? { ...f, name: next } : f)));
    };

    const deleteFloor = (i) => {
        if (floors.length <= 1) return;
        Alert.alert(
            "Delete floor",
            `Delete "${floors[i].name}" and everything on it? This can't be undone.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                        // Renumber floors that still carry a default name.
                        const fs = syncedFloors()
                            .filter((_, j) => j !== i)
                            .map((f, j) =>
                                /^(Ground floor|Floor \d+)$/.test(f.name)
                                    ? { ...f, name: defaultFloorName(j) }
                                    : f
                            );
                        setFloorSheetVisible(false);
                        // Stay on the same floor if another was deleted below it,
                        // otherwise land on the floor that took its place.
                        const keep = i < floorIndex ? floorIndex - 1 : i === floorIndex ? Math.min(i, fs.length - 1) : floorIndex;
                        loadFloor(fs, keep);
                    },
                },
            ]
        );
    };

    const floorBelow = floorIndex > 0 ? floors[floorIndex - 1] : null;

    const handleSave = async () => {
        if (!user) {
            Alert.alert("Sign in required", "Please sign in to save your design.");
            return;
        }
        const allFloors = syncedFloors();
        if (allFloors.every((f) => f.walls.length === 0)) {
            Alert.alert("Nothing to save", "Draw some walls first.");
            return;
        }
        // Floor 1 also goes in the legacy top-level fields (thumbnails, older
        // app versions); every floor goes in `floors`.
        const payload = {
            walls: allFloors[0].walls,
            furniture: allFloors[0].furniture,
            floors: allFloors,
            name,
        };
        setSaving(true);
        try {
            if (savedId) {
                await updateDesign(user.uid, savedId, payload);
            } else {
                const id = await saveDesign(user.uid, payload);
                setSavedId(id);
            }
            Alert.alert("Saved", "Your design is in My Designs.");
        } catch (e) {
            report(e, { feature: "save-design" });
            Alert.alert("Couldn't save", e?.message ?? "Please try again.");
        } finally {
            setSaving(false);
        }
    };

    // Show/edit the design title. Renames the saved doc immediately if it exists;
    // otherwise the new name is used the next time you Save.
    const applyRename = async (text) => {
        const next = (text || "").trim();
        if (!next || next === name) return;
        setName(next);
        if (savedId && user) {
            try {
                await renameDesign(user.uid, savedId, next);
            } catch {
                // ignore — the local title still updates
            }
        }
    };
    const handleRename = () => setRenameVisible(true);

    let planks = [];
    if (floorPolygon) {
        const xs = floorPolygon.map((p) => p.x);
        const ys = floorPolygon.map((p) => p.y);
        planks = buildPlanks({
            minX: Math.min(...xs),
            maxX: Math.max(...xs),
            minY: Math.min(...ys),
            maxY: Math.max(...ys),
        });
    }

    const imgRect = canvas.w
        ? {
              x: 32,
              y: canvas.h * 0.14,
              width: canvas.w - 64,
              height: canvas.h * 0.68,
          }
        : null;

    const todo = (what) => () => console.log("TODO:", what);

    const handleMoreAction = (key) => {
        setMoreMenuVisible(false);
        if (key === "measure") {
            navigation.navigate("Measurements", { walls });
        } else if (key === "upgrade") {
            navigation.navigate("Paywall");
        } else if (key === "love") {
            StoreReview.hasAction()
                .then((a) => a && StoreReview.requestReview())
                .catch(() => {});
        } else if (key === "help") {
            Linking.openURL(
                `mailto:biztech755@gmail.com?subject=${encodeURIComponent(
                    "Virtual Home Planner — Help & Feedback"
                )}`
            ).catch(() =>
                Alert.alert("Help & Feedback", "Email us at biztech755@gmail.com")
            );
        }
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            {/* Header */}
            <View style={styles.header}>
                <AnimatedPressable
                    onPress={() => navigation.navigate("FloorPlan")}
                    scaleTo={0.85}
                    style={styles.iconButton}
                    hitSlop={8}
                >
                    <Ionicons name="close" size={26} color={colors.text} />
                </AnimatedPressable>

                <AnimatedPressable
                    onPress={handleRename}
                    scaleTo={0.96}
                    style={styles.titleButton}
                    hitSlop={6}
                >
                    <Text style={styles.titleText} numberOfLines={1}>
                        {name}
                    </Text>
                    <Ionicons
                        name="pencil"
                        size={13}
                        color={colors.textMuted}
                        style={styles.titlePencil}
                    />
                </AnimatedPressable>

                <View style={styles.headerRight}>
                    <AnimatedPressable
                        onPress={undo}
                        disabled={!canUndo}
                        scaleTo={0.85}
                        style={styles.iconButton}
                        hitSlop={6}
                    >
                        <Ionicons
                            name="arrow-undo-outline"
                            size={23}
                            color={canUndo ? colors.text : colors.textFaint}
                        />
                    </AnimatedPressable>
                    <AnimatedPressable
                        onPress={redo}
                        disabled={!canRedo}
                        scaleTo={0.85}
                        style={styles.iconButton}
                        hitSlop={6}
                    >
                        <Ionicons
                            name="arrow-redo-outline"
                            size={23}
                            color={canRedo ? colors.text : colors.textFaint}
                        />
                    </AnimatedPressable>
                    <AnimatedPressable
                        onPress={() => {
                            setMoreMenuVisible(false);
                            setShareMenuVisible((v) => !v);
                        }}
                        scaleTo={0.85}
                        style={styles.iconButton}
                        hitSlop={6}
                    >
                        <Ionicons name="share-outline" size={24} color={colors.text} />
                    </AnimatedPressable>
                    <AnimatedPressable
                        onPress={() => {
                            setShareMenuVisible(false);
                            setMoreMenuVisible((v) => !v);
                        }}
                        scaleTo={0.85}
                        style={styles.iconButton}
                        hitSlop={6}
                    >
                        <Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
                    </AnimatedPressable>
                </View>
            </View>

            {/* Header menus: a full-screen overlay whose backdrop dismisses on
                any tap outside the menu box. */}
            {(moreMenuVisible || shareMenuVisible) && (
                <View style={styles.menuOverlay}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => {
                            setMoreMenuVisible(false);
                            setShareMenuVisible(false);
                        }}
                    />

                    {moreMenuVisible && (
                        <View style={styles.moreMenu}>
                            {MORE_ACTIONS.map((action) => (
                                <AnimatedPressable
                                    key={action.key}
                                    onPress={() => handleMoreAction(action.key)}
                                    scaleTo={0.97}
                                    style={styles.moreMenuItem}
                                >
                                    {action.lib === "mci" ? (
                                        <MaterialCommunityIcons
                                            name={action.icon}
                                            size={22}
                                            color={colors.text}
                                            style={styles.moreMenuIcon}
                                        />
                                    ) : (
                                        <Ionicons
                                            name={action.icon}
                                            size={22}
                                            color={colors.text}
                                            style={styles.moreMenuIcon}
                                        />
                                    )}
                                    <Text style={styles.moreMenuLabel}>{action.label}</Text>
                                </AnimatedPressable>
                            ))}
                        </View>
                    )}

                    {shareMenuVisible && (
                        <View style={styles.shareMenu}>
                            {SHARE_ACTIONS.map((action) => (
                                <AnimatedPressable
                                    key={action.key}
                                    onPress={() => handleShareAction(action.key)}
                                    scaleTo={0.97}
                                    style={styles.moreMenuItem}
                                >
                                    <Ionicons
                                        name={action.icon}
                                        size={22}
                                        color={colors.text}
                                        style={styles.moreMenuIcon}
                                    />
                                    <Text style={styles.moreMenuLabel}>{action.label}</Text>
                                </AnimatedPressable>
                            ))}
                        </View>
                    )}
                </View>
            )}

            {/* Gap warning */}
            <GapWarningBanner
                visible={
                    warningVisible &&
                    hasGap &&
                    !splitMode &&
                    !addOpeningKind &&
                    !resizingOpening
                }
                onDismiss={() => setWarningVisible(false)}
                message="You need to complete your room to switch to 3D. The open ends are marked in red — drag them onto the neighbouring wall to close the gap."
            />

            {/* Furniture clash warning (shown when 3D is blocked by a clash) */}
            <GapWarningBanner
                visible={
                    clashWarningVisible &&
                    hasClash &&
                    !(warningVisible && hasGap) &&
                    !splitMode &&
                    !addOpeningKind &&
                    !resizingOpening
                }
                onDismiss={() => setClashWarningVisible(false)}
                message={hasClash ? clashMessage(clashes) : ""}
            />

            {/* Split-mode instructions */}
            <GapWarningBanner
                visible={splitMode}
                onDismiss={() => setSplitMode(false)}
                message="Tap a point on the selected wall to split it there."
            />

            {/* Add-opening instructions */}
            <GapWarningBanner
                visible={!!addOpeningKind}
                onDismiss={() => setAddOpeningKind(null)}
                message={`Tap a point on the selected wall to place ${
                    addOpeningKind === "door"
                        ? "a door"
                        : addOpeningKind === "opening"
                        ? "an opening"
                        : "a window"
                } there.`}
            />

            {/* Opening-resize instructions */}
            <GapWarningBanner
                visible={!!resizingOpening}
                onDismiss={() => setResizingOpening(null)}
                message="Drag either end to resize it."
            />

            {/* Canvas */}
            <View
                style={styles.canvas}
                onLayout={(e) =>
                    setCanvas({
                        w: e.nativeEvent.layout.width,
                        h: e.nativeEvent.layout.height,
                    })
                }
                {...panHandlers}
            >
                <Svg ref={svgRef} width="100%" height="100%">
                    <Defs>
                        <ClipPath id="room">
                            <Polygon points={floorPoints || pointsAttr} />
                        </ClipPath>
                    </Defs>

                    <G
                        transform={`translate(${transform.tx} ${transform.ty}) scale(${transform.s})`}
                    >
                        {/* Faded source photo */}
                        {imageUri && imgRect && (
                            <SvgImage
                                href={{ uri: imageUri }}
                                x={imgRect.x}
                                y={imgRect.y}
                                width={imgRect.width}
                                height={imgRect.height}
                                preserveAspectRatio="xMidYMid meet"
                                opacity={0.3}
                            />
                        )}

                        {/* Wood floor clipped to the room's outer boundary */}
                        {floorPolygon && (
                            <G clipPath="url(#room)">
                                <Polygon points={floorPoints} fill="#C4A981" />
                                {planks.map((p, i) => (
                                    <Rect
                                        key={i}
                                        x={p.x}
                                        y={p.y}
                                        width={p.w}
                                        height={p.h}
                                        fill={p.color}
                                    />
                                ))}
                            </G>
                        )}

                        {/* Faint outline of the floor below, for lining up walls */}
                        {floorBelow &&
                            floorBelow.walls.map((w, i) => (
                                <Line
                                    key={`below${i}`}
                                    x1={w.x1}
                                    y1={w.y1}
                                    x2={w.x2}
                                    y2={w.y2}
                                    stroke="#94A3B8"
                                    strokeWidth={2 / transform.s}
                                    strokeDasharray={`${8 / transform.s} ${6 / transform.s}`}
                                    strokeLinecap="round"
                                    opacity={0.8}
                                />
                            ))}

                        {/* Furniture (under the walls, so pieces pushed
                            against a wall tuck neatly beneath its line) */}
                        {sortForDrawing(furniture).map((f) => (
                            <G
                                key={f.id}
                                transform={`translate(${f.x} ${f.y}) rotate(${f.rot || 0})`}
                                opacity={(f.elev ?? 0) > 0 ? 0.88 : 1}
                            >
                                <FurnitureGlyph item={f} sw={0.9} />
                            </G>
                        ))}

                        {/* Walls */}
                        {walls.map((w, i) => (
                            <Line
                                key={`w${i}`}
                                x1={w.x1}
                                y1={w.y1}
                                x2={w.x2}
                                y2={w.y2}
                                stroke={i === selectedWall ? SELECTED_COLOR : WALL_COLOR}
                                strokeWidth={WALL_WIDTH}
                                strokeLinecap="round"
                            />
                        ))}

                        {/* Windows & doors */}
                        {walls.flatMap((w, i) =>
                            (w.openings ?? []).map((op, oi) => {
                                const wallColor =
                                    i === selectedWall ? SELECTED_COLOR : WALL_COLOR;
                                const { a, b, nx, ny } = openingSpan(w, op);
                                const gap = (
                                    <Line
                                        key={`gap${i}_${oi}`}
                                        x1={a.x}
                                        y1={a.y}
                                        x2={b.x}
                                        y2={b.y}
                                        stroke={colors.surface}
                                        strokeWidth={WALL_WIDTH * 0.55}
                                    />
                                );

                                if (op.kind === "door") {
                                    const { hinge, closedTip, openTip, sweep } = doorSwing(
                                        w,
                                        op
                                    );
                                    return (
                                        <G key={`op${i}_${oi}`}>
                                            {gap}
                                            <Path
                                                d={`M${closedTip.x},${closedTip.y} A${op.width},${op.width} 0 0 ${sweep} ${openTip.x},${openTip.y}`}
                                                fill="none"
                                                stroke={wallColor}
                                                strokeWidth={1.6 / transform.s}
                                            />
                                            <Line
                                                x1={hinge.x}
                                                y1={hinge.y}
                                                x2={openTip.x}
                                                y2={openTip.y}
                                                stroke={wallColor}
                                                strokeWidth={1.6 / transform.s}
                                                strokeLinecap="round"
                                            />
                                        </G>
                                    );
                                }

                                // Plain opening: just the gap in the wall.
                                if (op.kind === "opening") {
                                    return <G key={`op${i}_${oi}`}>{gap}</G>;
                                }

                                const tick = 5 / transform.s;
                                return (
                                    <G key={`op${i}_${oi}`}>
                                        {gap}
                                        <Line
                                            x1={a.x - nx * tick}
                                            y1={a.y - ny * tick}
                                            x2={a.x + nx * tick}
                                            y2={a.y + ny * tick}
                                            stroke={wallColor}
                                            strokeWidth={1.6 / transform.s}
                                        />
                                        <Line
                                            x1={b.x - nx * tick}
                                            y1={b.y - ny * tick}
                                            x2={b.x + nx * tick}
                                            y2={b.y + ny * tick}
                                            stroke={wallColor}
                                            strokeWidth={1.6 / transform.s}
                                        />
                                    </G>
                                );
                            })
                        )}

                        {/* Corner knobs */}
                        {polygon.map((p, i) => (
                            <Circle
                                key={`k${i}`}
                                cx={p.x}
                                cy={p.y}
                                r={7 / transform.s}
                                fill="#F2F5F8"
                                stroke={WALL_COLOR}
                                strokeWidth={2.5 / transform.s}
                            />
                        ))}

                        {/* Draggable endpoint handles for the selected wall */}
                        {selected && (
                            <>
                                <Circle
                                    cx={selected.x1}
                                    cy={selected.y1}
                                    r={9 / transform.s}
                                    fill={colors.surface}
                                    stroke={SELECTED_COLOR}
                                    strokeWidth={3 / transform.s}
                                />
                                <Circle
                                    cx={selected.x2}
                                    cy={selected.y2}
                                    r={9 / transform.s}
                                    fill={colors.surface}
                                    stroke={SELECTED_COLOR}
                                    strokeWidth={3 / transform.s}
                                />
                                {(selected.openings ?? []).map((op, oi) => {
                                    if (
                                        resizingOpening?.wallIndex === selectedWall &&
                                        resizingOpening?.openingIndex === oi
                                    ) {
                                        return null; // replaced by the two end-handles below
                                    }
                                    const isPicked =
                                        selectedOpening?.wallIndex === selectedWall &&
                                        selectedOpening?.openingIndex === oi;
                                    return (
                                        <Circle
                                            key={`oph${oi}`}
                                            cx={selected.x1 + (selected.x2 - selected.x1) * op.t}
                                            cy={selected.y1 + (selected.y2 - selected.y1) * op.t}
                                            r={8 / transform.s}
                                            fill={isPicked ? SELECTED_COLOR : colors.surface}
                                            stroke={SELECTED_COLOR}
                                            strokeWidth={2.5 / transform.s}
                                        />
                                    );
                                })}
                            </>
                        )}

                        {/* Opening-resize end handles */}
                        {resizingOpening &&
                            (() => {
                                const w = walls[resizingOpening.wallIndex];
                                const op = w?.openings?.[resizingOpening.openingIndex];
                                if (!w || !op) return null;
                                const { a, b } = openingSpan(w, op);
                                return (
                                    <>
                                        <Circle
                                            cx={a.x}
                                            cy={a.y}
                                            r={9 / transform.s}
                                            fill={colors.primary}
                                            stroke={colors.surface}
                                            strokeWidth={2.5 / transform.s}
                                        />
                                        <Circle
                                            cx={b.x}
                                            cy={b.y}
                                            r={9 / transform.s}
                                            fill={colors.primary}
                                            stroke={colors.surface}
                                            strokeWidth={2.5 / transform.s}
                                        />
                                    </>
                                );
                            })()}

                        {/* Clashing furniture: red outline */}
                        {furniture
                            .filter((f) => clashes.ids.has(f.id))
                            .map((f) => {
                                const { w, d } = footprintPx(f);
                                const s = transform.s;
                                return (
                                    <G
                                        key={`clash${f.id}`}
                                        transform={`translate(${f.x} ${f.y}) rotate(${f.rot || 0})`}
                                    >
                                        <Rect
                                            x={-w / 2 - 1.5 / s}
                                            y={-d / 2 - 1.5 / s}
                                            width={w + 3 / s}
                                            height={d + 3 / s}
                                            rx={2 / s}
                                            fill={GAP_HIGHLIGHT}
                                            fillOpacity={0.18}
                                            stroke={GAP_HIGHLIGHT}
                                            strokeWidth={2.5 / s}
                                        />
                                    </G>
                                );
                            })}

                        {/* Selected furniture: outline, rotate knob, size label */}
                        {selectedPiece &&
                            (() => {
                                const { w, d } = footprintPx(selectedPiece);
                                const s = transform.s;
                                const knobY = -d / 2 - ROTATE_HANDLE_GAP / s;
                                const label = `${formatLength(selectedPiece.w, units)} × ${formatLength(
                                    selectedPiece.d,
                                    units
                                )}`;
                                // Below the piece whatever its rotation.
                                const labelBelow = Math.hypot(w, d) / 2 + 16 / s;
                                return (
                                    <>
                                        <G
                                            transform={`translate(${selectedPiece.x} ${selectedPiece.y}) rotate(${
                                                selectedPiece.rot || 0
                                            })`}
                                        >
                                            <Rect
                                                x={-w / 2 - 3 / s}
                                                y={-d / 2 - 3 / s}
                                                width={w + 6 / s}
                                                height={d + 6 / s}
                                                rx={3 / s}
                                                fill={FURNITURE_COLOR}
                                                fillOpacity={0.08}
                                                stroke={FURNITURE_COLOR}
                                                strokeWidth={2 / s}
                                                strokeDasharray={`${6 / s} ${4 / s}`}
                                            />
                                            <Line
                                                x1={0}
                                                y1={-d / 2 - 3 / s}
                                                x2={0}
                                                y2={knobY}
                                                stroke={FURNITURE_COLOR}
                                                strokeWidth={1.5 / s}
                                            />
                                            <Circle
                                                cx={0}
                                                cy={knobY}
                                                r={10 / s}
                                                fill={colors.surface}
                                                stroke={FURNITURE_COLOR}
                                                strokeWidth={2.5 / s}
                                            />
                                            <Path
                                                d={`M${-4.5 / s},${knobY - 1 / s} A${4.5 / s},${4.5 / s} 0 1 1 ${0},${knobY + 4.5 / s}`}
                                                fill="none"
                                                stroke={FURNITURE_COLOR}
                                                strokeWidth={1.6 / s}
                                                strokeLinecap="round"
                                            />
                                            {/* Resize handles */}
                                            {RESIZE_HANDLES.map(([hx, hy]) => {
                                                const hs = RESIZE_HANDLE_SIZE / s;
                                                return (
                                                    <Rect
                                                        key={`rh${hx}${hy}`}
                                                        x={hx * (w / 2 + 3 / s) - hs / 2}
                                                        y={hy * (d / 2 + 3 / s) - hs / 2}
                                                        width={hs}
                                                        height={hs}
                                                        rx={hx && hy ? 1.5 / s : hs / 2}
                                                        fill={colors.surface}
                                                        stroke={FURNITURE_COLOR}
                                                        strokeWidth={2 / s}
                                                    />
                                                );
                                            })}
                                        </G>
                                        {/* Size label: a white halo copy drawn first, then
                                            the black text on top (react-native-svg ignores
                                            paintOrder on iOS, so a single stroked text would
                                            paint the halo over the letters). */}
                                        <SvgText
                                            x={selectedPiece.x}
                                            y={selectedPiece.y + labelBelow}
                                            fontSize={12 / s}
                                            fontWeight="700"
                                            fill={colors.surface}
                                            stroke={colors.surface}
                                            strokeWidth={3 / s}
                                            strokeLinejoin="round"
                                            textAnchor="middle"
                                        >
                                            {label}
                                        </SvgText>
                                        <SvgText
                                            x={selectedPiece.x}
                                            y={selectedPiece.y + labelBelow}
                                            fontSize={12 / s}
                                            fontWeight="700"
                                            fill="#000000"
                                            textAnchor="middle"
                                        >
                                            {label}
                                        </SvgText>
                                    </>
                                );
                            })()}

                        {/* Gap highlights: mark the loose wall ends causing the
                            open room, drawn last so they sit above everything. */}
                        {gapEnds.map((p, i) => (
                            <G key={`gap${i}`}>
                                <Circle
                                    cx={p.x}
                                    cy={p.y}
                                    r={18 / transform.s}
                                    fill={GAP_HIGHLIGHT}
                                    opacity={0.2}
                                />
                                <Circle
                                    cx={p.x}
                                    cy={p.y}
                                    r={11 / transform.s}
                                    fill="none"
                                    stroke={GAP_HIGHLIGHT}
                                    strokeWidth={3.5 / transform.s}
                                />
                                <Circle
                                    cx={p.x}
                                    cy={p.y}
                                    r={4 / transform.s}
                                    fill={GAP_HIGHLIGHT}
                                />
                            </G>
                        ))}
                    </G>
                </Svg>

                {/* Floor switcher */}
                <AnimatedPressable
                    onPress={() => {
                        setMoreMenuVisible(false);
                        setShareMenuVisible(false);
                        setFloorSheetVisible(true);
                    }}
                    scaleTo={0.95}
                    style={styles.floorChip}
                >
                    <Ionicons name="layers-outline" size={16} color={colors.text} />
                    <Text style={styles.floorChipText} numberOfLines={1}>
                        {floors[floorIndex]?.name}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
                </AnimatedPressable>

                {/* Selected-wall context menu (hidden while an opening is picked) */}
                {menuPos && !selectedOpening && (
                    <View style={[styles.contextMenu, menuPos]}>
                        <ContextItem
                            icon="add"
                            label="Add"
                            onPress={() => setAddMenuVisible((v) => !v)}
                        />
                        <ContextItem
                            icon="resize-outline"
                            label="Size"
                            onPress={() => {
                                setAddMenuVisible(false);
                                setSizeSheetVisible(true);
                            }}
                        />
                        <ContextItem
                            icon="trash-outline"
                            label="Delete"
                            onPress={deleteSelectedWall}
                        />
                    </View>
                )}

                {/* "Add" flyout: split the wall, or insert a window/door/opening */}
                {addMenuPos && (
                    <View style={[styles.addMenu, addMenuPos]}>
                        {ADD_ACTIONS.map((action) => (
                            <AddMenuItem
                                key={action.key}
                                icon={action.icon}
                                label={action.label}
                                onPress={() => {
                                    setAddMenuVisible(false);
                                    if (action.key === "split") {
                                        setSplitMode(true);
                                    } else if (
                                        action.key === "window" ||
                                        action.key === "door" ||
                                        action.key === "opening"
                                    ) {
                                        setAddOpeningKind(action.key);
                                    } else {
                                        todo(action.key)();
                                    }
                                }}
                            />
                        ))}
                    </View>
                )}

                {/* Selected-opening context menu (window or door) */}
                {openingMenuPos && (
                    <View
                        style={[styles.contextMenu, styles.openingMenu, openingMenuPos]}
                    >
                        {openingActions.map((action) => (
                            <ContextItem
                                key={action.key}
                                icon={action.icon}
                                label={action.label}
                                onPress={() => {
                                    if (action.key === "delete") {
                                        deleteSelectedOpening();
                                    } else if (action.key === "copy") {
                                        copySelectedOpening();
                                    } else if (action.key === "size") {
                                        setResizingOpening(selectedOpening);
                                        setSelectedOpening(null);
                                    } else if (action.key === "rotate") {
                                        rotateSelectedDoor();
                                    } else if (action.key === "flip") {
                                        flipSelectedDoor();
                                    } else {
                                        todo(
                                            `${selectedOpeningData?.kind} ${action.key}`
                                        )();
                                    }
                                }}
                            />
                        ))}
                    </View>
                )}

                {/* Selected-furniture context menu */}
                {furnitureMenuPos && (
                    <View
                        style={[styles.contextMenu, styles.furnitureMenu, furnitureMenuPos]}
                    >
                        {FURNITURE_ACTIONS.map((action) => (
                            <ContextItem
                                key={action.key}
                                icon={action.icon}
                                label={action.label}
                                onPress={() => handleFurnitureAction(action.key)}
                            />
                        ))}
                    </View>
                )}
            </View>

            {/* Toolbar */}
            <View style={styles.toolbar}>
                <AnimatedPressable
                    onPress={() =>
                        hasGap
                            ? setWarningVisible(true)
                            : hasClash
                            ? setClashWarningVisible(true)
                            : navigation.navigate("Room3D", {
                                  walls,
                                  furniture,
                                  name,
                                  floors: syncedFloors(),
                                  floorIndex,
                              })
                    }
                    scaleTo={0.9}
                    style={styles.tool}
                >
                    <Text style={styles.threeD}>3D</Text>
                    <Text style={styles.toolLabel}>Open 3D plan</Text>
                </AnimatedPressable>

                <AnimatedPressable
                    onPress={handleSave}
                    disabled={saving}
                    scaleTo={0.9}
                    style={styles.tool}
                >
                    {saving ? (
                        <ActivityIndicator color={colors.text} />
                    ) : (
                        <Ionicons name="save-outline" size={25} color={colors.text} />
                    )}
                    <Text style={styles.toolLabel}>Save</Text>
                </AnimatedPressable>

                <AnimatedPressable
                    onPress={() => {
                        setMoreMenuVisible(false);
                        setShareMenuVisible(false);
                        setFurnitureSheetVisible(true);
                    }}
                    scaleTo={0.9}
                    style={styles.tool}
                >
                    <MaterialCommunityIcons name="sofa-outline" size={27} color={colors.text} />
                    <Text style={styles.toolLabel}>Furniture</Text>
                </AnimatedPressable>

                <AnimatedPressable
                    onPress={() =>
                        navigation.navigate("DrawWalls", {
                            updatedWalls: walls,
                            // Carried through wall drawing and handed back on
                            // "Done" so placed furniture isn't lost.
                            furniture,
                            // Likewise the other floors, so drawing walls on
                            // one floor keeps the rest of the building.
                            floors: syncedFloors(),
                            floorIndex,
                            imageUri,
                        })
                    }
                    scaleTo={0.9}
                    style={styles.tool}
                >
                    <Ionicons name="pencil" size={26} color={colors.text} />
                    <Text style={styles.toolLabel}>Draw Wall</Text>
                </AnimatedPressable>
            </View>

            <WallSizeSheet
                visible={sizeSheetVisible}
                wall={selected}
                pixelsPerFoot={PIXELS_PER_FOOT}
                onClose={() => setSizeSheetVisible(false)}
                onApply={applyWallSize}
            />

            <FloorSheet
                visible={floorSheetVisible}
                floors={floors.map((f, i) =>
                    i === floorIndex ? { ...f, walls, furniture } : f
                )}
                activeIndex={floorIndex}
                pro={pro}
                onSelect={selectFloor}
                onAdd={addFloor}
                onRename={(i) => setRenamingFloor(i)}
                onHeight={setFloorHeight}
                onDelete={deleteFloor}
                onClose={() => setFloorSheetVisible(false)}
            />
            <PromptModal
                visible={renamingFloor !== null}
                title="Rename floor"
                message="Enter a name for this floor."
                placeholder="Floor name"
                initialValue={renamingFloor !== null ? floors[renamingFloor]?.name ?? "" : ""}
                confirmLabel="Save"
                onSubmit={applyFloorRename}
                onClose={() => setRenamingFloor(null)}
            />

            <FurnitureSheet
                visible={furnitureSheetVisible}
                onPick={addFurniture}
                onClose={() => setFurnitureSheetVisible(false)}
            />

            <FurnitureEditSheet
                visible={furnitureEditVisible && !!selectedPiece}
                item={selectedPiece}
                onApply={updateSelectedFurniture}
                onClose={() => setFurnitureEditVisible(false)}
            />

            <StatsSheet
                visible={statsVisible}
                stats={statsVisible ? computeStats(walls, PIXELS_PER_FOOT) : null}
                onClose={() => setStatsVisible(false)}
            />
            <PromptModal
                visible={renameVisible}
                title="Rename design"
                message="Enter a title for this plan."
                placeholder="Plan title"
                initialValue={name === "Untitled plan" ? "" : name}
                confirmLabel="Save"
                onSubmit={applyRename}
                onClose={() => setRenameVisible(false)}
            />
        </SafeAreaView>
    );
};

const ContextItem = ({ icon, label, onPress }) => (
    <AnimatedPressable onPress={onPress} scaleTo={0.88} style={styles.contextItem}>
        <Ionicons name={icon} size={20} color={colors.text} />
        <Text style={styles.contextLabel}>{label}</Text>
    </AnimatedPressable>
);

const AddMenuItem = ({ icon, label, onPress }) => (
    <AnimatedPressable onPress={onPress} scaleTo={0.97} style={styles.addMenuItem}>
        <Ionicons name={icon} size={20} color={colors.text} />
        <Text style={styles.addMenuLabel}>{label}</Text>
    </AnimatedPressable>
);

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#F7F8FA",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    headerRight: {
        flexDirection: "row",
    },
    titleButton: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        marginHorizontal: 8,
    },
    titleText: {
        fontSize: 15,
        fontWeight: "700",
        color: colors.text,
        flexShrink: 1,
    },
    titlePencil: {
        marginLeft: 5,
    },
    iconButton: {
        paddingHorizontal: 9,
        paddingVertical: 6,
        borderRadius: radius.pill,
    },
    canvas: {
        flex: 1,
        overflow: "hidden",
    },
    contextMenu: {
        position: "absolute",
        width: MENU_WIDTH,
        height: MENU_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-around",
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        shadowColor: "#0F172A",
        shadowOpacity: 0.18,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 10,
    },
    contextItem: {
        alignItems: "center",
        paddingHorizontal: 6,
    },
    openingMenu: {
        width: OPENING_MENU_WIDTH,
    },
    furnitureMenu: {
        width: FURNITURE_MENU_WIDTH,
    },
    floorChip: {
        position: "absolute",
        top: 10,
        left: 12,
        maxWidth: 200,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 34,
        paddingHorizontal: 12,
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        shadowColor: "#0F172A",
        shadowOpacity: 0.12,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    floorChipText: {
        flexShrink: 1,
        fontSize: 13,
        fontWeight: "700",
        color: colors.text,
    },
    contextLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: colors.text,
        marginTop: 4,
    },
    addMenu: {
        position: "absolute",
        width: ADD_MENU_WIDTH,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        paddingVertical: 8,
        shadowColor: "#0F172A",
        shadowOpacity: 0.18,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 10,
    },
    addMenuItem: {
        flexDirection: "row",
        alignItems: "center",
        height: ADD_MENU_ITEM_HEIGHT,
        paddingHorizontal: 16,
    },
    addMenuLabel: {
        fontSize: 15,
        fontWeight: "600",
        color: colors.text,
        marginLeft: 14,
    },
    menuOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 30,
    },
    moreMenu: {
        position: "absolute",
        top: 52,
        right: 12,
        width: 260,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        paddingVertical: 8,
        zIndex: 20,
        shadowColor: "#0F172A",
        shadowOpacity: 0.18,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 12,
    },
    shareMenu: {
        position: "absolute",
        top: 52,
        right: 46,
        width: 230,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        paddingVertical: 8,
        zIndex: 20,
        shadowColor: "#0F172A",
        shadowOpacity: 0.18,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 12,
    },
    moreMenuItem: {
        flexDirection: "row",
        alignItems: "center",
        height: 50,
        paddingHorizontal: 18,
    },
    moreMenuIcon: {
        width: 26,
        textAlign: "center",
    },
    moreMenuLabel: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
        marginLeft: 14,
    },
    toolbar: {
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        paddingHorizontal: 24,
        paddingBottom: 30,
        paddingTop: 8,
    },
    tool: {
        alignItems: "center",
        minWidth: 64,
    },
    threeD: {
        fontSize: 24,
        fontWeight: "900",
        color: colors.text,
        lineHeight: 28,
    },
    toolLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: colors.text,
        marginTop: 4,
    },
});
