// ArticleCell's toolbar (SPST-61): the same five groups as the Toast UI toolbar it replaces.
// The heading menu and the link dialog render inside the editor's wrapper, not in a portal,
// so the grid's overlay doesn't treat clicks on them as clicks outside.
import * as React from "react";
import type { CmdKey } from "@milkdown/core";
import {
    createCodeBlockCommand,
    liftListItemCommand,
    sinkListItemCommand,
    toggleEmphasisCommand,
    toggleInlineCodeCommand,
    toggleLinkCommand,
    toggleStrongCommand,
    turnIntoTextCommand,
    updateLinkCommand,
    wrapInBlockquoteCommand,
    wrapInBulletListCommand,
    wrapInHeadingCommand,
    wrapInOrderedListCommand,
} from "@milkdown/preset-commonmark";
import {
    addColAfterCommand,
    addRowAfterCommand,
    insertTableCommand,
    toggleStrikethroughCommand,
} from "@milkdown/preset-gfm";
import type { MarkType, NodeType } from "@milkdown/prose/model";
import { type Command, type EditorState, Selection } from "@milkdown/prose/state";
import { deleteColumn, deleteRow, deleteTable, isInTable } from "@milkdown/prose/tables";
import type { ArticleEditor } from "./create-article-editor.js";
import { isInTaskItem, toggleTaskListCommand } from "./task-list.js";
import { safeArticleURL } from "./url-policy.js";

function markActive(state: EditorState, type: MarkType | undefined): boolean {
    if (type === undefined) return false;
    const { from, to, empty, $from } = state.selection;
    if (empty) return type.isInSet(state.storedMarks ?? $from.marks()) !== undefined;
    return state.doc.rangeHasMark(from, to, type);
}

function ancestorOf(state: EditorState, names: readonly string[]): NodeType | undefined {
    const { $from } = state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
        const type = $from.node(depth).type;
        if (names.includes(type.name)) return type;
    }
    return undefined;
}

/** The text node range of the link at or after the cursor, like `updateLinkCommand` finds it. */
function linkAt(state: EditorState): { from: number; to: number; href: string } | undefined {
    const type = state.schema.marks.link;
    const { from, to } = state.selection;
    let found: { from: number; to: number; href: string } | undefined;
    state.doc.nodesBetween(from, from === to ? to + 1 : to, (node, pos) => {
        if (found !== undefined) return false;
        const mark = type.isInSet(node.marks);
        if (mark !== undefined) found = { from: pos, to: pos + node.nodeSize, href: mark.attrs.href };
        return undefined;
    });
    return found;
}

/**
 * Inserts a horizontal rule after the block the caret is in, and moves the caret to the next
 * block, adding an empty paragraph if there's none. Milkdown's `insertHrCommand` leaves an
 * empty paragraph before the text instead, which saves as `<br />`.
 */
const insertRule: Command = (state, dispatch) => {
    const { $to } = state.selection;
    const { hr, paragraph } = state.schema.nodes;
    if ($to.depth < 1 || !$to.parent.isTextblock) return false;
    const index = $to.index($to.depth - 1);
    if (!$to.node($to.depth - 1).canReplaceWith(index + 1, index + 1, hr)) return false;
    if (dispatch !== undefined) {
        const after = $to.after();
        const tr = state.tr.insert(after, hr.create());
        const next = after + 1;
        if (tr.doc.resolve(next).nodeAfter === null) tr.insert(next, paragraph.create());
        dispatch(tr.setSelection(Selection.near(tr.doc.resolve(next), 1)).scrollIntoView());
    }
    return true;
};

interface ToolProps {
    readonly label: string;
    readonly text: React.ReactNode;
    readonly active?: boolean;
    readonly enabled?: boolean;
    readonly onClick: () => void;
    readonly toggle?: boolean;
}

const Tool: React.FC<ToolProps> = ({ label, text, active, enabled = true, onClick, toggle = true }) => (
    <button
        type="button"
        className="gdg-article-tool"
        aria-label={label}
        title={label}
        aria-pressed={toggle ? active === true : undefined}
        disabled={!enabled}
        // Keep the editor's selection and focus.
        onMouseDown={e => e.preventDefault()}
        onClick={onClick}
    >
        {text}
    </button>
);

const HEADINGS = [1, 2, 3, 4, 5, 6] as const;

interface LinkDialogProps {
    readonly editor: ArticleEditor;
    readonly onClose: () => void;
}

