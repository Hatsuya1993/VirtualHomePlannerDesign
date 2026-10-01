// React Native has no `navigator.sendBeacon`. Firebase's WebChannel transport
// (@firebase/webchannel-wrapper) uses it to fire a best-effort "terminate
// session" request when a stream closes, and falls back to an image ping when
// it's missing:
//
//   try { c = navigator.sendBeacon(uri.toString(), ""); } catch (d) {}
//   !c && global.Image && ((new Image).src = uri, c = true);
//
// That fallback assigns a goog.Uri *object* to `.src`, relying on the DOM to
// coerce it to a string. expo-three pulls in @expo/browser-polyfill, whose
// global Image stores `.src` verbatim and hands it to React Native's
// Image.getSize — which rejects a non-string argument and throws. The throw
// lands inside Firestore's stream teardown and trips
// "INTERNAL ASSERTION FAILED: Unexpected state", which we saw on every sign-out.
//
// Supplying sendBeacon keeps Firebase on the first branch, so the image path is
// never reached. The request is best-effort by design (the server expires the
// session anyway), hence the swallowed rejection.
if (typeof navigator !== "undefined" && typeof navigator.sendBeacon !== "function") {
    navigator.sendBeacon = (url, data) => {
        try {
            fetch(String(url), {
                method: "POST",
                body: data ?? "",
                keepalive: true,
            }).catch(() => {});
            return true;
        } catch {
            return false;
        }
    };
}
