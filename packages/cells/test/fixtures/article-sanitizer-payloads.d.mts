// Types for article-sanitizer-payloads.mjs (plain JS so the Chromium check can bundle it too).
export interface RenderPayload {
    readonly id: string;
    readonly name: string;
    readonly markdown: string;
}
export interface PastePayload {
    readonly id: string;
    readonly name: string;
    readonly html: string;
    readonly drop?: boolean;
}
export declare const renderPayloads: readonly RenderPayload[];
export declare const pastePayloads: readonly PastePayload[];
export declare const htmlOnlyCodePayload: PastePayload;
export declare const safeMarkdown: string;
export declare const safeSelectors: readonly string[];
export declare const safeURLMarkdown: string;
export declare const safeURLs: { readonly links: readonly string[]; readonly images: readonly string[] };
export declare const normalPasteHTML: string;
export declare const officeListPasteHTML: string;
export declare function contentRoots(container: ParentNode): Element[];
export declare function findDangerousDOM(container: ParentNode): string[];
