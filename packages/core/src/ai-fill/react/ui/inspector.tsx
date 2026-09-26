import * as React from "react";
import type { AICellState } from "../../config/api.js";
import type { AIColumnDefinition } from "../../config/types.js";
import type { ChoiceAnswer, NoulAnswer, ScoreAnswer } from "../../contract/types.js";
import { defaultNoulLabels, scoreLevelLabel } from "../../policy/map-output.js";
import type { AIFillSession } from "../session.js";
import { dialogKeys } from "./confirm.js";
import { type AIAnchor, AIPopup } from "./popup.js";
import type { AIFillUI } from "./ui-controller.js";

interface AIInspectorProps {
    readonly ui: AIFillUI;
    readonly rowId: string;
    readonly columnId: string;
    readonly anchor: AIAnchor;
    readonly portal: HTMLElement | null;
    readonly vars: Record<string, string>;
}

/** How a status reads in the inspector. */
const statusLabels: Record<AICellState["status"], string> = {
    queued: "Queued",
    pending: "Waiting for Jev",
    suggested: "Suggested",
    review: "Needs review",
    withheld: "Withheld",
    error: "Error",
    stale: "Stale: the inputs or the definition changed",
    accepted: "Accepted",
    applied: "Applied",
    rejected: "Rejected",
};

/** Four decimals, so the inspector shows the exact value a gate compared. */
function exact(value: number): string {
    return String(Number(value.toFixed(4)));
}

/** The values "Choose" offers: the Choice options, the Score levels, or Yes and No, each with the value it writes. */
export function choices(definition: AIColumnDefinition): { readonly label: string; readonly value: unknown }[] {
    switch (definition.primitive) {
        case "choice":
            return Object.entries(definition.options)
                .filter(([, option]) => (option.outcome ?? "value") === "value" || option.value !== undefined)
                .map(([id, option]) => ({ label: option.label ?? id, value: option.value ?? option.label ?? id }));
        case "score": {
            const store = definition.output?.store ?? "score";
            if (typeof store === "function") return [];
            return definition.levels.flatMap((level, index) => {
                const label = scoreLevelLabel(level, index);
                if (store !== "level-value") return [{ label, value: store === "level-label" ? label : index }];
                return typeof level === "string" || level.value === undefined ? [] : [{ label, value: level.value }];
            });
        }
        case "noul": {
            const store = definition.output?.store ?? "probability";
            const labels = { ...defaultNoulLabels, ...definition.output?.labels };
            return [true, false].map(yes => ({
                label: yes ? labels.true : labels.false,
                value: store === "boolean" ? yes : store === "label" ? (yes ? labels.true : labels.false) : yes ? 1 : 0,
            }));
        }
    }
}

const Bars: React.FC<{ readonly rows: readonly { label: string; p: number; selected: boolean }[] }> = ({ rows }) => (
    <div className="gdg-ai-bars" role="list">
        {rows.map(row => (
            <React.Fragment key={row.label}>
                <span role="listitem" className={row.selected ? "gdg-ai-selected" : undefined}>
                    {row.label}
                </span>
                <span className="gdg-ai-bar" aria-hidden="true">
                    <span style={{ width: `${Math.round(row.p * 100)}%` }} />
                </span>
                <span>{exact(row.p)}</span>
            </React.Fragment>
        ))}
    </div>
);

const Confidence: React.FC<{ readonly value: number }> = ({ value }) => (
    <p className="gdg-ai-muted">
        Model confidence {exact(value)}. Probability and confidence are model outputs, not measured accuracy.
    </p>
);

function ChoiceDetails({ definition, answer }: { definition: AIColumnDefinition; answer: ChoiceAnswer }) {
    if (definition.primitive !== "choice") return null;
    const alternatives = definition.presentation?.alternatives;
    const ranked = Object.entries(answer.probabilities)
        .sort((a, b) => b[1] - a[1])
        .filter(
            ([id, p], i) =>
                id === answer.choice ||
                (i < (alternatives?.count ?? Number.POSITIVE_INFINITY) + 1 && p >= (alternatives?.minProbability ?? 0))
        )
        .map(([id, p]) => ({ label: definition.options[id]?.label ?? id, p, selected: id === answer.choice }));
    return (
        <div className="gdg-ai-section">
            <div className="gdg-ai-muted">Options by probability</div>
            <Bars rows={ranked} />
            <Confidence value={answer.confidence} />
        </div>
    );
}

