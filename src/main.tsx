import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Phase S1: a crew link (/c/<code>) is read and the address tidied to "/" before the first render.
import "./game/share";
import { App } from "./App";
import { CrashScreen, watchErrors } from "./components/CrashScreen";
import { startApp } from "./game/push";
import "./styles/fonts.css";
import "./styles/theme.css";
import "./styles/base.css";

watchErrors();
startApp(); // the service worker and the install prompt (phase Q1b-2)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CrashScreen>
      <App />
    </CrashScreen>
  </StrictMode>,
);
