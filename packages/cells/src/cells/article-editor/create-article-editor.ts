// Creates ArticleCell's editor and viewer (SPST-61): Milkdown's headless core with the
// CommonMark and GFM presets and the history plugin, plus the defenses D1–D5. The viewer is
// the same editor with `editable: false`. No other Milkdown plugin (clipboard, upload, slash,
// block, tooltip, listener) is used, and there are no node views.
import {
    type CmdKey,
    commandsCtx,
    defaultValueCtx,
    Editor,
    editorViewCtx,
    editorViewOptionsCtx,
    rootCtx,
    serializerCtx,
} from "@milkdown/core";
import { history } from "@milkdown/plugin-history";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { $prose, callCommand } from "@milkdown/utils";
import { articleClipboardProps, installPasteDropBackstop } from "./clipboard.js";
import { articleSchema } from "./schema.js";
import { articleTaskList } from "./task-list.js";

/** The class on the ProseMirror element, in the editor and the viewer. */
export const ARTICLE_CONTENT_CLASS = "gdg-article-content";

export interface ArticleEditorOptions {
    /** A fresh element to create the editor in. The backstop (D5) is installed on it. */
    readonly root: HTMLElement;
    readonly markdown: string;
    readonly readonly: boolean;
    /** Called after every state update, for the toolbar. */
    readonly onUpdate?: (view: EditorView) => void;
}

export interface ArticleEditor {
    readonly view: EditorView;
    /** The document as Markdown. */
    serialize(): string;
    /** Runs a command against the current state. */
    run<T>(key: CmdKey<T>, payload?: T): boolean;
    /** Whether a command applies to the current state, without running it. */
    can<T>(key: CmdKey<T>, payload?: T): boolean;
    destroy(): Promise<void>;
}

export async function createArticleEditor(options: ArticleEditorOptions): Promise<ArticleEditor> {
    const { root, markdown, readonly, onUpdate } = options;
    const updates = $prose(
        () =>
            new Plugin({
                key: new PluginKey("ARTICLE_UPDATES"),
                view: () => ({ update: view => onUpdate?.(view) }),
            })
    );
    const editor = Editor.make()
        .config(ctx => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, markdown);
            ctx.update(editorViewOptionsCtx, prev => ({
                ...prev,
                ...articleClipboardProps,
                editable: () => !readonly,
                attributes: { class: ARTICLE_CONTENT_CLASS },
            }));
        })
        .use(commonmark)
        .use(gfm)
        .use(history)
        // After the presets, so the D2 schemas replace theirs.
        .use(articleSchema)
        .use(articleTaskList)
        .use(updates);
    await editor.create();

    const removeBackstop = installPasteDropBackstop(root);
    const view = editor.ctx.get(editorViewCtx);
    return {
        view,
        serialize: () => editor.ctx.get(serializerCtx)(view.state.doc),
        run: (key, payload) => {
            const done = editor.action(callCommand(key, payload));
            view.focus();
            return done;
        },
        can: (key, payload) => editor.ctx.get(commandsCtx).get(key)(payload)(view.state),
        destroy: async () => {
            removeBackstop();
            await editor.destroy();
        },
    };
}
