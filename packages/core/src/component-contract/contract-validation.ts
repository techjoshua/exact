import type {
	ExactComponentContract,
	ExactComponentExecutionContract,
	ExactComponentImplementationContract,
	ExactComponentContinuationExecutorContract,
	ExactComponentResumptionContract
} from '../component-contracts.js';
import { isExactComponentBoundaryContract } from './boundary-validation.js';
import {
	isExactContinuationDependency,
	isExactContinuationInvocation,
	isExactContinuationStatePath
} from './continuation-validation.js';
import {
	hasOnlyContractKeys,
	isContractRecord,
	isContractString,
	isSafeContractStringList
} from './metadata-validation.js';

/** Validates all required metadata before a generated artifact gains runtime authority. */
export function isExactComponentContract(
	value: unknown,
	componentId: string
): value is ExactComponentContract {
	if (!isContractRecord(value)) return false;
	return (
		hasOnlyContractKeys(value, [
			'version',
			'placement',
			'role',
			'implementations',
			'continuations',
			'executors',
			'boundaries',
			'resumption',
			'execution',
			'definition'
		]) &&
		value.version === 2 &&
		(value.placement === 'client' ||
			value.placement === 'server' ||
			value.placement === 'isomorphic' ||
			value.placement === 'unknown') &&
		(value.role === 'client' || value.role === 'executor') &&
		Array.isArray(value.implementations) &&
		value.implementations.every(isImplementation) &&
		Array.isArray(value.continuations) &&
		value.continuations.every(
			(continuation) => isContinuation(continuation) && continuation.componentId === componentId
		) &&
		Array.isArray(value.executors) &&
		value.executors.every(
			(executor) => isExecutor(executor) && executor.componentId === componentId
		) &&
		Array.isArray(value.boundaries) &&
		value.boundaries.every(
			(boundary) =>
				isExactComponentBoundaryContract(boundary) && boundary.ownerComponentId === componentId
		) &&
		(value.resumption === undefined ||
			(isResumption(value.resumption) && value.resumption.componentId === componentId)) &&
		(value.execution === undefined || isExecution(value.execution)) &&
		(value.definition === undefined || isDefinition(value.definition))
	);
}

function isDefinition(value: unknown): boolean {
	return (
		isContractRecord(value) &&
		hasOnlyContractKeys(value, [
			'version',
			'instantiate',
			'abi',
			'updates',
			'state',
			'tasks',
			'reactive',
			'render',
			'capabilities',
			'server'
		]) &&
		value.version === 1 &&
		typeof value.instantiate === 'function' &&
		(value.abi === undefined ||
			(typeof value.abi === 'number' &&
				Number.isSafeInteger(value.abi) &&
				value.abi >= 0 &&
				value.abi <= 15)) &&
		(value.updates === undefined || isComponentUpdates(value.updates)) &&
		(value.state === undefined || isSafeContractStringList(value.state)) &&
		(value.tasks === undefined || isSafeContractStringList(value.tasks)) &&
		(value.reactive === undefined ||
			(Array.isArray(value.reactive) && value.reactive.every(isReactiveAllocation))) &&
		(value.render === undefined || value.render === 'returned-function') &&
		(value.server === undefined || isServerExecution(value.server)) &&
		Array.isArray(value.capabilities) &&
		value.capabilities.every((capability) =>
			[
				'tasks',
				'continuations',
				'resumption',
				'inspection',
				'registry',
				'enhancements',
				'interactions',
				'compatibility',
				'dynamic-components',
				'collections'
			].includes(capability)
		)
	);
}

/** Validates the closed server projection without accepting executable data from foreign input. */
function isServerExecution(value: unknown): boolean {
	if (!isContractRecord(value)) return false;
	return (
		hasOnlyContractKeys(value, ['version', 'classification', 'lane', 'setupProps', 'render']) &&
		value.version === 1 &&
		(value.classification === 'synchronous' ||
			value.classification === 'scheduled' ||
			value.classification === 'dynamic') &&
		(value.lane === 'direct' || value.lane === 'generic') &&
		(value.lane === 'direct'
			? value.classification !== 'dynamic' &&
				typeof value.render === 'function' &&
				isSafeContractStringList(value.setupProps)
			: value.render === undefined && value.setupProps === undefined)
	);
}

function isComponentUpdates(value: unknown): boolean {
	return (
		isContractRecord(value) &&
		hasOnlyContractKeys(value, ['bindings', 'apply']) &&
		Array.isArray(value.bindings) &&
		value.bindings.every(
			(binding) =>
				Array.isArray(binding) &&
				binding.length === 3 &&
				isContractString(binding[0]) &&
				Number.isSafeInteger(binding[1]) &&
				binding[1] >= 0 &&
				Number.isSafeInteger(binding[2]) &&
				binding[2] >= 0
		) &&
		typeof value.apply === 'function'
	);
}

function isImplementation(value: unknown): value is ExactComponentImplementationContract {
	if (!isContractRecord(value)) return false;
	return (
		hasOnlyContractKeys(value, ['id', 'name', 'role', 'implementation']) &&
		isContractString(value.id) &&
		isContractString(value.name) &&
		(value.role === 'root' || value.role === 'client-island' || value.role === 'server-part') &&
		typeof value.implementation === 'function'
	);
}

