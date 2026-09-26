import * as React from "react";
import { createPortal } from "react-dom";
import { AIConfirm } from "./confirm.js";
import { AIInspector } from "./inspector.js";
import { AIMenu } from "./menu.js";
import { themeVariables } from "./popup.js";
import { AIStatusBar } from "./status-bar.js";
import { aiStyles } from "./styles.js";
import type { AIFillUI } from "./ui-controller.js";

/**
 * Renders AI Fill's built-in UI: the open popup (menu, confirm dialog or
 * inspector) in `portalElementRef ?? #portal`, the status bar over the bottom
 * edge of the grid, and a live region that announces what actions did.
 */
export const AIFillUIView: React.FC<{ readonly ui: AIFillUI }> = ({ ui }) => {
    const { session, popup } = ui;
    const version = React.useSyncExternalStore(session.subscribe, () => session.version);

    // The grid's element carries its AI class name only once the bridge composes, so look it up after each commit.
    const [grid, setGrid] = React.useState<HTMLElement | null>(null);
    React.useLayoutEffect(() => {
        setGrid(ui.gridElement());
    }, [ui, version]);
    const portal = ui.portal();
    const vars = themeVariables(grid);
    const config = session.currentConfig();
    // Computed when the menu opens, after the grid has applied any selection change the click made.
    const items = React.useMemo(() => {
        if (popup?.kind !== "menu") return [];
        const list = ui.getMenuItems(popup.target);
        const more = popup.more;
        return more === undefined
            ? list
            : [...list, { id: "more", label: "More options…", disabled: false, run: more }];
    }, [popup, ui]);

    let open: React.ReactNode = null;
    switch (popup?.kind) {
        case "menu": {
            const target = popup.target;
            const title = session.columnTitle("column" in target ? target.column : target.cell[1]);
            open = (
                <AIMenu
                    label={`AI Fill: ${title}`}
                    items={items}
                    anchor={popup.anchor}
                    portal={portal}
                    vars={vars}
                    onClose={focusGrid => ui.close(focusGrid)}
                />
            );
            break;
        }
        case "confirm": {
            const request = popup.request;
            open = (
                <AIConfirm
                    session={session}
                    request={request}
                    portal={portal}
                    vars={vars}
                    onConfirm={() => ui.confirmFill(request)}
                    onClose={focusGrid => ui.close(focusGrid)}
                />
            );
            break;
        }
        case "inspector":
            open = (
                <AIInspector
                    key={`${popup.rowId}\u0000${popup.columnId}`}
                    ui={ui}
                    rowId={popup.rowId}
                    columnId={popup.columnId}
                    anchor={popup.anchor}
                    portal={portal}
                    vars={vars}
                />
            );
            break;
        case undefined:
            break;
    }

    return (
        <>
            {open}
            {config.statusBar !== false &&
                grid !== null &&
                createPortal(<AIStatusBar api={session.api} className="gdg-ai-status-floating" />, grid)}
            {portal !== null &&
                createPortal(
                    <div className={`${aiStyles} gdg-ai-sr`} role="status" aria-live="polite">
                        {ui.announcement}
                    </div>,
                    portal
                )}
        </>
    );
};
