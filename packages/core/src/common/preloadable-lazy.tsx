import * as React from "react";

type Loader<P> = () => Promise<{ default: React.ComponentType<P> }>;

export interface PreloadableLazy<P> {
    /** Renders the loaded component, or a `React.lazy` wrapper that suspends until it loads. */
    readonly Component: React.FunctionComponent<P>;
    /**
     * Starts loading the component, once. Later calls return the same promise, which
     * settles with the load and never rejects. If this load fails, rendering `Component`
     * loads again and reports the error the way `React.lazy` does.
     */
    readonly preload: () => Promise<void>;
}

/**
 * Like `React.lazy`, but a component that has already loaded (after `preload()` or an
 * earlier render) renders directly instead of suspending. React 19 holds a suspended
 * boundary's content for up to 300 ms after its fallback appears, even if the chunk
 * arrives sooner, so a lazy editor that suspends on the first edit swallows the keys typed
 * in that time (GitHub #58).
 *
 * Switching from the lazy element to the loaded component doesn't remount anything: `loaded`
 * is set before React hears that the load finished, and a mount that suspended was never
 * committed, so React renders it again from the start and it takes the direct path.
 */
export function preloadableLazy<P extends object>(load: Loader<P>): PreloadableLazy<P> {
    let loaded: React.ComponentType<P> | undefined;
    let loading: Promise<{ default: React.ComponentType<P> }> | undefined;
    let preloading: Promise<void> | undefined;

    const start = () => {
        loading ??= load().then(
            module => {
                loaded = module.default;
                return module;
            },
            (error: unknown) => {
                loading = undefined;
                throw error;
            }
        );
        return loading;
    };

    const preload = () => {
        preloading ??= start().then(
            () => undefined,
            () => undefined
        );
        return preloading;
    };

    const Lazy = React.lazy(start);

    const Component: React.FunctionComponent<P> = props => React.createElement(loaded ?? Lazy, props);

    return { Component, preload };
}
