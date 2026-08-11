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
			'state',
			'tasks',
			'reactive',
			'render',
			'capabilities'
		]) &&
		value.version === 1 &&
		typeof value.instantiate === 'function' &&
		isSafeContractStringList(value.state) &&
		isSafeContractStringList(value.tasks) &&
		Array.isArray(value.reactive) &&
		value.reactive.every(isReactiveAllocation) &&
		value.render === 'returned-function' &&
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
				'compatibility'
			].includes(capability)
		)
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
	return (
		isContractRecord(value) &&
		hasOnlyContractKeys(value, ['version', 'ports', 'transitions', 'reactive']) &&
		value.version === 1 &&
		Array.isArray(value.ports) &&
		value.ports.every((port, index) => isExecutionPort(port, index)) &&
		Array.isArray(value.transitions) &&
		value.transitions.every((transition) =>
			isExecutionTransition(transition, value.ports.length)
		) &&
		Array.isArray(value.reactive) &&
		value.reactive.every(isReactiveAllocation)
	);
}

function isExecutionPort(value: unknown, expectedIndex: number): boolean {
	return (
		isContractRecord(value) &&
		hasOnlyContractKeys(value, ['index', 'kind', 'path', 'direction']) &&
		value.index === expectedIndex &&
		['state', 'props', 'context', 'derived', 'argument'].includes(value.kind) &&
		isContractString(value.path) &&
		['input', 'output', 'inout'].includes(value.direction)
	);
}

function isExecutionTransition(value: unknown, portCount: number): boolean {
	return (
		isContractRecord(value) &&
		hasOnlyContractKeys(value, [
			'id',
			'taskId',
			'activation',
			'placement',
			'readiness',
			'concurrency',
			'inputs',
			'outputs'
		]) &&
		isContractString(value.id) &&
		isContractString(value.taskId) &&
		(value.activation === 'setup' || value.activation === 'interaction') &&
		(value.placement === 'client' ||
			value.placement === 'server' ||
			value.placement === 'isomorphic') &&
		(value.readiness === 'blocking' || value.readiness === 'nonblocking') &&
		isConcurrency(value.concurrency) &&
		isPortIndexList(value.inputs, portCount) &&
		isPortIndexList(value.outputs, portCount)
	);
}

function isReactiveAllocation(value: unknown): boolean {
	return (
		isContractRecord(value) &&
		hasOnlyContractKeys(value, ['name', 'provenance', 'allocation', 'dependencies']) &&
		isContractString(value.name) &&
		['state', 'props', 'context', 'derived', 'cell', 'snapshot', 'unknown'].includes(
			value.provenance
		) &&
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
