/** @vitest-environment jsdom */
import { it } from 'vitest';
import { renderToHydratableString } from '@exactjs/ssr';
import { createCompiledComponentInputReceipt as operation } from '@exactjs/core/runtime/component-operations';
import { createCompiledComponentRegistry as registry } from '@exactjs/core/runtime/registry';
import { hydrate, createExactClient } from './index.js';
import { hydrate as hydrateOnly } from './root.js';
import { hydrateCompiledComponentInputRoot } from './framework/component-root.js';
import { ReplayCounter, observeReplay } from './test-support/island-replay.fixtures.js';
import { ReplayCounter as ServerCounter } from './test-support/island-replay.fixtures.js?exact-target=server';
import {
	verifyRootCancellation,
	verifyRejectedRootConstruction
} from '../../component-composition-corpus/test-support/root-cancellation-journey.js';
it.each([
	['complete', hydrate],
	['hydration-only', hydrateOnly],
	['compiler-selected', hydrateCompiledComponentInputRoot]
] as const)(
	'fences canceled selected-registry roots through %s hydration',
	async (_name, entry) => {
		for (const initial of [false, true])
			await verifyRootCancellation(
				{
					component: ReplayCounter,
					observe: observeReplay,
					operation,
					registry,
					hydrate: entry,
					async renderRegistry(identity) {
						const Server = registry(identity, 'Views', 'server', () => ({ panel: ServerCounter }));
						return (await renderToHydratableString(operation(Server.panel, {}))).htmlWithHydration;
					}
				},
				document,
				initial
			);
	}
);
it('releases cancellation and container ownership when construction fails', async () => {
	await verifyRejectedRootConstruction({ createExactClient, component: ReplayCounter }, document);
});