function isContinuation(value: unknown): boolean {
	if (!isContractRecord(value)) return false;
	return (
		hasOnlyContractKeys(value, [
			'id',
			'kind',
			'componentId',
			'readiness',
			'concurrency',
			'dependencies',
			'stateReads',
			'stateWrites',
			'publicContexts',
			'serverContexts',
			'contextWrites',
			'serverContextWrites',
			'boundaries',
			'invocation'
		]) &&
		isContractString(value.id) &&
		value.kind === 'task' &&
		isContractString(value.componentId) &&
		(value.readiness === 'blocking' || value.readiness === 'nonblocking') &&
		(value.concurrency === undefined || isConcurrency(value.concurrency)) &&
		Array.isArray(value.dependencies) &&
		value.dependencies.every(isExactContinuationDependency) &&
		Array.isArray(value.stateReads) &&
		value.stateReads.every(isExactContinuationStatePath) &&
		Array.isArray(value.stateWrites) &&
		value.stateWrites.every(isExactContinuationStatePath) &&
		isSafeContractStringList(value.publicContexts) &&
		isSafeContractStringList(value.serverContexts) &&
		isSafeContractStringList(value.contextWrites) &&
		(value.serverContextWrites === undefined ||
			isSafeContractStringList(value.serverContextWrites)) &&
		isSafeContractStringList(value.boundaries) &&
		(value.invocation === undefined || isExactContinuationInvocation(value.invocation))
	);
}

function isExecutor(value: unknown): value is ExactComponentContinuationExecutorContract {
	return (
		isContractRecord(value) &&
		hasOnlyContractKeys(value, ['id', 'componentId', 'execute']) &&
		isContractString(value.id) &&
		isContractString(value.componentId) &&
		typeof value.execute === 'function'
	);
}

function isResumption(value: unknown): value is ExactComponentResumptionContract {
	return (
		isContractRecord(value) &&
		hasOnlyContractKeys(value, [
			'componentId',
			'statePaths',
			'valueCaptures',
			'contexts',
			'boundaries'
		]) &&
		isContractString(value.componentId) &&
		isSafeContractStringList(value.statePaths) &&
		isSafeContractStringList(value.valueCaptures) &&
		isSafeContractStringList(value.contexts) &&
		isSafeContractStringList(value.boundaries)
	);
}

function isExecution(value: unknown): value is ExactComponentExecutionContract {
	if (!isContractRecord(value) || !Array.isArray(value.ports)) return false;
	const ports = value.ports;
	return (
		hasOnlyContractKeys(value, ['version', 'ports', 'transitions', 'reactive']) &&
		value.version === 1 &&
		ports.every(isExecutionPort) &&
		Array.isArray(value.transitions) &&
		value.transitions.every((transition) => isExecutionTransition(transition, ports.length)) &&
		(value.reactive === undefined ||
			(Array.isArray(value.reactive) && value.reactive.every(isReactiveAllocation)))
	);
}

function isExecutionPort(value: unknown): boolean {
	return (
		Array.isArray(value) &&
		value.length === 3 &&
		typeof value[0] === 'string' &&
		['state', 'props', 'context', 'derived', 'argument'].includes(value[0]) &&
		isContractString(value[1]) &&
		typeof value[2] === 'string' &&
		['input', 'output', 'inout'].includes(value[2])
	);
}

function isExecutionTransition(value: unknown, portCount: number): boolean {
	return (
		Array.isArray(value) &&
		value.length === 8 &&
		isContractString(value[0]) &&
		isContractString(value[1]) &&
		(value[2] === 'setup' || value[2] === 'interaction') &&
		(value[3] === 'client' || value[3] === 'server' || value[3] === 'isomorphic') &&
		(value[4] === 'blocking' || value[4] === 'nonblocking') &&
		isConcurrency(value[5]) &&
		isPortIndexList(value[6], portCount) &&
		isPortIndexList(value[7], portCount)
	);
}

function isReactiveAllocation(value: unknown): boolean {
	return (
		isContractRecord(value) &&
		hasOnlyContractKeys(value, ['name', 'provenance', 'allocation', 'dependencies']) &&
		isContractString(value.name) &&
		typeof value.provenance === 'string' &&
		['state', 'props', 'context', 'derived', 'cell', 'snapshot', 'unknown'].includes(
			value.provenance
		) &&
		typeof value.allocation === 'string' &&
		['constant', 'live-slot', 'inline', 'computed', 'snapshot', 'structural'].includes(
			value.allocation
		) &&
		isSafeContractStringList(value.dependencies)
	);
}

function isConcurrency(value: unknown): boolean {
	return value === 'parallel' || value === 'latest' || value === 'queue';
}

function isPortIndexList(value: unknown, portCount: number): boolean {
	return (
		Array.isArray(value) &&
		value.every((index) => Number.isSafeInteger(index) && index >= 0 && index < portCount)
	);
}
