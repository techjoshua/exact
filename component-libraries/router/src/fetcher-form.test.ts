// @vitest-environment jsdom
import { act, createElement } from '@exactjs/react-compat';
import { createRoot } from '@exactjs/react-dom-compat/client19';
import { expect, it, vi } from 'vitest';
import {
	verifyFetcherFormLifecycle,
	verifyNavigationFormFailure,
	verifyGetFormSubmission
} from '../../../packages/component-composition-corpus/test-support/router-fetcher-form-journey.js';
import { createMemoryRouter, Form, RouterProvider, useFetcher, useSubmit } from './modern.js';

const api = {
	act,
	createElement,
	createRoot,
	createMemoryRouter,
	Form,
	RouterProvider,
	useFetcher,
	useSubmit
};

it.each(['form lifecycle', 'fetcher GET', 'navigation GET'] as const)(
	'preserves %s contracts',
	async (mode) => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			if (mode === 'form lifecycle') await verifyFetcherFormLifecycle(api, document);
			else await verifyGetFormSubmission(api, document, mode === 'navigation GET');
			expect(errors).not.toHaveBeenCalled();
		} finally {
			errors.mockRestore();
		}
	}
);

it('allows owned fetcher cleanup after router disposal', () => {
	const router = createMemoryRouter([{ id: 'home', path: '/' }]);
	router.dispose();
	expect(() => router.releaseFetcher('finished')).not.toThrow();
});

it('reports a failed navigation form once and permits a following submission', () =>
	verifyNavigationFormFailure(api, document));
