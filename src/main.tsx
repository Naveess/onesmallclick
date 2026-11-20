import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { CrashScreen, watchErrors } from "./components/CrashScreen";
import "./styles/fonts.css";
import "./styles/theme.css";
import "./styles/base.css";

watchErrors();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CrashScreen>
      <App />
    </CrashScreen>
  </StrictMode>,
);
