import { css } from "@linaria/core";

/**
 * The styles of AI Fill's built-in UI, extracted into `dist/index.css` by the
 * build like every other core style (SPST-17 A6). Every element has a
 * `gdg-ai-*` class, and every color reads a `--gdg-ai-*` variable that falls
 * back to the grid's `--gdg-*` theme variables. The popups copy the grid's
 * `--gdg-*` variables, so they follow its theme.
 */
export const aiStyles = css`
    box-sizing: border-box;
    font-family: var(--gdg-ai-font-family, var(--gdg-font-family, sans-serif));
    font-size: 13px;
    line-height: 1.4;
    color: var(--gdg-ai-text, var(--gdg-text-dark, #313139));

    *,
    *::before,
    *::after {
        box-sizing: border-box;
    }

    &.gdg-ai-popup {
        position: fixed;
        z-index: 1000;
        max-width: min(420px, calc(100vw - 16px));
        max-height: calc(100vh - 16px);
        overflow: auto;
        border-radius: 6px;
        background: var(--gdg-ai-bg, var(--gdg-bg-cell, #fff));
        border: 1px solid var(--gdg-ai-border, var(--gdg-border-color, rgba(115, 116, 131, 0.16)));
        box-shadow:
            0 0 1px rgba(62, 65, 86, 0.4),
            0 6px 16px rgba(62, 65, 86, 0.18);
    }

    &.gdg-ai-menu {
        min-width: 220px;
        padding: 4px 0;
    }

    .gdg-ai-menu-item {
        display: flex;
        flex-direction: column;
        padding: 6px 12px;
        cursor: pointer;
        outline: none;
    }

    .gdg-ai-menu-item:focus,
    .gdg-ai-menu-item:hover {
        background: var(--gdg-ai-accent-light, var(--gdg-accent-light, rgba(62, 116, 253, 0.1)));
    }

    .gdg-ai-menu-item[aria-disabled="true"] {
        cursor: default;
        color: var(--gdg-ai-text-muted, var(--gdg-text-light, #737383));
    }

    .gdg-ai-menu-separator {
        height: 1px;
        margin: 4px 0;
        background: var(--gdg-ai-border, var(--gdg-border-color, rgba(115, 116, 131, 0.16)));
    }

    .gdg-ai-muted,
    .gdg-ai-menu-detail {
        font-size: 12px;
        color: var(--gdg-ai-text-muted, var(--gdg-text-light, #737383));
    }

    &.gdg-ai-dialog,
    &.gdg-ai-inspector {
        padding: 12px 14px;
        outline: none;
    }

    &.gdg-ai-dialog {
        left: 50%;
        top: 20%;
        width: 380px;
        transform: translateX(-50%);
    }

    &.gdg-ai-inspector {
        width: 340px;
    }

    h2 {
        margin: 0 0 8px;
        font-size: 14px;
        font-weight: 600;
    }

    dl {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 4px 12px;
        margin: 0 0 8px;
    }

    dt {
        color: var(--gdg-ai-text-muted, var(--gdg-text-light, #737383));
    }

    dd,
    ul {
        margin: 0;
    }

    ul {
        padding-left: 18px;
    }

    .gdg-ai-section {
        margin: 8px 0;
    }

    .gdg-ai-bars {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 80px 48px;
        gap: 3px 8px;
        align-items: center;
        margin: 4px 0;
    }

    .gdg-ai-bar {
        height: 6px;
        border-radius: 3px;
        background: var(--gdg-ai-bar-track, var(--gdg-bg-bubble, #ededf3));
        overflow: hidden;
    }

    .gdg-ai-bar > span {
        display: block;
        height: 100%;
        background: var(--gdg-ai-bar, var(--gdg-accent-color, #4f5dff));
    }

    .gdg-ai-selected {
        font-weight: 600;
    }

    .gdg-ai-review {
        color: var(--gdg-ai-review, #b45309);
    }

    .gdg-ai-error {
        color: var(--gdg-ai-error, #b91c1c);
    }

    .gdg-ai-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        margin-top: 10px;
    }

    button,
    select {
        font: inherit;
        font-size: 12px;
        padding: 3px 10px;
        border-radius: 4px;
        border: 1px solid var(--gdg-ai-border, var(--gdg-border-color, rgba(115, 116, 131, 0.16)));
        background: var(--gdg-ai-bg, var(--gdg-bg-cell, #fff));
        color: inherit;
        cursor: pointer;
    }

    button:disabled {
        cursor: default;
        opacity: 0.5;
    }

    button:focus-visible,
    select:focus-visible,
    &:focus-visible {
        outline: 2px solid var(--gdg-ai-accent, var(--gdg-accent-color, #4f5dff));
        outline-offset: 1px;
    }

    .gdg-ai-primary {
        border-color: var(--gdg-ai-accent, var(--gdg-accent-color, #4f5dff));
        background: var(--gdg-ai-accent, var(--gdg-accent-color, #4f5dff));
        color: var(--gdg-ai-accent-fg, var(--gdg-accent-fg, #fff));
    }

    &.gdg-ai-status:not(:empty) {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 10px;
        padding: 6px 10px;
        border-radius: 6px;
        background: var(--gdg-ai-bg, var(--gdg-bg-cell, #fff));
        border: 1px solid var(--gdg-ai-border, var(--gdg-border-color, rgba(115, 116, 131, 0.16)));
        box-shadow: 0 2px 8px rgba(62, 65, 86, 0.15);
    }

    &.gdg-ai-status-floating {
        position: absolute;
        z-index: 1;
        left: 50%;
        bottom: 8px;
        max-width: calc(100% - 16px);
        transform: translateX(-50%);
    }

    .gdg-ai-status-actions {
        display: flex;
        gap: 6px;
    }

    &.gdg-ai-sr,
    .gdg-ai-sr {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
    }
`;