function ScoreDetails({
    definition,
    answer,
    level,
}: {
    definition: AIColumnDefinition;
    answer: ScoreAnswer;
    level: number | undefined;
}) {
    if (definition.primitive !== "score") return null;
    const rows = definition.levels.map((rubricLevel, index) => ({
        label: `${index}: ${scoreLevelLabel(rubricLevel, index)}`,
        p: answer.probabilities[String(index)] ?? 0,
        selected: index === level,
    }));
    return (
        <div className="gdg-ai-section">
            <div className="gdg-ai-muted">
                Score {exact(answer.score)} on a 0–{definition.levels.length - 1} rubric. Level probabilities:
            </div>
            <Bars rows={rows} />
            <Confidence value={answer.confidence} />
        </div>
    );
}

function NoulDetails({ definition, answer }: { definition: AIColumnDefinition; answer: NoulAnswer }) {
    if (definition.primitive !== "noul") return null;
    const bands = definition.output?.bands;
    const labels = { ...defaultNoulLabels, ...definition.output?.labels };
    let band: string | undefined;
    if (bands !== undefined) {
        if (answer.noul <= bands.falseAtOrBelow) band = `${labels.false} (at or below ${bands.falseAtOrBelow})`;
        else if (answer.noul >= bands.trueAtOrAbove) band = `${labels.true} (at or above ${bands.trueAtOrAbove})`;
        else
            band = `${labels.uncertain} (between ${bands.falseAtOrBelow} and ${bands.trueAtOrAbove}: ${bands.between})`;
    }
    return (
        <div className="gdg-ai-section">
            <Bars rows={[{ label: "Probability of yes", p: answer.noul, selected: true }]} />
            {band !== undefined && <div>Band: {band}</div>}
        </div>
    );
}

/**
 * The inspector (`gdg-ai-inspector`, SPST-17 §8.5): everything AI Fill knows
 * about one cell's result, from the structured answer and the configured
 * rubric only, and the actions to decide it. Every write goes through the
 * same commit path as accept. Esc closes it; Enter accepts.
 */