const LinkDialog: React.FC<LinkDialogProps> = ({ editor, onClose }) => {
    const { view } = editor;
    const [existing] = React.useState(() => linkAt(view.state));
    const [needsText] = React.useState(() => view.state.selection.empty && existing === undefined);
    const [href, setHref] = React.useState(existing?.href ?? "");
    const [text, setText] = React.useState("");
    const [error, setError] = React.useState<string>();

    const close = () => {
        onClose();
        view.focus();
    };

    const apply = () => {
        // D1: the dialog only ever writes a URL the policy accepts.
        const url = safeArticleURL("a", "href", href.trim());
        if (url === "") {
            setError("Enter an https:, http:, mailto: or tel: URL, or a relative link.");
            return;
        }
        if (existing !== undefined) {
            editor.run(updateLinkCommand.key, { href: url });
        } else if (needsText) {
            if (text === "") {
                setError("Enter the link text.");
                return;
            }
            const { state } = view;
            const { from } = state.selection;
            const mark = state.schema.marks.link.create({ href: url });
            view.dispatch(state.tr.insertText(text, from).addMark(from, from + text.length, mark));
        } else {
            editor.run(toggleLinkCommand.key, { href: url });
        }
        close();
    };

    const remove = () => {
        const link = linkAt(view.state);
        if (link !== undefined) {
            view.dispatch(view.state.tr.removeMark(link.from, link.to, view.state.schema.marks.link));
        }
        close();
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            apply();
        } else if (e.key === "Escape") {
            e.preventDefault();
            close();
        }
    };

    return (
        <div className="gdg-article-popover" role="dialog" aria-label="Link" onKeyDown={onKeyDown}>
            <label>
                URL
                <input
                    className="gdg-article-link-url"
                    autoFocus={true}
                    value={href}
                    onChange={e => {
                        setHref(e.target.value);
                        setError(undefined);
                    }}
                />
            </label>
            {needsText && (
                <label>
                    Text
                    <input
                        className="gdg-article-link-text"
                        value={text}
                        onChange={e => {
                            setText(e.target.value);
                            setError(undefined);
                        }}
                    />
                </label>
            )}
            {error !== undefined && (
                <div className="gdg-article-error" role="alert">
                    {error}
                </div>
            )}
            <div className="gdg-article-popover-actions">
                {existing !== undefined && (
                    <button type="button" className="gdg-article-tool gdg-article-link-remove" onClick={remove}>
                        Remove
                    </button>
                )}
                <button type="button" className="gdg-article-tool" onClick={close}>
                    Cancel
                </button>
                <button type="button" className="gdg-article-tool gdg-article-link-apply" onClick={apply}>
                    Apply
                </button>
            </div>
        </div>
    );
};

interface ArticleToolbarProps {
    readonly editor: ArticleEditor;
}

type Popover = "heading" | "link" | undefined;

