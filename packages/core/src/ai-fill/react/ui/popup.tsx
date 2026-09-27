import * as React from "react";
import { createPortal } from "react-dom";
import ClickOutsideContainer from "../../../internal/click-outside-container/click-outside-container.js";
import { aiStyles } from "./styles.js";

/** A point in viewport coordinates, as `DataEditorRef.getBounds` returns them. */
export interface AIAnchor {
    readonly x: number;
    readonly y: number;
}

/** The grid's `--gdg-*` theme variables, copied so a popup outside the grid follows its theme. */
export function themeVariables(root: HTMLElement | null): Record<string, string> {
    const vars: Record<string, string> = {};
    if (root === null) return vars;
    for (let i = 0; i < root.style.length; i++) {
        const name = root.style[i];
        if (name.startsWith("--gdg-")) vars[name] = root.style.getPropertyValue(name);
    }
    return vars;
}

interface PopupProps extends React.HTMLAttributes<HTMLDivElement> {
    readonly portal: HTMLElement | null;
    /** Where the popup's top-left corner goes. Without it, CSS places the popup. */
    readonly anchor?: AIAnchor;
    readonly vars: Record<string, string>;
    readonly onClickOutside: () => void;
    readonly popupRef?: React.Ref<HTMLDivElement>;
}

/**
 * A popup in `portalElementRef ?? #portal`, like the grid's overlay editor. It
 * has the `click-outside-ignore` class, so the grid doesn't treat clicks on it
 * as clicks outside, and it moves back inside the viewport when it would overflow.
 */
export const AIPopup: React.FC<PopupProps> = ({
    portal,
    anchor,
    vars,
    onClickOutside,
    popupRef,
    className,
    style,
    ...rest
}) => {
    const inner = React.useRef<HTMLDivElement | null>(null);
    const [shift, setShift] = React.useState<AIAnchor>({ x: 0, y: 0 });

    React.useLayoutEffect(() => {
        const element = inner.current;
        if (element === null || anchor === undefined) return;
        const rect = element.getBoundingClientRect();
        setShift({
            x: Math.min(0, window.innerWidth - 8 - (anchor.x + rect.width)),
            y: Math.min(0, window.innerHeight - 8 - (anchor.y + rect.height)),
        });
    }, [anchor]);

    const setRef = React.useCallback(
        (element: HTMLDivElement | null) => {
            inner.current = element;
            if (typeof popupRef === "function") popupRef(element);
            else if (popupRef !== null && popupRef !== undefined) {
                (popupRef as React.MutableRefObject<HTMLDivElement | null>).current = element;
            }
        },
        [popupRef]
    );

    if (portal === null) return null;
    return createPortal(
        <ClickOutsideContainer className="click-outside-ignore" onClickOutside={onClickOutside}>
            <div
                {...rest}
                ref={setRef}
                className={`${aiStyles} gdg-ai-popup click-outside-ignore ${className ?? ""}`}
                style={{
                    ...vars,
                    ...(anchor === undefined
                        ? {}
                        : { left: Math.max(8, anchor.x + shift.x), top: Math.max(8, anchor.y + shift.y) }),
                    ...style,
                }}
            />
        </ClickOutsideContainer>,
        portal
    );
};
