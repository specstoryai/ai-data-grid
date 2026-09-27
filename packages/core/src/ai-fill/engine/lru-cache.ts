/** A least-recently-used cache. Reading an entry makes it the most recent. */
export class LruCache<V> {
    private readonly entries = new Map<string, V>();

    constructor(private readonly capacity: () => number) {}

    get size(): number {
        return this.entries.size;
    }

    /** Whether the key is cached, without making it the most recent. */
    has(key: string): boolean {
        return this.entries.has(key);
    }

    get(key: string): V | undefined {
        if (!this.entries.has(key)) return undefined;
        const value = this.entries.get(key) as V;
        this.entries.delete(key);
        this.entries.set(key, value);
        return value;
    }

    set(key: string, value: V): void {
        this.entries.delete(key);
        this.entries.set(key, value);
        this.trim();
    }

    clear(): void {
        this.entries.clear();
    }

    /** Drops the least recently used entries beyond the capacity. */
    trim(): void {
        const capacity = Math.max(0, this.capacity());
        for (const key of this.entries.keys()) {
            if (this.entries.size <= capacity) break;
            this.entries.delete(key);
        }
    }
}
