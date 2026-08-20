import { type AnyComponentFunction } from '@exactjs/core';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { mergeHydrationRegistration } from '../config.js';
import type { ClientIslandLoader, ExactActivationDecision, HydrateOptions } from '../types.js';

const pendingLoads = new WeakMap<ClientIslandLoader, Promise<AnyComponentFunction>>();
const loadedContracts = new WeakMap<
	AnyComponentFunction,
	ReturnType<typeof composeExactComponentContracts>
>();

/** Creates a compiler-facing lazy island registry entry without conflating loaders and components. */
export function lazyClientIsland(
	load: () => Promise<AnyComponentFunction>,
	activation?: ExactActivationDecision
): ClientIslandLoader {
	return Object.freeze({
		load,
		...(activation ? { activation: freezeActivation(activation) } : {})
	});
}

function freezeActivation(activation: ExactActivationDecision): ExactActivationDecision {
	if (activation.mode !== 'interaction' || activation.reasons.length !== 0)
		throw new TypeError('A lazy client island activation policy must be an interaction decision');
	if (!activation.targets.length)
		throw new TypeError('A lazy client island activation policy requires at least one target');
	const replayByType = {
		click: 'native-click',
		submit: 'request-submit',
		input: 'latest-value',
		change: 'latest-value',
		focus: 'notification',
		blur: 'notification',
		focusin: 'notification',
		focusout: 'notification'
	} as const;
	const identities = new Set<string>();
	return Object.freeze({
		mode: activation.mode,
		reasons: Object.freeze([]),
		targets: Object.freeze(
			activation.targets.map((target) => {
				if (!target.id || target.id.length > 256 || identities.has(target.id))
					throw new TypeError(
						'A lazy client island activation target must have a unique bounded id'
					);
				identities.add(target.id);
				const events = new Set<string>();
				return Object.freeze({
					id: target.id,
					events: Object.freeze(
						target.events.map((event) => {
							if (replayByType[event.type] !== event.replay || events.has(event.type))
								throw new TypeError(
									'A lazy client island event must use its bounded replay policy'
								);
							events.add(event.type);
							return Object.freeze({ ...event });
						})
					)
				});
			})
		)
	});
}

/** Resolves and registers one lazy component exactly once for every shared loader entry. */
export function loadClientIsland(
	entry: ClientIslandLoader,
	options: HydrateOptions
): Promise<AnyComponentFunction> {
	let pending = pendingLoads.get(entry);
	if (!pending) {
		pending = entry
			.load()
			.then((component) => {
				if (typeof component !== 'function')
					throw new TypeError('An eXact client island loader must resolve to a component function');
				return component;
			})
			.catch((error) => {
				pendingLoads.delete(entry);
				throw error;
			});
		pendingLoads.set(entry, pending);
	}
	return pending.then((component) => {
		// The module promise is shared, but continuation registration belongs to
		// each hydration root that activates the shared artifact.
		let contracts = loadedContracts.get(component);
		if (!contracts) {
			contracts = composeExactComponentContracts([component], 'client');
			loadedContracts.set(component, contracts);
		}
		mergeHydrationRegistration(options, {
			continuations: contracts.continuations
		});
		return component;
	});
}

/** Reports whether one registry value is an unambiguous lazy island loader. */
export function isClientIslandLoader(value: unknown): value is ClientIslandLoader {
	return (
		!!value &&
		typeof value === 'object' &&
		typeof (value as Partial<ClientIslandLoader>).load === 'function'
	);
}
