// @vitest-environment jsdom
import * as api from '@exactjs/react-compat';
import { toReactNode } from '@exactjs/react-compat/exact';
import { it } from 'vitest';
import { createRoot, hydrateRoot } from './client.js';
import { renderToString, renderToStaticMarkup, renderToReadableStream } from './server/shared.js';
import {
	verifyReactChildArrayClient,
	verifyReactChildArrayServer
} from '../../component-composition-corpus/test-support/react-child-array-journey.js';
it('preserves child array traversal, scopes, SSR and hydration ownership', async () => {
	const html = await verifyReactChildArrayServer({
		...api,
		toReactNode,
		renderToString,
		renderToStaticMarkup,
		renderToReadableStream
	});
	verifyReactChildArrayClient({ ...api, toReactNode, createRoot, hydrateRoot }, document, html);
});
