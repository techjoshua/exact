import { captureContinuationSubmission } from './array-submission.js';
import type { StatePublicationPlan } from '../state-publication.js';
import { prepareContinuationResponse, type ComponentInvocation } from './continuation-response.js';
import { linkExactObservationOwner } from '@exactjs/core/framework/inspection-transport';
import { deriveRuntimeConfiguration } from '@exactjs/core/framework/configuration';
import { acceptComponentStateCommit, componentRequestIdentity } from './state-ordering.js';
import { requireEndpoint, endpointForOperation, transportForEndpoint } from './transport.js';
export { requireEndpoint, endpointForOperation, transportForEndpoint } from './transport.js';
import { createComponentProgressObserver } from './progress.js';
import { createDomWorkBudget, type DomWorkBudget } from '@exactjs/dom/root';
import { stageTaskMutation } from '@exactjs/core';
import { componentDomainInspection } from '@exactjs/core/framework/component-domains';
import { enqueueExactOperation } from '../batching.js';
import { ExactBuildUnsupportedError, invokePreparedExact } from '../invocations.js';
import { hydrateClientIslands } from '../islands.js';
import {
	applyPatches,
	boundaryInnerHtml,
	boundaryInnerHtmls,
	createPatchBoundaryResolver,
	partitionAuthority
} from '../patches.js';
import type {
	ExactClient,
	ExactInvocationKind,
	ExactInvocationRequest,
	ExactInvocationResult,
	HydrateOptions
} from '../types.js';
import { requestVersions } from './state.js';

/** Runs and apply with the supplied execution context. */
export async function invokeAndApply(
	container: Element,
	client: ExactClient,
	type: ExactInvocationKind,
	id: string,
	payload: unknown,
	options: HydrateOptions,
	component?: ComponentInvocation
): Promise<ExactInvocationResult> {
	const ownership: { release?: () => void } = {};
	try {
		return await invokeAndApplyOwned(
			container,
			client,
			type,
			id,
			payload,
			options,
			component,
			ownership
		);
	} finally {
		ownership.release?.();
	}
}

