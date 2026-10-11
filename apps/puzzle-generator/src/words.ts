import type { CrosswordClue } from './types.js';

const blockedSequences = [
	'BITCH',
	'COCK',
	'CUNT',
	'DICK',
	'FUCK',
	'PISS',
	'SHIT',
	'SLUT',
	'WHORE'
] as const;

/** Parses, normalizes, and deduplicates author-provided puzzle words. */
export function parseWords(source: string): string[] {
	return [
		...new Set(
			source
				.split(/[\s,;]+/)
				.map((word) =>
					word
						.normalize('NFKD')
						.replace(/[^a-z]/gi, '')
						.toUpperCase()
				)
				.filter(Boolean)
		)
	];
}

/**
 * Parses one crossword entry per line using the human-readable `answer - clue` format.
 * Dash separators accept optional surrounding whitespace. A later spaced separator preserves
 * a hyphenated answer only when the preceding text is one compact token. Otherwise the first
 * dash separates the clue, retaining any later dashes within its text.
 * A line without a separator remains usable and receives an explicit missing-clue label.
 */
export function parseCrosswordClues(source: string): CrosswordClue[] {
	return parseCrosswordInput(source).map(({ word, clue }) => ({ word, clue }));
}

/**
 * Parses at least three distinct crossword answers using the same constraints as word lists.
 * Throws on invalid input. Answer errors include the original line and its one-based line number.
 */
export function parseValidatedCrosswordClues(source: string): CrosswordClue[] {
	const entries = parseCrosswordInput(source);
	if (entries.length < 3) throw new Error('Enter at least 3 different words.');
	const issue = invalidWordIssue(entries.map((entry) => entry.word));
	if (issue) {
		const entry = entries.find((entry) => entry.word === issue.word)!;
		throw new Error(
			`Line ${entry.lineNumber}: the answer ${issue.reason}\nOriginal line: ${entry.sourceLine}`
		);
	}
	return entries.map(({ word, clue }) => ({ word, clue }));
}

/** Retains input provenance before normalization so diagnostics can identify the authored entry. */
function parseCrosswordInput(
	source: string
): (CrosswordClue & { sourceLine: string; lineNumber: number })[] {
	const entries = new Map<string, CrosswordClue & { sourceLine: string; lineNumber: number }>();
	for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
		const line = rawLine.trim();
		if (!line) continue;
		const firstSeparator = line.match(/[-–\u2014]/);
		const spacedSeparator = line.match(/\s+(?:-|–|\u2014)\s+/);
		const separator =
			spacedSeparator && !/\s/.test(line.slice(0, spacedSeparator.index).trim())
				? spacedSeparator
				: firstSeparator;
		const answerSource = separator ? line.slice(0, separator.index) : line;
		const word = normalizeWord(answerSource);
		if (!word || entries.has(word)) continue;
		const clue = separator ? line.slice((separator.index ?? 0) + separator[0].length).trim() : '';
		entries.set(word, {
			word,
			clue: clue || 'No clue provided',
			sourceLine: rawLine,
			lineNumber: index + 1
		});
	}
	return [...entries.values()];
}

function normalizeWord(source: string): string {
	return source
		.normalize('NFKD')
		.replace(/[^a-z]/gi, '')
		.toUpperCase();
}

/** Returns a user-facing validation issue, or undefined when words are safe to generate. */
export function validateWords(words: readonly string[], minimum = 2): string | undefined {
	if (words.length < minimum) return `Enter at least ${minimum} different words.`;
	const issue = invalidWordIssue(words);
	return issue ? `“${issue.word}” ${issue.reason}` : undefined;
}

/** Applies the same answer constraints and error priority to manual and generated word lists. */
function invalidWordIssue(words: readonly string[]): { word: string; reason: string } | undefined {
	const short = words.find((word) => word.length < 2);
	if (short) return { word: short, reason: 'is too short. Answers need at least two letters.' };
	const long = words.find((word) => word.length > 24);
	if (long) return { word: long, reason: 'is longer than the 24-letter limit.' };
	const blocked = words.find(containsBlockedSequence);
	if (blocked) return { word: blocked, reason: 'contains a blocked sequence and was not used.' };
	return undefined;
}

/** Checks a letter sequence in both reading directions against the conservative safety list. */
export function containsBlockedSequence(value: string): boolean {
	const upper = value.toUpperCase();
	const reverse = [...upper].reverse().join('');
	return blockedSequences.some((blocked) => upper.includes(blocked) || reverse.includes(blocked));
}
