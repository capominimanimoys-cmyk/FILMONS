import { createRoot } from "react-dom/client";
import AdminApp from "./app/AdminApp.tsx";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(<AdminApp />);
