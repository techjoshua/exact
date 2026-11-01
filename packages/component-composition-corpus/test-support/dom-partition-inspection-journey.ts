type Host = Pick<import('../../dom/src/inspection.js').ExactDomInspectionHost, 'snapshot'>;

/** Checks deep partition ordering, independent writable snapshots, marker rejection and removal on an inspected root. */
export function verifyDeepPartitionInspection(
	host: Host,
	container: Element,
	identity: { buildKey: string; executionRoot: string }
): void {
	const markers: Element[] = [];
	let parent = container;
	try {
		for (let index = 0; index < 3000; index++) {
			const marker = container.ownerDocument.createElement('div');
			for (const [name, value] of Object.entries({
				version: '1',
				build: identity.buildKey,
				root: identity.executionRoot,
				edge: `plan${index}`,
				owner: 'component',
				generation: '1',
				discriminator: 'single'
			}))
				marker.setAttribute(`data-exact-partition-${name}`, value);
			parent.append(marker);
			markers.push(marker);
			parent = marker;
		}
		for (const mode of ['foreign', 'invalid']) {
			const marker = markers[0]!.cloneNode(false) as Element;
			marker.setAttribute(
				mode === 'foreign' ? 'data-exact-partition-build' : 'data-exact-partition-generation',
				mode === 'foreign' ? 'foreign' : '0'
			);
			container.append(marker);
			markers.push(marker);
		}
		const read = () => {
			const roots = host.snapshot().partitions;
			if (roots.length !== 1 || Object.isFrozen(roots))
				throw new Error('Partition marker rejection changed root selection');
			let node = roots[0];
			let last = node;
			let depth = 0;
			while (node) {
				if (Object.isFrozen(node) || Object.isFrozen(node.children) || node.children.length > 1)
					throw new Error('Partition observation is frozen or lost tree shape');
				if (depth < 2999 && node.plan !== `plan${depth}`)
					throw new Error('Partition snapshot reordered markers');
				last = node;
				node = node.children[0];
				depth++;
			}
			if (depth !== 3000) throw new Error('Partition snapshot truncated a valid deep tree');
			return last!;
		};
		const retained = read();
		markers[2999]!.setAttribute('data-exact-partition-edge', 'updated');
		if (read().plan !== 'updated' || retained.plan !== 'plan2999')
			throw new Error('Partition update mutated a retained inspection snapshot');
		Object.assign(retained, { plan: 'caller observation' });
		Object.assign(retained.discriminator, { kind: 'branch', branch: 'caller' });
		const observations = host.snapshot().partitions;
		Reflect.set(observations, 'length', 0);
		if (read().plan !== 'updated' || read().discriminator.kind !== 'single')
			throw new Error('Writable partition observations changed retained marker authority');
	} finally {
		// Remove leaves first so the fixture does not depend on a DOM emulator's recursive detach.
		for (let index = markers.length - 1; index >= 0; index--) markers[index]!.remove();
	}
	if (host.snapshot().partitions.length)
		throw new Error('Removed partition markers remained inspectable');
}
