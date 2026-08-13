/** Browser-persisted OpenAI settings for the standalone Puzzle Foundry application. */
export type OpenAiSettings = Readonly<{
	apiKey: string;
	model: string;
}>;

export const openAiSettingsStorageKey = 'exact-puzzle-foundry-openai';
export const defaultOpenAiModel = 'gpt-4.1-mini';

/** Reads locally persisted settings without exposing the API key through component state. */
export function loadOpenAiSettings(): OpenAiSettings {
	try {
		const stored = JSON.parse(localStorage.getItem(openAiSettingsStorageKey) ?? 'null');
		return {
			apiKey: typeof stored?.apiKey === 'string' ? stored.apiKey.trim() : '',
			model:
				typeof stored?.model === 'string' && stored.model.trim()
					? stored.model.trim()
					: defaultOpenAiModel
		};
	} catch {
		return { apiKey: '', model: defaultOpenAiModel };
	}
}

/** Persists one user-owned key and model selection in this origin's local storage. */
export function saveOpenAiSettings(settings: OpenAiSettings): void {
	localStorage.setItem(
		openAiSettingsStorageKey,
		JSON.stringify({ apiKey: settings.apiKey.trim(), model: settings.model.trim() })
	);
}

/** Removes the persisted API key and model selection from this browser. */
export function clearOpenAiSettings(): void {
	localStorage.removeItem(openAiSettingsStorageKey);
}
