import * as React from "react";
import type { AIMenuItem } from "../../config/api.js";
import { type AIAnchor, AIPopup } from "./popup.js";

interface AIMenuProps {
    readonly label: string;
    readonly items: readonly AIMenuItem[];
    readonly anchor: AIAnchor;
    readonly portal: HTMLElement | null;
    readonly vars: Record<string, string>;
    /** Closes the menu. `focusGrid` is false when the user clicked elsewhere or picked "More options…". */
    readonly onClose: (focusGrid: boolean) => void;
}

/**
 * The AI column or cell menu (`role="menu"`). Arrow keys, Home and End move
 * between items, Enter and Space pick one, typing a letter jumps to the next
 * item that starts with it, and Esc or Tab closes the menu.
 */
export const AIMenu: React.FC<AIMenuProps> = ({ label, items, anchor, portal, vars, onClose }) => {
    const [active, setActive] = React.useState(0);
    const refs = React.useRef<(HTMLDivElement | null)[]>([]);

    React.useEffect(() => {
        refs.current[active]?.focus();
    }, [active]);

    const pick = (item: AIMenuItem) => {
        if (item.disabled) return;
        onClose(item.id !== "more");
        item.run();
    };

    const onKeyDown = (event: React.KeyboardEvent) => {
        const last = items.length - 1;
        let next: number | undefined;
        switch (event.key) {
            case "ArrowDown":
                next = active === last ? 0 : active + 1;
                break;
            case "ArrowUp":
                next = active === 0 ? last : active - 1;
                break;
            case "Home":
                next = 0;
                break;
            case "End":
                next = last;
                break;
            case "Enter":
            case " ":
                pick(items[active]);
                break;
            case "Escape":
            case "Tab":
                onClose(true);
                break;
            default:
                if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                    const key = event.key.toLowerCase();
                    for (let i = 1; i <= items.length; i++) {
                        const index = (active + i) % items.length;
                        if (items[index].label.toLowerCase().startsWith(key)) {
                            next = index;
                            break;
                        }
                    }
                } else {
                    return;
                }
        }
        event.preventDefault();
        event.stopPropagation();
        if (next !== undefined) setActive(next);
    };

    return (
        <AIPopup
            portal={portal}
            anchor={anchor}
            vars={vars}
            onClickOutside={() => onClose(false)}
            className="gdg-ai-menu"
            role="menu"
            aria-label={label}
            onKeyDown={onKeyDown}>
            {items.map((item, index) => (
                <React.Fragment key={item.id}>
                    {item.id === "more" && <div className="gdg-ai-menu-separator" role="separator" />}
                    <div
                        ref={element => {
                            refs.current[index] = element;
                        }}
                        role="menuitem"
                        tabIndex={index === active ? 0 : -1}
                        aria-disabled={item.disabled}
                        title={item.disabledReason}
                        className="gdg-ai-menu-item"
                        onClick={() => pick(item)}
                        onMouseEnter={() => setActive(index)}>
                        <span>{item.label}</span>
                        {(item.detail ?? item.disabledReason) !== undefined && (
                            <span className="gdg-ai-menu-detail">{item.detail ?? item.disabledReason}</span>
                        )}
                    </div>
                </React.Fragment>
            ))}
        </AIPopup>
    );
};
