import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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
} from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { GapWarningBanner } from "../../components/GapWarningBanner";
import { WallSizeSheet } from "../../components/WallSizeSheet";
import { usePinchPanZoom } from "../../hooks/usePinchPanZoom";
import {
    chainRoom,
    collectEndpoints,
    findCornerGroup,
    hitTestWall,
    projectOntoSegment,
    snapPoint,
} from "../../utils/roomGeometry";
import { colors, radius } from "../../utils/theme";

const WALL_COLOR = "#4C7CA8";
const SELECTED_COLOR = colors.info;
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

const OPENING_DEFAULTS = {
    window: { width: 46 },
    door: { width: 40, hinge: "a", flip: false },
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
    { key: "color", icon: "color-palette-outline", label: "Color" },
    { key: "size", icon: "resize-outline", label: "Size" },
    { key: "copy", icon: "copy-outline", label: "Copy" },
    { key: "rotate", icon: "reload-outline", label: "Rotate" },
    { key: "delete", icon: "trash-outline", label: "Delete" },
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
    const [walls, setWalls] = useState(route.params?.walls ?? []);
    const [canvas, setCanvas] = useState({ w: 0, h: 0 });
    const [selectedWall, setSelectedWall] = useState(null);
    const [sizeSheetVisible, setSizeSheetVisible] = useState(false);
    const [addMenuVisible, setAddMenuVisible] = useState(false);
    const [splitMode, setSplitMode] = useState(false);
    const [addOpeningKind, setAddOpeningKind] = useState(null); // null | "window" | "door"
    const [selectedOpening, setSelectedOpening] = useState(null); // { wallIndex, openingIndex } | null
    const [resizingOpening, setResizingOpening] = useState(null); // { wallIndex, openingIndex } | null

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
        setSelectedWall(hit);
        setSelectedOpening(null);
        setAddMenuVisible(false);
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

        if (selectedWall === null) return null;
        const w = walls[selectedWall];
        if (!w) return null;

        let anchor = null;
        if (Math.hypot(contentPoint.x - w.x1, contentPoint.y - w.y1) <= r) {
            anchor = { x: w.x1, y: w.y1 };
        } else if (Math.hypot(contentPoint.x - w.x2, contentPoint.y - w.y2) <= r) {
            anchor = { x: w.x2, y: w.y2 };
        }
        if (!anchor) return null;
        return findCornerGroup(walls, anchor);
    };

    const handleDragMove = (target, contentPoint) => {
        if (!target) return;

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
    const handleDragEnd = (target, _contentPoint, gs) => {
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
            setAddMenuVisible(false);
        }
    };

    const { transform, panHandlers } = usePinchPanZoom({
        onTap: handleTap,
        hitTest: hitTestHandle,
        onDragMove: handleDragMove,
        onDragEnd: handleDragEnd,
    });

    const { polygon, closed } = chainRoom(walls);
    const hasGap = walls.length > 0 && !closed;
    const pointsAttr = polygon.map((p) => `${p.x},${p.y}`).join(" ");
    const [warningVisible, setWarningVisible] = useState(() => hasGap);

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

    const deleteSelectedWall = () => {
        setWalls((ws) => ws.filter((_, i) => i !== selectedWall));
        setSelectedWall(null);
        setSelectedOpening(null);
        setResizingOpening(null);
        setAddMenuVisible(false);
    };

    const applyWallSize = ({ lengthIn, heightIn, thicknessIn }) => {
        if (selectedWall === null) return;
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

    let planks = [];
    if (closed) {
        const xs = polygon.map((p) => p.x);
        const ys = polygon.map((p) => p.y);
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

                <View style={styles.headerRight}>
                    <AnimatedPressable onPress={todo("undo")} scaleTo={0.85} style={styles.iconButton} hitSlop={6}>
                        <Ionicons name="arrow-undo-outline" size={23} color={colors.text} />
                    </AnimatedPressable>
                    <AnimatedPressable onPress={todo("snapshot")} scaleTo={0.85} style={styles.iconButton} hitSlop={6}>
                        <Ionicons name="camera" size={24} color={colors.text} />
                    </AnimatedPressable>
                    <AnimatedPressable onPress={todo("share")} scaleTo={0.85} style={styles.iconButton} hitSlop={6}>
                        <Ionicons name="share-outline" size={24} color={colors.text} />
                    </AnimatedPressable>
                    <AnimatedPressable onPress={todo("more")} scaleTo={0.85} style={styles.iconButton} hitSlop={6}>
                        <Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
                    </AnimatedPressable>
                </View>
            </View>

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
                    addOpeningKind === "door" ? "a door" : "a window"
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
                <Svg width="100%" height="100%">
                    <Defs>
                        <ClipPath id="room">
                            <Polygon points={pointsAttr} />
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

                        {/* Wood floor clipped to the room (closed rooms only) */}
                        {closed && (
                            <G clipPath="url(#room)">
                                <Polygon points={pointsAttr} fill="#C4A981" />
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
                    </G>
                </Svg>

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
                                        action.key === "door"
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
            </View>

            {/* Toolbar */}
            <View style={styles.toolbar}>
                <AnimatedPressable
                    onPress={() =>
                        hasGap
                            ? setWarningVisible(true)
                            : navigation.navigate("Room3D", { walls })
                    }
                    scaleTo={0.9}
                    style={styles.tool}
                >
                    <Text style={styles.threeD}>3D</Text>
                    <Text style={styles.toolLabel}>Open 3D plan</Text>
                </AnimatedPressable>

                <AnimatedPressable
                    onPress={() =>
                        navigation.navigate("DrawWalls", {
                            updatedWalls: walls,
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
