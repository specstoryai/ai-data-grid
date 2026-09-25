import { renderHook, cleanup, act } from "@testing-library/react";
import { useStateWithReactiveInput } from "../src/common/utils.js";
import { expect, describe, test, afterEach } from "vitest";

describe("useStateWithReactiveInput", () => {
    afterEach(async () => {
        await cleanup();
    });

    test("initial state", () => {
        const { result } = renderHook(() => useStateWithReactiveInput(20));
        expect(result.current[0]).toBe(20);
    });

    test("set state", () => {
        const { result } = renderHook(() => useStateWithReactiveInput(20));

        act(() => {
            result.current[1](30);
        });

        expect(result.current[0]).toBe(30);
    });

    test("set state then render with new initial", () => {
        const { result, rerender } = renderHook(({ initialValue }) => useStateWithReactiveInput(initialValue), {
            initialProps: { initialValue: 20 },
        });

        act(() => {
            result.current[1](30);
        });

        rerender({ initialValue: 50 });

        expect(result.current[0]).toBe(50);
    });

    test("set state then render with new initial then set state", () => {
        const { result, rerender } = renderHook(({ initialValue }) => useStateWithReactiveInput(initialValue), {
            initialProps: { initialValue: 20 },
        });

        act(() => {
            result.current[1](30);
        });

        rerender({ initialValue: 50 });

        act(() => {
            result.current[1](30);
        });

        expect(result.current[0]).toBe(30);
    });

    test("set state then render with new initial then set state should get re-render value", () => {
        const { result, rerender } = renderHook(({ initialValue }) => useStateWithReactiveInput(initialValue), {
            initialProps: { initialValue: 20 },
        });

        act(() => {
            result.current[1](30);
        });

        rerender({ initialValue: 50 });

        act(() => {
            result.current[1](pv => {
                expect(pv).toBe(50);
                return 30;
            });
        });

        expect(result.current[0]).toBe(30);
    });

    test("set state with identity does not re-render", () => {
        let renderCount = 0;
        const { result } = renderHook(
            ({ initialValue }) => {
                renderCount++;
                return useStateWithReactiveInput(initialValue);
            },
            {
                initialProps: { initialValue: 20 },
            }
        );

        expect(renderCount).toBe(1);

        act(() => {
            result.current[1](x => x);
        });

        expect(renderCount).toBe(1);
    });

    test("set state with increment re-render", () => {
        let renderCount = 0;
        const { result } = renderHook(
            ({ initialValue }) => {
                renderCount++;
                return useStateWithReactiveInput(initialValue);
            },
            {
                initialProps: { initialValue: 20 },
            }
        );

        expect(renderCount).toBe(1);

        act(() => {
            result.current[1](x => x + 1);
        });

        expect(renderCount).toBe(2);
    });

    test("set state with identity does not re-render after state change", () => {
        let renderCount = 0;
        const { result, rerender } = renderHook(
            ({ initialValue }) => {
                renderCount++;
                return useStateWithReactiveInput(initialValue);
            },
            {
                initialProps: { initialValue: 20 },
            }
        );

        expect(renderCount).toBe(1);

        rerender({ initialValue: 50 });

        expect(result.current[0]).toBe(50);

        expect(renderCount).toBe(2);

        act(() => {
            result.current[1](x => x);
        });

        expect(result.current[0]).toBe(50);
        expect(renderCount).toBe(2);
    });
});
