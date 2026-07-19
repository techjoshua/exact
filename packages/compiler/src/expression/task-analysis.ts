import type { BoundModule } from '@exact/expressions';

import type { CallableEffectPlan } from '../analysis/callable-effects.js';

import { isServerOnlyModule } from '../imports.js';

import type { ExactContextEffect, ExactPlacement, ExactStateEffect } from '../types.js';

import { expressionComponentIndex } from './component-index.js';

import { analyzeExpressionWrites } from './writes.js';

import type {
	ExpressionLifecycleListener,
	ExpressionSetupTask,
	ExpressionTaskPlan,
	ExpressionTaskResource,
	ExpressionTaskSignalCall,
	ExpressionTaskSite
} from './task-contracts.js';

import {
	directSetupExpression,
	effectPathSuffix,
	insideClientJsx,
	insideTask,
	isOwnedListener,
	moduleLocalVariables,
	taskResource,
	taskResourceOwnership,
	taskSignalCall
} from './task-resources.js';

import {
	collectStateAliases,
	effect,
	insideAssignmentTarget,
	isFunction,
	isTaskCall,
	statePath,
	taskComponentOwner,
	uniqueContexts,
	uniqueEffects
} from './task-state.js';

const browserGlobals = new Set([
	'window',
	'document',
	'navigator',
	'location',
	'history',
	'localStorage',
	'sessionStorage',
	'requestAnimationFrame',
	'cancelAnimationFrame',
	'requestIdleCallback',
	'cancelIdleCallback',
	'MutationObserver',
	'ResizeObserver',
	'IntersectionObserver',
	'WebSocket',
	'EventSource',
	'BroadcastChannel',
	'Worker'
]);

