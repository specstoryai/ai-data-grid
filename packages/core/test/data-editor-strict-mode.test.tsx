import * as React from "react";
import { render, screen, act } from "@testing-library/react";
import { DataEditor, type DataEditorProps, type GridCell, GridCellKind, type Item } from "../src/index.js";
import { vi, expect, describe, test, beforeEach, afterEach } from "vitest";
import { basicProps, prep, standardBeforeEach, standardAfterEach } from "./test-utils.js";

// The accessibility tree is a debounced memo of the grid's state.
const A11Y_DEBOUNCE = 200;

function textCells(prefix: string) {
    return ([col, row]: Item): GridCell => ({
        kind: GridCellKind.Text,
        allowOverlay: true,
        data: `${prefix} ${col}-${row}`,
        displayData: `${prefix} ${col}-${row}`,
    });
}

const firstCells = textCells("first");
const secondCells = textCells("second");

const props: DataEditorProps = {
    ...basicProps,
    getCellContent: firstCells,
    rows: 100,
};

// StrictMode has to be the root element, as in `createRoot(el).render(<StrictMode>...)`. React doesn't replay
// the effects of a subtree that mounts together with a component rendering `<StrictMode>` below itself.
function wrap(strict: boolean, editor: React.ReactElement) {
    const content = (
        <>
            {editor}
            <div id="portal" />
        </>
    );
    return strict ? <React.StrictMode>{content}</React.StrictMode> : content;
}

function gridcells() {
    return document.querySelectorAll('[role="gridcell"]');
}

describe("data-editor accessibility tree", () => {
    vi.mock("../src/common/resize-detector", () => {
        return {
            useResizeDetector: () => ({ ref: undefined, width: 1000, height: 1000 }),
        };
    });

    beforeEach(() => {
        standardBeforeEach();
        vi.useFakeTimers();
    });

    afterEach(() => {
        standardAfterEach();
        vi.useRealTimers();
    });

    describe.each([
        ["without StrictMode", false],
        ["in StrictMode", true],
    ])("%s", (_name, strict) => {
        test("exposes gridcells once the grid is measured", () => {
            render(wrap(strict, <DataEditor {...props} />));

            // Unmeasured: the scroller hasn't reported a client size yet.
            expect(gridcells()).toHaveLength(0);

            prep(false);

            expect(gridcells().length).toBeGreaterThan(0);
            expect(screen.getByTestId("glide-cell-1-0").textContent).toBe("first 1-0");
            expect(screen.getByTestId("glide-cell-2-3").textContent).toBe("first 2-3");
        });

        test("updates gridcells when the data changes", () => {
            const { rerender } = render(wrap(strict, <DataEditor {...props} />));
            prep(false);
            expect(screen.getByTestId("glide-cell-1-0").textContent).toBe("first 1-0");

            rerender(wrap(strict, <DataEditor {...props} getCellContent={secondCells} />));

            act(() => {
                vi.advanceTimersByTime(A11Y_DEBOUNCE - 1);
            });
            expect(screen.getByTestId("glide-cell-1-0").textContent).toBe("first 1-0");

            act(() => {
                vi.advanceTimersByTime(1);
            });
            expect(screen.getByTestId("glide-cell-1-0").textContent).toBe("second 1-0");
            expect(screen.getByTestId("glide-cell-2-3").textContent).toBe("second 2-3");
        });

        test("renders no gridcells with experimental.disableAccessibilityTree", () => {
            render(wrap(strict, <DataEditor {...props} experimental={{ disableAccessibilityTree: true }} />));
            prep(false);

            expect(gridcells()).toHaveLength(0);
            expect(document.querySelector('[role="grid"]')).toBeNull();
        });
    });
});
