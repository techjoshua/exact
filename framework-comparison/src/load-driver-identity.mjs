import assert from 'node:assert/strict';

/** Requires one implementation and binary identity throughout a capture, including older Node evidence. */
export function loadDriverIdentity(capture) {
	let identity;
	for (const block of capture.blocks)
		for (const { driver } of block.results) {
			const implementation = driver.implementation ?? 'node';
			assert.ok(['node', 'rust'].includes(implementation), 'Unknown load driver');
			const current =
				implementation === 'node'
					? { implementation, version: driver.node ?? capture.environment.runtimes.node }
					: {
							implementation,
							version: driver.version,
							rustc: driver.rustc,
							binarySha256: driver.binarySha256,
							runtime: driver.runtime,
							http: driver.http
						};
			if (implementation === 'rust') {
				assert.match(
					current.binarySha256 ?? '',
					/^[a-f0-9]{64}$/u,
					'Rust driver binary identity is required'
				);
				assert.ok(
					current.version && current.rustc && current.runtime && current.http,
					'Rust driver metadata is required'
				);
			}
			if (identity) assert.deepEqual(current, identity, 'A capture must use the same load driver');
			identity = current;
		}
	assert.ok(identity, 'Load capture must contain a driver');
	return identity;
}

/** Describes the measured generator rather than the Node process that orchestrated it. */
export function describeLoadDriver(identity) {
	return identity.implementation === 'node'
		? `Node ${identity.version} load drivers`
		: `Rust ${identity.version} load drivers (${identity.rustc}, ${identity.runtime}, ${identity.http})`;
}
