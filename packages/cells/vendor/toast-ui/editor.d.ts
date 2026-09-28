// Minimal hand-written types for the vendored Toast UI Editor 3.2.2 (editor.js). They cover
// only what src/cells/article-cell-editor.tsx uses; see README.md.

export type ToolbarItemName =
    | "heading"
    | "bold"
    | "italic"
    | "strike"
    | "hr"
    | "quote"
    | "ul"
    | "ol"
    | "task"
    | "indent"
    | "outdent"
    | "table"
    | "image"
    | "link"
    | "code"
    | "codeblock";

export interface ToastUIViewerOptions {
    readonly el: HTMLElement;
    readonly initialValue?: string;
    readonly usageStatistics?: boolean;
}

export interface ToastUIEditorOptions extends ToastUIViewerOptions {
    readonly height?: string;
    readonly initialEditType?: "markdown" | "wysiwyg";
    readonly hideModeSwitch?: boolean;
    readonly autofocus?: boolean;
    readonly toolbarItems?: ToolbarItemName[][];
}

export interface ToastUIViewer {
    destroy(): void;
}

export declare class Editor {
    constructor(options: ToastUIEditorOptions);
    static factory(options: ToastUIViewerOptions & { readonly viewer: true }): ToastUIViewer;
    getMarkdown(): string;
    destroy(): void;
}

export default Editor;
