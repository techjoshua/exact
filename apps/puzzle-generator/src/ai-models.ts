/** Curated WebLLM chat models whose first download remains below 1.5 GiB. */
export const localAiModels = [
	{
		id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
		label: 'SmolLM2 360M',
		downloadMb: 198,
		gpuMemoryMb: 376,
		note: 'Fastest, basic clues'
	},
	{
		id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
		label: 'Qwen 2.5 0.5B',
		downloadMb: 276,
		gpuMemoryMb: 945,
		note: 'Lightweight default'
	},
	{
		id: 'Qwen3-0.6B-q4f16_1-MLC',
		label: 'Qwen 3 0.6B',
		downloadMb: 335,
		gpuMemoryMb: 1403,
		note: 'Newer compact model'
	},
	{
		id: 'gemma3-1b-it-q4f16_1-MLC',
		label: 'Gemma 3 1B',
		downloadMb: 574,
		gpuMemoryMb: 711,
		note: 'Balanced and memory-efficient'
	},
	{
		id: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC',
		label: 'TinyLlama 1.1B',
		downloadMb: 593,
		gpuMemoryMb: 697,
		note: 'Older, low-memory option'
	},
	{
		id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
		label: 'Llama 3.2 1B',
		downloadMb: 672,
		gpuMemoryMb: 879,
		note: 'Balanced general model'
	},
	{
		id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
		label: 'Qwen 2.5 1.5B',
		downloadMb: 840,
		gpuMemoryMb: 1630,
		note: 'Stronger clue writing'
	},
	{
		id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
		label: 'SmolLM2 1.7B',
		downloadMb: 922,
		gpuMemoryMb: 1774,
		note: 'Larger SmolLM option'
	},
	{
		id: 'Qwen3-1.7B-q4f16_1-MLC',
		label: 'Qwen 3 1.7B',
		downloadMb: 939,
		gpuMemoryMb: 2037,
		note: 'Newer, higher quality'
	},
	{
		id: 'Qwen3.5-2B-q4f16_1-MLC',
		label: 'Qwen 3.5 2B',
		downloadMb: 1032,
		gpuMemoryMb: 2245,
		note: 'Largest Qwen option'
	},
	{
		id: 'gemma-2-2b-it-q4f16_1-MLC',
		label: 'Gemma 2 2B',
		downloadMb: 1424,
		gpuMemoryMb: 1895,
		note: 'Largest download'
	}
] as const;

/** Identifier accepted by the curated local-model selector. */
export type LocalAiModelId = (typeof localAiModels)[number]['id'];

/** Lightweight default retained for devices that may have limited bandwidth. */
export const defaultLocalAiModel: LocalAiModelId = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

/** Finds display and resource metadata for a selectable local model. */
export function getLocalAiModel(modelId: LocalAiModelId) {
	return localAiModels.find((model) => model.id === modelId) ?? localAiModels[1];
}

/** Returns load-time corrections required by a model's published chat configuration. */
export function getLocalAiChatOptions(modelId: LocalAiModelId): ChatOptions | undefined {
	return modelId === 'gemma3-1b-it-q4f16_1-MLC' ? { sliding_window_size: -1 } : undefined;
}
import type { ChatOptions } from '@mlc-ai/web-llm';
