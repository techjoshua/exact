import type { PuzzleKind } from './types.js';
import { validateWords } from './words.js';

/** Puzzle kinds for which the local language model can author source material. */
export type AiPuzzleKind = Exclude<PuzzleKind, 'sudoku'>;

const topicToken = '{{topic}}';
const wordSearchPromptTemplate = `Create 10 unique word-search words about "{{topic}}".
Use familiar answers of 3-12 English letters. Remove spaces, punctuation, and accents from answers. Avoid proper nouns unless essential, offensive language, and near-duplicates.
Output contract:
- Return one valid JSON object and nothing else: no introduction, explanation, markdown, or code fence.
- The object must have exactly one top-level property named "words".
- "words" must be an array of 8-12 strings, with one normalized answer in each string.
- Do not add any other properties.
Check the JSON syntax before responding.`;
const crosswordPromptTemplate = `Create 10 unique conventional American-style crossword answers and clues about "{{topic}}".
Every answer must be directly and recognizably related to the requested topic. Use familiar answers of 3-12 English letters. Remove spaces, punctuation, and accents from answers. Avoid proper nouns unless essential, offensive language, and near-duplicates. Choose answers that share letters so they can form one connected crossword.
Write short crossword clues, not explanatory sentences or dictionary-style definitions. Each clue must be 2-8 words and accurately lead to its paired answer, not a different entry. Use a synonym, concise description, fill-in-the-blank, wordplay, or familiar association. Never include the answer, an inflected or plural form of it, a close spelling variant, or a longer word containing it. Avoid frames such as "is," "means," "something that," and "used to."
Before responding, check that every answer belongs to the topic, every clue uniquely fits its paired answer, and no clue reveals its answer. Replace any entry that fails a check. Do not copy words or clues from these instructions.
Output contract:
- Return one valid JSON object and nothing else: no introduction, explanation, markdown, or code fence.
- The object must have exactly one top-level property named "entries".
- "entries" must be an array of 8-12 objects.
- Every entry object must have exactly two string properties: "word" and "clue".
- Do not add any other properties.
Check the JSON syntax before responding.`;

/** Identifies otherwise structured crossword output whose clues reveal their answers. */
export class AiClueLeakError extends Error {
	readonly answers: readonly string[];

	/** Records the normalized answers exposed by one otherwise structured model response. */
	constructor(answers: readonly string[]) {
		super(
			`The local model repeated answers in their clues: ${answers.join(', ')}. Try again or edit the prompt template.`
		);
		this.name = 'AiClueLeakError';
		this.answers = answers;
	}
}

/** Returns the editable default prompt template for one local-AI puzzle kind. */
export function defaultAiPromptTemplate(kind: AiPuzzleKind): string {
	return kind === 'crossword' ? crosswordPromptTemplate : wordSearchPromptTemplate;
}

/** Returns the constrained JSON schema used for local model output. */
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
				items,
				minItems: 8,
				maxItems: 12
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
		throw new Error('The local model returned malformed data. Try generating again.');
	}
	if (!isRecord(parsed)) throw new Error('The local model returned an unexpected result.');

	if (kind === 'word-search') {
		if (!Array.isArray(parsed.words))
			throw new Error('The local model did not return a word list.');
		const words = uniqueWords(parsed.words);
		validateAiWords(words);
		return words.join('\n');
	}

	if (!Array.isArray(parsed.entries))
		throw new Error('The local model did not return crossword entries.');
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
		throw new Error('The local model returned too few usable words. Try a broader topic.');
	const issue = validateWords(words, 6);
	if (issue) throw new Error(`The local model response was rejected: ${issue}`);
}

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
