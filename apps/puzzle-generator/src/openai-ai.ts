import {
	AiClueLeakError,
	aiWordListPrompt,
	aiWordListSchema,
	formatAiWordListResponse,
	type AiPuzzleKind
} from './ai-word-list-format.js';

type OpenAiResponse = Readonly<{
	output_text?: string;
	output?: ReadonlyArray<{
		type?: string;
		content?: ReadonlyArray<{ type?: string; text?: string }>;
	}>;
	error?: { message?: string };
}>;

/** One unmodified response received before parsing and puzzle-input validation. */
export type OpenAiPuzzleResponse = Readonly<{
	attempt: 'initial' | 'repair';
	content: string;
}>;

/** Generates validated word-search or crossword input through the OpenAI Responses API. */
export async function generateOpenAiWordList(
	apiKey: string,
	model: string,
	topic: string,
	kind: AiPuzzleKind,
	promptTemplate: string,
	onResponse: (response: OpenAiPuzzleResponse) => void,
	signal?: AbortSignal
): Promise<string> {
	const systemPrompt = systemInstruction(kind);
	const userPrompt = aiWordListPrompt(topic, kind, promptTemplate);
	const content = await requestStructuredInput(
		apiKey,
		model,
		kind,
		[
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt }
		],
		signal
	);
	onResponse({ attempt: 'initial', content });
	try {
		return formatAiWordListResponse(content, kind);
	} catch (error) {
		if (kind !== 'crossword' || !(error instanceof AiClueLeakError)) throw error;
		const repaired = await requestStructuredInput(
			apiKey,
			model,
			kind,
			[
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt },
				{ role: 'assistant', content },
				{
					role: 'user',
					content: `Rejected: the clues revealed these answers or longer forms containing them: ${error.answers.join(', ')}. Return a complete replacement entries array with new clues that do not reveal their answers.`
				}
			],
			signal
		);
		onResponse({ attempt: 'repair', content: repaired });
		return formatAiWordListResponse(repaired, kind);
	}
}

async function requestStructuredInput(
	apiKey: string,
	model: string,
	kind: AiPuzzleKind,
	input: ReadonlyArray<{ role: 'system' | 'user' | 'assistant'; content: string }>,
	signal?: AbortSignal
): Promise<string> {
	const response = await fetch('https://api.openai.com/v1/responses', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model,
			input,
			max_output_tokens: 1500,
			text: {
				format: {
					type: 'json_schema',
					name: kind === 'crossword' ? 'crossword_entries' : 'word_search_words',
					strict: true,
					schema: JSON.parse(aiWordListSchema(kind))
				}
			}
		}),
		signal
	});
	const payload = (await response.json().catch(() => ({}))) as OpenAiResponse;
	if (!response.ok) {
		throw new Error(
			payload.error?.message || `OpenAI request failed with status ${response.status}.`
		);
	}
	const content = responseText(payload);
	if (!content) throw new Error('OpenAI did not return any puzzle input.');
	return content;
}

function responseText(response: OpenAiResponse): string | undefined {
	if (response.output_text?.trim()) return response.output_text;
	for (const item of response.output ?? []) {
		if (item.type !== 'message') continue;
		for (const content of item.content ?? []) {
			if (content.type === 'output_text' && content.text?.trim()) return content.text;
		}
	}
	return undefined;
}

function systemInstruction(kind: AiPuzzleKind): string {
	return kind === 'crossword'
		? 'You are a careful crossword editor creating safe, accurate source material for printable puzzles. Every answer must clearly belong to the requested topic and every clue must accurately identify its paired answer. Follow the supplied JSON schema exactly and never reveal an answer inside its clue.'
		: 'You are a careful word-search editor creating safe, familiar words for printable puzzles. Every answer must clearly belong to the requested topic. Follow the supplied JSON schema exactly.';
}
