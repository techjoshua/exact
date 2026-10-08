import assert from 'node:assert/strict';

/** Requires one Node runtime identity throughout a capture, including older Node evidence. */
export function loadDriverIdentity(capture) {
	let identity;
	for (const block of capture.blocks)
		for (const { driver } of block.results) {
			const implementation = driver.implementation ?? 'node';
			assert.equal(implementation, 'node', 'Load captures require the Node driver');
			const current = {
				implementation,
				version: driver.node ?? capture.environment.runtimes.node
			};
			if (identity) assert.deepEqual(current, identity, 'A capture must use the same load driver');
			identity = current;
		}
	assert.ok(identity, 'Load capture must contain a driver');
	return identity;
}

/** Describes the measured generator rather than the Node process that orchestrated it. */
export function describeLoadDriver(identity) {
	return `Node ${identity.version} load drivers`;
}
