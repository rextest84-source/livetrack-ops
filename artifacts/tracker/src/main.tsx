import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

(window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL ??=
  `${import.meta.env.BASE_URL.replace(/\/$/, "")}/cesium`;

createRoot(document.getElementById("root")!).render(<App />);
