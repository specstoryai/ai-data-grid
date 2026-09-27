import * as React from "react";
import type { DataEditorRef } from "../../data-editor/data-editor.js";
import type { Item, Rectangle } from "../../internal/data-grid/data-grid-types.js";
import {
    AIStoryFrame,
    AIStoryGrid,
    AIStoryLog,
    contactsWith,
    endpointArgTypes,
    type EndpointArgs,
    personaColumn,
    personaRows,
    personaColumns,
    personaRules,
    type StoryColumn,
    storyConfig,
    useMockJev,
    useStoryConnection,
    useStoryLog,
    useStoryTable,
} from "./story-kit.js";

export default {
    title: "AI-Data-Grid/AI Fill/4 Menus and opt-out",
};

// ---------------------------------------------------------------------------
// 12. Coexisting with app menus (and compose mode)
// ---------------------------------------------------------------------------

interface AppMenuItem {
    readonly key: string;
    readonly label: string;
    readonly hint?: string;
    readonly disabled?: boolean;
    readonly separatorBefore?: boolean;
    readonly onSelect: () => void;
}

interface AppMenuState {
    readonly x: number;
    readonly y: number;
    readonly heading: string;
    readonly items: readonly AppMenuItem[];
}

/** The app's own menu: a plain list with a backdrop. It knows nothing about AI Fill. */
const AppMenu: React.FC<{ readonly menu: AppMenuState; readonly onClose: () => void }> = ({ menu, onClose }) => (
    <div className="ai-story-menu-backdrop" onClick={onClose}>
        <div className="ai-story-menu" style={{ left: menu.x, top: menu.y }} onClick={event => event.stopPropagation()}>
            <div className="ai-story-menu-heading">{menu.heading}</div>
            {menu.items.map(item => (
                <React.Fragment key={item.key}>
                    {item.separatorBefore === true && <hr />}
                    <button
                        type="button"
                        disabled={item.disabled}
                        onClick={() => {
                            onClose();
                            item.onSelect();
                        }}
                    >
                        {item.label}
                        {item.hint !== undefined && <small>{item.hint}</small>}
                    </button>
                </React.Fragment>
            ))}
        </div>
    </div>
);

const menuColumns: readonly StoryColumn[] = [
    { id: "name", title: "Name", width: 140, hasMenu: true },
    { id: "company", title: "Company", width: 190, hasMenu: true },
    { id: "title", title: "Title", width: 180, hasMenu: true },
    { id: "notes", title: "Notes", width: 320 },
    { id: "persona", title: "Persona", width: 230 },
];
const menuRows = contactsWith(() => ({ persona: "" }));

type MenusMode = "built-in" | "compose" | "off";

