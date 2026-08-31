export interface GeoResult {
  lat: number;
  lng: number;
  accuracy: number | null;
}

function toResult(pos: GeolocationPosition): GeoResult {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
  };
}

// Spec-defined GeolocationPositionError.code value — using the literal here
// instead of err.PERMISSION_DENIED (which only resolves correctly via the
// browser's own WebIDL constant inheritance) keeps this check unambiguous
// regardless of how the error object was constructed.
const PERMISSION_DENIED = 1;

/**
 * Tries a high-accuracy GPS fix first (best for pinning an exact address),
 * then — if that times out or the device can't get a lock, which is common
 * indoors or with a weak sky view even when location permission is fully
 * granted — falls back once to a faster, lower-accuracy fix (Wi-Fi/cell
 * positioning instead of forcing the GPS chip). A real permission denial
 * skips the fallback and rejects immediately, since retrying can't help.
 */
export function getCurrentPositionWithFallback(): Promise<GeoResult> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("geolocation_unsupported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(toResult(pos)),
      (err) => {
        if (err.code === PERMISSION_DENIED) {
          reject(err);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(toResult(pos)),
          (fallbackErr) => reject(fallbackErr),
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });
}
