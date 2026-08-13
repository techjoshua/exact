// @vitest-environment jsdom

import { render, unmount } from '@exactjs/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PuzzleGeneratorApp } from './PuzzleGeneratorApp.jsx';
import { openAiSettingsStorageKey } from './openai-settings.js';

describe('PuzzleGeneratorApp OpenAI settings', () => {
	beforeEach(() => localStorage.clear());

	it('stores a submitted key without retaining it in the input or rendered text', async () => {
		const container = document.createElement('div');
		try {
			render(<PuzzleGeneratorApp />, container);
			const wordSearch = [...container.querySelectorAll<HTMLButtonElement>('.kind-card')].find(
				(button) => button.textContent?.includes('Word search')
			)!;
			wordSearch.click();
			const configToggle = container.querySelector<HTMLButtonElement>('.ai-config-toggle')!;
			expect(configToggle.getAttribute('aria-label')).toContain('setup required');
			expect(container.querySelector('input[type="password"]')).toBeNull();
			configToggle.click();
			await vi.waitFor(() =>
				expect(container.querySelector('input[type="password"]')).toBeTruthy()
			);

			const keyInput = container.querySelector<HTMLInputElement>('input[type="password"]')!;
			keyInput.value = 'sk-private-example';
			const save = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
				button.textContent?.includes('Save API key')
			)!;
			save.click();

			await vi.waitFor(() => {
				expect(JSON.parse(localStorage.getItem(openAiSettingsStorageKey)!)).toEqual({
					apiKey: 'sk-private-example',
					model: 'gpt-4.1-mini'
				});
				expect(container.textContent).toContain('API key saved in this browser');
			});
			expect(configToggle.getAttribute('aria-label')).toContain('configured');
			expect(keyInput.value).toBe('');
			expect(container.textContent).not.toContain('sk-private-example');

			const clear = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
				button.textContent?.includes('Clear saved key')
			)!;
			clear.click();
			await vi.waitFor(() => expect(localStorage.getItem(openAiSettingsStorageKey)).toBeNull());
			expect(configToggle.getAttribute('aria-label')).toContain('setup required');
			configToggle.click();
			await vi.waitFor(() => expect(container.querySelector('input[type="password"]')).toBeNull());
		} finally {
			unmount(container);
		}
	});

	it('requires an editable titled plan to be verified before bulk export', async () => {
		const container = document.createElement('div');
		try {
			render(<PuzzleGeneratorApp />, container);
			const quantity = container.querySelector<HTMLInputElement>('.bulk-export-actions input')!;
			quantity.value = '2';
			quantity.dispatchEvent(new Event('input', { bubbles: true }));
			const manual = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
				button.textContent?.includes('Manual draft')
			)!;
			manual.click();
			await vi.waitFor(() =>
				expect(
					container.querySelector<HTMLTextAreaElement>('.bulk-plan-editor textarea')?.value
				).toContain('# The Sunday Puzzle No. 2')
			);
			const download = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
				button.textContent?.includes('Download verified ZIP')
			)!;
			expect(download.disabled).toBe(true);
			const verify = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
				button.textContent?.includes('Verify edition')
			)!;
			verify.click();
			await vi.waitFor(() => expect(container.textContent).toContain('2 titled puzzles verified'));
			expect(download.disabled).toBe(false);
		} finally {
			unmount(container);
		}
	});
});
