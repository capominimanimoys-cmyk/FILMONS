import { createRoot } from "react-dom/client";
import LearningApp from "./app/LearningApp.tsx";
import "./styles/index.css";
import "./styles/learning-pop.css";
import "./styles/learning-hero.css";

createRoot(document.getElementById("root")!).render(<LearningApp />);
