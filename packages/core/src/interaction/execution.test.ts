import { describe, expect, it } from 'vitest';

import { createComponentInstance } from '../component/runtime.js';
import { defineTask } from '../tasks/runtime.js';
import {
	InteractionCancellation,
	currentInteraction,
	interactionAwait,
	joinCurrentInteraction,
	runComponentInteraction
} from './execution.js';

describe('component interactions', () => {
	it('aggregates work joined synchronously by an interaction host', async () => {
		const owner = createComponentInstance(() => () => null, {});
		let release!: () => void;
		const joined = new Promise<void>((resolve) => {
			release = resolve;
		});
		let settled = false;
		const interaction = runComponentInteraction(
			owner,
			'form',
			1,
			'interactive',
			new AbortController(),
			() => {
				expect(currentInteraction()?.owner).toBe(owner);
				joinCurrentInteraction(joined);
			}
		).then(() => {
			settled = true;
		});

		await Promise.resolve();
		expect(settled).toBe(false);
		release();
		await interaction;
		expect(settled).toBe(true);
		owner.unmount();
	});

	it('restores joined ownership after compiler-lowered awaits', async () => {
		const owner = createComponentInstance(() => () => null, {});
		const controller = new AbortController();
		let releaseJoined!: () => void;
		const joined = new Promise<void>((resolve) => {
			releaseJoined = resolve;
		});
		let continuationReached = false;
		let settled = false;
		const interaction = runComponentInteraction(
			owner,
			'invoked',
			1,
			'normal',
			controller,
			async () => {
				await interactionAwait(controller.signal, Promise.resolve());
				expect(currentInteraction()?.owner).toBe(owner);
				continuationReached = true;
				joinCurrentInteraction(joined);
			}
		).then(() => {
			settled = true;
		});

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(continuationReached).toBe(true);
		expect(settled).toBe(false);
		releaseJoined();
		await interaction;
		expect(settled).toBe(true);
		owner.unmount();
	});

	it('cancels unsettled host work when its component is disposed', async () => {
		const owner = createComponentInstance(() => () => null, {});
		const never = new Promise<void>(() => undefined);
		const interaction = runComponentInteraction(
			owner,
			'event',
			1,
			'interactive',
			new AbortController(),
			() => never
		);

		owner.unmount();
		await expect(interaction).rejects.toBeInstanceOf(InteractionCancellation);
	});

	it('attaches function-defined task descendants to an interaction root', async () => {
		const owner = createComponentInstance(() => () => null, {});
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const child = defineTask({}, () => gate);
		let settled = false;
		const interaction = runComponentInteraction(
			owner,
			'event',
			1,
			'interactive',
			new AbortController(),
			() => {
				void child();
			}
		).then(() => {
			settled = true;
		});

		await Promise.resolve();
		expect(settled).toBe(false);
		release();
		await interaction;
		expect(settled).toBe(true);
		owner.unmount();
	});
});
