import { issueServerComponentReceipt } from '@exactjs/core/framework/server-component-execution';
import { createPreparedServerComponentReference } from '@exactjs/core/framework/server-render-structure';
import { expect, it } from 'vitest';
import {
	ObservedServerComponent,
	ServerCard,
	readComponentRenderingFixtureState,
	resetComponentRenderingFixtureState
} from '../component-rendering.fixtures.test.js';
import { createSsrContext } from './context.js';
import {
	renderIssuedServerComponentChildren,
	takePreparedDirectScheduledSsrComponent
} from './direct-component-scheduling.js';
import { readServerComponentReference } from './server-component-reference.js';

it('leaves synchronous child props untouched while issuing a render tree', async () => {
	let reads = 0;
	const context = createSsrContext({});
	const result = await renderIssuedServerComponentChildren(
		context,
		{},
		() => {
			return issueServerComponentReceipt(
				createPreparedServerComponentReference(ServerCard, {
					get title() {
						reads++;
						return 'safe';
					}
				})
			);
		},
		undefined
	);
	expect(result.preparation).toBeUndefined();
	expect(reads).toBe(0);
});

it.each([false, true])('transfers child cleanup only when claimed (%s)', async (claimed) => {
	resetComponentRenderingFixtureState();
	const context = createSsrContext({});
	let candidate: unknown;
	const result = await renderIssuedServerComponentChildren(
		context,
		{},
		() => {
			candidate = issueServerComponentReceipt(
				createPreparedServerComponentReference(ObservedServerComponent, {})
			);
			return candidate;
		},
		undefined
	);
	const reference = readServerComponentReference(candidate);
	if (!reference || !result.preparation) throw new Error('Expected an issued scheduled child');
	const child = claimed
		? await takePreparedDirectScheduledSsrComponent(context, reference)
		: undefined;
	if (claimed && !child) throw new Error('Expected ownership transfer');
	await result.preparation[Symbol.asyncDispose]();
	expect(readComponentRenderingFixtureState().observedDisposals).toBe(claimed ? 0 : 1);
	expect(context.preparedDirectScheduledComponents?.has(reference)).toBe(false);
	if (child) await child[Symbol.asyncDispose]();
	expect(readComponentRenderingFixtureState().observedDisposals).toBe(1);
});

it('releases issued children before rejecting a failed parent render', async () => {
	resetComponentRenderingFixtureState();
	const context = createSsrContext({});
	const failure = new Error('render failed');
	await expect(
		renderIssuedServerComponentChildren(
			context,
			{},
			() => {
				issueServerComponentReceipt(
					createPreparedServerComponentReference(ObservedServerComponent, {})
				);
				throw failure;
			},
			undefined
		)
	).rejects.toBe(failure);
	expect(readComponentRenderingFixtureState().observedDisposals).toBe(1);
	await expect(
		renderIssuedServerComponentChildren(
			context,
			{},
			() => {
				throw failure;
			},
			undefined
		)
	).rejects.toBe(failure);
});
