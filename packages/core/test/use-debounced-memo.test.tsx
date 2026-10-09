import * as React from "react";
import { renderHook, cleanup, act } from "@testing-library/react";
import { useDebouncedMemo } from "../src/common/utils.js";
import { expect, describe, test, afterEach, beforeEach, vi } from "vitest";

const DEBOUNCE = 200;

function renderDebouncedMemo(strict: boolean, factory: (dep: number) => string) {
    const committed: string[] = [];
    const hook = renderHook(
        ({ dep }) => {
            const value = useDebouncedMemo(() => factory(dep), [dep], DEBOUNCE);
            React.useEffect(() => {
                committed.push(value);
            }, [value]);
            return value;
        },
        {
            initialProps: { dep: 0 },
            wrapper: strict ? React.StrictMode : undefined,
        }
    );
    // StrictMode replays the effect above, so keep only distinct consecutive commits.
    const distinctCommits = () => committed.filter((v, i) => i === 0 || committed[i - 1] !== v);
    return { ...hook, distinctCommits };
}

describe.each([
    ["without StrictMode", false],
    ["in StrictMode", true],
])("useDebouncedMemo %s", (_name, strict) => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test("computes the initial value during the first render", () => {
        const { result } = renderDebouncedMemo(strict, dep => `value ${dep}`);
        expect(result.current).toBe("value 0");
    });

    test("updates after the debounce settles when a dependency changes", () => {
        const { result, rerender } = renderDebouncedMemo(strict, dep => `value ${dep}`);

        rerender({ dep: 1 });
        expect(result.current).toBe("value 0");

        act(() => {
            vi.advanceTimersByTime(DEBOUNCE - 1);
        });
        expect(result.current).toBe("value 0");

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(result.current).toBe("value 1");

        // And keeps updating on later changes.
        rerender({ dep: 2 });
        act(() => {
            vi.advanceTimersByTime(DEBOUNCE);
        });
        expect(result.current).toBe("value 2");
    });

    test("debounces a burst of dependency changes into one update", () => {
        const { result, rerender, distinctCommits } = renderDebouncedMemo(strict, dep => `value ${dep}`);

        for (let dep = 1; dep <= 3; dep++) {
            rerender({ dep });
            act(() => {
                vi.advanceTimersByTime(DEBOUNCE / 2);
            });
            expect(result.current).toBe("value 0");
        }

        act(() => {
            vi.advanceTimersByTime(DEBOUNCE / 2);
        });
        expect(result.current).toBe("value 3");
        expect(distinctCommits()).toEqual(["value 0", "value 3"]);
    });

    test("doesn't compute or update after a real unmount", () => {
        const consoleError = vi.spyOn(console, "error");
        const factory = vi.fn((dep: number) => `value ${dep}`);
        const { rerender, unmount } = renderDebouncedMemo(strict, factory);

        rerender({ dep: 1 });
        unmount();
        factory.mockClear();

        act(() => {
            vi.advanceTimersByTime(DEBOUNCE * 2);
        });

        expect(factory).not.toHaveBeenCalled();
        expect(consoleError).not.toHaveBeenCalled();
    });

    test("cancels a pending update on unmount", () => {
        const { rerender, unmount } = renderDebouncedMemo(strict, dep => `value ${dep}`);

        rerender({ dep: 1 });
        // React keeps a timer of its own, so compare counts instead of expecting zero.
        const pending = vi.getTimerCount();

        unmount();
        expect(vi.getTimerCount()).toBe(pending - 1);
    });
});
