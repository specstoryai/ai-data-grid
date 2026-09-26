import * as React from "react";
import type { AIFillApi } from "../config/api.js";

/** The props of {@link AIFillStatus}. */
export interface AIFillStatusProps {
    /**
     * The grid's AI Fill API: `ref.current.aiFill`, or the argument of
     * `aiFill.onReady`. While it is `undefined` (before AI Fill has loaded),
     * nothing is rendered.
     */
    readonly api: AIFillApi | undefined;
    /** Extra class names for the status element, which always has `gdg-ai-status`. */
    readonly className?: string;
    readonly style?: React.CSSProperties;
}

// Loaded on first render, so importing `AIFillStatus` adds almost nothing to an app's initial bundle.
const StatusBar = /* @__PURE__ */ React.lazy(() => import("./ui/status-bar.js"));

/** Implements the public `AIFillStatus`; its reference documentation is on the export in `ai-fill/index.ts`. */
export const AIFillStatus: React.FC<AIFillStatusProps> = ({ api, className, style }) =>
    api === undefined ? null : (
        <React.Suspense fallback={null}>
            <StatusBar api={api} className={className} style={style} />
        </React.Suspense>
    );
