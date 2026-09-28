// ArticleCell's editor and viewer styles (SPST-61). The build writes them into dist/esm, and
// dist/index.css imports them, so there's no separate stylesheet to import. Every rule is
// scoped under the wrapper: there are no global ProseMirror rules.
import { styled } from "@linaria/react";

export const ArticleWrapper = styled.div`
    position: relative;
    color: var(--gdg-text-dark, #313139);
    background-color: var(--gdg-bg-cell, #ffffff);
    font-family: var(--gdg-font-family);
    border-radius: var(--gdg-rounding-radius, 9px);

    &#gdg-markdown-readonly {
        overflow: auto;
    }

    .gdg-article-body {
        display: flex;
        flex-direction: column;
        height: 75vh;
    }

    .gdg-article-frame {
        flex: 1;
        min-height: 0;
        overflow: auto;
    }

    .gdg-article-frame > div,
    .gdg-article-frame .milkdown {
        min-height: 100%;
        display: flex;
        flex-direction: column;
    }

    /* The toolbar */
    .gdg-article-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 2px;
        padding: 6px 8px;
        border-bottom: 1px solid var(--gdg-border-color, rgba(115, 116, 131, 0.16));
        background-color: var(--gdg-bg-header, #f7f7f8);
        border-radius: var(--gdg-rounding-radius, 9px) var(--gdg-rounding-radius, 9px) 0 0;
    }

    .gdg-article-toolbar-group {
        display: flex;
        align-items: center;
        gap: 2px;
        padding-right: 6px;
        margin-right: 4px;
        border-right: 1px solid var(--gdg-border-color, rgba(115, 116, 131, 0.16));

        &:last-child {
            border-right: none;
        }
    }

    .gdg-article-tool {
        min-width: 28px;
        height: 28px;
        padding: 0 6px;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--gdg-text-medium, #737383);
        font-family: var(--gdg-font-family);
        font-size: 13px;
        cursor: pointer;

        &:hover:not(:disabled) {
            background-color: var(--gdg-bg-header-hovered, #efeff1);
            color: var(--gdg-text-dark, #313139);
        }

        &[aria-pressed="true"] {
            background-color: var(--gdg-accent-light, rgba(62, 116, 253, 0.1));
            color: var(--gdg-accent-color, #4f5dff);
        }

        &:disabled {
            opacity: 0.4;
            cursor: default;
        }
    }

    /* The heading menu and the link dialog, inside the wrapper so the overlay keeps them */
    .gdg-article-popover {
        position: absolute;
        top: 44px;
        left: 8px;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 180px;
        padding: 8px;
        border: 1px solid var(--gdg-border-color, rgba(115, 116, 131, 0.16));
        border-radius: 6px;
        background-color: var(--gdg-bg-cell, #ffffff);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);

        label {
            display: flex;
            flex-direction: column;
            gap: 2px;
            font-size: 12px;
            color: var(--gdg-text-medium, #737383);
        }

        input {
            padding: 4px 6px;
            font-family: var(--gdg-font-family);
            font-size: 13px;
            border: 1px solid var(--gdg-border-color, rgba(115, 116, 131, 0.16));
            border-radius: 4px;
        }
    }

    .gdg-article-popover-actions {
        display: flex;
        justify-content: flex-end;
        gap: 4px;
    }

    .gdg-article-error {
        font-size: 12px;
        color: #d14343;
    }

    .gdg-article-menu-item {
        text-align: left;
    }

    /* The content, in the editor and the viewer */
    .gdg-article-content {
        position: relative;
        flex: 1;
        padding: 16px 24px;
        outline: none;
        white-space: pre-wrap;
        word-wrap: break-word;
        font-variant-ligatures: none;
        font-feature-settings: "liga" 0;
        font-size: 14px;
        line-height: 1.6;

        & > :first-child {
            margin-top: 0;
        }

        p {
            margin: 0 0 10px;
        }

        h1,
        h2,
        h3,
        h4,
        h5,
        h6 {
            margin: 18px 0 10px;
            line-height: 1.3;
            font-weight: 600;
        }

        h1 {
            font-size: 1.9em;
            border-bottom: 1px solid var(--gdg-border-color, rgba(115, 116, 131, 0.16));
        }
        h2 {
            font-size: 1.5em;
            border-bottom: 1px solid var(--gdg-border-color, rgba(115, 116, 131, 0.16));
        }
        h3 {
            font-size: 1.25em;
        }
        h4 {
            font-size: 1.1em;
        }
        h5 {
            font-size: 1em;
        }
        h6 {
            font-size: 0.9em;
            color: var(--gdg-text-medium, #737383);
        }

        a {
            color: var(--gdg-link-color, #353fb5);
            text-decoration: underline;
        }

        strong {
            font-weight: 600;
        }

        code {
            padding: 1px 4px;
            border-radius: 3px;
            background-color: var(--gdg-bg-header, #f7f7f8);
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 0.9em;
        }

        pre {
            margin: 0 0 10px;
            padding: 10px 12px;
            border-radius: 4px;
            background-color: var(--gdg-bg-header, #f7f7f8);
            overflow-x: auto;
            white-space: pre;

            code {
                padding: 0;
                background: none;
            }
        }

        blockquote {
            margin: 0 0 10px;
            padding: 0 12px;
            border-left: 4px solid var(--gdg-border-color, rgba(115, 116, 131, 0.16));
            color: var(--gdg-text-medium, #737383);
        }

        hr {
            margin: 16px 0;
            border: none;
            border-top: 1px solid var(--gdg-border-color, rgba(115, 116, 131, 0.16));
        }

        ul,
        ol {
            margin: 0 0 10px;
            padding-left: 24px;
        }

        li > p {
            margin: 0 0 4px;
        }

        li[data-item-type="task"] {
            position: relative;
            list-style: none;

            &::before {
                content: "";
                position: absolute;
                left: -22px;
                top: 4px;
                width: 14px;
                height: 14px;
                border: 1px solid var(--gdg-text-light, #b2b2c0);
                border-radius: 3px;
                background-color: var(--gdg-bg-cell, #ffffff);
                cursor: pointer;
            }
        }

        li[data-item-type="task"][data-checked="true"] {
            & > p {
                color: var(--gdg-text-medium, #737383);
            }

            &::before {
                border-color: var(--gdg-accent-color, #4f5dff);
                background: var(--gdg-accent-color, #4f5dff)
                    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='white' stroke-width='2' d='M3.5 8.5l3 3 6-7'/%3E%3C/svg%3E")
                    center / 12px no-repeat;
            }
        }

        table {
            margin: 0 0 10px;
            border-collapse: collapse;
        }

        th,
        td {
            min-width: 48px;
            padding: 4px 10px;
            border: 1px solid var(--gdg-border-color, rgba(115, 116, 131, 0.16));
            vertical-align: top;

            p {
                margin: 0;
            }
        }

        th {
            background-color: var(--gdg-bg-header, #f7f7f8);
            font-weight: 600;
        }

        .selectedCell {
            background-color: var(--gdg-accent-light, rgba(62, 116, 253, 0.1));
        }

        img {
            max-width: 100%;
        }

        /* Raw HTML from the Markdown: shown as its source text, never interpreted */
        span[data-type="html"] {
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 0.9em;
            color: var(--gdg-text-medium, #737383);
            white-space: pre-wrap;
        }

        sup[data-type="footnote_reference"] {
            font-size: 0.75em;
            color: var(--gdg-link-color, #353fb5);
        }

        dl[data-type="footnote_definition"] {
            margin: 0 0 10px;
            font-size: 0.9em;
            color: var(--gdg-text-medium, #737383);

            dt {
                float: left;
                margin-right: 6px;
            }

            dd {
                margin: 0;
            }
        }

        &.ProseMirror-hideselection *::selection {
            background: transparent;
        }

        &.ProseMirror-hideselection {
            caret-color: transparent;
        }

        .ProseMirror-selectednode {
            outline: 2px solid var(--gdg-accent-color, #4f5dff);
        }
    }

    /* Shown if the editor can't be created: the stored Markdown as plain text */
    .gdg-article-fallback {
        margin: 0;
        padding: 16px 24px;
        white-space: pre-wrap;
        word-wrap: break-word;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 13px;
    }

    .gdg-footer {
        display: flex;
        justify-content: flex-end;
        padding: 20px;

        button {
            border: none;
            padding: 8px 16px;
            font-size: 14px;
            font-weight: 500;
            font-family: var(--gdg-font-family);
            cursor: pointer;
            border-radius: var(--gdg-rounding-radius, 9px);
        }
    }

    .gdg-save-button {
        background-color: var(--gdg-accent-color);
        color: var(--gdg-accent-fg);
    }

    .gdg-close-button {
        background-color: var(--gdg-bg-header);
        color: var(--gdg-text-medium);
        margin-right: 8px;
    }
`;
