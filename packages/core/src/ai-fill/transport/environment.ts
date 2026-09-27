/**
 * Whether the code runs in a browser: a window with a document, or a web
 * worker. Direct mode needs `dangerouslyAllowBrowser` there.
 */
export function isBrowserEnvironment(): boolean {
    const inWindow = typeof window !== "undefined" && typeof document !== "undefined";
    const inWorker = typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== "undefined";
    return inWindow || inWorker;
}
