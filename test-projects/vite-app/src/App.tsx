import * as React from "react";
import {
    DataEditor,
    GridCellKind,
    type EditableGridCell,
    type GridCell,
    type GridColumn,
    type Item,
} from "@specstory/ai-data-grid";
import "@specstory/ai-data-grid/dist/index.css";
import { allCells, type StarCellType } from "@specstory/ai-data-grid-cells";

interface Person {
    name: string;
    age: number;
    subscriber: boolean;
    rating: number;
}

const data: Person[] = [
    { name: "Ada Lovelace", age: 36, subscriber: true, rating: 5 },
    { name: "Grace Hopper", age: 85, subscriber: false, rating: 4 },
    { name: "Katherine Johnson", age: 101, subscriber: true, rating: 5 },
    { name: "Margaret Hamilton", age: 88, subscriber: false, rating: 3 },
];

const columns: GridColumn[] = [
    { title: "Name", id: "name", width: 200 },
    { title: "Age", id: "age", width: 80 },
    { title: "Subscriber", id: "subscriber", width: 100 },
    { title: "Rating", id: "rating", width: 120 },
];

export function App() {
    const [rows, setRows] = React.useState(data);

    const getCellContent = React.useCallback(
        ([col, row]: Item): GridCell => {
            const person = rows[row];
            switch (columns[col].id) {
                case "age":
                    return {
                        kind: GridCellKind.Number,
                        data: person.age,
                        displayData: String(person.age),
                        allowOverlay: true,
                    };
                case "subscriber":
                    return {
                        kind: GridCellKind.Boolean,
                        data: person.subscriber,
                        allowOverlay: false,
                    };
                case "rating":
                    return {
                        kind: GridCellKind.Custom,
                        data: { kind: "star-cell", rating: person.rating },
                        copyData: String(person.rating),
                        allowOverlay: true,
                    } satisfies StarCellType;
                default:
                    return {
                        kind: GridCellKind.Text,
                        data: person.name,
                        displayData: person.name,
                        allowOverlay: true,
                    };
            }
        },
        [rows]
    );

    const onCellEdited = React.useCallback((cell: Item, newValue: EditableGridCell) => {
        setRows(prev => {
            const next = [...prev];
            const person = { ...next[cell[1]] };
            if (columns[cell[0]].id === "age" && newValue.kind === GridCellKind.Number) {
                person.age = typeof newValue.data === "number" ? newValue.data : person.age;
            } else if (columns[cell[0]].id === "name" && newValue.kind === GridCellKind.Text) {
                person.name = newValue.data;
            } else if (newValue.kind === GridCellKind.Custom) {
                const star = newValue.data as StarCellType["data"];
                if (star?.kind === "star-cell") person.rating = star.rating;
            }
            next[cell[1]] = person;
            return next;
        });
    }, []);

    return (
        <div style={{ width: "100vw", height: "100vh" }}>
            <DataEditor
                columns={columns}
                rows={rows.length}
                getCellContent={getCellContent}
                onCellEdited={onCellEdited}
                customRenderers={allCells}
                width="100%"
                height="100%"
            />
        </div>
    );
}
