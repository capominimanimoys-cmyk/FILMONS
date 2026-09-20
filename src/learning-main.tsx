import { createRoot } from "react-dom/client";
import LearningApp from "./app/LearningApp.tsx";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(<LearningApp />);
