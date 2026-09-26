import * as React from "react";
import type { AIFillApi, AIRunState } from "../../config/api.js";
import { aiStyles } from "./styles.js";

/** The status bar's props. `AIFillStatusProps` is the public version. */
export interface AIStatusBarProps {
    readonly api: AIFillApi;
    readonly className?: string;
    readonly style?: React.CSSProperties;
}

/** The status bar's actions after a run, from the grid-wide menu items. */
const actions = ["review-next", "accept-eligible", "retry-failed"];

function progress(state: AIRunState): string | undefined {
    if (state.active.length === 0) return undefined;
    const titles = [...new Set(state.active.flatMap(run => run.columnTitles))];
    const done = state.active.reduce((sum, run) => sum + run.done, 0);
    const total = state.active.reduce((sum, run) => sum + run.total, 0);
    return `Evaluating ${titles.join(", ")}: ${done} / ${total}`;
}

function summary(state: AIRunState): string | undefined {
    const last = state.last;
    if (last === undefined) return undefined;
    const count = (key: keyof typeof last.counts) => last.counts[key] ?? 0;
    const skipped = Object.values(last.skipped).reduce((sum, n) => sum + (n ?? 0), 0);
    const parts = [
        `${count("suggested")} suggested`,
        `${count("review")} review`,
        `${count("withheld")} withheld`,
        `${count("error")} errors`,
        `${skipped} skipped`,
    ];
    if (count("applied") > 0) parts.unshift(`${count("applied")} applied`);
    return `${last.cancelled ? "Cancelled: " : "Done: "}${parts.join(" · ")}`;
}

/**
 * AI Fill's status bar (`gdg-ai-status`, `role="status"`, SPST-17 §8.3):
 * progress and Cancel while a run is in progress, then the run's summary with
 * "Review next", "Accept N eligible" and "Retry failed". It re-renders on every
 * change the API reports, and never sends a request by itself.
 */
export const AIStatusBar: React.FC<AIStatusBarProps> = ({ api, className, style }) => {
    const [, update] = React.useReducer((n: number) => n + 1, 0);
    const [dismissed, setDismissed] = React.useState<string | undefined>(undefined);
    React.useEffect(() => api.subscribe(update), [api]);

    const state = api.getRunState();
    const running = progress(state);
    const done = running === undefined && state.last?.runId !== dismissed ? summary(state) : undefined;
    const items = running === undefined && done === undefined ? [] : api.getMenuItems();
    const wanted = running === undefined ? actions : ["cancel"];
    const shown = wanted.flatMap(id => items.filter(item => item.id === id && !item.disabled));

    return (
        <div role="status" aria-live="polite" className={`${aiStyles} gdg-ai-status ${className ?? ""}`} style={style}>
            {(running ?? done) !== undefined && (
                <>
                    <span>{running ?? done}</span>
                    <span className="gdg-ai-status-actions">
                        {shown.map(item => (
                            <button key={item.id} type="button" onClick={item.run}>
                                {item.label}
                            </button>
                        ))}
                        {done !== undefined && (
                            <button type="button" aria-label="Dismiss" onClick={() => setDismissed(state.last?.runId)}>
                                ×
                            </button>
                        )}
                    </span>
                </>
            )}
        </div>
    );
};

export default AIStatusBar;
