import { it } from 'vitest';
import { renderToHydratableString } from '@exactjs/ssr/enhanced';
import { pendingOwnerRoot as serverRoot } from './test-support/pending-owner-overlap.fixtures.js?exact-target=server';
import { corpus as serverCorpus } from './scenarios/enhancement-implementation.fixtures.js?exact-target=server';
import { createPendingOwnerHarness } from './test-support/pending-owner-harness.js';
import {
	verifyPendingOwnerOverlap,
	verifyPendingOwnerSequence
} from './test-support/pending-owner-journey.js';

for (const entry of ['mount', 'hydrate'] as const)
	for (const enhanced of [false, true])
		it(`${entry}/enhanced=${enhanced}: fences pending helpers across prop rebinding and keyed ownership`, () =>
			verifyPendingOwnerOverlap(
				createPendingOwnerHarness((props) =>
					renderToHydratableString(serverRoot(props), {
						enhancementCatalog: new Map([
							['../scenarios/enhancement-routing.fixtures.js#corpus', serverCorpus]
						])
					})
				),
				entry,
				enhanced
			));

for (const entry of ['mount', 'hydrate'] as const)
	for (const enhanced of [false, true])
		for (const seed of [17, 99])
			it(`${entry}/enhanced=${enhanced}/seed=${seed}: preserves ownership across bounded task and prop sequences`, () =>
				verifyPendingOwnerSequence(
					createPendingOwnerHarness((props) =>
						renderToHydratableString(serverRoot(props), {
							enhancementCatalog: new Map([
								['../scenarios/enhancement-routing.fixtures.js#corpus', serverCorpus]
							])
						})
					),
					entry,
					enhanced,
					seed
				));
