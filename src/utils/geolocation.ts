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
 * One bounded GPS attempt, tuned for a fast, predictable UI: a visitor
 * should never wait more than ~7-8s (5-7s geolocation timeout + the
 * watchdog's buffer) to find out whether GPS worked. Deliberately does not
 * retry with different accuracy settings — a slow/failed fix almost always
 * means the same thing will happen again immediately, so a second attempt
 * only doubles the wait without meaningfully improving the odds; the
 * division/district/area pickers are the real fallback, not a longer GPS
 * timeout. enableHighAccuracy is off: a Wi-Fi/cell fix resolves well inside
 * this budget far more reliably than waiting on a GPS chip lock, and
 * thana-level accuracy is all a division/district/area report needs anyway.
 */
export function getCurrentPositionQuick(): Promise<GeoResult> {
  return requestPosition({ enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 });
}

// Known embedded/in-app browser UA tokens. These WebViews commonly restrict
// or silently break the geolocation permission prompt at the native-app
// level, which no in-page setting can fix — so they're routed through the
// external-browser handoff screen instead of being left to fail at GPS.
//   FBAN/FBAV/FB_IAB/FBIOS  - Facebook & Messenger (iOS and Android)
//   Messenger               - Messenger's own token on some builds
//   Instagram               - Instagram's in-app browser
//   WhatsApp                - WhatsApp's in-app browser
//   Line/, MicroMessenger   - LINE, WeChat
//   Twitter, TikTok, Snapchat, Pinterest, GSA - other common embedded browsers
//   ; wv                    - the generic Android WebView marker
const IN_APP_BROWSER_PATTERN =
  /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|WhatsApp|Line\/|MicroMessenger|Twitter|TikTok|Snapchat|Pinterest|GSA\/|; wv\)/i;

export function isInAppBrowser(): boolean {
  return typeof navigator !== "undefined" && IN_APP_BROWSER_PATTERN.test(navigator.userAgent || "");
}

export function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");
}

/**
 * Best-effort escape from an in-app WebView into a real browser — never
 * guaranteed to work, since no web-standard mechanism can force another app
 * to open on every platform. On Android, an `intent://` URL targeting
 * Chrome's package is the one broadly reliable trick (falls through to the
 * Play Store listing if Chrome isn't installed); elsewhere (iOS in
 * particular, where no such mechanism exists) this just opens the current
 * URL in a new tab/window, which some in-app browsers honor and others
 * silently ignore. Either way, the manual division/district/area pickers
 * already work fine in the current WebView, so this is only ever a
 * convenience shortcut, never something the report flow depends on.
 */
export function tryOpenInChrome(): void {
  const url = window.location.href;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  if (/Android/i.test(ua)) {
    const withoutScheme = url.replace(/^https?:\/\//, "");
    window.location.href = `intent://${withoutScheme}#Intent;scheme=https;package=com.android.chrome;end`;
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
