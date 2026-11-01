import { appendFileSync } from 'node:fs';
import { createCompiledFragmentReceipt } from '@exactjs/core/runtime/component-operations';
import { createServerSlot } from '@exactjs/core/runtime/render-operations';
import { renderToString } from '../index.js';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import { StaticServerLeaf as ClientCard } from './static-server-programs.fixtures.test.js?exact-target=client';
import { issueServerComponentReceipt } from '@exactjs/core/framework/server-component-execution';
import { createPreparedServerComponentInputReference } from '@exactjs/core/framework/server-render-structure';
import { expect, it } from 'vitest';
import {
	ObservedServerComponent,
	RejectingServerPreparation,
	ServerCard,
	readComponentRenderingFixtureState,
	resetComponentRenderingFixtureState
} from '../component-rendering.fixtures.test.js';
import { createSsrContext } from './context.js';
import {
	renderIssuedServerComponentChildren,
	prepareDirectScheduledSsrComponentReferences
} from './direct-component-scheduling.js';
import {
	readServerComponentReference,
	prepareServerComponentOccurrence
} from './server-component-reference.js';
it('leaves synchronous child props untouched while issuing a render tree', async () => {
	let reads = 0;
	const context = createSsrContext({});
	const result = await renderIssuedServerComponentChildren(
		context,
		{},
		() => {
			return issueServerComponentReceipt(
				createPreparedServerComponentInputReference(ServerCard, {
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
				createPreparedServerComponentInputReference(ObservedServerComponent, {})
			);
			return candidate;
		},
		undefined
	);
	const reference = readServerComponentReference(candidate);
	if (!reference || !result.content.children) throw new Error('Expected actual child output');
	const preparation = prepareDirectScheduledSsrComponentReferences(
		context,
		result.content.children,
		undefined,
		{},
		{}
	);
	if (!preparation) throw new Error('Expected scheduled output preparation');
	const acquired = claimed ? await prepareServerComponentOccurrence(context, reference) : undefined;
	const child = acquired?.preparedScheduled;
	if (claimed && !child) throw new Error('Expected ownership transfer');
	await preparation[Symbol.asyncDispose]();
	expect(readComponentRenderingFixtureState().observedDisposals).toBe(claimed ? 0 : 1);
	expect(context.preparedDirectScheduledComponents).toHaveLength(0);
	if (child) await child[Symbol.asyncDispose]();
	expect(readComponentRenderingFixtureState().observedDisposals).toBe(1);
});
it('does not acquire unselected recipes when parent output fails', () => {
	resetComponentRenderingFixtureState();
	const context = createSsrContext({});
	const failure = new Error('render failed');
	expect(() =>
		renderIssuedServerComponentChildren(
			context,
			{},
			() => {
				issueServerComponentReceipt(
					createPreparedServerComponentInputReference(ObservedServerComponent, {})
				);
				throw failure;
			},
			undefined
		)
	).toThrow(failure);
	expect(readComponentRenderingFixtureState().observedDisposals).toBe(0);
	expect(context.preparedDirectScheduledComponents).toBeUndefined();
});

it.each(['reader', 'getter', 'nested-slot', 'provider'] as const)(
	'releases a prepared prefix after later %s failure',
	async (kind) => {
		resetComponentRenderingFixtureState();
		const first = createPreparedServerComponentInputReference(ObservedServerComponent, {});
		const failure = new Error('later child acquisition');
		let later:
			| ReturnType<typeof createPreparedServerComponentInputReference>
			| ReturnType<typeof createCompiledComponentInputReceipt>
			| ReturnType<typeof createServerSlot> =
			kind === 'reader'
				? createPreparedServerComponentInputReference(
						ObservedServerComponent,
						{},
						{
							kind: 'reader',
							read() {
								throw failure;
							}
						}
					)
				: kind === 'provider'
					? createCompiledComponentInputReceipt(ClientCard, { title: 'wrong provider' })
					: createPreparedServerComponentInputReference(ObservedServerComponent, {
							get children() {
								throw failure;
							}
						});
		if (kind === 'nested-slot') later = createServerSlot('prefix-failure', {}, later);
		let caught: unknown;
		try {
			await renderToString(createCompiledFragmentReceipt(null, first, later), { markers: false });
		} catch (error) {
			caught = error;
		}
		const output = process.env.EXACT_CHILD_INPUT_OBSERVATIONS;
		if (output)
			appendFileSync(
				output,
				JSON.stringify({
					case: kind,
					exactPrimary: caught === failure,
					disposals: readComponentRenderingFixtureState().observedDisposals,
					error: String(caught)
				}) + '\n'
			);
		expect(caught).toBeDefined();
		if (kind !== 'provider') expect(caught).toBe(failure);
		expect(readComponentRenderingFixtureState().observedDisposals).toBe(1);
	}
);
it('disposes repeated actual scheduled occurrences once each', async () => {
	resetComponentRenderingFixtureState();
	let reads = 0;
	const operation = createPreparedServerComponentInputReference(
		ObservedServerComponent,
		{},
		{
			kind: 'reader',
			read() {
				reads++;
				return [];
			}
		}
	);
	await renderToString(createCompiledFragmentReceipt(null, operation, operation), {
		markers: false
	});
	expect(reads).toBe(2);
	expect(readComponentRenderingFixtureState().observedDisposals).toBe(2);
});

it('preserves later acquisition failure while releasing an earlier rejected construction', async () => {
	resetComponentRenderingFixtureState();
	const firstFailure = new Error('construction failed'),
		primary = new Error('later acquisition failed');
	const first = createPreparedServerComponentInputReference(ObservedServerComponent, {});
	const rejected = createPreparedServerComponentInputReference(RejectingServerPreparation, {
		fail() {
			throw firstFailure;
		}
	});
	const later = createPreparedServerComponentInputReference(ObservedServerComponent, {
		get children() {
			throw primary;
		}
	});
	let caught: unknown;
	try {
		await renderToString(createCompiledFragmentReceipt(null, first, rejected, later), {
			markers: false
		});
	} catch (error) {
		caught = error;
	}
	const output = process.env.EXACT_CHILD_INPUT_OBSERVATIONS;
	if (output)
		appendFileSync(
			output,
			JSON.stringify({
				case: 'construction-before-acquisition',
				exactPrimary: caught === primary,
				disposals: readComponentRenderingFixtureState().observedDisposals
			}) + '\n'
		);
	expect(caught).toBe(primary);
	expect(readComponentRenderingFixtureState().observedDisposals).toBe(2);
});
