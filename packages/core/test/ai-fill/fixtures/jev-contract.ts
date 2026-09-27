/**
 * Jev request and response bodies copied from the TypeSafe docs
 * (https://docs.typesafe.ai/primitives/choice, /score and /noul, read
 * 2026-09-25). The model id `jev-1.13.0` is also what live `jev-latest`
 * requests reported during planning (SPST-17 §1). If Jev's contract drifts,
 * update these from the docs and a manual live check, never from a test run.
 */

export const choiceRequest = {
    state: "My running shoes arrived in the wrong size. Can I swap them for a size 10?",
    model: "jev-latest",
    questions: {
        department: {
            type: "choice",
            instructions: "Which team should handle this?",
            criteria: {
                returns: "Exchanges, wrong or damaged items",
                shipping: "Delivery status, delays, lost packages",
                billing: "Charges, invoices, payment problems",
            },
        },
    },
} as const;

export const choiceResponse = {
    model: "jev-1.13.0",
    answers: {
        department: {
            type: "choice",
            choice: "returns",
            confidence: 1.0,
            probabilities: { shipping: 0.0, returns: 1.0, billing: 0.0 },
        },
    },
    usage: { input_tokens: 328, output_tokens: 34 },
};

export const scoreRequest = {
    state: "content to evaluate",
    model: "jev-latest",
    questions: {
        question_id: {
            type: "score",
            instructions: "What is being rated?",
            criteria: ["Level 0 description", "Level 1 description", "Level 2 description"],
        },
    },
} as const;

export const scoreResponse = {
    model: "jev-1.13.0",
    answers: {
        question_id: {
            type: "score",
            score: 1.43,
            confidence: 0.35,
            legend: { "0": "Level 0 description", "1": "Level 1 description", "2": "Level 2 description" },
            probabilities: { "0": 0.0, "1": 0.57, "2": 0.43 },
        },
    },
};

export const noulRequest = {
    state: "I have asked three times now. Can I please just talk to a real person?",
    model: "jev-latest",
    questions: {
        is_human_escalation: {
            type: "noul",
            instructions: "Is the customer asking for a human agent?",
        },
        is_repeat_contact: {
            type: "noul",
            instructions: "Has the customer contacted support about this before?",
            criteria: {
                true: "Mentions a prior attempt, ticket, or that they have asked before",
                false: "No sign of any previous contact",
            },
        },
    },
} as const;

export const noulResponse = {
    model: "jev-1.13.0",
    answers: {
        is_human_escalation: { type: "noul", noul: 0.99 },
        is_repeat_contact: { type: "noul", noul: 0.93 },
    },
    usage: { input_tokens: 360, output_tokens: 39 },
};
