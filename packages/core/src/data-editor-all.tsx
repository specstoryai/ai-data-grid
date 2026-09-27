import * as React from "react";
import { DataEditor, type DataEditorProps, type DataEditorRef } from "./data-editor/data-editor.js";
import { AllCellRenderers } from "./cells/index.js";
import { sprites } from "./internal/data-grid/sprites.js";
import ImageWindowLoaderImpl from "./common/image-window-loader.js";
import type { ImageWindowLoader } from "./internal/data-grid/image-window-loader-interface.js";
import type { AIFillApi } from "./ai-fill/config/api.js";
import type { AIFillConfig } from "./ai-fill/config/types.js";
import { type AIFillBridge, linkAIFillRef } from "./ai-fill/react/bridge.js";

const AIFillController = React.lazy(() => import("./ai-fill/react/controller.js"));

export interface DataEditorAllProps extends Omit<DataEditorProps, "imageWindowLoader"> {
    imageWindowLoader?: ImageWindowLoader;
    /**
     * Turns on AI Fill for this grid: AI-filled columns powered by Jev, with
     * suggestions, review, accept and undo built in. Leave it unset and the grid
     * behaves exactly as it does without AI Fill, and no AI code loads. Its API
     * is `ref.current.aiFill` once loaded. Keep the object stable (for example
     * with `useMemo`): a new object re-validates the configuration.
     */
    aiFill?: AIFillConfig;
}

const DataEditorAllImpl: React.ForwardRefRenderFunction<DataEditorRef, DataEditorAllProps> = (p, ref) => {
    const { aiFill, ...rest } = p;

    const allSprites = React.useMemo(() => {
        return { ...sprites, ...p.headerIcons };
    }, [p.headerIcons]);

    const renderers = React.useMemo(() => {
        return p.renderers ?? AllCellRenderers;
    }, [p.renderers])

    const imageWindowLoader = React.useMemo(() => {
        return p.imageWindowLoader ?? new ImageWindowLoaderImpl();
    }, [p.imageWindowLoader]);

    // AI Fill: these hooks run on every render, whether or not `aiFill` is set.
    // Every other AI hook lives in the lazily loaded controller.
    const [bridge, setBridge] = React.useState<AIFillBridge | undefined>(undefined);
    const grid = React.useRef<DataEditorRef | null>(null);
    const api = React.useRef<AIFillApi | undefined>(undefined);
    const mergedRef = React.useCallback(
        (handle: DataEditorRef | null) => {
            grid.current = handle;
            linkAIFillRef(ref, handle, api.current);
        },
        [ref]
    );
    const onBridge = React.useCallback(
        (next: AIFillBridge | undefined) => {
            setBridge(next);
            if (api.current !== next?.api) {
                api.current = next?.api;
                linkAIFillRef(ref, grid.current, api.current);
            }
        },
        [ref]
    );

    const props = aiFill !== undefined && bridge !== undefined ? bridge.compose(rest, aiFill) : rest;

    return (
        <>
            <DataEditor
                {...props}
                renderers={renderers}
                headerIcons={allSprites}
                ref={aiFill === undefined ? ref : mergedRef}
                imageWindowLoader={imageWindowLoader}
            />
            {aiFill !== undefined && (
                <React.Suspense fallback={null}>
                    <AIFillController config={aiFill} props={rest} grid={grid} onBridge={onBridge} />
                </React.Suspense>
            )}
        </>
    );
};

export const DataEditorAll = React.forwardRef(DataEditorAllImpl);
