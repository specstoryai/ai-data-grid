import * as React from "react";
import type { AIFillControllerProps } from "./bridge.js";
import { AIFillSession } from "./session.js";

/**
 * AI Fill's controller, loaded lazily by `DataEditor` when the `aiFill` prop
 * is set. It owns every piece of AI state through an {@link AIFillSession} and
 * hands `DataEditor` a bridge that composes the app's props. Unmounting it
 * (clearing `aiFill`) aborts in-flight requests and drops every result.
 */
const AIFillController: React.FC<AIFillControllerProps> = ({ config, props, grid, onBridge }) => {
    const [session] = React.useState(() => new AIFillSession(grid));
    session.update(props, config);

    React.useLayoutEffect(() => {
        session.attach(onBridge);
        return () => session.detach();
    }, [session, onBridge]);

    React.useLayoutEffect(() => {
        session.configure(config, props.columns);
    }, [session, config, props.columns]);

    return null;
};

export default AIFillController;
