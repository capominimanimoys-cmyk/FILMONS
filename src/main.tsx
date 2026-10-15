import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
import "./styles/learning-pop.css";
import { initPerfMetrics } from "./lib/perfMetrics";
import { installChunkRecovery } from "./lib/chunkRecovery";

initPerfMetrics();
installChunkRecovery();

createRoot(document.getElementById("root")!).render(<App />);
  