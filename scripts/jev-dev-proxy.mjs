#!/usr/bin/env node
/**
 * Local dev proxy for AI Fill's endpoint mode. TypeSafe's API rejects browser
 * CORS preflights, so browser demos (Storybook, the sample apps) point an
 * endpoint connection at this proxy instead:
 *
 *     aiFill.connection = { mode: "endpoint", url: "http://localhost:8787/api/jev" }
 *
 * It runs `createJevHandler` from `@specstory/ai-data-grid/server` on
 * 0.0.0.0:8787 with the key from JEV_API_KEY (or TYPESAFE_API_KEY). CORS and
 * `authorize` allow only http://localhost:<any port>, http://127.0.0.1:<any
 * port> and the origins passed with --allow-origin; never `*`. A request with
 * no Origin header is refused, so it can't be used from outside a browser.
 *
 * It is not published and no test or CI step runs it. It never logs the key
 * or request headers. Build core first (`npm run build`), then:
 *
 *     JEV_API_KEY=… node scripts/jev-dev-proxy.mjs [--port 8787] [--allow-origin <origin>]… [--allow-model <model>]…
 *
 * Every request it forwards is a live, billed Jev call.
 */
import { createServer } from "node:http";
import { parseArgs } from "node:util";
import { createJevHandler, toNodeListener } from "@specstory/ai-data-grid/server";

const { values } = parseArgs({
    options: {
        port: { type: "string", default: "8787" },
        host: { type: "string", default: "0.0.0.0" },
        "allow-origin": { type: "string", multiple: true, default: [] },
        "allow-model": { type: "string", multiple: true, default: [] },
        help: { type: "boolean", default: false },
    },
});

if (values.help) {
    console.log(
        "Usage: JEV_API_KEY=… node scripts/jev-dev-proxy.mjs [--port 8787] [--host 0.0.0.0] [--allow-origin <origin>]… [--allow-model <model>]…"
    );
    process.exit(0);
}

const apiKey = process.env.JEV_API_KEY ?? process.env.TYPESAFE_API_KEY ?? "";
if (apiKey === "") {
    console.error("jev-dev-proxy: set JEV_API_KEY (or TYPESAFE_API_KEY) in the environment.");
    process.exit(1);
}

const extraOrigins = new Set();
for (const origin of values["allow-origin"]) {
    if (origin === "*" || origin === "null") {
        console.error(`jev-dev-proxy: --allow-origin ${origin} is not allowed; pass exact origins.`);
        process.exit(1);
    }
    try {
        extraOrigins.add(new URL(origin).origin);
    } catch {
        console.error(`jev-dev-proxy: --allow-origin ${origin} isn't a valid origin, for example https://example.com`);
        process.exit(1);
    }
}

const localOrigin = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/;

function isAllowedOrigin(origin) {
    return typeof origin === "string" && (localOrigin.test(origin) || extraOrigins.has(origin));
}

const handler = createJevHandler({
    apiKey,
    authorize: request => isAllowedOrigin(request.headers.get("origin")),
    ...(values["allow-model"].length > 0 ? { allowedModels: values["allow-model"] } : {}),
});
const listener = toNodeListener(handler);

const server = createServer((req, res) => {
    const origin = req.headers.origin;
    const allowed = isAllowedOrigin(origin);
    const started = Date.now();
    res.on("finish", () => {
        // Method, path, status and time only: never the key, headers or bodies.
        console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - started} ms`);
    });

    if (allowed) {
        res.setHeader("access-control-allow-origin", origin);
        res.setHeader("vary", "Origin");
        res.setHeader("access-control-expose-headers", "retry-after, retry-after-ms, x-typesafe-request-id");
    }
    if (req.method === "OPTIONS") {
        if (!allowed) {
            res.statusCode = 403;
            res.end();
            return;
        }
        res.statusCode = 204;
        res.setHeader("access-control-allow-methods", "POST");
        res.setHeader("access-control-allow-headers", req.headers["access-control-request-headers"] ?? "content-type");
        res.setHeader("access-control-max-age", "600");
        res.end();
        return;
    }
    void listener(req, res);
});

const port = Number(values.port);
server.listen(port, values.host, () => {
    const origins = ["http://localhost:*", "http://127.0.0.1:*", ...extraOrigins].join(", ");
    console.log(`jev-dev-proxy: POST http://${values.host}:${port}/api/jev (any path works) → Jev`);
    console.log(`jev-dev-proxy: allowed origins: ${origins}`);
});
