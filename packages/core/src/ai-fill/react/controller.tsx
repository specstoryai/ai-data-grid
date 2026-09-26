import * as React from "react";
import type { AIFillControllerProps } from "./bridge.js";
import { AIFillSession } from "./session.js";
import { AIFillUIView } from "./ui/ui.js";
import { AIFillUI } from "./ui/ui-controller.js";

function createSession(grid: AIFillControllerProps["grid"]): { session: AIFillSession; ui: AIFillUI } {
    const session = new AIFillSession(grid);
    const ui = new AIFillUI(session);
    session.ui = ui;
    return { session, ui };
}

/**
 * AI Fill's controller, loaded lazily by `DataEditor` when the `aiFill` prop
 * is set. It owns every piece of AI state through an {@link AIFillSession} and
 * hands `DataEditor` a bridge that composes the app's props. It also renders
 * the built-in UI: menus, the confirm dialog, the inspector and the status
 * bar. Unmounting it (clearing `aiFill`) aborts in-flight requests and drops
 * every result.
 */
const AIFillController: React.FC<AIFillControllerProps> = ({ config, props, grid, onBridge }) => {
    const [{ session, ui }] = React.useState(() => createSession(grid));
    session.update(props, config);

    React.useLayoutEffect(() => {
        session.attach(onBridge);
        return () => session.detach();
    }, [session, onBridge]);

    React.useLayoutEffect(() => {
        session.configure(config, props.columns);
    }, [session, config, props.columns]);

    return <AIFillUIView ui={ui} />;
};

export default AIFillController;
