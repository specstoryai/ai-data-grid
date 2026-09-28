import * as React from "react";
import { createRoot } from "react-dom/client";
import { AIFillSmoke } from "./AIFillSmoke";
import { App } from "./App";

const container = document.getElementById("root");
if (container === null) throw new Error("Missing #root element");

createRoot(container).render(
    <React.StrictMode>{location.hash === "#ai-fill" ? <AIFillSmoke /> : <App />}</React.StrictMode>
);