export const CoexistingWithAppMenus: React.FC<EndpointArgs & { readonly menus: MenusMode }> = ({
    endpointUrl,
    menus,
}) => {
    const table = useStoryTable(menuRows, menuColumns);
    const jev = useMockJev(personaRules, 500);
    const connection = useStoryConnection(endpointUrl, jev);
    const ref = React.useRef<DataEditorRef>(null);
    const [menu, setMenu] = React.useState<AppMenuState>();
    const [lines, log] = useStoryLog();
    const aiFill = React.useMemo(
        () => storyConfig(connection, table.getRowId, { persona: personaColumn }, { menus }),
        [connection, table.getRowId, menus]
    );

    const { columns, view, setSort, setValue } = table;

    /** AI Fill's items for the app's menu, in compose mode only. */
    const aiItems = React.useCallback(
        (target: { column: string } | { cell: readonly [string, string] }): AppMenuItem[] => {
            if (menus !== "compose") return [];
            const items = ref.current?.aiFill?.getMenuItems(target) ?? [];
            return items.map((item, i) => ({
                key: `ai-${item.id}`,
                label: `✦ ${item.label}`,
                hint: item.detail ?? item.disabledReason,
                disabled: item.disabled,
                separatorBefore: i === 0,
                onSelect: item.run,
            }));
        },
        [menus]
    );

    const openColumnMenu = React.useCallback(
        (col: number, bounds: Rectangle, via: string) => {
            const column = columns[col];
            const id = column.id ?? "";
            log(`app ${via}(${column.title})`);
            setMenu({
                x: bounds.x,
                y: bounds.y + bounds.height,
                heading: `App menu: ${column.title}`,
                items: [
                    { key: "asc", label: "Sort A → Z", onSelect: () => setSort({ columnId: id, direction: "asc" }) },
                    { key: "desc", label: "Sort Z → A", onSelect: () => setSort({ columnId: id, direction: "desc" }) },
                    { key: "none", label: "Original order", onSelect: () => setSort(undefined) },
                    ...aiItems({ column: id }),
                ],
            });
        },
        [columns, log, setSort, aiItems]
    );

    const onCellContextMenu = React.useCallback(
        ([col, row]: Item, event: { preventDefault: () => void; bounds: Rectangle }) => {
            event.preventDefault();
            const column = columns[col];
            const rowId = view[row]?.id;
            if (rowId === undefined) return;
            const id = column.id ?? "";
            log(`app onCellContextMenu(${column.title}, ${String(view[row].name)})`);
            setMenu({
                x: event.bounds.x,
                y: event.bounds.y + event.bounds.height,
                heading: `App menu: ${column.title}, ${String(view[row].name)}`,
                items: [
                    { key: "clear", label: "Clear cell", onSelect: () => setValue(rowId, id, "") },
                    { key: "id", label: "Log the row id", onSelect: () => log(`row id: ${rowId}`) },
                    ...aiItems({ cell: [rowId, id] }),
                ],
            });
        },
        [columns, view, log, setValue, aiItems]
    );

    return (
        <AIStoryFrame
            title="12. Coexisting with app menus (and compose mode)"
            description={
                <>
                    <p>
                        This app already has its own menus: a header menu (the ▾ on Name, Company and Title, and a
                        right-click on any header) and a cell context menu (a right-click on any cell). Persona is an AI
                        column. The <code>menus</code> control switches <code>aiFill.menus</code>; the log shows which
                        of the app&apos;s handlers ran.
                    </p>
                    <ul>
                        <li>
                            <b>built-in</b> (the default): on Name, Company, Title and Notes, the app&apos;s menus open
                            exactly as they would without AI Fill. On Persona, AI Fill&apos;s menu opens instead, and
                            ends with <b>More options…</b>, which calls the app&apos;s handler with the original
                            arguments, so its menu is one click away.
                        </li>
                        <li>
                            <b>compose</b>: AI Fill&apos;s menu never opens. The app&apos;s handlers always run, and
                            this app appends <code>api.getMenuItems(target)</code> (marked ✦) to its own menu on
                            Persona.
                        </li>
                        <li>
                            <b>off</b>: no AI menus at all. The app&apos;s menus open everywhere, and the API, the
                            inspector, the status bar and the shortcuts still work.
                        </li>
                    </ul>
                </>
            }
        >
            <AIStoryGrid
                table={table}
                aiFill={aiFill}
                gridRef={ref}
                props={{
                    onHeaderMenuClick: (col, bounds) => openColumnMenu(col, bounds, "onHeaderMenuClick"),
                    onHeaderContextMenu: (col, event) => {
                        event.preventDefault();
                        openColumnMenu(col, event.bounds, "onHeaderContextMenu");
                    },
                    onCellContextMenu,
                }}
            />
            <AIStoryLog lines={lines} empty="The app's menu handlers haven't run yet." />
            {menu !== undefined && <AppMenu menu={menu} onClose={() => setMenu(undefined)} />}
        </AIStoryFrame>
    );
};
Object.assign(CoexistingWithAppMenus, {
    storyName: "12 Coexisting with app menus (and compose mode)",
    args: { endpointUrl: "", menus: "built-in" },
    argTypes: {
        ...endpointArgTypes,
        menus: {
            control: { type: "inline-radio" },
            options: ["built-in", "compose", "off"],
            description: "`aiFill.menus`: how AI Fill's menu fits with the app's own menus.",
        },
    },
});

// ---------------------------------------------------------------------------
// 13. Disabled (no aiFill)
// ---------------------------------------------------------------------------

export const Disabled: React.FC = () => {
    const table = useStoryTable(personaRows, personaColumns);
    const ref = React.useRef<DataEditorRef>(null);
    const [handle, setHandle] = React.useState("checking…");
    React.useEffect(() => {
        const timer = setTimeout(() => {
            const current = ref.current;
            setHandle(
                current === null
                    ? "ref.current is null"
                    : `ref.current.aiFill is ${current.aiFill === undefined ? "undefined" : "set"}`
            );
        }, 500);
        return () => clearTimeout(timer);
    }, []);
    return (
        <AIStoryFrame
            title="13. Disabled (no aiFill)"
            description={
                <>
                    <p>
                        The same data and columns as story 1, rendered by the same <code>DataEditor</code>, without the{" "}
                        <code>aiFill</code> prop. A grid without <code>aiFill</code> is a plain grid: no ✦ badge and no
                        ▾ on Persona, no status bar, no AI menu on right-click, no shortcuts, and no AI module is loaded
                        (the controller chunk never appears in the network panel). Persona is an ordinary text column:
                        double-click a cell to edit it.
                    </p>
                    <p>
                        <code>{handle}</code>
                    </p>
                </>
            }
        >
            <AIStoryGrid table={table} gridRef={ref} />
        </AIStoryFrame>
    );
};
Object.assign(Disabled, { storyName: "13 Disabled (no aiFill)" });