export const AIInspector: React.FC<AIInspectorProps> = ({ ui, rowId, columnId, anchor, portal, vars }) => {
    const session: AIFillSession = ui.session;
    const dialog = React.useRef<HTMLDivElement | null>(null);
    const [choice, setChoice] = React.useState("");
    const id = React.useId();

    React.useEffect(() => {
        dialog.current?.focus();
    }, [rowId, columnId]);

    const state = session.cellState(rowId, columnId);
    const definition = session.definition(columnId);
    const close = () => ui.close(true);
    const refs = [{ rowId, columnId }];
    const status = state?.status;
    const canAccept = status === "suggested" || status === "review";
    const options = definition === undefined ? [] : choices(definition);
    const canChoose = canAccept || status === "withheld";
    const answer = state?.metadata.answer;
    const decision = state?.decision;
    const reason = decision?.reason;
    const received = state?.metadata.timings.receivedAt;

    /** Runs an action, then closes the inspector and returns focus to the grid. */
    const act = (action: () => void) => () => {
        action();
        close();
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" && event.target === event.currentTarget && canAccept) {
            event.preventDefault();
            ui.accept(refs);
            close();
            return;
        }
        dialogKeys(event, close);
    };

    return (
        <AIPopup
            portal={portal}
            anchor={anchor}
            vars={vars}
            onClickOutside={() => ui.close(false)}
            popupRef={dialog}
            className="gdg-ai-inspector"
            role="dialog"
            aria-labelledby={id}
            tabIndex={-1}
            onKeyDown={onKeyDown}>
            <h2 id={id}>
                {session.columnTitle(columnId)}: {status === undefined ? "No result" : statusLabels[status]}
            </h2>
            {state !== undefined && (
                <dl>
                    {state.output !== undefined && (
                        <>
                            <dt>Suggested</dt>
                            <dd>
                                {state.output.display}
                                {state.output.hasValue && String(state.output.value) !== state.output.display && (
                                    <span className="gdg-ai-muted"> (writes {JSON.stringify(state.output.value)})</span>
                                )}
                                {!state.output.hasValue && <span className="gdg-ai-muted"> (no value to write)</span>}
                            </dd>
                        </>
                    )}
                    {decision !== undefined && reason !== undefined && (
                        <>
                            <dt>Decision</dt>
                            <dd className={decision.status === "review" ? "gdg-ai-review" : undefined}>
                                {reason.message}
                                {reason.actual !== undefined && reason.threshold !== undefined && (
                                    <div className="gdg-ai-muted">
                                        {reason.measure ?? "value"} {String(reason.actual)}, threshold{" "}
                                        {String(reason.threshold)}
                                    </div>
                                )}
                            </dd>
                        </>
                    )}
                    {state.error !== undefined && (
                        <>
                            <dt>Error</dt>
                            <dd className="gdg-ai-error">
                                {state.error.kind}: {state.error.message}
                            </dd>
                        </>
                    )}
                    {state.blocked !== undefined && (
                        <>
                            <dt>Not written</dt>
                            <dd className="gdg-ai-error">{state.blocked.message}</dd>
                        </>
                    )}
                    {state.manual && (
                        <>
                            <dt>Edited</dt>
                            <dd>The cell was edited after the request</dd>
                        </>
                    )}
                    <dt>Model</dt>
                    <dd>
                        {state.metadata.model ?? state.metadata.requestedModel}
                        {state.metadata.model === undefined && <span className="gdg-ai-muted"> (requested)</span>}
                    </dd>
                    {received !== undefined && (
                        <>
                            <dt>Received</dt>
                            <dd>
                                <time dateTime={new Date(received).toISOString()}>
                                    {new Date(received).toLocaleString()}
                                </time>
                            </dd>
                        </>
                    )}
                </dl>
            )}
            {definition !== undefined && answer?.type === "choice" && (
                <ChoiceDetails definition={definition} answer={answer} />
            )}
            {definition !== undefined && answer?.type === "score" && (
                <ScoreDetails definition={definition} answer={answer} level={state?.output?.level} />
            )}
            {definition !== undefined && answer?.type === "noul" && (
                <NoulDetails definition={definition} answer={answer} />
            )}
            <div className="gdg-ai-actions">
                <button
                    type="button"
                    className="gdg-ai-primary"
                    disabled={!canAccept}
                    onClick={act(() => ui.accept(refs))}>
                    Accept
                </button>
                <button
                    type="button"
                    disabled={!(canAccept || status === "withheld" || status === "stale")}
                    onClick={act(() => ui.reject(refs))}>
                    Reject
                </button>
                <button type="button" onClick={() => ui.editManually(rowId, columnId)}>
                    Edit manually
                </button>
                {status === "error" && (
                    <button type="button" onClick={act(() => session.rerun("error", { cells: [[rowId, columnId]] }))}>
                        Retry
                    </button>
                )}
                {(status === "stale" || status === "rejected") && (
                    <button type="button" onClick={act(() => ui.rerun(rowId, columnId))}>
                        Re-run
                    </button>
                )}
            </div>
            {canChoose && options.length > 0 && (
                <div className="gdg-ai-actions">
                    <select
                        aria-label="Choose a value"
                        value={choice}
                        onChange={event => setChoice(event.target.value)}>
                        <option value="">Choose…</option>
                        {options.map((option, index) => (
                            <option key={option.label} value={String(index)}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        disabled={choice === ""}
                        onClick={act(() => ui.choose(refs[0], options[Number(choice)].value))}>
                        Write choice
                    </button>
                </div>
            )}
        </AIPopup>
    );
};
