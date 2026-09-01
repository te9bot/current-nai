import { useState } from "react";
import { isAndroid, tryOpenInChrome } from "../utils/geolocation";
import { BoltIcon } from "./icons";

/**
 * Shown instead of the app whenever the site is opened inside a known
 * embedded browser (Messenger/Facebook/Instagram/WhatsApp and friends),
 * where the geolocation prompt is frequently blocked at the native-app level.
 *
 * Deliberately self-contained and dependency-light: it renders before the
 * main application chunk is even fetched, so a visitor never sees a flash of
 * the real landing page (or pays for its map/JS) before being handed off.
 * Its copy is hardcoded Bengali rather than going through i18n for the same
 * reason — i18n's language detection and the rest of the UI aren't needed to
 * render this one screen.
 *
 * Nothing here is remembered: no localStorage, sessionStorage, or cookie.
 * Re-opening the site in the same in-app browser shows this screen again
 * every time, by design.
 *
 * This is a hard gate — there is deliberately no "continue anyway" path, so
 * the only way onward is the external-browser handoff (or the manual
 * instructions below it, for hosts that block the handoff).
 */
export default function InAppBrowserGate() {
  const [attempted, setAttempted] = useState(false);

  function handleOpen() {
    // Fired only from this explicit tap, never automatically — an automatic
    // attempt on mount risks a redirect loop if the host app bounces the
    // navigation straight back into the same WebView.
    tryOpenInChrome();
    setAttempted(true);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 px-6 py-10">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-md bg-amber-500 text-ink-onAccent shadow-glow-amber-soft">
          <BoltIcon width={26} height={26} />
        </span>

        <h1 className="font-bn text-xl font-extrabold leading-snug tracking-tight text-grey-900">
          লোকেশন ব্যবহার করতে ব্রাউজারে খুলুন
        </h1>
        <p className="font-bn mt-2.5 text-sm leading-relaxed text-grey-500">
          Messenger, Facebook, Instagram বা WhatsApp-এর ভেতরের ব্রাউজারে GPS ঠিকমতো কাজ নাও করতে পারে।
        </p>

        <button
          type="button"
          onClick={handleOpen}
          className="font-bn mt-6 w-full rounded-pill bg-amber-500 py-3.5 text-base font-bold text-ink-onAccent shadow-glow-amber transition-colors duration-fast ease-standard hover:bg-amber-400 active:scale-[.98]"
        >
          Chrome-এ খুলুন
        </button>

        {/* Only after an attempt: if the host app swallowed it (common on
            iOS, where nothing can force another browser to open), these are
            the manual steps that always work. The host app's own "you're
            leaving" confirmation is its UI, not reproduced here. */}
        {attempted && (
          <div className="mt-5 rounded-md border border-black/10 bg-ink-900/70 p-3.5 text-left">
            <p className="font-bn text-xs font-semibold text-grey-900">খোলেনি? নিচের যেকোনো একটি করুন:</p>
            <ul className="font-bn mt-1.5 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-grey-600">
              <li>
                উপরের ডান কোণে <span className="font-bold">⋯</span> মেনুতে চাপ দিন, তারপর{" "}
                <span className="font-bold">{isAndroid() ? "\"Open in Chrome\"" : "\"Open in Browser\""}</span> বেছে
                নিন।
              </li>
              <li>অথবা লিংকটি কপি করে Chrome-এ পেস্ট করুন।</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
