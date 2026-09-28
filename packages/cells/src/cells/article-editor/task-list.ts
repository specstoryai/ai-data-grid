// Task lists for the article editor (SPST-61). GFM's list item schema stores a task's state
// in `checked` (null for an ordinary item) and renders it as `li[data-item-type="task"]`, with
// no checkbox element: styles.ts draws the box, and a click on it is handled here. There are no
// node views.
import { bulletListSchema, listItemSchema } from "@milkdown/preset-commonmark";
import type { Node as ProseNode } from "@milkdown/prose/model";
import { type EditorState, Plugin, PluginKey, type Transaction } from "@milkdown/prose/state";
import { wrapInList } from "@milkdown/prose/schema-list";
import { $command, $prose } from "@milkdown/utils";

/**
 * Toggles a task list. Inside a list, the items the selection touches become tasks, or plain
 * items again if they all are tasks already. Outside a list, the selection is wrapped in a
 * bullet list of open tasks.
 */
export const toggleTaskListCommand = $command("ToggleArticleTaskList", ctx => () => (state, dispatch) => {
    const listItem = listItemSchema.type(ctx);
    const { $from, from, to } = state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type !== listItem) continue;
        const list = $from.node(depth - 1);
        const listStart = $from.start(depth - 1);
        const items: { node: ProseNode; pos: number }[] = [];
        list.forEach((node, offset) => {
            const pos = listStart + offset;
            if (pos + node.nodeSize > from && pos < Math.max(to, from + 1)) items.push({ node, pos });
        });
        if (dispatch !== undefined) {
            const makeTasks = items.some(item => item.node.attrs.checked === null);
            const tr = state.tr;
            for (const { node, pos } of items) {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: makeTasks ? false : null });
            }
            dispatch(tr);
        }
        return true;
    }

    let wrapped: Transaction | undefined;
    if (!wrapInList(bulletListSchema.type(ctx))(state, tr => (wrapped = tr))) return false;
    if (dispatch !== undefined && wrapped !== undefined) {
        const tr = wrapped;
        tr.doc.nodesBetween(tr.selection.from, tr.selection.to, (node, pos) => {
            if (node.type === listItem) tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: false });
        });
        dispatch(tr);
    }
    return true;
});

/** Whether the selection is in a task item. */
export function isInTaskItem(state: EditorState): boolean {
    const { $from } = state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth);
        if (node.type.name === "list_item") return node.attrs.checked !== null;
    }
    return false;
}

/**
 * Toggles a task when its checkbox is clicked. The checkbox is the list item's `::before`, so
 * the click targets the `li` itself, left of the item's content.
 */
export const taskCheckboxPlugin = $prose(
    () =>
        new Plugin({
            key: new PluginKey("ARTICLE_TASK_CHECKBOX"),
            props: {
                handleDOMEvents: {
                    mousedown: (view, event) => {
                        const li = event.target;
                        if (!(li instanceof HTMLElement) || li.localName !== "li") return false;
                        if (li.dataset.itemType !== "task" || !view.editable) return false;
                        const content = li.firstElementChild;
                        if (content !== null && event.clientX > content.getBoundingClientRect().left) return false;
                        const pos = view.posAtDOM(li, 0) - 1;
                        const node = view.state.doc.nodeAt(pos);
                        if (node === null || node.type.name !== "list_item" || node.attrs.checked === null)
                            return false;
                        event.preventDefault();
                        view.dispatch(
                            view.state.tr.setNodeMarkup(pos, undefined, {
                                ...node.attrs,
                                checked: node.attrs.checked !== true,
                            })
                        );
                        return true;
                    },
                },
            },
        })
);

export const articleTaskList = [toggleTaskListCommand, taskCheckboxPlugin];
