import type * as React from "react";
import type { DataEditorProps, DataEditorRef } from "../../data-editor/data-editor.js";
import type { AIFillApi } from "../config/api.js";
import type { AIFillConfig } from "../config/types.js";

/**
 * The static half of AI Fill's `DataEditor` integration. It is the only AI
 * Fill module in the initial bundle, so it holds types and one small helper;
 * everything else loads lazily with the controller (SPST-17, A1).
 */

/** The props AI Fill composes. Every other prop passes through untouched. */
export type AIFillComposedProps = Pick<
    DataEditorProps,
    | "columns"
    | "drawCell"
    | "drawHeader"
    | "onHeaderMenuClick"
    | "onHeaderContextMenu"
    | "onCellContextMenu"
    | "onCellEdited"
    | "onCellsEdited"
    | "onKeyDown"
    | "gridSelection"
    | "onGridSelectionChange"
    | "getCellContent"
    | "rows"
    | "validateCell"
    | "className"
    | "onCellClicked"
    | "portalElementRef"
>;

/** What the loaded controller hands `DataEditor`. A new object means `DataEditor` must render again. */
export interface AIFillBridge {
    readonly api: AIFillApi;
    /**
     * Composes the app's props with AI Fill's, during render. App handlers are
     * wrapped, never replaced, and each wrapper keeps its identity for as long
     * as the app handler it wraps does.
     */
    readonly compose: <P extends AIFillComposedProps>(props: P, config: AIFillConfig) => P;
}

/** The lazily loaded controller's props. */
export interface AIFillControllerProps {
    readonly config: AIFillConfig;
    /** The app's props, without `aiFill`. */
    readonly props: AIFillComposedProps;
    /** The core grid's own handle. */
    readonly grid: React.RefObject<DataEditorRef | null>;
    readonly onBridge: (bridge: AIFillBridge | undefined) => void;
}

/**
 * Points the app's ref at the grid's handle, adding `aiFill` once the API
 * exists. The handle's methods are closures, so a shallow copy is safe.
 */
export function linkAIFillRef(
    target: React.ForwardedRef<DataEditorRef>,
    handle: DataEditorRef | null,
    api: AIFillApi | undefined
): void {
    const value = handle === null || api === undefined ? handle : { ...handle, aiFill: api };
    if (typeof target === "function") target(value);
    else if (target !== null) target.current = value;
}
