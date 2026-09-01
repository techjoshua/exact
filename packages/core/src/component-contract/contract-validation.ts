import type {
	ExactComponentContract,
	ExactComponentExecutionContract,
	ExactComponentImplementationContract,
	ExactComponentContinuationExecutorContract,
	ExactComponentResumptionContract
} from '../component-contracts.js';
import { isExactServerExecutionMetadata } from './server-execution-validation.js';
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
import { allCompiledComponentABI } from '../component/compiled-abi.js';

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
			'artifact'
		]) &&
		value.version === 3 &&
		(value.placement === 'client' ||
			value.placement === 'server' ||
			value.placement === 'isomorphic' ||
			value.placement === 'unknown') &&
		(value.role === 'client' || value.role === 'render' || value.role === 'executor') &&
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
		isExecutableArtifact(value.artifact, componentId, value.role) &&
		hasConsistentServerPublication(value)
	);
}

function hasConsistentServerPublication(value: Record<PropertyKey, unknown>): boolean {
	if (!isContractRecord(value.artifact) || !isContractRecord(value.artifact.execution)) return true;
	const resumable =
		value.resumption !== undefined &&
		Array.isArray(value.continuations) &&
		value.continuations.length !== 0;
	return (value.artifact.execution.publication !== undefined) === resumable;
}

function isExecutableArtifact(value: unknown, componentId: string, role: unknown): boolean {
	if (!isContractRecord(value) || value.version !== 1 || value.id !== componentId) return false;
	if (!hasCommonArtifactFields(value)) return false;
	if (value.target === 'client') return role === 'client' && isClientArtifact(value);
	if (value.target === 'server')
		return (role === 'render' || role === 'executor') && isServerArtifact(value);
	return false;
}

function hasCommonArtifactFields(value: Record<PropertyKey, unknown>): boolean {
	return (
		typeof value.instantiate === 'function' &&
		typeof value.construct === 'function' &&
		typeof value.abi === 'number' &&
		Number.isSafeInteger(value.abi) &&
		value.abi >= 0 &&
		(value.abi & ~allCompiledComponentABI) === 0 &&
		isSafeContractStringList(value.state) &&
		isSafeContractStringList(value.props) &&
		(value.opaqueProps === undefined || isSafeContractStringList(value.opaqueProps)) &&
		(value.identityProps === undefined || isSafeContractStringList(value.identityProps)) &&
		(value.tasks === undefined || isSafeContractStringList(value.tasks)) &&
		(value.reactive === undefined ||
			(Array.isArray(value.reactive) && value.reactive.every(isReactiveAllocation))) &&
		(value.render === undefined || value.render === 'returned-function') &&
		Array.isArray(value.capabilities) &&
		value.capabilities.every(isCapability)
	);
}

function isClientArtifact(value: Record<PropertyKey, unknown>): boolean {
	return (
		hasOnlyContractKeys(value, [
			'version',
			'target',
			'id',
			'template',
			'construct',
			'attach',
			'receive',
			'dispose',
			'instantiate',
			'abi',
			'updates',
			'state',
			'props',
			'opaqueProps',
			'identityProps',
			'tasks',
			'reactive',
			'render',
			'capabilities'
		]) &&
		(value.template === undefined || isContractRecord(value.template)) &&
		typeof value.attach === 'function' &&
		typeof value.receive === 'function' &&
		typeof value.dispose === 'function' &&
		(value.updates === undefined || isComponentUpdates(value.updates))
	);
}

function isServerArtifact(value: Record<PropertyKey, unknown>): boolean {
	return (
		hasOnlyContractKeys(value, [
			'version',
			'target',
			'id',
			'issue',
			'write',
			'dispose',
			'execute',
			'instantiate',
			'construct',
			'abi',
			'state',
			'props',
			'opaqueProps',
			'tasks',
			'reactive',
			'render',
			'capabilities',
			'execution',
			'selection'
		]) &&
		typeof value.issue === 'function' &&
		typeof value.write === 'function' &&
		typeof value.dispose === 'function' &&
		(value.execute === undefined || typeof value.execute === 'function') &&
		(value.selection === undefined || isServerSelection(value.selection)) &&
		isServerExecution(value.execution, value.selection !== undefined) &&
		hasConsistentStatelessServerExecution(value)
	);
}

/** Ensures a stateless executor cannot smuggle request-owned component surfaces into its artifact. */
function hasConsistentStatelessServerExecution(value: Record<PropertyKey, unknown>): boolean {
	if (!isContractRecord(value.execution) || value.execution.mode !== 'stateless') return true;
	return (
		Array.isArray(value.state) &&
		value.state.length === 0 &&
		Array.isArray(value.capabilities) &&
		value.capabilities.every((capability) => capability === 'registry') &&
		value.execution.frame === undefined &&
		value.execution.lifecycle === undefined &&
		value.execution.publication === undefined
	);
}

/** Validates the finite registry resolver retained by a lazy server facade. */
function isServerSelection(value: unknown): boolean {
	return (
		isContractRecord(value) &&
		hasOnlyContractKeys(value, ['key', 'resolve']) &&
		isContractString(value.key) &&
		typeof value.resolve === 'function'
	);
}

function isCapability(value: unknown): boolean {
	return (
		typeof value === 'string' &&
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
			'collections',
			'contexts',
			'targets'
		].includes(value)
	);
}

/** Validates the closed server projection without accepting executable data from foreign input. */
function isServerExecution(value: unknown, selection = false): boolean {
	return isExactServerExecutionMetadata(value, selection);
}

function isComponentUpdates(value: unknown): boolean {
	if (
		!isContractRecord(value) ||
		!hasOnlyContractKeys(value, ['bindings', 'props', 'words', 'apply'])
	)
		return false;
	const words = value.words === undefined ? 2 : value.words;
	return (
		typeof words === 'number' &&
		Number.isSafeInteger(words) &&
		words >= 2 &&
		(value.words === undefined || words >= 3) &&
		Array.isArray(value.bindings) &&
		(value.props === undefined ||
			(typeof value.props === 'number' &&
				Number.isSafeInteger(value.props) &&
				value.props > 0 &&
				value.props <= value.bindings.length)) &&
		value.bindings.every(
			(binding) =>
				Array.isArray(binding) &&
				binding.length === words + 1 &&
				Number.isSafeInteger(binding[0]) &&
				binding[0] >= 0 &&
				binding
					.slice(1)
					.every((mask) => Number.isSafeInteger(mask) && mask >= 0 && mask <= 0xffff_ffff)
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
			'stateInputs',
			'valueCaptures',
			'contexts',
			'boundaries'
		]) &&
		isContractString(value.componentId) &&
		isSafeContractStringList(value.statePaths) &&
		Array.isArray(value.stateInputs) &&
		value.stateInputs.every(
			(input) =>
				Array.isArray(input) &&
				input.length === 2 &&
				isContractString(input[0]) &&
				isContractString(input[1])
		) &&
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
