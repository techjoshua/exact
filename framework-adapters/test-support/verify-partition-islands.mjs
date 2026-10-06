import assert from 'node:assert/strict';
import {
	captureTargetAttributeOwnership,
	verifyTargetAttributeOwnership,
	verifyTargetAttributeOwnershipDisposed
} from '../../packages/component-composition-corpus/test-support/target-attribute-journey.mjs';

/** Owns pre-activation semantic nodes for each captured island journey. */
const targetAttributes = new WeakMap();

/** Retains pre-activation targets so adoption and disposal are checked on the same DOM nodes. */
export function capturePartitionIslands(container) {
	const targets = Object.fromEntries(
		['event', 'dormant', 'method', 'paths'].map((name) => {
			const element = container.querySelector(`[data-partition="${name}"]`);
			assert.ok(element, `${name}: server fallback`);
			return [name, element];
		})
	);
	targetAttributes.set(targets, captureTargetAttributeOwnership(container));
	return targets;
}

/** Executes native event reads, lazy replay, distinct snapshots and opaque callback updates. */
export async function verifyPartitionIslands(container, targets) {
	targets.opaque = container.querySelector('[data-partition="opaque"]');
	assert.ok(targets.opaque, 'opaque spread activates eagerly');
	for (const [name, element] of Object.entries(targets))
		assert.equal(
			container.querySelector(`[data-partition="${name}"]`),
			element,
			`${name}: adoption`
		);
	const custom = new Event('input', { bubbles: true });
	Object.defineProperty(custom, 'value', { value: 'custom native data' });
	targets.event.dispatchEvent(custom);
	targets.dormant.dispatchEvent(new Event('input', { bubbles: true }));
	targets.method.dispatchEvent(new Event('input', { bubbles: true }));
	for (let tick = 0; tick < 100 && targets.dormant.value !== 'input'; tick++)
		await new Promise((resolve) => setTimeout(resolve, 5));
	assert.equal(
		targets.event.value,
		'custom native data',
		'unowned event fields require eager activation'
	);
	assert.equal(targets.dormant.value, 'input', 'dormant await does not prevent replay');
	assert.equal(targets.method.value, 'input', 'nested method retains the native event');
	assert.equal(targets.paths.textContent, '1:2', 'distinct initial state paths');
	for (const count of [1, 2]) {
		targets.paths.click();
		targets.opaque.click();
		for (
			let tick = 0;
			tick < 100 && targets.paths.textContent !== `${count + 1}:${count + 2}`;
			tick++
		)
			await new Promise((resolve) => setTimeout(resolve, 5));
		assert.equal(targets.paths.textContent, `${count + 1}:${count + 2}`, 'distinct paths update');
		assert.equal(
			targets.opaque.textContent,
			String(count),
			'stored callbacks execute only on interaction'
		);
	}
	await verifyTargetAttributeOwnership(container, targetAttributes.get(targets));
}

/** Detached retained targets must stop invoking their disposed component owners. */
export async function verifyPartitionIslandsDisposed(targets) {
	targets.paths.click();
	targets.opaque.click();
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal(targets.paths.textContent, '3:4');
	assert.equal(targets.opaque.textContent, '2');
	await verifyTargetAttributeOwnershipDisposed(targetAttributes.get(targets));
}
