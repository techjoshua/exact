import type { ExactComponentExecutionContract } from '../component-contracts.js';

type ExecutionTransition = ExactComponentExecutionContract['transitions'][number];

/** Precomputed state output descriptor shared by every instance of one component plan. */
export type PreparedComponentOutput = Readonly<{
	portIndex: number;
	path: readonly string[];
}>;

/** Precomputed prop dependency descriptor shared by every instance of one component plan. */
export type PreparedComponentProp = Readonly<{
	portIndex: number;
	path: readonly string[];
}>;

/** Precomputed transition wiring shared by every instance of one component plan. */
export type PreparedComponentTransition = Readonly<{
	contract: ExecutionTransition;
	dependencyPorts: readonly number[];
	outputs: readonly PreparedComponentOutput[];
}>;

/** Immutable execution indexes prepared once for a compiler-emitted component plan. */
export type PreparedComponentExecution = Readonly<{
	plan: ExactComponentExecutionContract;
	statePortsByPath: ReadonlyMap<string, number>;
	transitionsById: ReadonlyMap<string, PreparedComponentTransition>;
	outputPortIndexes: readonly number[];
	propPorts: readonly PreparedComponentProp[];
	setupOutputs: readonly boolean[];
	setupPropNames: ReadonlySet<string>;
}>;

const preparedPlans = new WeakMap<ExactComponentExecutionContract, PreparedComponentExecution>();

/** Returns allocation-free lookup indexes after preparing an immutable plan once. */
export function prepareComponentExecution(
	plan: ExactComponentExecutionContract
): PreparedComponentExecution {
	const cached = preparedPlans.get(plan);
	if (cached) return cached;
	const producers = producerIdsByPort(plan);
	const outputPortIndexes: number[] = [];
	const propPorts: PreparedComponentProp[] = [];
	const setupOutputs = Array<boolean>(plan.ports.length).fill(false);
	const statePortsByPath = new Map<string, number>();
	const setupInputPorts = new Set<number>();
	for (let portIndex = 0; portIndex < plan.ports.length; portIndex++) {
		const port = plan.ports[portIndex]!;
		if (port[0] === 'state') statePortsByPath.set(port[1], portIndex);
		if (port[0] === 'props') {
			const path = port[1].startsWith('props.') ? port[1].slice(6) : port[1];
			propPorts.push({ portIndex, path: Object.freeze(path.split('.')) });
		}
		if (producers[portIndex]?.size) outputPortIndexes.push(portIndex);
	}
	for (const transition of plan.transitions) {
		if (transition[2] !== 'setup') continue;
		for (const input of transition[6]) setupInputPorts.add(input);
		for (const output of transition[7]) setupOutputs[output] = true;
	}
	const transitionsById = new Map<string, PreparedComponentTransition>();
	for (const transition of plan.transitions) {
		transitionsById.set(transition[0], {
			contract: transition,
			dependencyPorts: transition[6].map((portIndex) =>
				hasPredecessor(producers[portIndex], transition[0]) ||
				plan.ports[portIndex]?.[0] === 'props'
					? portIndex
					: -1
			),
			outputs: transition[7].flatMap((portIndex) => {
				const port = plan.ports[portIndex];
				return port?.[0] === 'state'
					? [{ portIndex, path: Object.freeze(port[1].split('.')) }]
					: [];
			})
		});
	}
	const setupPropNames = new Set<string>();
	for (const portIndex of setupInputPorts) {
		const port = plan.ports[portIndex];
		if (port?.[0] !== 'props') continue;
		const path = port[1].startsWith('props.') ? port[1].slice(6) : port[1];
		const separator = path.indexOf('.');
		setupPropNames.add(separator < 0 ? path : path.slice(0, separator));
	}
	const prepared = Object.freeze({
		plan,
		statePortsByPath,
		transitionsById,
		outputPortIndexes: Object.freeze(outputPortIndexes),
		propPorts: Object.freeze(propPorts),
		setupOutputs: Object.freeze(setupOutputs),
		setupPropNames
	});
	preparedPlans.set(plan, prepared);
	return prepared;
}

function producerIdsByPort(plan: ExactComponentExecutionContract): Array<Set<string> | undefined> {
	const producers = new Array<Set<string> | undefined>(plan.ports.length);
	for (const transition of plan.transitions) {
		for (const output of transition[7]) {
			let ids = producers[output];
			if (!ids) producers[output] = ids = new Set();
			ids.add(transition[0]);
		}
	}
	return producers;
}

function hasPredecessor(producers: Set<string> | undefined, transitionId: string): boolean {
	if (!producers) return false;
	return producers.size > 1 || !producers.has(transitionId);
}
