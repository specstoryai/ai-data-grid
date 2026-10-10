// Types for office-clipboard.mjs (plain JS so the browser check can bundle it too).
export interface OfficeItem {
    readonly list?: string;
    readonly level?: number;
    readonly lfo?: number;
    readonly marker: string;
    readonly text: string;
    readonly position?: "First" | "Middle" | "Last" | "Normal";
    readonly comments?: "outlook";
}
export interface OfficeFixture {
    readonly id: string;
    readonly html: string;
}
export interface OfficeBrowserCase extends OfficeFixture {
    readonly name: string;
    readonly text: string;
    readonly expected: {
        readonly ul: number;
        readonly ol: number;
        readonly li: number;
        readonly depth: number;
        /** Items whose text still looks like a marker (default 0). */
        readonly marked?: number;
    };
    readonly saved?: string;
}
export declare function wordDocument(listRules: string, body: string): string;
export declare function fragmentDocument(body: string): string;
export declare function wordItem(item: OfficeItem): string;
export declare function wordContinuation(text: string, position?: "Middle" | "Last"): string;
export declare function wordParagraph(text: string): string;
export declare const bulletRules: string;
export declare const numberRules: string;
export declare const mixedRules: string;
export declare const officeBullets: string;
export declare const officeBulletsSaved: string;
export declare const officeNumbers: string;
export declare const officeNumbersSaved: string;
export declare const officeMixed: string;
export declare const officeMixedSaved: string;
export declare const officeContinuation: string;
export declare const officeRestart: string;
export declare const officeFormats: string;
export declare const officePictureBullets: string;
export declare const officeFragment: string;
export declare const officeWebKitBullets: string;
export declare const officeWebKitNumbers: string;
export declare const officeOutlook: string;
export declare const officeTable: string;
export declare const officeNoIgnore: string;
export declare const officeHeadings: string;
export declare const textMentionsMsoList: string;
export declare const outlookWebLists: string;
export declare const wordWebLists: string;
export declare function officeListItem(html: string): string;
export declare const malformedOffice: readonly { readonly name: string; readonly html: string }[];
export declare const officeMixedMalformed: string;
export declare const officeStaircase: string;
export declare const officeJump: string;
export declare const officeStartsDeep: string;
export declare const officeNestedStart: string;
export declare const officeNestedStartSaved: string;
export declare const officeContinuationNested: string;
export declare const officeTypedText: string;
export declare const officeTypedTextSaved: string;
export declare const officeNoIgnoreMixed: string;
export declare const officeNoIgnoreMixedSaved: string;
export declare const outlineRules: string;
export declare const officeOutline: string;
export declare const officeOutlineSaved: string;
export declare const officeOutlineFragment: string;
export declare const officeMarkerShapes: string;
export declare const officeMarkerShapesFragment: string;
export declare function longMarkerOfficeList(count: number): string;
export declare const noncanonicalHTML: string;
export declare const noncanonicalMentionsMsoList: string;
export declare const officeReordered: string;
export declare const officeMismatched: string;
export declare function largeOfficeList(count: number, options?: { deep?: boolean }): string;
export declare function oversizedOfficeList(): string;
export declare const officeHostile: string;
export declare const officeBrowserCases: readonly OfficeBrowserCase[];
export declare const officeCorpus: readonly OfficeFixture[];
