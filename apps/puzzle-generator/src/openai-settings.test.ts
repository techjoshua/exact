// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
	clearOpenAiSettings,
	defaultOpenAiModel,
	loadOpenAiSettings,
	openAiSettingsStorageKey,
	saveOpenAiSettings
} from './openai-settings.js';

describe('OpenAI browser settings', () => {
	beforeEach(() => localStorage.clear());

	it('persists and clears the user-owned key and model', () => {
		expect(loadOpenAiSettings()).toEqual({ apiKey: '', model: defaultOpenAiModel });
		saveOpenAiSettings({ apiKey: '  sk-example  ', model: '  gpt-4.1-mini  ' });
		expect(loadOpenAiSettings()).toEqual({ apiKey: 'sk-example', model: 'gpt-4.1-mini' });

		clearOpenAiSettings();
		expect(localStorage.getItem(openAiSettingsStorageKey)).toBeNull();
	});

	it('recovers from malformed local storage', () => {
		localStorage.setItem(openAiSettingsStorageKey, '{');
		expect(loadOpenAiSettings()).toEqual({ apiKey: '', model: defaultOpenAiModel });
	});
});
