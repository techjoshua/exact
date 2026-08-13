import { formatAiWordListResponse, type AiPuzzleKind } from './ai-word-list-format.js';
import type { BulkPuzzlePlan, BulkPuzzlePlanEntry } from './bulk-plan.js';
import { requestOpenAiStructuredOutput } from './openai-ai.js';

/** One raw chunk returned while OpenAI drafts an edition plan. */
export type OpenAiBulkResponse = { completed: number; total: number; content: string };

/**
 * Drafts separately titled source material in bounded Responses API chunks.
 * Every chunk is schema-constrained and passed through the same local word and clue validation as
 * single-puzzle authoring before it becomes editable plan text.
 */
export async function generateOpenAiBulkPlan(
	apiKey: string,
	model: string,
	topic: string,
	kind: AiPuzzleKind,
	count: number,
	onResponse: (response: OpenAiBulkResponse) => void,
	signal?: AbortSignal
): Promise<BulkPuzzlePlan> {
	const entries: BulkPuzzlePlanEntry[] = [];
	const chunkSize = 5;
	while (entries.length < count) {
		const size = Math.min(chunkSize, count - entries.length);
		const input: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
			{ role: 'system', content: systemInstruction(kind) },
			{ role: 'user', content: bulkPrompt(topic, kind, size, entries.map((entry) => entry.title)) }
		];
		let accepted: BulkPuzzlePlanEntry[] | undefined;
		for (let attempt = 0; attempt < 2 && !accepted; attempt++) {
			const content = await requestOpenAiStructuredOutput(
				apiKey,
				model,
				'bulk_puzzle_edition',
				bulkPlanSchema(kind, size),
				input,
				signal,
				8000
			);
			onResponse({ completed: entries.length, total: count, content });
			try {
				accepted = parseBulkResponse(content, kind, size);
			} catch (error) {
				if (attempt === 1) throw error;
				input.push(
					{ role: 'assistant', content },
					{
						role: 'user',
						content: `That chunk was rejected: ${error instanceof Error ? error.message : String(error)} Return a complete replacement chunk that corrects the problem.`
					}
				);
			}
		}
		entries.push(...accepted!);
		onResponse({ completed: entries.length, total: count, content: '' });
	}
	return { kind, entries };
}

/** Defines the exact per-puzzle title and source-material shape returned by the model. */
export function bulkPlanSchema(kind: AiPuzzleKind, count: number): Record<string, unknown> {
	const source =
		kind === 'crossword'
			? {
					entries: {
						type: 'array',
						items: {
							type: 'object',
							properties: { word: { type: 'string' }, clue: { type: 'string' } },
							required: ['word', 'clue'],
							additionalProperties: false
						}
					}
				}
			: { words: { type: 'array', items: { type: 'string' } } };
	const required = kind === 'crossword' ? ['title', 'entries'] : ['title', 'words'];
	return {
		type: 'object',
		properties: {
			puzzles: {
				type: 'array',
				minItems: count,
				maxItems: count,
				items: {
					type: 'object',
					properties: { title: { type: 'string' }, ...source },
					required,
					additionalProperties: false
				}
			}
		},
		required: ['puzzles'],
		additionalProperties: false
	};
}

/** Converts strict model JSON into the same editable text accepted by manual plans. */
function parseBulkResponse(source: string, kind: AiPuzzleKind, expectedCount: number): BulkPuzzlePlanEntry[] {
	let parsed: { puzzles?: unknown[] };
	try {
		parsed = JSON.parse(source) as { puzzles?: unknown[] };
	} catch {
		throw new Error('OpenAI returned malformed bulk puzzle data.');
	}
	if (!Array.isArray(parsed.puzzles) || parsed.puzzles.length !== expectedCount)
		throw new Error(`OpenAI did not return the requested ${expectedCount} puzzle drafts.`);
	return parsed.puzzles.map((candidate, index) => {
		if (!candidate || typeof candidate !== 'object') throw new Error(`OpenAI puzzle ${index + 1} is invalid.`);
		const record = candidate as Record<string, unknown>;
		const title = typeof record.title === 'string' ? record.title.trim().replace(/\s+/g, ' ') : '';
		if (!title || title.length > 120) throw new Error(`OpenAI puzzle ${index + 1} has an invalid title.`);
		const wordText = formatAiWordListResponse(
			JSON.stringify(kind === 'crossword' ? { entries: record.entries } : { words: record.words }),
			kind
		);
		return { title, wordText };
	});
}

function systemInstruction(kind: AiPuzzleKind): string {
	return `You are a careful ${kind === 'crossword' ? 'crossword' : 'word-search'} editor. Create accurate, safe, publication-ready source material and follow the supplied JSON schema exactly. Every puzzle must have a distinct descriptive title and a distinct source set.`;
}

function bulkPrompt(topic: string, kind: AiPuzzleKind, count: number, usedTitles: string[]): string {
	const sourceRule = kind === 'crossword'
		? 'Give each puzzle 20 unique single-word answers of 3-12 letters with concise accurate clues. Never reveal an answer or a form of it in its clue. Favor connected crossword vocabulary.'
		: 'Give each puzzle 20 unique familiar words of 3-12 letters, using letters A-Z only after normalization.';
	return `Draft ${count} distinct printable ${kind} puzzles about “${topic}”. ${sourceRule} Titles must be concise and unique. Do not reuse an entire source set. Avoid offensive material, placeholders, and near-duplicates.${usedTitles.length ? ` Do not reuse these earlier titles: ${usedTitles.join('; ')}.` : ''}`;
}
