import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["test/**/*.test.tsx", "test/**/*.test.ts"],
        environment: "jsdom",
        threads: false,
        singleThread: true,
        watch: false,
        clearMocks: true,
        maxConcurrency: 5,
    },
});
