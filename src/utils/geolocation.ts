export interface GeoResult {
  lat: number;
  lng: number;
  accuracy: number | null;
}

export type GeoFailureReason = "unsupported" | "insecure_context" | "denied" | "timeout" | "unavailable";

export class GeoError extends Error {
  reason: GeoFailureReason;
  constructor(reason: GeoFailureReason) {
    super(reason);
    this.reason = reason;
  }
}

function toResult(pos: GeolocationPosition): GeoResult {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
  };
}

// Spec-defined GeolocationPositionError.code values — literals here instead
// of err.PERMISSION_DENIED etc. (which only resolve correctly via the
// browser's own WebIDL constant inheritance) keep this check unambiguous
// regardless of how the error object was constructed.
const PERMISSION_DENIED = 1;
const TIMEOUT = 3;

function mapError(err: GeolocationPositionError): GeoFailureReason {
  if (err.code === PERMISSION_DENIED) return "denied";
  if (err.code === TIMEOUT) return "timeout";
  return "unavailable"; // POSITION_UNAVAILABLE, or any code a nonstandard WebView invents
}

/**
 * A single geolocation attempt that can never hang the UI indefinitely.
 * Some in-app browsers/WebViews (Facebook/Messenger's in particular, but not
 * only) are known to silently drop a geolocation request — never calling
 * either callback — instead of honoring the `timeout` passed to
 * getCurrentPosition. A JS-level watchdog timer guarantees this promise
 * always settles one way or another, regardless of what the host browser
 * actually does under the hood. Also rejects immediately, before ever
 * calling into the API, for the two conditions that make calling it
 * pointless: no secure context (geolocation is unavailable or silently
 * broken on plain http, except localhost) and no `navigator.geolocation` at
 * all.
 */
export function requestPosition(options: PositionOptions): Promise<GeoResult> {
  return new Promise((resolve, reject) => {
    // Only reject on a *confirmed* insecure context — some older WebViews
    // don't expose `isSecureContext` at all, and treating "unknown" the same
    // as "insecure" would falsely block geolocation there instead of just
    // letting the actual getCurrentPosition call decide.
    if (typeof window.isSecureContext === "boolean" && !window.isSecureContext) {
      reject(new GeoError("insecure_context"));
      return;
    }
    if (!("geolocation" in navigator)) {
      reject(new GeoError("unsupported"));
      return;
    }

    let settled = false;
    const watchdog = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new GeoError("timeout"));
    }, (options.timeout ?? 10000) + 3000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(watchdog);
        resolve(toResult(pos));
      },
      (err) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(watchdog);
        reject(new GeoError(mapError(err)));
      },
      options
    );
  });
}

/**
 * Tries a high-accuracy GPS fix first (best for pinning an exact address),
 * then — if that times out or the device can't get a lock, which is common
 * indoors or with a weak sky view even when location permission is fully
 * granted — falls back once to a faster, lower-accuracy fix (Wi-Fi/cell
 * positioning instead of forcing the GPS chip). A real permission denial (or
 * an insecure context, or no geolocation support at all) skips the fallback
 * and rejects immediately, since retrying can't change any of those.
 */
export function getCurrentPositionWithFallback(): Promise<GeoResult> {
  return requestPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }).catch((err: unknown) => {
    const reason = err instanceof GeoError ? err.reason : "unavailable";
    if (reason === "denied" || reason === "insecure_context" || reason === "unsupported") {
      throw err;
    }
    return requestPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
  });
}

// Common in-app browser UA tokens (Facebook/Messenger, Instagram, WhatsApp,
// Line, WeChat) — these are the browsers most likely to restrict or silently
// break the geolocation permission prompt at the native-app level, so GPS
// failure there gets a reassuring "just pick your area" hint instead of the
// more technical denied/timeout/unavailable message.
const IN_APP_BROWSER_PATTERN = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|WhatsApp|Messenger/i;

export function isInAppBrowser(): boolean {
  return typeof navigator !== "undefined" && IN_APP_BROWSER_PATTERN.test(navigator.userAgent || "");
}
