#!/usr/bin/env node
/**
 * Manual live check of AI Fill against Jev (SPST-17 §10 item 3), in direct
 * mode from Node. It sends the three example questions (buyer persona Choice,
 * seniority Score, owns-a-budget Noul) about one synthetic contact through AI
 * Fill's own direct-mode client, validates every answer with `parseJevAnswer`
 * and runs the column policies, then makes one deliberate call with a bad key
 * to confirm a 401 is reported as an `authentication` error.
 *
 * It makes at most 4 live, billed calls (3 without --skip-401). No test or CI
 * step runs it; live calls are budgeted and recorded by hand in
 * docs/content/docs/ai-fill/live-validation.mdx.
 *
 * Build core first (`npm run build`), then:
 *
 *     node scripts/jev-live-check.mjs --dry-run            # prints the requests, sends nothing, needs no key
 *     JEV_API_KEY=… node scripts/jev-live-check.mjs [--model jev-latest] [--skip-401]
 *
 * It reads JEV_API_KEY (or TYPESAFE_API_KEY), refuses to send without one, and
 * never prints the key. For each call it prints the date, what was asked, the
 * model id that answered, the request id and the answer.
 */
import { parseArgs } from "node:util";
import { parseJevAnswer, evaluateAIPolicy } from "@specstory/ai-data-grid";
import { buildQuestion } from "../packages/core/dist/esm/ai-fill/identity/fingerprints.js";
import { createJevTransport } from "../packages/core/dist/esm/ai-fill/transport/client.js";

const { values } = parseArgs({
    options: {
        "dry-run": { type: "boolean", default: false },
        "skip-401": { type: "boolean", default: false },
        model: { type: "string", default: "jev-latest" },
    },
});

/** One synthetic contact. Nothing here is real data. */
const state = {
    company: "Example Manufacturing Co",
    title: "VP of Finance",
    notes: "Asked for a pricing sheet and said the purchase needs sign-off from their team's annual budget.",
};

const columns = {
    persona: {
        primitive: "choice",
        instructions: "Which buyer persona best describes this contact?",
        options: {
            champion: { description: "Drives the purchase internally and advocates for it", label: "Champion" },
            economic: { description: "Controls the budget and signs off on spend", label: "Economic buyer" },
            user: { description: "Uses the product day to day", label: "End user" },
            none_of_the_above: { description: "None of these fit", label: "None of the above", outcome: "none" },
        },
        policy: { show: { minProbability: 0.8 } },
    },
    seniority: {
        primitive: "score",
        instructions: "How senior is this contact?",
        levels: ["Individual contributor", "Manager", "Director", "Vice president or C-level"],
        output: { store: "level-label" },
        policy: { show: { minConfidence: 0.7 } },
    },
    ownsBudget: {
        primitive: "noul",
        instructions: "Does this contact own a budget?",
        criteria: { true: "Signs off on spend", false: "No spending authority" },
        output: { store: "boolean", bands: { falseAtOrBelow: 0.2, trueAtOrAbove: 0.8, between: "review" } },
    },
};

const questionIds = Object.keys(columns).map((_, i) => `q${i}`);
const request = {
    state,
    model: values.model,
    questions: Object.fromEntries(
        Object.values(columns).map((definition, i) => [questionIds[i], buildQuestion(definition)])
    ),
};

const transportOptions = {
    timeoutMs: 20_000,
    maxRetries: 0,
    backoff: { initialMs: 500, maxMs: 5000, jitter: 0.25 },
    isBrowser: false,
};

if (values["dry-run"]) {
    console.log("Dry run: nothing is sent. These are the requests a live run makes:");
    console.log(`1. POST https://api.typesafe.ai/v1/systemone with the key from JEV_API_KEY`);
    console.log(JSON.stringify(request, null, 2));
    if (!values["skip-401"]) {
        console.log("2. The same request with a deliberately invalid key, expecting HTTP 401 (authentication)");
    }
    process.exit(0);
}

const apiKey = process.env.JEV_API_KEY ?? process.env.TYPESAFE_API_KEY ?? "";
if (apiKey === "") {
    console.error(
        "jev-live-check: set JEV_API_KEY (or TYPESAFE_API_KEY). Use --dry-run to see the requests without a key."
    );
    process.exit(1);
}

let failed = false;
const date = new Date().toISOString();

const transport = createJevTransport({ mode: "direct", apiKey }, transportOptions);
try {
    const { response, requestId } = await transport.send(request);
    console.log(`${date} asked: persona (choice), seniority (score), ownsBudget (noul) about one synthetic contact`);
    console.log(
        `requested model: ${request.model}; answered by: ${response.model}; request id: ${requestId ?? "none"}`
    );
    Object.entries(columns).forEach(([columnId, definition], i) => {
        const questionId = questionIds[i];
        const parsed = parseJevAnswer(response.answers[questionId], request.questions[questionId], response.model);
        if (!parsed.ok) {
            failed = true;
            console.log(`${columnId}: MALFORMED (${parsed.reason}): ${JSON.stringify(response.answers[questionId])}`);
            return;
        }
        const evaluation = evaluateAIPolicy({
            definition,
            answer: parsed.answer,
            context: { rowId: "contact-1", columnId, state },
        });
        const outcome =
            evaluation.status === "error"
                ? `error ${evaluation.error.kind}: ${evaluation.error.message}`
                : `${evaluation.status} "${evaluation.output.display}" (${evaluation.decision.reason.message})`;
        console.log(`${columnId}: ${JSON.stringify(parsed.answer)} → ${outcome}`);
    });
} catch (error) {
    failed = true;
    console.log(`${date} live call failed: ${error.kind ?? "error"}: ${error.message}`);
}

if (!values["skip-401"]) {
    const badKey = createJevTransport({ mode: "direct", apiKey: "invalid-key-for-live-check" }, transportOptions);
    try {
        await badKey.send(request);
        failed = true;
        console.log(`${new Date().toISOString()} deliberate 401: UNEXPECTED success`);
    } catch (error) {
        const ok = error.kind === "authentication" && error.httpStatus === 401;
        if (!ok) failed = true;
        console.log(
            `${new Date().toISOString()} deliberate 401: ${ok ? "ok" : "UNEXPECTED"} (${error.kind}, HTTP ${error.httpStatus ?? "none"}, request id ${error.requestId ?? "none"})`
        );
    }
}

process.exit(failed ? 1 : 0);
