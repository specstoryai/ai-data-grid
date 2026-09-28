import type { ProvideEditorComponent } from "@specstory/ai-data-grid";
import * as React from "react";
import type { ArticleCell } from "./article-cell-types.js";
// The Milkdown-based article editor and viewer with cells' own defenses (SPST-61). See
// article-editor/create-article-editor.ts.
import { type ArticleEditor, createArticleEditor } from "./article-editor/create-article-editor.js";
import { ArticleWrapper } from "./article-editor/styles.js";
import { ArticleToolbar } from "./article-editor/toolbar.js";

const ArticleCellEditor: ProvideEditorComponent<ArticleCell> = p => {
    // The editor owns its content once created, so it's initialized from the value the
    // editor opened with, and Save reads the Markdown back from the editor.
    const [initialMarkdown] = React.useState(p.value.data.markdown);
    const readonly = p.value.readonly === true;
    const frameRef = React.useRef<HTMLDivElement>(null);
    const editorRef = React.useRef<{ readonly editor: ArticleEditor; readonly baseline: string }>(undefined);
    const [editor, setEditor] = React.useState<ArticleEditor>();
    const [failed, setFailed] = React.useState(false);
    // Bumped on every editor update, so the toolbar re-renders with the new state.
    const [, setVersion] = React.useState(0);

    React.useEffect(() => {
        const frame = frameRef.current;
        if (frame === null) return;
        // A fresh element per mount keeps StrictMode's mount/unmount/mount cycle clean.
        const el = document.createElement("div");
        frame.append(el);
        let disposed = false;
        let created: ArticleEditor | undefined;
        createArticleEditor({
            root: el,
            markdown: initialMarkdown,
            readonly,
            onUpdate: () => setVersion(v => v + 1),
        }).then(
            instance => {
                // Creation is async: if this effect was cleaned up meanwhile, discard the result.
                if (disposed) {
                    void instance.destroy();
                    return;
                }
                created = instance;
                // Remember how the editor serializes the untouched document, before any edit.
                editorRef.current = { editor: instance, baseline: instance.serialize() };
                setEditor(instance);
                if (!readonly) instance.view.focus();
            },
            () => {
                if (!disposed) setFailed(true);
            }
        );
        return () => {
            disposed = true;
            editorRef.current = undefined;
            setEditor(undefined);
            if (created !== undefined) void created.destroy();
            el.remove();
        };
    }, [initialMarkdown, readonly]);

    const onKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        e.stopPropagation();
    }, []);

    const onSave = React.useCallback(() => {
        const current = editorRef.current;
        const markdown = current?.editor.serialize();
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

    // If the editor can't be created, show the stored Markdown as plain text.
    const fallback = failed ? <pre className="gdg-article-fallback">{initialMarkdown}</pre> : null;

    if (readonly) {
        return (
            <ArticleWrapper
                id="gdg-markdown-readonly"
                onKeyDown={onKeyDown}
                style={{ height: "75vh", padding: "35px" }}
            >
                <div ref={frameRef} className="gdg-article-frame" />
                {fallback}
            </ArticleWrapper>
        );
    }

    return (
        <ArticleWrapper id="gdg-markdown-wysiwyg" onKeyDown={onKeyDown}>
            <div className="gdg-article-body">
                {editor !== undefined && <ArticleToolbar editor={editor} />}
                <div ref={frameRef} className="gdg-article-frame" />
                {fallback}
            </div>
            <div className="gdg-footer">
                <button className="gdg-close-button" onClick={onClose}>
                    Close
                </button>
                <button className="gdg-save-button" onClick={onSave}>
                    Save
                </button>
            </div>
        </ArticleWrapper>
    );
};

export default ArticleCellEditor;
