import { createReadinessCoordinator } from '@exactjs/core';
import { createFrameworkComponentDomain } from '@exactjs/core/framework/component-domains';
import { registerComponentLifecycleHandler } from '@exactjs/core/framework/component-lifecycle';
import { createFrameworkLogicalOwner } from '@exactjs/core/runtime/render';

/** Exercises cleanup, waiter settlement, publication failure, and logical ownership in native hosts. */
export async function readinessCleanupJourney() {
	const owner = createFrameworkLogicalOwner(
		undefined,
		undefined,
		createFrameworkComponentDomain({ target: 'server', executionRoot: 'readiness-cleanup' })
	);
	try {
		const results = [];
		for (const method of ['dispose', 'beginGeneration', 'commitGeneration']) {
			const coordinator = createReadinessCoordinator(() => {});
			const error = new Error('first callback failed');
			let later = 0;
			const callback = method === 'commitGeneration' ? 'commit' : 'discard';
			for (const run of [
				() => {
					throw error;
				},
				() => later++
			])
				coordinator.context.register({
					owner,
					taskGeneration: 1,
					settlement: new Promise(() => {}),
					[callback]: run
				});
			const ready = coordinator.whenReady().then(
				() => undefined,
				(failure) => failure
			);
			let observed;
			try {
				coordinator[method]();
			} catch (failure) {
				observed = failure;
			}
			const readinessError = await ready;
			results.push(
				observed === error &&
					later === 1 &&
					coordinator.pending === 0 &&
					readinessError === (method === 'commitGeneration' ? error : undefined)
			);
			coordinator.dispose();
		}
		const coordinator = createReadinessCoordinator(() => {}, { commitSettled: true });
		const error = new Error('publication failed');
		coordinator.context.register({
			owner,
			taskGeneration: 1,
			settlement: Promise.resolve(),
			commit() {
				throw error;
			}
		});
		let observed;
		try {
			await coordinator.whenReady();
		} catch (failure) {
			observed = failure;
		}
		results.push(observed === error);
		coordinator.beginGeneration();
		await coordinator.whenReady();
		coordinator.dispose();
		results.push(await cleanupRegistersWork(owner), await notificationRegistersWork(owner));
		let disposed = 0;
		registerComponentLifecycleHandler(owner, 'unmount', () => disposed++);
		owner.unmount();
		owner.unmount();
		results.push(disposed === 1);
		return results;
	} finally {
		owner.unmount();
	}
}

async function cleanupRegistersWork(owner) {
	const coordinator = createReadinessCoordinator(() => {});
	let settle;
	const next = new Promise((resolve) => {
		settle = resolve;
	});
	coordinator.context.register({
		owner,
		taskGeneration: 1,
		settlement: new Promise(() => {}),
		discard() {
			coordinator.context.register({ owner, taskGeneration: 2, settlement: next });
		}
	});
	coordinator.beginGeneration();
	settle();
	await Promise.resolve();
	const valid = coordinator.pending === 0;
	coordinator.dispose();
	return valid;
}

async function notificationRegistersWork(owner) {
	let settleFirst, settleNext;
	const first = new Promise((resolve) => {
		settleFirst = resolve;
	});
	const next = new Promise((resolve) => {
		settleNext = resolve;
	});
	let added = false,
		ready = false;
	const coordinator = createReadinessCoordinator((pending) => {
		if (pending || added) return;
		added = true;
		coordinator.context.register({ owner, taskGeneration: 2, settlement: next });
	});
	coordinator.context.register({ owner, taskGeneration: 1, settlement: first });
	const result = coordinator.whenReady().then(() => {
		ready = true;
	});
	settleFirst();
	await Promise.resolve();
	await Promise.resolve();
	const valid = coordinator.pending === 1 && !ready;
	settleNext();
	await result;
	coordinator.dispose();
	return valid && ready;
}
