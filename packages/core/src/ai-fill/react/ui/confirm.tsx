import * as React from "react";
import type { AISkipReason } from "../../config/results.js";
import type { AIFillSession } from "../session.js";
import { AIPopup } from "./popup.js";
import { type AIFillRequest, skipLabels } from "./ui-controller.js";

interface AIConfirmProps {
    readonly session: AIFillSession;
    readonly request: AIFillRequest;
    readonly portal: HTMLElement | null;
    readonly vars: Record<string, string>;
    readonly onConfirm: () => void;
    readonly onClose: (focusGrid: boolean) => void;
}

/** Keeps Tab and Shift+Tab inside a dialog, and closes it on Esc. */
export function dialogKeys(event: React.KeyboardEvent<HTMLElement>, onClose: () => void): void {
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
        ...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled)"),
    ];
    if (focusable.length === 0) return;
    const index = focusable.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey ? (index <= 0 ? focusable.length - 1 : index - 1) : (index + 1) % focusable.length;
    event.preventDefault();
    focusable[next].focus();
}

/**
 * The scope statement shown before a large, column-wide or "Fill and apply"
 * fill (SPST-17 §8.2): the columns, the row scope, the cells to evaluate and to
 * skip by reason, the estimated requests, and whether anything will be written.
 * Nothing is sent until the user confirms.
 */
export const AIConfirm: React.FC<AIConfirmProps> = ({ session, request, portal, vars, onConfirm, onClose }) => {
    const { plan, scope, mode } = request;
    const primary = React.useRef<HTMLButtonElement | null>(null);
    const dialog = React.useRef<HTMLDivElement | null>(null);
    const id = React.useId();

    React.useEffect(() => {
        (primary.current ?? dialog.current)?.focus();
    }, []);

    const cells = plan.cells.length + plan.failed.length;
    const columns = plan.columnIds.length > 0 ? plan.columnIds : (request.columns ?? session.aiColumnIds(undefined));
    const rows =
        scope === "column" || scope === "column-empty" ? session.currentConfig().rowScope?.().label : undefined;
    const skipped = Object.entries(plan.skipped) as [AISkipReason, number][];
    const apply = mode === "apply";

    return (
        <AIPopup
            portal={portal}
            vars={vars}
            onClickOutside={() => onClose(false)}
            popupRef={dialog}
            className="gdg-ai-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={id}
            tabIndex={-1}
            onKeyDown={event => dialogKeys(event, () => onClose(true))}>
            <h2 id={id}>{apply ? "Fill and apply" : "Fill"}</h2>
            {plan.error !== undefined ? (
                <p className="gdg-ai-error" role="alert">
                    {plan.error.message}
                </p>
            ) : (
                <dl>
                    <dt>Columns</dt>
                    <dd>{columns.map(column => session.columnTitle(column)).join(", ")}</dd>
                    <dt>Rows</dt>
                    <dd>{rows ?? (scope === "selection-empty" ? "Empty cells in the selection" : "The selection")}</dd>
                    <dt>To evaluate</dt>
                    <dd>{cells} cells</dd>
                    <dt>Skipped</dt>
                    <dd>
                        {skipped.length === 0 ? (
                            "None"
                        ) : (
                            <ul>
                                {skipped.map(([reason, count]) => (
                                    <li key={reason}>
                                        {count} {skipLabels[reason]}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </dd>
                    <dt>Requests</dt>
                    <dd>About {plan.requests}</dd>
                    <dt>Writes</dt>
                    <dd>
                        {apply
                            ? "Results that pass the auto-apply policy are written to the grid"
                            : "None: results are suggestions until you accept them"}
                    </dd>
                </dl>
            )}
            <div className="gdg-ai-actions">
                {plan.error === undefined && (
                    <button
                        type="button"
                        ref={primary}
                        className="gdg-ai-primary"
                        onClick={onConfirm}
                        disabled={cells === 0}>
                        {apply ? `Fill and apply ${cells} cells` : `Fill ${cells} cells`}
                    </button>
                )}
                <button type="button" onClick={() => onClose(true)}>
                    {plan.error === undefined ? "Cancel" : "Close"}
                </button>
            </div>
        </AIPopup>
    );
};
