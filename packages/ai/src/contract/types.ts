/**
 * Types for the Jev HTTP contract (`POST https://api.typesafe.ai/v1/systemone`).
 *
 * These are this package's own versioned copy of the contract, pinned by a
 * fixture test. They describe the wire format; {@link ParsedAnswer} is the
 * validated form the rest of the package works with.
 */

/** Any JSON value. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonObject;

/** A JSON object. */
export interface JsonObject {
    readonly [key: string]: JsonValue;
}

/** The three Jev question types. */
export type JevPrimitive = "choice" | "score" | "noul";

/** Jev `instructions`: a string, an object or an array. */
export type JevInstructions = string | JsonObject | readonly JsonValue[];

/** Jev `state`, the content every question in a request is asked about: a string, an object or an array. */
export type JevState = string | JsonObject | readonly JsonValue[];

/**
 * A Choice question. `criteria` maps each option id to its description; a
 * description may be `null`. Jev allows at most 255 options.
 */
export interface JevChoiceQuestion {
    readonly type: "choice";
    readonly instructions: JevInstructions;
    readonly criteria: { readonly [optionId: string]: string | JsonObject | null };
}

/** A Score question. `criteria` is the ordered list of rubric levels, lowest first. */
export interface JevScoreQuestion {
    readonly type: "score";
    readonly instructions: JevInstructions;
    readonly criteria: readonly (string | JsonObject)[];
}

/** A Noul (yes/no) question, optionally with descriptions of what `true` and `false` mean. */
export interface JevNoulQuestion {
    readonly type: "noul";
    readonly instructions: JevInstructions;
    readonly criteria?: { readonly true?: string | JsonObject; readonly false?: string | JsonObject };
}

/** One Jev question. */
export type JevQuestion = JevChoiceQuestion | JevScoreQuestion | JevNoulQuestion;

/** The request body. Every question sees the same `state` and is answered independently. */
export interface JevRequest {
    readonly state: JevState;
    /** A model alias (`jev-latest`, `jev-preview`) or a versioned id such as `jev-1.13.0`. Required. */
    readonly model: string;
    readonly questions: { readonly [questionId: string]: JevQuestion };
}

/** A Choice answer as sent by Jev. */
export interface JevChoiceAnswer {
    readonly type: "choice";
    /** The selected option id: the one with the highest probability. */
    readonly choice: string;
    /** The probability of every option. They sum to 1 across the options. */
    readonly probabilities: { readonly [optionId: string]: number };
    /** Model confidence in [0, 1]. Higher when the probability is concentrated on one option. Not a probability. */
    readonly confidence: number;
}

/** A Score answer as sent by Jev. */
export interface JevScoreAnswer {
    readonly type: "score";
    /** The probability-weighted position on the rubric, in [0, levels − 1]. Not a percentage or a probability. */
    readonly score: number;
    /** Maps each level index (`"0"`, `"1"`, …) back to its description. */
    readonly legend: { readonly [level: string]: JsonValue };
    /** The probability of each level, keyed `"0"`…`"n-1"`. They sum to 1. */
    readonly probabilities: { readonly [level: string]: number };
    /** Model confidence in [0, 1]. */
    readonly confidence: number;
}

/** A Noul answer as sent by Jev. There is no confidence field. */
export interface JevNoulAnswer {
    readonly type: "noul";
    /** The probability that the answer is yes, in [0, 1]. A value near 0 is a strong no, not a failure. */
    readonly noul: number;
}

/** One answer as sent by Jev. */
export type JevAnswer = JevChoiceAnswer | JevScoreAnswer | JevNoulAnswer;

/** The response body. */
export interface JevResponse {
    /** The versioned model id that answered, for example `jev-1.13.0` for a `jev-latest` request. */
    readonly model: string;
    readonly answers: { readonly [questionId: string]: JevAnswer };
    readonly usage?: { readonly input_tokens: number; readonly output_tokens: number };
}

/** A validated Choice answer, with the model that produced it. */
export interface ChoiceAnswer extends JevChoiceAnswer {
    /** The versioned model id reported by the response. */
    readonly model: string;
}

/** A validated Score answer, with the model that produced it. */
export interface ScoreAnswer extends JevScoreAnswer {
    /** The versioned model id reported by the response. */
    readonly model: string;
}

/** A validated Noul answer, with the model that produced it. */
export interface NoulAnswer extends JevNoulAnswer {
    /** The versioned model id reported by the response. */
    readonly model: string;
}

/** A validated answer of any primitive. Produced only by {@link parseAnswer}. */
export type ParsedAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

/** The validated answer type for primitive `P`. */
export type AnswerFor<P extends JevPrimitive> = Extract<ParsedAnswer, { readonly type: P }>;
