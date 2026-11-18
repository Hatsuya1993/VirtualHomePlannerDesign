import { roomOutline } from "./roomGeometry";

// Multi-floor designs.
//
// A design holds `floors: [{ id, name, heightIn, walls, furniture }]`, bottom
// floor first. `heightIn` is floor-to-floor height (inches): floor N sits at
// the sum of the heights of the floors below it. Designs saved before floors
// existed only have top-level `walls`/`furniture`; those load as a single
// ground floor, and every save still writes floor 1 to the top-level fields
// so older app versions and the My Designs thumbnails keep working.

export const DEFAULT_FLOOR_HEIGHT_IN = 120; // 10 ft
export const MIN_FLOOR_HEIGHT_IN = 84; // 7 ft
export const MAX_FLOOR_HEIGHT_IN = 240; // 20 ft

export const defaultFloorName = (index) => (index === 0 ? "Ground floor" : `Floor ${index + 1}`);

// Short label for compact pickers: G, 1, 2, …
export const floorShortLabel = (index) => (index === 0 ? "G" : String(index));

const newFloorId = () => `fl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const makeFloor = (index, walls = [], furniture = []) => ({
    id: newFloorId(),
    name: defaultFloorName(index),
    heightIn: DEFAULT_FLOOR_HEIGHT_IN,
    walls,
    furniture,
});

// Floors for a screen's route params (or a saved design), falling back to a
// single floor built from the legacy top-level walls/furniture.
export const floorsFromParams = (params = {}) => {
    if (Array.isArray(params.floors) && params.floors.length > 0) {
        return params.floors.map((f, i) => ({
            id: f.id || newFloorId(),
            name: f.name || defaultFloorName(i),
            heightIn: f.heightIn || DEFAULT_FLOOR_HEIGHT_IN,
            walls: f.walls ?? [],
            furniture: f.furniture ?? [],
        }));
    }
    return [
        {
            id: "floor-1",
            name: defaultFloorName(0),
            heightIn: DEFAULT_FLOOR_HEIGHT_IN,
            walls: params.walls ?? [],
            furniture: params.furniture ?? [],
        },
    ];
};

// Elevation (inches) of each floor's level above the ground.
export const floorElevationsIn = (floors) => {
    let acc = 0;
    return floors.map((f) => {
        const e = acc;
        acc += f.heightIn || DEFAULT_FLOOR_HEIGHT_IN;
        return e;
    });
};

// Starting walls for a new floor: the outer boundary of the floor below (no
// interior walls, doors or windows), so the new level lines up with the
// building. Falls back to copying every wall when the outline can't be traced.
export const outerWallsOf = (walls) => {
    if (!walls?.length) return [];
    const outline = roomOutline(walls);
    if (outline && outline.length >= 3) {
        return outline.map((p, i) => {
            const q = outline[(i + 1) % outline.length];
            return { x1: p.x, y1: p.y, x2: q.x, y2: q.y };
        });
    }
    return walls.map((w) => ({
        x1: w.x1,
        y1: w.y1,
        x2: w.x2,
        y2: w.y2,
        ...(w.heightIn ? { heightIn: w.heightIn } : {}),
        ...(w.thicknessIn ? { thicknessIn: w.thicknessIn } : {}),
    }));
};