/** Owns submitted correspondence until immediate apply or transfer into the existing staged queue. */
async function invokeAndApplyOwned(
	container: Element,
	client: ExactClient,
	type: ExactInvocationKind,
	id: string,
	payload: unknown,
	options: HydrateOptions,
	component: ComponentInvocation | undefined,
	ownership: { release?: () => void }
): Promise<ExactInvocationResult> {
	const work = createDomWorkBudget(options.maxTreeNodes);
	const continuation = type === 'invoke' ? options.continuations?.[id] : undefined;
	if (type === 'invoke' && !continuation)
		throw new Error(`No eXact client continuation contract is registered for ${id}`);
	let versions = requestVersions.get(container);
	if (!versions) {
		versions = new Map();
		requestVersions.set(container, versions);
	}
	const configuredBoundaries = continuation?.boundaries;
	const componentKey = component ? componentRequestIdentity(component.instance) : undefined;
	const scopeRequestKey = (key: string): string => (componentKey ? `${componentKey}:${key}` : key);
	const requestKeys = [
		...new Set(
			type === 'refresh'
				? [`boundary:${id}`]
				: configuredBoundaries?.length
					? configuredBoundaries.map((boundary) => `boundary:${boundary}`)
					: [`invocation:${id}`]
		)
	].map(scopeRequestKey);
	let requestVersion = 1;
	for (const key of requestKeys)
		requestVersion = Math.max(requestVersion, (versions.get(key) ?? 0) + 1);
	for (const key of requestKeys) versions.set(key, requestVersion);
	const requestOrdinalKey = componentKey ? `${componentKey}:request` : 'request';
	const stateCommittedKey = componentKey ? `${componentKey}:state-committed` : 'state-committed';
	const requestOrdinal = (versions.get(requestOrdinalKey) ?? 0) + 1;
	versions.set(requestOrdinalKey, requestOrdinal);
	const refreshPartition =
		type === 'refresh'
			? partitionAuthority(container, id, work, options.executionRoot ?? 'page')
			: undefined;
	let submission = continuation
		? captureContinuationSubmission(
				component?.instance.state ?? client.state,
				continuation,
				component?.instance,
				options.continuationArrays?.[id]
			)
		: undefined;
	ownership.release = submission?.release;
	const selectedState = submission ? submission.state : client.state;
	const needsArray = Boolean(submission?.arrayParser);
	const arrayParser = submission?.arrayParser;
	const preparedState = submission?.preparedState;
	let statePublication: StatePublicationPlan | undefined;
	const operation: ExactInvocationRequest = {
		type,
		root: options.executionRoot ?? 'page',
		id: refreshPartition?.planEdgeId ?? id,
		...(refreshPartition ? { partition: refreshPartition } : {}),
		payload: component
			? {
					dependencies: component.dependencies,
					...(component.generation === undefined ? {} : { generation: component.generation })
				}
			: payload,
		state: needsArray ? undefined : selectedState,
		...(needsArray ? { arrayCompletion: 4 as const } : {}),
		publicContext:
			type === 'invoke'
				? publicContextFor(options.publicContexts, continuation?.publicContexts)
				: undefined,
		boundaryHtml:
			type === 'refresh'
				? boundaryInnerHtml(container, id, work, options.executionRoot ?? 'page')
				: undefined,
		boundaryHtmls:
			type === 'invoke'
				? boundaryHtmlsFor(container, configuredBoundaries, work, options.executionRoot ?? 'page')
				: undefined
	};
	if (component)
		componentDomainInspection(component.instance.domain)?.publish({
			kind: 'continuation.dispatch',
			component: component.instance,
			operationId: id,
			generation: component.generation
		});
	const endpoint = requireEndpoint(
		endpointForOperation(client, type, refreshPartition?.planEdgeId ?? id)
	);
	const transport = transportForEndpoint(options, endpoint);
	// Operations can route to per-invocation or per-boundary endpoints, which keeps
	// server components usable inside independently deployed micro-frontend bundles.
	const progress =
		component && continuation?.progress?.length
			? createComponentProgressObserver(
					component.instance,
					continuation.progress.map((receiver) => receiver.id),
					component.signal
				)
			: undefined;
	const stream = options.stream ?? Boolean(progress);
	const observeResponse =
		options.onOperation && linkExactObservationOwner(operation, options.onResponse);
	let result: ExactInvocationResult;
	try {
		result =
			options.batch === false
				? await invokePreparedExact(
						{
							endpoint,
							...operation,
							arrayParser,
							fetch: transport.fetch,
							headers: transport.headers,
							logger: options.logger,
							stream,
							progress,
							streamLimits: options.streamLimits,
							signal: component?.signal ?? options.signal,
							onResponse: observeResponse ?? options.onResponse
						},
						preparedState
					)
				: await enqueueExactOperation(container, {
						endpoint,
						operation,
						arrayParser,
						preparedState,
						fetch: transport.fetch,
						headers: transport.headers,
						logger: options.logger,
						stream,
						progress,
						streamLimits: options.streamLimits,
						signal: component?.signal ?? options.signal,
						onResponse: observeResponse ?? options.onResponse
					});
	} catch (error) {
		if (error instanceof ExactBuildUnsupportedError) options.onBuildUnsupported?.();
		throw error;
	} finally {
		progress?.close();
	}
	if (continuation) {
		const prepared = prepareContinuationResponse({
			container,
			state: component?.instance.state ?? client.state,
			result,
			continuation,
			submission: submission!,
			contextWrites: component?.contextWrites,
			work
		});
		if (!prepared) {
			options.onDiagnostic?.({
				code: 'invalid-response',
				message: `rejected exact invocation response outside the continuation contract for ${id}`
			});
			options.onOperation?.({
				operation,
				result,
				appliedPatches: [],
				patchesApplied: false,
				stale: false
			});
			return result;
		}
		statePublication = prepared.plan;
		result = prepared.result;
	}

	// State-only component responses use declared write ordering. Their render boundaries
	// may be shared by independent tasks even though no server DOM patch was returned.
	const stateOnlyComponent =
		component &&
		!result.patches?.length &&
		!result.html &&
		!Object.keys(result.contexts ?? {}).length;
	const staleKeys = new Set(
		stateOnlyComponent ? [] : requestKeys.filter((key) => versions!.get(key) !== requestVersion)
	);
	if (staleKeys.size === requestKeys.length) {
		options.onDiagnostic?.({
			code: 'stale-response',
			message: `ignored stale exact ${type} response for ${id}`,
			patch: { type, id }
		});
		options.onOperation?.({
			operation,
			result,
			appliedPatches: [],
			patchesApplied: false,
			stale: true
		});
		return result;
	}
	let responsePatches =
		refreshPartition && result.patches
			? result.patches.map((patch) =>
					patch.id === refreshPartition.planEdgeId ? { ...patch, id } : patch
				)
			: result.patches;
	const partiallyStale = staleKeys.size > 0;
	if (partiallyStale && configuredBoundaries && responsePatches) {
		const rejected: string[] = [];
		const boundaryForPatch = createPatchBoundaryResolver(container, configuredBoundaries, work);
		responsePatches = responsePatches.filter((patch) => {
			const owner = boundaryForPatch(patch.id);
			const accepted = owner !== undefined && !staleKeys.has(scopeRequestKey(`boundary:${owner}`));
			if (!accepted) rejected.push(`${patch.type}:${patch.id}`);
			return accepted;
		});
		options.onDiagnostic?.({
			code: 'stale-response',
			message:
				`partially ignored stale exact ${type} response for ${id}` +
				(rejected.length ? ` (${rejected.join(', ')})` : ''),
			patch: { type, id }
		});
	}
	const patchOptions = deriveRuntimeConfiguration<HydrateOptions & { workBudget?: DomWorkBudget }>(
		options,
		() => ({ workBudget: work })
	);
	const applyResponse = (): void => {
		let appliedPatches: readonly import('@exactjs/core/framework/operation-protocol').ExactPatch[] =
			responsePatches ?? [];
		let patchesApplied = responsePatches
			? applyPatches(container, responsePatches, patchOptions)
			: true;
		if (!patchesApplied && type === 'refresh' && result.html) {
			appliedPatches = [{ type: 'replace', id, html: result.html }];
			patchesApplied = applyPatches(container, appliedPatches, patchOptions);
		}
		if (!patchesApplied) {
			options.onDiagnostic?.({
				code: 'invalid-patch',
				message: `rejected exact ${type} response for ${id}; DOM and state were left unchanged`,
				patch: { type, id }
			});
			options.onOperation?.({
				operation,
				result,
				appliedPatches,
				patchesApplied: false,
				stale: partiallyStale
			});
			return;
		}
		if (responsePatches?.length && options.islands)
			hydrateClientIslands(container, options.islands, options);
		if (
			!partiallyStale &&
			(statePublication !== undefined || 'state' in result) &&
			(component
				? acceptComponentStateCommit(
						component.instance,
						continuation!.stateWrites,
						requestOrdinal,
						statePublication?.footprint
					)
				: requestOrdinal >= (versions.get(stateCommittedKey) ?? 0))
		) {
			versions.set(stateCommittedKey, requestOrdinal);
			if (component || (needsArray && statePublication)) {
				statePublication?.apply();
			} else {
				client.state = result.state;
			}
		}
		if (!partiallyStale && component && result.contexts) {
			const tokens = new Map(component.contextWrites.map((write) => [write.name, write.token]));
			for (const [name, value] of Object.entries(result.contexts))
				component.instance.setContext(tokens.get(name)!, value);
		}
		if (component) {
			if (appliedPatches.length)
				componentDomainInspection(component.instance.domain)?.publish({
					kind: 'patch.apply',
					component: component.instance,
					operationId: id,
					generation: component.generation,
					attributes: { count: appliedPatches.length }
				});
			componentDomainInspection(component.instance.domain)?.publish({
				kind: 'continuation.apply',
				component: component.instance,
				operationId: id,
				generation: component.generation,
				attributes: { stale: partiallyStale }
			});
		}
		options.onOperation?.({
			operation,
			result,
			appliedPatches,
			patchesApplied: true,
			stale: partiallyStale
		});
	};
	const release = ownership.release;
	const ownedApply = () => {
		try {
			applyResponse();
		} finally {
			release?.();
		}
	};
	if (component && continuation?.readiness === 'blocking') {
		if (component.signal.aborted) throw component.signal.reason;
		stageTaskMutation(component.signal, ownedApply);
	} else ownedApply();
	ownership.release = undefined;
	submission = undefined;

	return result;
}

/** Selects only compiler-approved shared context projections for one activation record. */
function publicContextFor(
	values: Record<string, unknown> | undefined,
	tokens: readonly string[] | undefined
): Record<string, unknown> | undefined {
	if (!tokens?.length) return undefined;
	const output: Record<string, unknown> = {};
	for (const token of tokens) {
		if (!values || !Object.prototype.hasOwnProperty.call(values, token)) {
			throw new Error(`Missing eXact public context projection ${token}`);
		}
		output[token] = values[token];
	}
	return output;
}

/** Performs the boundary htmls for domain operation. */
export function boundaryHtmlsFor(
	container: Element,
	ids: readonly string[] | undefined,
	work: DomWorkBudget,
	executionRoot?: string
): Record<string, string> | undefined {
	if (!ids?.length) return undefined;
	const htmls = boundaryInnerHtmls(container, ids, work, executionRoot);
	return Object.keys(htmls).length ? htmls : undefined;
}
