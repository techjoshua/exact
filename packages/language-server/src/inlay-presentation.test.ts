import type { ExactLanguageInlayHintV1 } from '@exactjs/language-extension-api';
import type { Connection, TextDocuments } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { describe, expect, it, vi } from 'vitest';
import { projectInferenceEvidence, registerInlayPresentation } from './inlay-presentation.js';

describe('provider inference presentation', () => {
	it('does not request a client refresh while initialization selects its level', () => {
		let changeLevel: ((value: { level?: unknown }) => void) | undefined;
		const refresh = vi.fn(async () => undefined);
		const connection = {
			onNotification: vi.fn((_method, handler) => {
				changeLevel = handler;
			}),
			onRequest: vi.fn(),
			languages: { inlayHint: { on: vi.fn(), refresh } }
		} as unknown as Connection;
		const controller = registerInlayPresentation(
			connection,
			{} as TextDocuments<TextDocument>,
			() => undefined,
			() => false
		);
		controller.setLevel('all');
		expect(refresh).not.toHaveBeenCalled();
		changeLevel?.({ level: 'off' });
		expect(refresh).toHaveBeenCalledOnce();
	});

	it('fences provider presentation while the document analysis generation is active', async () => {
		let inlays: ((params: unknown) => Promise<unknown>) | undefined;
		let decorations: ((params: unknown) => Promise<unknown>) | undefined;
		const connection = {
			onNotification: vi.fn(),
			onRequest: vi.fn((method, handler) => {
				if (method === 'exact/inferenceDecorations') decorations = handler;
			}),
			languages: {
				inlayHint: {
					on: vi.fn((handler) => {
						inlays = handler;
					}),
					refresh: vi.fn(async () => undefined)
				}
			}
		} as unknown as Connection;
		registerInlayPresentation(
			connection,
			{} as TextDocuments<TextDocument>,
			() => undefined,
			() => true
		);
		const params = { textDocument: { uri: 'file:///view.tsx' } };
		expect(await inlays?.({ ...params, range: { start: {}, end: {} } })).toEqual([]);
		expect(await decorations?.(params)).toBeUndefined();
	});

	it('deduplicates evidence and preserves its provider explanation', () => {
		const hint: ExactLanguageInlayHintV1 = {
			position: 20,
			label: 'unit',
			evidence: [
				{
					range: { start: 10, end: 16 },
					kind: 'unit',
					explanation: 'pound source unit inferred from authored fallback'
				}
			]
		};
		expect(
			projectInferenceEvidence([
				{ provider: '@exactjs/intl', value: hint },
				{ provider: '@exactjs/intl', value: hint }
			])
		).toEqual([
			{
				range: { start: 10, end: 16 },
				kind: 'unit',
				hover:
					'Inferred unit\n\npound source unit inferred from authored fallback\n\nSource: @exactjs/intl',
				provider: '@exactjs/intl'
			}
		]);
	});
});
