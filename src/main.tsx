import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./i18n";
import "./index.css";
import InAppBrowserGate from "./components/InAppBrowserGate";
import { isInAppBrowser } from "./utils/geolocation";

// App is loaded lazily specifically so the in-app-browser handoff screen
// below can render *without* it: in an embedded browser the visitor should
// never see (or pay to download/parse) the landing page, map, or report form
// before being handed off to a real browser. In a normal browser this is a
// single extra chunk fetched immediately, with nothing gating it.
const App = lazy(() => import("./App"));

function Root() {
  // Evaluated once per page load from the user agent alone — deliberately
  // not persisted anywhere (no localStorage/sessionStorage/cookie), so the
  // handoff screen reappears every time the site is opened in an in-app
  // browser, exactly as intended. There is no dismiss/bypass path: in a
  // detected in-app browser the handoff screen is the whole application.
  if (isInAppBrowser()) {
    return <InAppBrowserGate />;
  }

  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
