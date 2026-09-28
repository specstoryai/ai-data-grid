import type { ProvideEditorComponent } from "@specstory/ai-data-grid";
import * as React from "react";
import { styled } from "@linaria/react";
import type { ArticleCell } from "./article-cell-types.js";
// Patched, vendored Toast UI Editor 3.2.2 that sanitizes through the external `dompurify`
// package (SPST-48). This path resolves the same way from src/, dist/esm/ and dist/cjs/.
import { Editor, type ToolbarItemName } from "../../vendor/toast-ui/editor.js";

const Wrapper = styled.div`
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

const toolbarItems: ToolbarItemName[][] = [
    ["heading", "bold", "italic", "strike"],
    ["hr", "quote"],
    ["ul", "ol", "task", "indent", "outdent"],
    ["table", "link"],
    ["code", "codeblock"],
];

const ArticleCellEditor: ProvideEditorComponent<ArticleCell> = p => {
    // Toast UI owns its content once created, so it's initialized from the value the
    // editor opened with, and Save reads the Markdown back from the instance.
    const [initialMarkdown] = React.useState(p.value.data.markdown);
    const readonly = p.value.readonly === true;
    const hostRef = React.useRef<HTMLDivElement>(null);
    const editorRef = React.useRef<{ readonly editor: Editor; readonly baseline: string }>(undefined);

    React.useEffect(() => {
        const host = hostRef.current;
        if (host === null) return;
        // A fresh element per mount keeps StrictMode's mount/unmount/mount cycle clean.
        const el = document.createElement("div");
        host.append(el);
        if (readonly) {
            const viewer = Editor.factory({ el, viewer: true, initialValue: initialMarkdown, usageStatistics: false });
            return () => {
                viewer.destroy();
                el.remove();
            };
        }
        const editor = new Editor({
            el,
            initialEditType: "wysiwyg",
            hideModeSwitch: true,
            autofocus: true,
            height: "75vh",
            usageStatistics: false,
            initialValue: initialMarkdown,
            toolbarItems,
        });
        // Toast UI normalizes Markdown on load, so remember what it reports before any edit.
        editorRef.current = { editor, baseline: editor.getMarkdown() };
        return () => {
            editorRef.current = undefined;
            editor.destroy();
            el.remove();
        };
    }, [initialMarkdown, readonly]);

    const onKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        e.stopPropagation();
    }, []);

    const onSave = React.useCallback(() => {
        const current = editorRef.current;
        const markdown = current?.editor.getMarkdown();
        p.onFinishedEditing({
            ...p.value,
            data: {
                ...p.value.data,
                // Unchanged content saves the original Markdown byte for byte.
                markdown: markdown === undefined || markdown === current?.baseline ? p.value.data.markdown : markdown,
            },
        });
    }, [p]);

    const onClose = React.useCallback(() => {
        p.onFinishedEditing(undefined);
    }, [p]);

    if (readonly) {
        return (
            <Wrapper id="gdg-markdown-readonly" onKeyDown={onKeyDown} style={{ height: "75vh", padding: "35px" }}>
                <div ref={hostRef} />
            </Wrapper>
        );
    }

    return (
        <Wrapper id="gdg-markdown-wysiwyg" onKeyDown={onKeyDown}>
            <div ref={hostRef} />
            <div className="gdg-footer">
                <button className="gdg-close-button" onClick={onClose}>
                    Close
                </button>
                <button className="gdg-save-button" onClick={onSave}>
                    Save
                </button>
            </div>
        </Wrapper>
    );
};

export default ArticleCellEditor;
