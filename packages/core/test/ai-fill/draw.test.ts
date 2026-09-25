/* eslint-disable sonarjs/no-duplicate-string */
import { describe, expect, test, vi } from "vitest";
import { getDataEditorTheme } from "../../src/common/styles.js";
import type { AIColumnDefinition } from "../../src/ai-fill/config/types.js";
import type { ParsedJevAnswer } from "../../src/ai-fill/contract/types.js";
import type { AICellRecord } from "../../src/ai-fill/engine/store.js";
import { mapAIOutput } from "../../src/ai-fill/policy/map-output.js";
import { drawAICell, drawAIHeaderBadge, presentation } from "../../src/ai-fill/react/draw.js";
import { noulAnswer, ownsBudget, persona, personaAnswer, seniority, seniorityAnswer } from "./fixtures/definitions.js";

const theme = getDataEditorTheme();
const rect = { x: 10, y: 20, width: 200, height: 32 };

interface Call {
    readonly type: string;
    readonly props: Record<string, unknown>;
}

function canvas() {
    const ctx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D & {
        __getDrawCalls(): Call[];
        __getEvents(): Call[];
    };
    return ctx;
}

function record(
    status: AICellRecord["status"],
    definition: AIColumnDefinition,
    answer?: ParsedJevAnswer
): AICellRecord {
    const mapped = answer === undefined ? undefined : mapAIOutput(definition, answer);
    return {
        rowId: "r1",
        columnId: "c",
        status,
        runId: "run-1",
        requestSeq: 1,
        scope: "selection",
        mode: "suggest",
        identity: { questionFingerprint: "q", inputFingerprint: "i", model: "jev-latest" },
        destinationSnapshot: "",
        timings: {},
        ...(answer === undefined ? {} : { answer }),
        ...(mapped?.ok === true ? { output: mapped.output } : {}),
    };
}

/** Draws a cell and returns what was drawn, as a list of short strings. */
function draw(rec: AICellRecord, definition: AIColumnDefinition, empty: boolean = true) {
    const ctx = canvas();
    const content = vi.fn(() => {
        ctx.fillText("content", 0, 0);
    });
    let alphaDuringContent = 1;
    content.mockImplementation(() => {
        alphaDuringContent = ctx.globalAlpha;
        ctx.fillText("content", 0, 0);
    });
    drawAICell({ ctx, rect, theme }, content, rec, definition, empty);
    const calls = ctx.__getDrawCalls().map(call => {
        if (call.type === "fillText") return `text ${String(call.props.text)}`;
        return call.type;
    });
    const events = ctx.__getEvents();
    const fonts = events.filter(e => e.type === "font").map(e => String(e.props.value));
    const fills = events.filter(e => e.type === "fillStyle").map(e => String(e.props.value));
    return { calls, fonts, fills, content, alphaDuringContent };
}

const champion = personaAnswer(0.9, 0.8);

describe("drawAICell: every state (SPST-17 §8.4)", () => {
    test("pending and queued: the content, then a static pending glyph", () => {
        for (const status of ["pending", "queued"] as const) {
            const out = draw(record(status, persona), persona);
            expect(out.content).toHaveBeenCalledTimes(1);
            expect(out.calls).toEqual(["text content", "text ⋯"]);
        }
    });

    test("suggested on an empty cell: italic ghost text in the accent color, and a sparkle", () => {
        const out = draw(record("suggested", persona, champion), persona);
        expect(out.calls).toEqual(["text content", "text Champion", "text ✦"]);
        expect(out.fonts.some(font => font.includes("italic"))).toBe(true);
        expect(out.fills).toContain(theme.accentColor.toLowerCase());
        expect(out.alphaDuringContent).toBe(1);
    });

    test("suggested on a populated cell: the value dimmed, plus a → suggestion chip", () => {
        const out = draw(record("suggested", persona, champion), persona, false);
        expect(out.alphaDuringContent).toBeLessThan(1);
        expect(out.calls).toEqual(["text content", "fillRect", "text → Champion"]);
    });

    test("review: like suggested, plus an amber corner marker", () => {
        const out = draw(record("review", persona, champion), persona);
        expect(out.calls).toEqual(["text content", "text Champion", "text ✦", "fill"]);
        expect(out.fills).toContain("#d97706");
    });

    test("a semantic outcome: the label in muted italic with its own marker, not an error", () => {
        const none = personaAnswer(0.9, 0.9, "none_of_the_above");
        const out = draw(record("suggested", persona, none), persona);
        expect(out.calls).toEqual(["text content", "text None of the above", "text ◇"]);
        expect(out.fills).toContain(theme.textLight.toLowerCase());
        expect(out.fills).not.toContain("#dc2626");
    });

    test("withheld: the value unchanged and a hollow marker only", () => {
        const out = draw(record("withheld", persona, champion), persona, false);
        expect(out.alphaDuringContent).toBe(1);
        expect(out.calls).toEqual(["text content", "text ○"]);
    });

    test("error: a red corner marker", () => {
        const out = draw(record("error", persona), persona);
        expect(out.calls).toEqual(["text content", "fill"]);
        expect(out.fills).toContain("#dc2626");
    });

    test("stale: a grey, struck-through ghost with a ↻ marker", () => {
        const out = draw(record("stale", persona, champion), persona);
        expect(out.calls).toEqual(["text content", "text Champion", "fillRect", "text ↻"]);
        expect(out.fills).toContain(theme.textLight.toLowerCase());
    });

    test("accepted, applied and rejected: the normal cell, with no marker", () => {
        for (const status of ["accepted", "applied", "rejected"] as const) {
            const out = draw(record(status, persona, champion), persona);
            expect(out.calls).toEqual(["text content"]);
        }
    });

    test("the overlay is clipped to the cell", () => {
        const ctx = canvas();
        drawAICell({ ctx, rect, theme }, () => undefined, record("suggested", persona, champion), persona, true);
        const events = ctx.__getEvents().map(e => e.type);
        expect(events).toContain("clip");
        expect(events.filter(e => e === "save")).toHaveLength(events.filter(e => e === "restore").length);
    });
});

