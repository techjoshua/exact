/** Captures and summarizes one post-GC Chromium heap snapshot without retaining its raw JSON. */
export async function captureHeapDominators(session, limit = 30) {
	await session.send('HeapProfiler.collectGarbage');
	const chunks = [];
	const collect = ({ chunk }) => chunks.push(chunk);
	session.on('HeapProfiler.addHeapSnapshotChunk', collect);
	try {
		await session.send('HeapProfiler.takeHeapSnapshot', {
			reportProgress: false,
			captureNumericValue: true
		});
	} finally {
		session.off('HeapProfiler.addHeapSnapshotChunk', collect);
	}
	return summarizeHeapDominators(JSON.parse(chunks.join('')), limit);
}

/** Computes strong-edge immediate dominators and retained sizes from a V8 heap snapshot. */
export function summarizeHeapDominators(snapshot, limit = 30) {
	const graph = parseSnapshotGraph(snapshot);
	const { order, reversePostorder } = reachableReversePostorder(graph.outgoing);
	const immediate = immediateDominators(reversePostorder, order, graph.incoming);
	const retained = [...graph.selfSizes];
	for (let cursor = reversePostorder.length - 1; cursor > 0; cursor--) {
		const node = reversePostorder[cursor];
		const parent = immediate[node];
		if (parent >= 0 && parent !== node) retained[parent] += retained[node];
	}
	const dominators = reversePostorder.slice(1).map((node) => ({
		node,
		type: graph.types[node],
		name: graph.names[node],
		selfBytes: graph.selfSizes[node],
		retainedBytes: retained[node],
		dominatedNodes: 0
	}));
	for (let node = 1; node < immediate.length; node++) {
		const parent = immediate[node];
		if (parent > 0) dominators.find((entry) => entry.node === parent).dominatedNodes++;
	}
	const selfBytesByType = {};
	const nodeCountByType = {};
	for (let node = 0; node < graph.types.length; node++) {
		const type = graph.types[node];
		selfBytesByType[type] = (selfBytesByType[type] ?? 0) + graph.selfSizes[node];
		nodeCountByType[type] = (nodeCountByType[type] ?? 0) + 1;
	}
	return {
		nodeCount: graph.selfSizes.length,
		reachableNodeCount: reversePostorder.length,
		selfBytes: graph.selfSizes.reduce((sum, size) => sum + size, 0),
		selfBytesByType,
		nodeCountByType,
		rootRetainedBytes: retained[0],
		topDominators: dominators
			.filter((entry) => entry.retainedBytes > 0)
			.sort((left, right) => right.retainedBytes - left.retainedBytes)
			.slice(0, limit)
	};
}

function parseSnapshotGraph(snapshot) {
	const nodeFields = snapshot.snapshot.meta.node_fields;
	const nodeTypes = snapshot.snapshot.meta.node_types[0];
	const edgeFields = snapshot.snapshot.meta.edge_fields;
	const edgeTypes = snapshot.snapshot.meta.edge_types[0];
	const nodeWidth = nodeFields.length;
	const edgeWidth = edgeFields.length;
	const nodeCount = snapshot.nodes.length / nodeWidth;
	const typeOffset = nodeFields.indexOf('type');
	const nameOffset = nodeFields.indexOf('name');
	const selfSizeOffset = nodeFields.indexOf('self_size');
	const edgeCountOffset = nodeFields.indexOf('edge_count');
	const edgeTypeOffset = edgeFields.indexOf('type');
	const toNodeOffset = edgeFields.indexOf('to_node');
	const outgoing = Array.from({ length: nodeCount }, () => []);
	const incoming = Array.from({ length: nodeCount }, () => []);
	const selfSizes = new Array(nodeCount);
	const names = new Array(nodeCount);
	const types = new Array(nodeCount);
	let edgeCursor = 0;
	for (let node = 0; node < nodeCount; node++) {
		const offset = node * nodeWidth;
		selfSizes[node] = snapshot.nodes[offset + selfSizeOffset];
		names[node] = snapshot.strings[snapshot.nodes[offset + nameOffset]];
		types[node] = nodeTypes[snapshot.nodes[offset + typeOffset]];
		const edgeCount = snapshot.nodes[offset + edgeCountOffset];
		for (let edge = 0; edge < edgeCount; edge++, edgeCursor += edgeWidth) {
			const type = edgeTypes[snapshot.edges[edgeCursor + edgeTypeOffset]];
			const target = snapshot.edges[edgeCursor + toNodeOffset] / nodeWidth;
			if (type === 'weak' || !Number.isSafeInteger(target) || target < 0 || target >= nodeCount)
				continue;
			outgoing[node].push(target);
			incoming[target].push(node);
		}
	}
	return { outgoing, incoming, selfSizes, names, types };
}

function reachableReversePostorder(outgoing) {
	const visited = new Uint8Array(outgoing.length);
	const postorder = [];
	const stack = [[0, 0]];
	visited[0] = 1;
	while (stack.length) {
		const frame = stack.at(-1);
		const edges = outgoing[frame[0]];
		if (frame[1] < edges.length) {
			const target = edges[frame[1]++];
			if (!visited[target]) {
				visited[target] = 1;
				stack.push([target, 0]);
			}
		} else {
			postorder.push(frame[0]);
			stack.pop();
		}
	}
	const reversePostorder = postorder.reverse();
	const order = new Int32Array(outgoing.length).fill(-1);
	reversePostorder.forEach((node, index) => (order[node] = index));
	return { order, reversePostorder };
}

function immediateDominators(reversePostorder, order, incoming) {
	const immediate = new Int32Array(order.length).fill(-1);
	immediate[0] = 0;
	let changed = true;
	while (changed) {
		changed = false;
		for (const node of reversePostorder.slice(1)) {
			const predecessors = incoming[node].filter((candidate) => immediate[candidate] >= 0);
			if (!predecessors.length) continue;
			let next = predecessors[0];
			for (const predecessor of predecessors.slice(1))
				next = intersectDominators(next, predecessor, immediate, order);
			if (immediate[node] !== next) {
				immediate[node] = next;
				changed = true;
			}
		}
	}
	return immediate;
}

function intersectDominators(left, right, immediate, order) {
	while (left !== right) {
		while (order[left] > order[right]) left = immediate[left];
		while (order[right] > order[left]) right = immediate[right];
	}
	return left;
}
