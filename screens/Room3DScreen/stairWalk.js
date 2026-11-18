import { toLocal } from "../../utils/furnitureCatalog";
import { stairHeightAt } from "../../utils/stairs";

// Walking up and down stairs in the 3D Walk mode.
//
// `levels` are buildBuilding's floors (each with `stairs: [{ f, layout }]`,
// `heightIn` and a wall/furniture `blocked(x, z)`); `origin` maps world feet
// back to plan pixels. The walker is always "on" one floor; underfoot is
// either plain floor (0), a step of a stair on that floor (0..h), a step of a
// stair coming up from the floor below (negative), or the empty part of a
// stairwell opening (VOID, which blocks). Crossing halfway up a stair hands
// the walker over to the next floor without moving them.

const VOID = "void";
// The most the walker can step up/down in one move, so stairs are entered at
// the bottom or top rather than climbed up the side.
const MAX_STEP_IN = 12;

const inPoly = (poly, p) => {
    let inside = false;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
        const pa = poly[a];
        const pb = poly[b];
        if (pa.y > p.y !== pb.y > p.y && p.x < ((pb.x - pa.x) * (p.y - pa.y)) / (pb.y - pa.y) + pa.x) {
            inside = !inside;
        }
    }
    return inside;
};

export const createStairWalker = (levels, origin, pixelsPerFoot) => {
    const pxPerIn = pixelsPerFoot / 12;
    let currentStepIn = 0;

    const localIn = (sf, x, z) => {
        const l = toLocal(sf, { x: origin.x + x * pixelsPerFoot, y: origin.y + z * pixelsPerFoot });
        return { x: l.x / pxPerIn, y: l.y / pxPerIn };
    };

    // What's underfoot at world (x, z) on floor i, in inches relative to it.
    const stepAt = (i, x, z) => {
        for (const st of levels[i].stairs) {
            const hgt = stairHeightAt(st.layout, localIn(st.f, x, z));
            if (hgt !== null) return hgt;
        }
        const below = levels[i - 1];
        if (below) {
            for (const st of below.stairs) {
                const p = localIn(st.f, x, z);
                const hgt = stairHeightAt(st.layout, p);
                if (hgt !== null) return hgt - below.heightIn;
                if (inPoly(st.layout.voidPoly, p)) return VOID;
            }
        }
        return 0;
    };

    // Wrap each floor's blocked() so stairwells and too-tall steps block too.
    levels.forEach((l, i) => {
        const base = l.blocked;
        l.blocked = (x, z) => {
            if (base(x, z)) return true;
            const t = stepAt(i, x, z);
            return t === VOID || Math.abs(t - currentStepIn) > MAX_STEP_IN;
        };
    });

    return {
        stepAt,
        // Call once per frame in Walk mode after the camera has moved. Returns
        // { floor, stepIn }: the floor the walker is now on (switched when
        // past halfway up/down a stair) and the step height under them.
        update(floor, x, z) {
            let i = floor;
            let t = stepAt(i, x, z);
            if (t === VOID) t = currentStepIn;
            if (t > levels[i].heightIn / 2 && levels[i + 1]) {
                t -= levels[i].heightIn;
                i += 1;
            } else if (i > 0 && t < -levels[i - 1].heightIn / 2) {
                t += levels[i - 1].heightIn;
                i -= 1;
            }
            currentStepIn = t;
            return { floor: i, stepIn: t };
        },
        reset() {
            currentStepIn = 0;
        },
    };
};
