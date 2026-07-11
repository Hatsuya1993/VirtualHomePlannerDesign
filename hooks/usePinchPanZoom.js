import { useRef, useState } from "react";
import { PanResponder } from "react-native";

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TAP_THRESHOLD = 10; // screen-space movement (pt) below which a release counts as a tap

// Pan-with-one-finger, pinch-to-zoom-with-two-fingers for an SVG (or any)
// canvas. Returns { transform, panHandlers } — apply `transform` to a
// `<G transform={\`translate(${tx} ${ty}) scale(${s})\`}>` wrapper around the
// content, and spread `panHandlers` onto the touchable container.
//
// Pass `onTap(contentPoint)` to also detect plain taps (single finger,
// negligible movement) — fires with the touch point converted into content
// coordinates via the transform in effect when the tap started.
//
// Pass `hitTest(contentPoint) => target|null` to let a single-finger touch
// grab a draggable handle instead of panning: if it returns a truthy value
// at touch-down, the gesture becomes a drag — `onDragMove(target, contentPoint)`
// fires on every move, `onDragEnd(target, contentPoint, gestureState)` once on
// release — and the canvas itself won't pan for that gesture. `gestureState`
// (the raw PanResponder gesture state, or undefined if a second finger cut
// the drag short) lets callers tell a genuine drag apart from a tap that
// happened to land on the handle, via `gestureState.dx/dy`.
export const usePinchPanZoom = ({
    minScale = 0.5,
    maxScale = 6,
    onTap,
    hitTest,
    onDragStart,
    onDragMove,
    onDragEnd,
} = {}) => {
    const [transform, setTransform] = useState({ s: 1, tx: 0, ty: 0 });
    const transformRef = useRef(transform);
    transformRef.current = transform;
    const gestureRef = useRef(null);
    const onTapRef = useRef(onTap);
    onTapRef.current = onTap;
    const hitTestRef = useRef(hitTest);
    hitTestRef.current = hitTest;
    const onDragStartRef = useRef(onDragStart);
    onDragStartRef.current = onDragStart;
    const onDragMoveRef = useRef(onDragMove);
    onDragMoveRef.current = onDragMove;
    const onDragEndRef = useRef(onDragEnd);
    onDragEndRef.current = onDragEnd;

    const toContent = (x, y) => {
        const t = transformRef.current;
        return { x: (x - t.tx) / t.s, y: (y - t.ty) / t.s };
    };

    const touchesOf = (e) => {
        const t = e.nativeEvent.touches;
        return [
            { x: t[0].locationX, y: t[0].locationY },
            { x: t[1].locationX, y: t[1].locationY },
        ];
    };

    const beginZoom = (e) => {
        const [t0, t1] = touchesOf(e);
        gestureRef.current = {
            kind: "zoom",
            startDist: dist(t0, t1),
            startMid: mid(t0, t1),
            startTransform: { ...transformRef.current },
        };
    };

    const applyZoom = (e) => {
        const g = gestureRef.current;
        const [t0, t1] = touchesOf(e);
        const d = dist(t0, t1);
        const m = mid(t0, t1);
        const st = g.startTransform;
        const s = clamp((d / g.startDist) * st.s, minScale, maxScale);
        // content point under the initial focal stays anchored to the moving focal
        const cx = (g.startMid.x - st.tx) / st.s;
        const cy = (g.startMid.y - st.ty) / st.s;
        setTransform({ s, tx: m.x - cx * s, ty: m.y - cy * s });
    };

    const responder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: (e, gs) => {
                if (gs.numberActiveTouches >= 2) {
                    beginZoom(e);
                    return;
                }
                const { locationX, locationY } = e.nativeEvent;
                const target = hitTestRef.current?.(toContent(locationX, locationY));
                if (target) {
                    gestureRef.current = { kind: "drag", target };
                    onDragStartRef.current?.(target);
                } else {
                    gestureRef.current = {
                        kind: "pan",
                        startTransform: { ...transformRef.current },
                        startPoint: { x: locationX, y: locationY },
                    };
                }
            },
            onPanResponderMove: (e, gs) => {
                const g = gestureRef.current;
                if (!g) return;

                if (gs.numberActiveTouches >= 2) {
                    if (g.kind === "drag") onDragEndRef.current?.(g.target);
                    if (g.kind !== "zoom") beginZoom(e);
                    else applyZoom(e);
                    return;
                }
                // While a pinch is winding down to one finger, wait for release
                // rather than snapping into a pan with a stale start point.
                if (g.kind === "zoom") return;

                if (g.kind === "drag") {
                    const { locationX, locationY } = e.nativeEvent;
                    onDragMoveRef.current?.(g.target, toContent(locationX, locationY));
                    return;
                }

                const st = g.startTransform;
                setTransform({ s: st.s, tx: st.tx + gs.dx, ty: st.ty + gs.dy });
            },
            onPanResponderRelease: (e, gs) => {
                const g = gestureRef.current;
                gestureRef.current = null;
                if (!g) return;

                if (g.kind === "drag") {
                    const { locationX, locationY } = e.nativeEvent;
                    onDragEndRef.current?.(g.target, toContent(locationX, locationY), gs);
                    return;
                }

                if (
                    g.kind === "pan" &&
                    onTapRef.current &&
                    Math.hypot(gs.dx, gs.dy) < TAP_THRESHOLD
                ) {
                    const st = g.startTransform;
                    onTapRef.current({
                        x: (g.startPoint.x - st.tx) / st.s,
                        y: (g.startPoint.y - st.ty) / st.s,
                    });
                }
            },
        })
    ).current;

    const reset = () => setTransform({ s: 1, tx: 0, ty: 0 });

    // Scale + center content `bounds` (in content space) to fit a viewport of
    // `viewW` × `viewH`, leaving `pad` points of margin. Used for an initial
    // "fit the whole plan on screen" view.
    const fitTo = (bounds, viewW, viewH, pad = 40) => {
        if (!bounds || viewW <= 0 || viewH <= 0) return;
        const bw = bounds.maxX - bounds.minX;
        const bh = bounds.maxY - bounds.minY;
        if (bw <= 0 || bh <= 0) return;
        const s = clamp(
            Math.min((viewW - pad * 2) / bw, (viewH - pad * 2) / bh),
            minScale,
            maxScale
        );
        const tx = (viewW - bw * s) / 2 - bounds.minX * s;
        const ty = (viewH - bh * s) / 2 - bounds.minY * s;
        setTransform({ s, tx, ty });
    };

    return { transform, panHandlers: responder.panHandlers, reset, fitTo };
};
