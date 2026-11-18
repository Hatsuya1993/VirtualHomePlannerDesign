import * as THREE from "three";

// Camera controller for the 3D room view, with three modes:
//
//  - "orbit": a dollhouse view looking down into the room from outside. One
//    finger orbits, pinch zooms, two fingers pan. Releasing a spin coasts.
//  - "top":   straight down, oriented like the 2D plan. One finger pans,
//    pinch zooms.
//  - "walk":  first person at eye height. Drag to look, joystick to walk,
//    double-tap the floor to glide there.
//
// The rig keeps a *desired* pose per mode and eases the real camera toward
// it every frame, which gives smooth motion and animated mode switches for
// free. Pure JS (no React) — the screen feeds it gestures and calls update().

export const FOV = { orbit: 50, top: 40, walk: 70 };

const EYE_HEIGHT_FT = 5.5;
const WALK_SPEED = 5; // ft/s at full stick
const GLIDE_SPEED = 4.2; // ft/s when double-tap gliding
const STICK_DEADZONE = 0.12;
const ORBIT_ROTATE = 0.008; // rad per px
const ORBIT_TILT = 0.006;
const LOOK_SENSITIVITY = 0.006;
const MAX_PITCH = Math.PI / 2 - 0.05;
const ORBIT_MIN_PITCH = 0.22;
const ORBIT_MAX_PITCH = 1.45;
const TOP_PITCH = Math.PI / 2 - 0.02; // just shy of vertical so lookAt stays stable
const MODE_TRANSITION_S = 0.75;

