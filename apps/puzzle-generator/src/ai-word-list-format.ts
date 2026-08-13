import type { PuzzleKind } from './types.js';
import { validateWords } from './words.js';

/** Puzzle kinds for which OpenAI can author source material. */
export type AiPuzzleKind = Exclude<PuzzleKind, 'sudoku'>;

const topicToken = '{{topic}}';
const wordSearchPromptTemplate = `Create 20 unique, individual words closely related to "{{topic}}" for a word-search puzzle.
Use familiar words of 3-12 English letters. Do not use words that appear in the topic text. Remove spaces, punctuation, and accents. Avoid proper nouns unless essential, offensive language, and near-duplicates.
Output contract:
- Return one valid JSON object and nothing else: no introduction, explanation, markdown, or code fence.
- The object must have exactly one top-level property named "words".
- "words" must be an array of 20 strings, with one word in each string.
- Do not add any other properties.
- Begin with an opening curly brace, then the quoted key "words", a colon, and an opening square bracket.
- Write each answer as a separate quoted JSON string divided by commas.
- After the last answer, close the square bracket and then the curly brace.
Check the JSON syntax before responding.`;
const crosswordPromptTemplate = `Create 20 unique, single-word answers closely related to "{{topic}}" for a conventional American-style crossword.
Use familiar answers of 3-12 English letters. Do not use words that appear in the topic text. Remove spaces, punctuation, and accents. Avoid proper nouns unless essential, offensive language, and near-duplicates. Favor answers that share common letters so they can form a connected grid.
Give every answer a concise clue of 2-7 words that could appear in a published crossword. A clue may be a synonym, short descriptive phrase, familiar association, fill-in-the-blank, or simple wordplay. It must point accurately to its paired answer and not another entry.
Never put the answer, a grammatical form of it, a close spelling variant, or a longer word containing it in the clue. Do not describe the spelling or say that the answer "is," "means," is "something that," or is "used to" do something. Do not write explanatory sentences.
Before responding, silently check that every answer belongs to the topic, every clue fits its paired answer, and no clue reveals its answer. Replace any entry that fails a check.
Output contract:
- Return one valid JSON object and nothing else: no introduction, explanation, markdown, or code fence.
- The object must have exactly one top-level property named "entries".
- "entries" must be an array of 20 objects.
- Every entry object must have exactly two string properties: "word" and "clue".
- Do not add any other properties.
- Begin with an opening curly brace, then the quoted key "entries", a colon, and an opening square bracket.
- Write each array item as an object with the quoted key "word" followed by its answer string and the quoted key "clue" followed by its clue string.
- Divide entries with commas. After the last entry, close the square bracket and then the outer curly brace.
Check the JSON syntax before responding.`;

/** Identifies otherwise structured crossword output whose clues reveal their answers. */
export class AiClueLeakError extends Error {
	readonly answers: readonly string[];

	/** Records the normalized answers exposed by one otherwise structured model response. */
	constructor(answers: readonly string[]) {
		super(
			`OpenAI repeated answers in their clues: ${answers.join(', ')}. Try again or edit the prompt template.`
		);
		this.name = 'AiClueLeakError';
		this.answers = answers;
	}
}

/** Returns the editable default prompt template for one AI-authored puzzle kind. */
export function defaultAiPromptTemplate(kind: AiPuzzleKind): string {
	return kind === 'crossword' ? crosswordPromptTemplate : wordSearchPromptTemplate;
}

/** Returns the constrained JSON schema used for OpenAI output. */
export function aiWordListSchema(kind: AiPuzzleKind): string {
	const items =
		kind === 'crossword'
			? {
					type: 'object',
					properties: {
						word: { type: 'string' },
						clue: { type: 'string' }
					},
					required: ['word', 'clue'],
					additionalProperties: false
				}
			: { type: 'string' };
	return JSON.stringify({
		type: 'object',
		properties: {
			[kind === 'crossword' ? 'entries' : 'words']: {
				type: 'array',
				items
			}
		},
		required: [kind === 'crossword' ? 'entries' : 'words'],
		additionalProperties: false
	});
}

