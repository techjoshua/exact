import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { it, onTestFinished } from 'vitest';
import { targetAttributeOwnership } from './test-support/target-attribute-ownership.fixtures.js';
import { targetAttributeOwnership as serverOwnership } from './test-support/target-attribute-ownership.fixtures.js?exact-target=server';
import {
	captureTargetAttributeOwnership,
	verifyTargetAttributeOwnership,
	verifyTargetAttributeOwnershipDisposed
} from '../test-support/target-attribute-journey.mjs';

it.each(['mount', 'hydrate'] as const)(
	'retains target attribute ownership after %s',
	async (mode) => {
		const host = document.createElement('div');
		onTestFinished(() => {
			unmount(host);
		});
		let targets;
		if (mode === 'hydrate') {
			const output = await renderToHydratableString(serverOwnership());
			host.innerHTML = output.html;
			targets = captureTargetAttributeOwnership(host);
			hydrate(targetAttributeOwnership(), host, {
				resumptions: output.resumptions,
				onMismatch: 'throw'
			});
		} else render(targetAttributeOwnership(), host);
		targets ??= captureTargetAttributeOwnership(host);
		await verifyTargetAttributeOwnership(host, targets);
		unmount(host);
		await verifyTargetAttributeOwnershipDisposed(targets);
	}
);