export const ArticleToolbar: React.FC<ArticleToolbarProps> = ({ editor }) => {
    const [popover, setPopover] = React.useState<Popover>();
    const { view } = editor;
    const { state } = view;
    const { marks } = state.schema;

    const run =
        <T,>(key: CmdKey<T>, payload?: T) =>
        () => {
            setPopover(undefined);
            editor.run(key, payload);
        };
    const exec = (command: Command) => () => {
        setPopover(undefined);
        command(view.state, view.dispatch, view);
        view.focus();
    };

    const heading = state.selection.$from.parent.type.name === "heading" ? state.selection.$from.parent.attrs.level : 0;
    const list = ancestorOf(state, ["bullet_list", "ordered_list"])?.name;
    const task = isInTaskItem(state);
    const inCodeBlock = state.selection.$from.parent.type.spec.code === true;
    const inTable = isInTable(state);

    return (
        <>
            <div className="gdg-article-toolbar" role="toolbar" aria-label="Formatting">
                <div className="gdg-article-toolbar-group">
                    <Tool
                        label="Headings"
                        text={heading === 0 ? "¶" : `H${heading}`}
                        active={popover === "heading"}
                        enabled={!inCodeBlock}
                        onClick={() => setPopover(popover === "heading" ? undefined : "heading")}
                    />
                    <Tool
                        label="Bold"
                        text={<b>B</b>}
                        active={markActive(state, marks.strong)}
                        enabled={editor.can(toggleStrongCommand.key)}
                        onClick={run(toggleStrongCommand.key)}
                    />
                    <Tool
                        label="Italic"
                        text={<i>I</i>}
                        active={markActive(state, marks.emphasis)}
                        enabled={editor.can(toggleEmphasisCommand.key)}
                        onClick={run(toggleEmphasisCommand.key)}
                    />
                    <Tool
                        label="Strike"
                        text={<s>S</s>}
                        active={markActive(state, marks.strike_through)}
                        enabled={editor.can(toggleStrikethroughCommand.key)}
                        onClick={run(toggleStrikethroughCommand.key)}
                    />
                </div>
                <div className="gdg-article-toolbar-group">
                    <Tool label="Line" text="―" toggle={false} enabled={insertRule(state)} onClick={exec(insertRule)} />
                    <Tool
                        label="Blockquote"
                        text="❝"
                        active={ancestorOf(state, ["blockquote"]) !== undefined}
                        enabled={editor.can(wrapInBlockquoteCommand.key)}
                        onClick={run(wrapInBlockquoteCommand.key)}
                    />
                </div>
                <div className="gdg-article-toolbar-group">
                    <Tool
                        label="Unordered list"
                        text="•"
                        active={list === "bullet_list" && !task}
                        enabled={editor.can(wrapInBulletListCommand.key)}
                        onClick={run(wrapInBulletListCommand.key)}
                    />
                    <Tool
                        label="Ordered list"
                        text="1."
                        active={list === "ordered_list" && !task}
                        enabled={editor.can(wrapInOrderedListCommand.key)}
                        onClick={run(wrapInOrderedListCommand.key)}
                    />
                    <Tool
                        label="Task"
                        text="☑"
                        active={task}
                        enabled={editor.can(toggleTaskListCommand.key)}
                        onClick={run(toggleTaskListCommand.key)}
                    />
                    <Tool
                        label="Indent"
                        text="→"
                        toggle={false}
                        enabled={editor.can(sinkListItemCommand.key)}
                        onClick={run(sinkListItemCommand.key)}
                    />
                    <Tool
                        label="Outdent"
                        text="←"
                        toggle={false}
                        enabled={editor.can(liftListItemCommand.key)}
                        onClick={run(liftListItemCommand.key)}
                    />
                </div>
                <div className="gdg-article-toolbar-group">
                    <Tool
                        label="Insert table"
                        text="▦"
                        toggle={false}
                        enabled={!inTable && !inCodeBlock}
                        onClick={run(insertTableCommand.key, { row: 3, col: 3 })}
                    />
                    {inTable && (
                        <>
                            <Tool label="Add row" text="+R" toggle={false} onClick={run(addRowAfterCommand.key)} />
                            <Tool label="Add column" text="+C" toggle={false} onClick={run(addColAfterCommand.key)} />
                            <Tool
                                label="Delete row"
                                text="−R"
                                toggle={false}
                                enabled={deleteRow(state)}
                                onClick={exec(deleteRow)}
                            />
                            <Tool
                                label="Delete column"
                                text="−C"
                                toggle={false}
                                enabled={deleteColumn(state)}
                                onClick={exec(deleteColumn)}
                            />
                            <Tool label="Delete table" text="✕" toggle={false} onClick={exec(deleteTable)} />
                        </>
                    )}
                    <Tool
                        label="Insert link"
                        text="🔗"
                        active={popover === "link" || markActive(state, marks.link)}
                        enabled={!inCodeBlock}
                        onClick={() => setPopover(popover === "link" ? undefined : "link")}
                    />
                </div>
                <div className="gdg-article-toolbar-group">
                    <Tool
                        label="Code"
                        text="`"
                        active={markActive(state, marks.inlineCode)}
                        enabled={editor.can(toggleInlineCodeCommand.key)}
                        onClick={run(toggleInlineCodeCommand.key)}
                    />
                    <Tool
                        label="Code block"
                        text="{ }"
                        active={inCodeBlock}
                        enabled={inCodeBlock || editor.can(createCodeBlockCommand.key)}
                        onClick={inCodeBlock ? run(turnIntoTextCommand.key) : run(createCodeBlockCommand.key)}
                    />
                </div>
            </div>
            {popover === "heading" && (
                <div
                    className="gdg-article-popover"
                    role="menu"
                    aria-label="Heading levels"
                    onKeyDown={e => {
                        if (e.key !== "Escape") return;
                        setPopover(undefined);
                        view.focus();
                    }}
                >
                    <button
                        type="button"
                        role="menuitem"
                        aria-label="Paragraph"
                        className="gdg-article-tool gdg-article-menu-item"
                        onMouseDown={e => e.preventDefault()}
                        onClick={run(turnIntoTextCommand.key)}
                    >
                        Paragraph
                    </button>
                    {HEADINGS.map(level => (
                        <button
                            key={level}
                            type="button"
                            role="menuitem"
                            aria-label={`Heading ${level}`}
                            className="gdg-article-tool gdg-article-menu-item"
                            onMouseDown={e => e.preventDefault()}
                            onClick={run(wrapInHeadingCommand.key, level)}
                        >
                            Heading {level}
                        </button>
                    ))}
                </div>
            )}
            {popover === "link" && <LinkDialog editor={editor} onClose={() => setPopover(undefined)} />}
        </>
    );
};