/** Builds a compact instruction tuned for printable puzzle source material. */
export function aiWordListPrompt(
	topic: string,
	kind: AiPuzzleKind,
	template = defaultAiPromptTemplate(kind)
): string {
	const normalizedTemplate = template.trim();
	const serializedTopic = topic.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	return normalizedTemplate.includes(topicToken)
		? normalizedTemplate.replaceAll(topicToken, serializedTopic)
		: `${normalizedTemplate}\nTopic: "${serializedTopic}"`;
}

/**
 * Validates structured model output and converts it to the app's editable text format.
 * Invalid or unsafe generations are rejected before they can replace authored input.
 */
export function formatAiWordListResponse(source: string, kind: AiPuzzleKind): string {
	let parsed: unknown;
	try {
		parsed = JSON.parse(source);
	} catch {
		throw new Error('OpenAI returned malformed data. Try generating again.');
	}
	if (!isRecord(parsed)) throw new Error('OpenAI returned an unexpected result.');

	if (kind === 'word-search') {
		if (!Array.isArray(parsed.words)) throw new Error('OpenAI did not return a word list.');
		const words = uniqueWords(parsed.words);
		validateAiWords(words);
		return words.join('\n');
	}

	if (!Array.isArray(parsed.entries)) throw new Error('OpenAI did not return crossword entries.');
	const entries = new Map<string, string>();
	const leakingAnswers: string[] = [];
	for (const candidate of parsed.entries) {
		if (
			!isRecord(candidate) ||
			typeof candidate.word !== 'string' ||
			typeof candidate.clue !== 'string'
		)
			continue;
		const word = normalizeAnswer(candidate.word);
		const clue = candidate.clue.trim().replace(/\s+/g, ' ');
		if (word && clue && clueContainsAnswer(word, clue)) {
			leakingAnswers.push(word);
			continue;
		}
		if (word && clue && clue.length <= 160 && !entries.has(word)) entries.set(word, clue);
	}
	if (leakingAnswers.length) {
		throw new AiClueLeakError([...new Set(leakingAnswers)]);
	}
	validateAiWords([...entries.keys()]);
	return [...entries].map(([word, clue]) => `${word} - ${clue}`).join('\n');
}

function uniqueWords(candidates: readonly unknown[]): string[] {
	return [
		...new Set(
			candidates.flatMap((candidate) =>
				typeof candidate === 'string' && normalizeAnswer(candidate)
					? [normalizeAnswer(candidate)]
					: []
			)
		)
	];
}

function validateAiWords(words: readonly string[]): void {
	if (words.length < 6)
		throw new Error('OpenAI returned too few usable words. Try a broader topic.');
	const wrongLength = words.find((word) => word.length < 3 || word.length > 12);
	if (wrongLength)
		throw new Error(`OpenAI returned “${wrongLength}”, but answers must contain 3-12 letters.`);
	const placeholder = words.find((word) => placeholderAnswers.has(word));
	if (placeholder)
		throw new Error(`OpenAI copied the placeholder “${placeholder}” instead of an answer.`);
	const issue = validateWords(words, 6);
	if (issue) throw new Error(`The OpenAI response was rejected: ${issue}`);
}

const placeholderAnswers = new Set(['WORD', 'ANSWER', 'CLUE', 'PLACEHOLDER']);

function normalizeAnswer(source: string): string {
	return source
		.normalize('NFKD')
		.replace(/[^a-z]/gi, '')
		.toUpperCase();
}

function clueContainsAnswer(answer: string, clue: string): boolean {
	const normalizedAnswer = answer.toLowerCase();
	return clue
		.normalize('NFKD')
		.toLowerCase()
		.split(/[^a-z]+/)
		.some((token) => token.includes(normalizedAnswer));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
