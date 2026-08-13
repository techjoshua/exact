import { describe, expect, it } from 'vitest';
import { ExactDocumentAnalysisState } from './document-analysis-state.js';

describe('document analysis state', () => {
	it('joins duplicate notifications for the active document version', () => {
		const state = new ExactDocumentAnalysisState();
		const first = state.start('file:///component.tsx', 1);

		expect(first).toBeDefined();
		expect(state.start('file:///component.tsx', 1)).toBeUndefined();
		expect(first?.signal.aborted).toBe(false);
		expect(state.publish('file:///component.tsx', 1, first!)).toBe(true);
		expect(state.presentationBlocked('file:///component.tsx', 1)).toBe(false);
	});

	it('fences stale generations when a newer document version starts', () => {
		const state = new ExactDocumentAnalysisState();
		const first = state.start('file:///component.tsx', 1)!;
		const second = state.start('file:///component.tsx', 2)!;

		expect(first.signal.aborted).toBe(true);
		expect(state.publish('file:///component.tsx', 1, first)).toBe(false);
		expect(state.presentationBlocked('file:///component.tsx', 2)).toBe(true);
		expect(state.publish('file:///component.tsx', 2, second)).toBe(true);
		expect(state.presentationBlocked('file:///component.tsx', 2)).toBe(false);
	});
});
