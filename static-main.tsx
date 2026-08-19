import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PatternGenerator from "./app/page";
import "./app/globals.css";
import "./app/weave.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <PatternGenerator />
  </StrictMode>,
);