describe("presentations for the three primitives (§8.4)", () => {
    test("Choice: the label, then the selected option's probability and the model confidence when asked", () => {
        expect(presentation(persona, record("suggested", persona, champion))).toEqual({ text: "Champion" });
        const shown = { ...persona, presentation: { showProbability: true, showConfidence: true } };
        expect(presentation(shown, record("suggested", shown, champion))).toEqual({
            text: "Champion · 0.90 · conf 0.80",
        });
    });

    test("Score: the number or the level label, with an optional rubric bar", () => {
        const answer = seniorityAnswer(2.25, 0.7);
        expect(presentation(seniority, record("suggested", seniority, answer))).toEqual({ text: "2.25" });
        const labelled = {
            ...seniority,
            output: { store: "level-label" as const },
            presentation: { rubricBar: true, showConfidence: true },
        };
        expect(presentation(labelled, record("suggested", labelled, answer))).toEqual({
            text: "Director · conf 0.70",
            bar: 0.75,
        });
        const out = draw(record("suggested", labelled, answer), labelled);
        expect(out.calls).toEqual(["text content", "text Director · conf 0.70", "fillRect", "text ✦"]);
    });

    test("Noul: Yes, No or Uncertain (never No for the middle band), or the probability, with an optional bar", () => {
        expect(presentation(ownsBudget, record("suggested", ownsBudget, noulAnswer(0.95)))?.text).toBe("Yes");
        expect(presentation(ownsBudget, record("suggested", ownsBudget, noulAnswer(0.02)))?.text).toBe("No");
        expect(presentation(ownsBudget, record("review", ownsBudget, noulAnswer(0.5)))?.text).toBe("Uncertain");
        const raw = {
            ...ownsBudget,
            output: { store: "probability" as const },
            presentation: { probabilityBar: true },
        };
        expect(presentation(raw, record("suggested", raw, noulAnswer(0.42)))).toEqual({ text: "0.42", bar: 0.42 });
        // The middle band has no value to write, so it is drawn like a semantic outcome.
        const out = draw(record("review", ownsBudget, noulAnswer(0.5)), ownsBudget);
        expect(out.calls).toEqual(["text content", "text Uncertain", "text ◇", "fill"]);
    });
});

describe("drawAIHeaderBadge", () => {
    test("draws the badge left of the menu button, or at the right edge without one", () => {
        const ctx = canvas();
        drawAIHeaderBadge(ctx, rect, { x: 180, y: 20, width: 20, height: 32 }, theme);
        drawAIHeaderBadge(ctx, rect, { x: 0, y: 0, width: 0, height: 0 }, theme);
        const texts = ctx.__getDrawCalls().filter(c => c.type === "fillText");
        expect(texts.map(c => c.props.text)).toEqual(["✦", "✦"]);
        expect(texts[0].props.x).toBe(178);
        expect(texts[1].props.x).toBe(rect.x + rect.width - theme.cellHorizontalPadding);
    });
});
