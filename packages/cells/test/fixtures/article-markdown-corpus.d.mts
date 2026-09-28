// Types for article-markdown-corpus.mjs.
export interface CorpusDocument {
    readonly id: string;
    readonly name: string;
    readonly markdown: string;
}
export declare const markdownCorpus: readonly CorpusDocument[];
