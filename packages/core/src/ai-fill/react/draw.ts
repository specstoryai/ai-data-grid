import type { Theme } from "../../common/styles.js";
import type { Rectangle } from "../../internal/data-grid/data-grid-types.js";
import type { AIColumnDefinition } from "../config/types.js";
import type { AICellRecord } from "../engine/store.js";

/** Colors that don't come from the grid theme: the review and error markers. */
const reviewColor = "#d97706";
const errorColor = "#dc2626";
const markerSize = 7;

/** What a cell's AI presentation needs. */
export interface AIDrawArgs {
    readonly ctx: CanvasRenderingContext2D;
    readonly rect: Rectangle;
    readonly theme: Theme;
}

/** The text and optional bar (0–1) a result shows in its cell (SPST-17 §8.4, "Standard presentations"). */
export function presentation(
    definition: AIColumnDefinition,
    record: AICellRecord
): { readonly text: string; readonly bar?: number } | undefined {
    const output = record.output;
    const answer = record.answer;
    if (output === undefined || answer === undefined) return undefined;
    let text = output.display;
    if (definition.primitive === "choice" && answer.type === "choice") {
        const p = definition.presentation;
        if (p?.showProbability === true) text += ` · ${(answer.probabilities[answer.choice] ?? 0).toFixed(2)}`;
        if (p?.showConfidence === true) text += ` · conf ${answer.confidence.toFixed(2)}`;
        return { text };
    }
    if (definition.primitive === "score" && answer.type === "score") {
        if (definition.presentation?.showConfidence === true) text += ` · conf ${answer.confidence.toFixed(2)}`;
        const top = definition.levels.length - 1;
        return definition.presentation?.rubricBar === true && top > 0 ? { text, bar: answer.score / top } : { text };
    }
    if (definition.primitive === "noul" && answer.type === "noul") {
        return definition.presentation?.probabilityBar === true ? { text, bar: answer.noul } : { text };
    }
    return { text };
}

function font(theme: Theme, italic: boolean): string {
    return `${italic ? "italic " : ""}${theme.baseFontStyle} ${theme.fontFamily}`;
}

/** A glyph at the right edge of the cell. */
function marker(a: AIDrawArgs, glyph: string, color: string): void {
    const { ctx, rect, theme } = a;
    ctx.font = font(theme, false);
    ctx.fillStyle = color;
    ctx.textAlign = "right";
    ctx.fillText(glyph, rect.x + rect.width - theme.cellHorizontalPadding, rect.y + rect.height / 2);
    ctx.textAlign = "left";
}

/** A small filled triangle in the top-right corner. */
function corner(a: AIDrawArgs, color: string): void {
    const { ctx, rect } = a;
    const right = rect.x + rect.width;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(right - markerSize, rect.y);
    ctx.lineTo(right, rect.y);
    ctx.lineTo(right, rect.y + markerSize);
    ctx.closePath();
    ctx.fill();
}

/** Ghost text at the left of the cell, with an optional bar along the bottom edge. */
function ghost(a: AIDrawArgs, shown: { text: string; bar?: number }, color: string, struck: boolean): void {
    const { ctx, rect, theme } = a;
    const x = rect.x + theme.cellHorizontalPadding;
    const y = rect.y + rect.height / 2;
    ctx.font = font(theme, true);
    ctx.fillStyle = color;
    ctx.fillText(shown.text, x, y);
    if (struck) {
        const width = ctx.measureText(shown.text).width;
        ctx.fillRect(x, y, width, 1);
    }
    if (shown.bar !== undefined) {
        const width = rect.width - 2 * theme.cellHorizontalPadding;
        ctx.fillRect(x, rect.y + rect.height - 3, Math.max(0, Math.min(1, shown.bar)) * width, 2);
    }
}

/** A "→ suggestion" chip at the right of a populated cell. */
function chip(a: AIDrawArgs, text: string, color: string): void {
    const { ctx, rect, theme } = a;
    const label = `→ ${text}`;
    ctx.font = font(theme, true);
    const width = ctx.measureText(label).width + 8;
    const x = rect.x + rect.width - width - theme.cellHorizontalPadding;
    ctx.fillStyle = theme.accentLight;
    ctx.fillRect(x, rect.y + 4, width, rect.height - 8);
    ctx.fillStyle = color;
    ctx.fillText(label, x + 4, rect.y + rect.height / 2);
}

/**
 * Draws a cell with an AI record (SPST-17 §8.4). `drawContent` draws the
 * cell's normal content, through the app's `drawCell` when it has one. The
 * overlay is static: the cell repaints only when its record changes.
 */
export function drawAICell(
    a: AIDrawArgs,
    drawContent: () => void,
    record: AICellRecord,
    definition: AIColumnDefinition,
    destinationEmpty: boolean
): void {
    const { ctx, rect, theme } = a;
    const status = record.status;
    const shown = presentation(definition, record);
    const suggestion = (status === "suggested" || status === "review") && shown !== undefined;

    if (suggestion && !destinationEmpty) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        drawContent();
        ctx.restore();
    } else {
        drawContent();
    }
    if (status === "accepted" || status === "applied" || status === "rejected") return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    ctx.textBaseline = "middle";
    if (suggestion) {
        const semantic = record.output?.outcome !== "value";
        const color = semantic ? theme.textLight : theme.accentColor;
        if (destinationEmpty) {
            ghost(a, shown, color, false);
            marker(a, semantic ? "◇" : "✦", color);
        } else {
            chip(a, shown.text, color);
        }
        if (status === "review") corner(a, reviewColor);
    } else {
        switch (status) {
            case "queued":
            case "pending":
                marker(a, "⋯", theme.textLight);
                break;
            case "withheld":
                marker(a, "○", theme.textLight);
                break;
            case "error":
                corner(a, errorColor);
                break;
            case "stale":
                if (shown !== undefined && destinationEmpty) ghost(a, shown, theme.textLight, true);
                marker(a, "↻", theme.textLight);
                break;
        }
    }
    ctx.restore();
}

/** The header badge of an AI column, left of the menu button. */
export function drawAIHeaderBadge(ctx: CanvasRenderingContext2D, rect: Rectangle, menuBounds: Rectangle, theme: Theme) {
    ctx.save();
    ctx.font = font(theme, false);
    ctx.fillStyle = theme.accentColor;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const right = menuBounds.width > 0 ? menuBounds.x - 2 : rect.x + rect.width - theme.cellHorizontalPadding;
    ctx.fillText("✦", right, rect.y + rect.height / 2);
    ctx.restore();
}