/** Builds task effects from canonical references while retaining source spans for emission. */
export function analyzeExpressionTasks(
	module: BoundModule,
	callableEffects?: CallableEffectPlan
): ExpressionTaskPlan {
	const components = expressionComponentIndex(module);
	const sites = new Map<string, ExpressionTaskSite>();
	const resources = new Map<string, ExpressionTaskResource>();
	const lifecycleListeners = new Map<string, ExpressionLifecycleListener>();
	const setupTasks = new Map<string, ExpressionSetupTask>();
	const signalCalls = new Map<string, ExpressionTaskSignalCall>();
	const planDiagnostics: string[] = [];
	const diagnosticLocations: Array<Readonly<{ message: string; start: number }>> = [];
	const writes = analyzeExpressionWrites(module);
	const localVariables = moduleLocalVariables(module);
	for (const task of module
		.walk()
		.calls()
		.where((call) => isTaskCall(call, components))) {
		if (!task.node.span) continue;
		const work = task.arguments.at(-1);
		if (!work || !isFunction(work)) continue;
		const aliases = collectStateAliases(module, work);
		const reads: ExactStateEffect[] = [];
		const taskWrites: ExactStateEffect[] = [];
		const contexts: ExactContextEffect[] = [];
		const contextSites: Array<Readonly<{ start: number; effect: ExactContextEffect }>> = [];
		const resourceDiagnostics: string[] = [];
		let browserEffects = false;
		let serverEffects = false;

		for (const reference of work.walk({ types: false })) {
			const variable = reference.variable;
			const name = variable?.name ?? reference.name;
			if (
				reference.node.kind === 'Identifier' &&
				name &&
				browserGlobals.has(name) &&
				(!variable || !localVariables.has(variable))
			)
				browserEffects = true;
			if (
				reference.node.kind === 'Identifier' &&
				variable?.importedFrom &&
				isServerOnlyModule(variable.importedFrom)
			)
				serverEffects = true;
			if (reference.isMember()) {
				const callTarget =
					reference.parent?.node.kind === 'CallExpression' &&
					'target' in reference.parent.node &&
					reference.parent.node.target === reference.node;
				const path = statePath(
					module,
					callTarget && reference.target ? reference.target : reference,
					aliases
				);
				if (path && !insideAssignmentTarget(reference)) reads.push(effect(path.join('.'), 'read'));
			}
		}
		for (const site of writes.sites.values()) {
			if (site.start >= work.node.span!.start && site.end <= work.node.span!.end)
				taskWrites.push(effect(site.path.join('.'), 'write', site.operation === 'array-mutation'));
		}
		for (const call of work.walk().calls()) {
			const resource = taskResource(call, localVariables);
			if (resource && call.node.span) {
				const ownership =
					resource.kind === 'owned' ? taskResourceOwnership(module, work, call, resource) : 'owned';
				if (ownership === 'owned') {
					const site = Object.freeze({
						nodeId: call.node.id,
						start: call.node.span.start,
						end: call.node.span.end,
						...resource
					});
					resources.set(site.nodeId, site);
				} else if (ownership === 'escape') {
					resourceDiagnostics.push(
						`error: task-owned ${resource.description ?? 'resource'} escapes its task generation; return an explicit cleanup or keep the resource local`
					);
				}
			}
			const signalCall = taskSignalCall(call, localVariables);
			if (signalCall && call.node.span) {
				const site = Object.freeze({
					nodeId: call.node.id,
					start: call.node.span.start,
					end: call.node.span.end,
					...signalCall
				});
				signalCalls.set(site.nodeId, site);
			}
			if (
				!call.target?.isMember() ||
				!/^this\.(?:getContext|setContext)$/.test(call.target.node.text ?? '')
			)
				continue;
			const token = call.arguments[0];
			const exactToken =
				token && /^(?:[A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*)*$/.test(token.node.text ?? '');
			const effect = Object.freeze({
				token: exactToken ? token!.node.text! : 'unknown',
				kind: call.target.name === 'getContext' ? 'read' : 'write',
				confidence: exactToken ? 'exact' : 'unknown'
			} satisfies ExactContextEffect);
			contexts.push(effect);
			contextSites.push(
				Object.freeze({ start: call.node.span?.start ?? task.node.span.start, effect })
			);
			continue;
		}
		for (const call of work.walk().calls()) {
			if (!call.target?.isMember('assign') || call.target.target?.node.text !== 'Object') continue;
			const object = call.target.target.rootVariable;
			if (object && localVariables.has(object)) continue;
			const target = call.arguments[0];
			const path = target ? statePath(module, target, aliases) : undefined;
			if (path) taskWrites.push(effect(path.length ? path.join('.') : '*', 'write', true));
		}
		const requestedPlacement =
			task.target?.name === 'client' || task.target?.name === 'server'
				? task.target.name
				: undefined;
		const callableEffect = callableEffects?.byNodeId.get(work.node.id);
		if (callableEffect) {
			taskWrites.push(...callableEffect.stateWrites);
			reads.push(...callableEffect.stateReads);
			contexts.push(...callableEffect.contexts);
		}
		const environmentEffect =
			callableEffect?.effect ??
			(browserEffects && serverEffects
				? 'mixed'
				: browserEffects
					? 'browser'
					: serverEffects
						? 'server'
						: 'neutral');
		const effectSources = callableEffect?.effectSources ?? [];
		browserEffects ||= effectSources.some((source) => source.environment === 'browser');
		serverEffects ||= effectSources.some((source) => source.environment === 'server');
		const placement: ExactPlacement =
			requestedPlacement ??
			(environmentEffect === 'browser'
				? 'client'
				: environmentEffect === 'server'
					? 'server'
					: environmentEffect === 'unknown'
						? browserEffects && !serverEffects
							? 'client'
							: serverEffects && !browserEffects
								? 'server'
								: 'unknown'
						: environmentEffect === 'mixed'
							? 'unknown'
							: taskWrites.length
								? 'isomorphic'
								: 'client');
		const diagnostics: string[] = [];
		const nearestFunction = task.ancestors().functions().first();
		const componentOwner = taskComponentOwner(task, components);
		if (componentOwner && nearestFunction?.node !== componentOwner.node) {
			diagnostics.push(
				'error: this.task() must be registered directly during component setup, not inside render functions or callbacks'
			);
		}
		if (browserEffects && taskWrites.length)
			diagnostics.push(
				'task writes component state and references browser-only globals; classify as client and split at this boundary'
			);
		if (!requestedPlacement && !browserEffects && !serverEffects && taskWrites.length)
			diagnostics.push(
				'task writes component state without environment-specific effects; classify as isomorphic so SSR can run it and hydration can skip duplicate initial work'
			);
		if (!browserEffects && !serverEffects && !taskWrites.length)
			diagnostics.push(
				'task has no detected state writes or environment-specific effects; classify as client lifecycle work'
			);
		if (requestedPlacement === 'server' && browserEffects)
			diagnostics.push('error: this.task.server() cannot reference browser-only globals');
		if (requestedPlacement === 'client' && serverEffects)
			diagnostics.push('error: this.task.client() cannot reference server-only imports');
		if (environmentEffect === 'mixed' || (browserEffects && serverEffects))
			diagnostics.push(
				`error: task has indivisible browser and server effects${effectPathSuffix(effectSources)}`
			);
		if (!requestedPlacement && environmentEffect === 'unknown' && !browserEffects && !serverEffects)
			diagnostics.push(
				`error: task placement depends on an opaque call; use this.task.client() or this.task.server()${effectPathSuffix(effectSources)}`
			);
		if (requestedPlacement)
			diagnostics.push(`task placement forced by this.task.${requestedPlacement}()`);
		diagnostics.push(...resourceDiagnostics);
		// The plan-level channel is consumed before emission and must include every
		// fatal site diagnostic. Informational placement notes remain site-local.
		for (const diagnostic of diagnostics)
			if (diagnostic.startsWith('error:')) {
				planDiagnostics.push(diagnostic);
				diagnosticLocations.push(
					Object.freeze({ message: diagnostic, start: task.node.span.start })
				);
			}
		const component = componentOwner?.node.name;
		const site = Object.freeze({
			nodeId: task.node.id,
			...(component ? { component } : {}),
			...(componentOwner ? { componentId: componentOwner.node.id } : {}),
			start: task.node.span.start,
			end: task.node.span.end,
			...(requestedPlacement ? { requestedPlacement } : {}),
			placement,
			async: /^\s*async\b/.test(work.node.text ?? ''),
			browserEffects,
			serverEffects,
			reads: Object.freeze(uniqueEffects(reads)),
			writes: Object.freeze(uniqueEffects(taskWrites)),
			contexts: Object.freeze(uniqueContexts(contexts)),
			contextSites: Object.freeze(contextSites),
			diagnostics: Object.freeze(diagnostics),
			environmentEffect,
			effectSources: Object.freeze([...effectSources])
		});
		sites.set(site.nodeId, site);
	}
	for (const call of module.walk().calls()) {
		if (!call.node.span || insideTask(call) || insideClientJsx(call)) continue;
		const owner = components.owner(call);
		if (!owner || call.ancestors().functions().first()?.node !== owner.node) continue;
		const listenerCall = isOwnedListener(call, localVariables);
		const resource = taskResource(call, localVariables);
		const signalCall = taskSignalCall(call, localVariables);
		let ownResource = false;
		if (resource) {
			const ownership =
				resource.kind === 'owned' ? taskResourceOwnership(module, owner, call, resource) : 'owned';
			if (ownership === 'owned') {
				ownResource = true;
				const site = Object.freeze({
					nodeId: call.node.id,
					start: call.node.span.start,
					end: call.node.span.end,
					...resource
				});
				resources.set(site.nodeId, site);
			} else if (ownership === 'escape') {
				const message = `error: setup-created ${resource.description ?? resource.kind} escapes component lifecycle ownership; move its creation into this.task.client() or dispose it explicitly`;
				planDiagnostics.push(message);
				diagnosticLocations.push(Object.freeze({ message, start: call.node.span.start }));
			}
		}
		if (signalCall) {
			const site = Object.freeze({
				nodeId: call.node.id,
				start: call.node.span.start,
				end: call.node.span.end,
				...signalCall
			});
			signalCalls.set(site.nodeId, site);
		}
		if (!listenerCall && !ownResource && !signalCall) continue;
		const expression = directSetupExpression(call);
		if (!expression?.node.span) {
			const message = `error: setup-created ${resource?.description ?? resource?.kind ?? 'cancellable operation'} cannot be owned without changing its expression result; move it into this.task.client()`;
			planDiagnostics.push(message);
			diagnosticLocations.push(Object.freeze({ message, start: call.node.span.start }));
			continue;
		}
		const setup = Object.freeze({
			nodeId: expression.node.id,
			component: owner.node.name!,
			start: expression.node.span.start,
			end: expression.node.span.end
		});
		setupTasks.set(setup.nodeId, setup);
		if (listenerCall) {
			const listener = Object.freeze({
				nodeId: call.node.id,
				component: owner.node.name!,
				start: call.node.span.start,
				end: call.node.span.end
			});
			lifecycleListeners.set(listener.nodeId, listener);
		}
	}
	return Object.freeze({
		sites,
		resources,
		lifecycleListeners,
		setupTasks,
		signalCalls,
		diagnostics: Object.freeze(planDiagnostics),
		diagnosticLocations: Object.freeze(diagnosticLocations)
	});
}