const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const createCameraRig = ({ bounds, roomCenter, ceilingHeight, blocked, aspect, baseY = 0 }) => {
    // bounds: { minX, maxX, minZ, maxZ } of the room in feet.
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const halfW = Math.max(4, (bounds.maxX - bounds.minX) / 2);
    const halfD = Math.max(4, (bounds.maxZ - bounds.minZ) / 2);
    const radius = Math.hypot(halfW, halfD);
    // The floor level the camera is on (multi-floor buildings): its height
    // above ground, walk collision, starting point and eye height.
    const level = {
        baseY,
        blocked,
        roomCenter,
        eye: Math.min(EYE_HEIGHT_FT, ceilingHeight - 0.5),
    };

    const fitOrbitDist = () => (radius / Math.sin((FOV.orbit * Math.PI) / 360)) * 1.02;
    const fitTopDist = (asp) => {
        const t = Math.tan((FOV.top * Math.PI) / 360);
        return Math.max(halfD / t, halfW / (t * asp)) * 1.12 + ceilingHeight;
    };

    const s = {
        mode: "orbit",
        aspect,
        transition: 0,
        orbit: { tx: cx, tz: cz, yaw: 0.6, pitch: 0.9, dist: fitOrbitDist(), yawVel: 0 },
        top: { tx: cx, tz: cz, dist: fitTopDist(aspect) },
        walk: {
            x: roomCenter.x,
            z: roomCenter.z,
            yaw: 0,
            pitch: 0,
            dYaw: 0,
            dPitch: 0,
            vx: 0,
            vz: 0,
            glide: null,
        },
        stick: { x: 0, y: 0 },
        pos: new THREE.Vector3(),
        look: new THREE.Vector3(),
        fov: FOV.orbit,
    };

    // Smoothed copies of the orbit/top parameters actually shown.
    const view = {
        orbit: { ...s.orbit },
        top: { ...s.top },
    };

    const minDist = 4;
    const maxDist = Math.max(30, radius * 4);
    const clampTarget = (o) => {
        o.tx = clamp(o.tx, bounds.minX - 4, bounds.maxX + 4);
        o.tz = clamp(o.tz, bounds.minZ - 4, bounds.maxZ + 4);
    };

    const desiredPose = (outPos, outLook) => {
        if (s.mode === "walk") {
            const w = s.walk;
            const eyeY = level.baseY + level.eye;
            outPos.set(w.x, eyeY, w.z);
            outLook.set(
                w.x - Math.sin(w.yaw) * Math.cos(w.pitch),
                eyeY + Math.sin(w.pitch),
                w.z - Math.cos(w.yaw) * Math.cos(w.pitch)
            );
            return;
        }
        const o = s.mode === "top" ? view.top : view.orbit;
        const yaw = s.mode === "top" ? 0 : o.yaw;
        const pitch = s.mode === "top" ? TOP_PITCH : o.pitch;
        const lookY = level.baseY + (s.mode === "top" ? 0 : 1.2);
        outLook.set(o.tx, lookY, o.tz);
        outPos.set(
            o.tx + Math.sin(yaw) * Math.cos(pitch) * o.dist,
            lookY + Math.sin(pitch) * o.dist,
            o.tz + Math.cos(yaw) * Math.cos(pitch) * o.dist
        );
    };

    // Start the real camera exactly at the opening pose.
    desiredPose(s.pos, s.look);

    const tmpPos = new THREE.Vector3();
    const tmpLook = new THREE.Vector3();

    const stepWalk = (dt) => {
        const w = s.walk;
        // Look: ease toward the dragged angles.
        const k = damp(18, dt);
        w.yaw += (w.dYaw - w.yaw) * k;
        w.pitch += (w.dPitch - w.pitch) * k;

        // Stick → desired velocity in the camera's ground frame, with a
        // deadzone and a gentle curve so small pushes walk slowly.
        let sx = s.stick.x;
        let sy = s.stick.y;
        const mag = Math.hypot(sx, sy);
        let tvx = 0;
        let tvz = 0;
        if (mag > STICK_DEADZONE) {
            const scaled = ((mag - STICK_DEADZONE) / (1 - STICK_DEADZONE)) ** 1.6;
            sx = (sx / mag) * scaled;
            sy = (sy / mag) * scaled;
            const fx = -Math.sin(w.yaw);
            const fz = -Math.cos(w.yaw);
            const rx = Math.cos(w.yaw);
            const rz = -Math.sin(w.yaw);
            tvx = (-sy * fx + sx * rx) * WALK_SPEED;
            tvz = (-sy * fz + sx * rz) * WALK_SPEED;
            w.glide = null; // stick input cancels a glide
        } else if (w.glide) {
            const dx = w.glide.x - w.x;
            const dz = w.glide.z - w.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.15) {
                w.glide = null;
            } else {
                const sp = Math.min(GLIDE_SPEED, d * 3); // ease in to the stop
                tvx = (dx / d) * sp;
                tvz = (dz / d) * sp;
            }
        }
        const kv = damp(9, dt);
        w.vx += (tvx - w.vx) * kv;
        w.vz += (tvz - w.vz) * kv;
        if (Math.abs(w.vx) < 1e-3 && Math.abs(w.vz) < 1e-3) {
            w.vx = 0;
            w.vz = 0;
            return;
        }
        const nx = w.x + w.vx * dt;
        const nz = w.z + w.vz * dt;
        const x0 = w.x;
        const z0 = w.z;
        const wanted = Math.hypot(w.vx, w.vz) * dt;
        // A glide that's pressed up against a wall or furniture (sliding but
        // barely progressing) gives up instead of pushing forever.
        const checkGlide = () => {
            if (w.glide && Math.hypot(w.x - x0, w.z - z0) < wanted * 0.3) {
                w.glide = null;
                w.vx = 0;
                w.vz = 0;
            }
        };
        // Full move, else slide along whichever axis is clear.
        const blocked = level.blocked;
        if (!blocked(nx, nz)) {
            w.x = nx;
            w.z = nz;
        } else if (!blocked(nx, w.z)) {
            w.x = nx;
            w.vz = 0;
        } else if (!blocked(w.x, nz)) {
            w.z = nz;
            w.vx = 0;
        } else {
            w.vx = 0;
            w.vz = 0;
            w.glide = null;
        }
        checkGlide();
    };

    return {
        get mode() {
            return s.mode;
        },
        get pos() {
            return s.pos;
        },
        get look() {
            return s.look;
        },
        get fov() {
            return s.fov;
        },
        // True while the camera is still easing somewhere (so keep rendering).
        get busy() {
            return s.transition > 0 || Math.abs(s.orbit.yawVel) > 1e-3 || !!s.walk.glide;
        },

        setAspect(a) {
            s.aspect = a;
        },

        // Move to another floor of the building. `teleport` puts the walker at
        // that floor's room center (used by the floor picker); stairs (which
        // carry the walker across) pass false. `eye` is the eye height above
        // the floor, which stairs vary as you climb.
        setLevel({ baseY: y, blocked: b, roomCenter: rc, ceilingHeight: ch }, teleport = true) {
            level.baseY = y;
            level.blocked = b;
            level.roomCenter = rc;
            level.eye = Math.min(EYE_HEIGHT_FT, ch - 0.5);
            if (teleport) {
                s.walk.x = rc.x;
                s.walk.z = rc.z;
                s.walk.vx = 0;
                s.walk.vz = 0;
                s.walk.glide = null;
                s.transition = MODE_TRANSITION_S;
            }
        },

        get walkPos() {
            return { x: s.walk.x, z: s.walk.z };
        },

        get baseY() {
            return level.baseY;
        },

        setMode(mode) {
            if (mode === s.mode) return;
            s.mode = mode;
            s.transition = MODE_TRANSITION_S;
            s.orbit.yawVel = 0;
        },

        reset() {
            if (s.mode === "orbit") {
                Object.assign(s.orbit, { tx: cx, tz: cz, yaw: 0.6, pitch: 0.9, dist: fitOrbitDist(), yawVel: 0 });
            } else if (s.mode === "top") {
                Object.assign(s.top, { tx: cx, tz: cz, dist: fitTopDist(s.aspect) });
            } else {
                Object.assign(s.walk, {
                    x: level.roomCenter.x,
                    z: level.roomCenter.z,
                    dYaw: 0,
                    dPitch: 0,
                    vx: 0,
                    vz: 0,
                    glide: null,
                });
            }
            s.transition = MODE_TRANSITION_S * 0.8;
        },

        // One-finger drag by (dx, dy) screen px since the last move.
        drag(dx, dy, viewH) {
            if (s.mode === "orbit") {
                s.orbit.yaw -= dx * ORBIT_ROTATE;
                s.orbit.pitch = clamp(s.orbit.pitch + dy * ORBIT_TILT, ORBIT_MIN_PITCH, ORBIT_MAX_PITCH);
                s.orbit.yawVel = 0;
            } else if (s.mode === "top") {
                this.pan(dx, dy, viewH);
            } else {
                const w = s.walk;
                w.dYaw -= dx * LOOK_SENSITIVITY;
                w.dPitch = clamp(w.dPitch - dy * LOOK_SENSITIVITY, -MAX_PITCH, MAX_PITCH);
            }
        },

        // Called when a one-finger orbit drag is released, with the last
        // horizontal speed in px/s, so the spin coasts to a stop.
        fling(vxPx) {
            if (s.mode === "orbit") s.orbit.yawVel = clamp(-vxPx * ORBIT_ROTATE, -4, 4);
        },

        // Two-finger pan by (dx, dy) screen px.
        pan(dx, dy, viewH) {
            if (s.mode === "walk") return;
            const o = s.mode === "top" ? s.top : s.orbit;
            const yaw = s.mode === "top" ? 0 : o.yaw;
            const fov = FOV[s.mode];
            const scale = (o.dist * 2 * Math.tan((fov * Math.PI) / 360)) / viewH;
            const rx = Math.cos(yaw);
            const rz = -Math.sin(yaw);
            const fx = -Math.sin(yaw);
            const fz = -Math.cos(yaw);
            o.tx += (-dx * rx + dy * fx) * scale;
            o.tz += (-dx * rz + dy * fz) * scale;
            clampTarget(o);
        },

        // Pinch: ratio = previous finger distance / current finger distance.
        zoom(ratio) {
            if (s.mode === "walk") return;
            const o = s.mode === "top" ? s.top : s.orbit;
            o.dist = clamp(o.dist * ratio, minDist, maxDist);
        },

        setStick(v) {
            s.stick = v;
        },

        // Double-tap on the floor at world point (x, z).
        floorTap(x, z) {
            if (s.mode === "walk") {
                s.walk.glide = { x, z };
            } else {
                const o = s.mode === "top" ? s.top : s.orbit;
                o.tx = x;
                o.tz = z;
                clampTarget(o);
            }
        },

        // Advance by dt seconds and write the eased pose into pos/look/fov.
        update(dt) {
            if (s.mode === "walk") stepWalk(dt);

            // Orbit coasting.
            if (Math.abs(s.orbit.yawVel) > 1e-3) {
                s.orbit.yaw += s.orbit.yawVel * dt;
                s.orbit.yawVel *= Math.exp(-4 * dt);
            } else {
                s.orbit.yawVel = 0;
            }

            // Ease the displayed orbit/top parameters toward their targets.
            const k = damp(14, dt);
            for (const key of ["orbit", "top"]) {
                const v = view[key];
                const t = s[key];
                v.tx += (t.tx - v.tx) * k;
                v.tz += (t.tz - v.tz) * k;
                v.dist += (t.dist - v.dist) * k;
                if (key === "orbit") {
                    v.yaw += (t.yaw - v.yaw) * k;
                    v.pitch += (t.pitch - v.pitch) * k;
                }
            }

            desiredPose(tmpPos, tmpLook);
            // Slow, smooth blend while switching modes; tight follow otherwise.
            const follow = s.transition > 0 ? damp(5.5, dt) : damp(s.mode === "walk" ? 30 : 20, dt);
            s.transition = Math.max(0, s.transition - dt);
            s.pos.lerp(tmpPos, follow);
            s.look.lerp(tmpLook, follow);
            s.fov += (FOV[s.mode] - s.fov) * damp(8, dt);
        },
    };
};
