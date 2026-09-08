import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Apply saved theme on load (default: dark)
const saved = localStorage.getItem("scheduler_theme") || "dark";
document.documentElement.classList.add(saved);

createRoot(document.getElementById("root")!).render(<App />);
