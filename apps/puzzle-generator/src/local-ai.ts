import type { InitProgressReport, WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import {
	aiWordListPrompt,
	aiWordListSchema,
	formatAiWordListResponse,
	type AiPuzzleKind
} from './ai-word-list-format.js';

/** The small quantized model downloaded on demand from the MLC Hugging Face repository. */
export const localAiModel = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

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
	topic: string,
	kind: AiPuzzleKind,
	onProgress: (progress: LocalAiProgress) => void
): Promise<string> {
	if (!supportsLocalAi())
		throw new Error('Local AI requires a browser and device with WebGPU support.');
	progressSubscriber = onProgress;
	const engine = await loadEngine();
	onProgress({ progress: 1, text: 'Generating locally…' });
	try {
		const response = await engine.chat.completions.create({
			messages: [
				{
					role: 'system',
					content:
						'You create safe, accurate source material for printable puzzles and always follow the requested JSON schema.'
				},
				{ role: 'user', content: aiWordListPrompt(topic, kind) }
			],
			response_format: { type: 'json_object', schema: aiWordListSchema(kind) },
			temperature: 0.7,
			top_p: 0.9,
			max_tokens: 900,
			seed: Date.now() >>> 0
		});
		const content = response.choices[0]?.message.content;
		if (!content) throw new Error('The local model did not return any puzzle words.');
		return formatAiWordListResponse(content, kind);
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
	progressSubscriber = undefined;
}

/** Releases the engine and removes the downloaded model artifacts from this site's browser cache. */
export async function removeLocalAiModel(): Promise<void> {
	disposeLocalAi();
	const { deleteModelAllInfoInCache } = await loadWebLlm();
	await deleteModelAllInfoInCache(localAiModel);
}

function loadEngine(): Promise<WebWorkerMLCEngine> {
	if (enginePromise) return enginePromise;
	const requestedLifecycle = lifecycle;
	let createdWorker: Worker | undefined;
	let createdWorkerUrl: string | undefined;
	const loadingEngine = loadWebLlm().then(({ CreateWebWorkerMLCEngine }) => {
		if (lifecycle !== requestedLifecycle) throw new Error('Local AI canceled.');
		createdWorkerUrl = URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' }));
		createdWorker = new Worker(createdWorkerUrl, { type: 'module' });
		workerUrl = createdWorkerUrl;
		worker = createdWorker;
		return CreateWebWorkerMLCEngine(createdWorker, localAiModel, {
			initProgressCallback: reportProgress,
			logLevel: 'WARN'
		});
	});
	const createdEngine = loadingEngine.catch((error: unknown) => {
		if (enginePromise === createdEngine) enginePromise = undefined;
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
