import type { InitProgressReport, WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import {
	AiClueLeakError,
	aiWordListPrompt,
	aiWordListSchema,
	formatAiWordListResponse,
	type AiPuzzleKind
} from './ai-word-list-format.js';
import type { LocalAiModelId } from './ai-models.js';

/** Pinned browser runtime served only after the user opts into local AI. */
export const webLlmCdnUrl = 'https://esm.run/@mlc-ai/web-llm@0.2.84';

type WebLlmModule = typeof import('@mlc-ai/web-llm');

/** Progress reported while the local model downloads, initializes, or generates. */
export type LocalAiProgress = Readonly<{
	progress: number;
	text: string;
}>;

let worker: Worker | undefined;
let workerUrl: string | undefined;
let enginePromise: Promise<WebWorkerMLCEngine> | undefined;
let engineModel: LocalAiModelId | undefined;
let webLlmPromise: Promise<WebLlmModule> | undefined;
let progressSubscriber: ((progress: LocalAiProgress) => void) | undefined;
let lifecycle = 0;

/** Reports whether this secure browser context exposes WebGPU. */
export function supportsLocalAi(): boolean {
	return (
		typeof navigator !== 'undefined' && 'gpu' in navigator && globalThis.isSecureContext !== false
	);
}

/** Downloads the model when necessary and generates an editable puzzle word list locally. */
export async function generateLocalAiWordList(
	model: LocalAiModelId,
	topic: string,
	kind: AiPuzzleKind,
	promptTemplate: string,
	onProgress: (progress: LocalAiProgress) => void
): Promise<string> {
	if (!supportsLocalAi())
		throw new Error('Local AI requires a browser and device with WebGPU support.');
	progressSubscriber = onProgress;
	const engine = await loadEngine(model);
	onProgress({ progress: 1, text: 'Generating locally…' });
	try {
		const systemPrompt =
			'You are a careful crossword editor creating safe, accurate source material for printable puzzles. Every answer must clearly belong to the requested topic and every clue must accurately identify its paired answer. Follow the requested JSON schema exactly and never reveal an answer inside its clue.';
		const userPrompt = aiWordListPrompt(topic, kind, promptTemplate);
		const response = await engine.chat.completions.create({
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			],
			response_format: { type: 'json_object', schema: aiWordListSchema(kind) },
			temperature: 0.7,
			top_p: 0.9,
			max_tokens: 900,
			seed: Date.now() >>> 0
		});
		const content = response.choices[0]?.message.content;
		if (!content) throw new Error('The local model did not return any puzzle words.');
		try {
			return formatAiWordListResponse(content, kind);
		} catch (error) {
			if (kind !== 'crossword' || !(error instanceof AiClueLeakError)) throw error;
			onProgress({ progress: 1, text: 'Rewriting answer-revealing clues…' });
			const repaired = await engine.chat.completions.create({
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt },
					{ role: 'assistant', content },
					{
						role: 'user',
						content: `Rejected: the clues revealed these answers or longer forms containing them: ${error.answers.join(', ')}. Return a complete replacement entries array. Use new 2-8 word clue fragments for every answer. Before responding, compare each clue against its answer and rewrite every leak. Output JSON only.`
					}
				],
				response_format: { type: 'json_object', schema: aiWordListSchema(kind) },
				temperature: 0.4,
				top_p: 0.85,
				max_tokens: 900,
				seed: (Date.now() + 1) >>> 0
			});
			const repairedContent = repaired.choices[0]?.message.content;
			if (!repairedContent) throw new Error('The local model did not return repaired clues.');
			return formatAiWordListResponse(repairedContent, kind);
		}
	} finally {
		progressSubscriber = undefined;
	}
}

/** Cancels active model work and releases its worker and GPU resources. */
export function disposeLocalAi(): void {
	lifecycle += 1;
	const activeEngine = enginePromise;
	void activeEngine?.then((engine) => engine.interruptGenerate()).catch(() => undefined);
	worker?.terminate();
	if (workerUrl) URL.revokeObjectURL(workerUrl);
	worker = undefined;
	workerUrl = undefined;
	enginePromise = undefined;
	engineModel = undefined;
	progressSubscriber = undefined;
}

/** Releases the engine and removes the downloaded model artifacts from this site's browser cache. */
export async function removeLocalAiModel(model: LocalAiModelId): Promise<void> {
	disposeLocalAi();
	const { deleteModelAllInfoInCache } = await loadWebLlm();
	await deleteModelAllInfoInCache(model);
}

function loadEngine(model: LocalAiModelId): Promise<WebWorkerMLCEngine> {
	if (enginePromise && engineModel === model) return enginePromise;
	if (enginePromise) disposeLocalAi();
	const requestedLifecycle = lifecycle;
	engineModel = model;
	let createdWorker: Worker | undefined;
	let createdWorkerUrl: string | undefined;
	const loadingEngine = loadWebLlm().then(({ CreateWebWorkerMLCEngine }) => {
		if (lifecycle !== requestedLifecycle) throw new Error('Local AI canceled.');
		createdWorkerUrl = URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' }));
		createdWorker = new Worker(createdWorkerUrl, { type: 'module' });
		workerUrl = createdWorkerUrl;
		worker = createdWorker;
		return CreateWebWorkerMLCEngine(createdWorker, model, {
			initProgressCallback: reportProgress,
			logLevel: 'WARN'
		});
	});
	const createdEngine = loadingEngine.catch((error: unknown) => {
		if (enginePromise === createdEngine) {
			enginePromise = undefined;
			engineModel = undefined;
		}
		if (worker === createdWorker) {
			createdWorker?.terminate();
			worker = undefined;
		}
		if (workerUrl === createdWorkerUrl) {
			if (createdWorkerUrl) URL.revokeObjectURL(createdWorkerUrl);
			workerUrl = undefined;
		}
		throw error;
	});
	enginePromise = createdEngine;
	return createdEngine;
}

function loadWebLlm(): Promise<WebLlmModule> {
	if (!webLlmPromise) {
		const loadingModule = import(/* @vite-ignore */ webLlmCdnUrl) as Promise<WebLlmModule>;
		webLlmPromise = loadingModule.catch((error: unknown) => {
			webLlmPromise = undefined;
			throw error;
		});
	}
	return webLlmPromise;
}

function workerSource(): string {
	return `import { WebWorkerMLCEngineHandler } from ${JSON.stringify(webLlmCdnUrl)};
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (event) => handler.onmessage(event);`;
}

function reportProgress(report: InitProgressReport): void {
	progressSubscriber?.({
		progress: Math.max(0, Math.min(1, report.progress)),
		text: report.text
	});
}
