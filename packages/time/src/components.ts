import {
	createContext,
	intl,
	type Child,
	type Component,
	type ComponentInstance
} from '@exactjs/core';
import { isHydrationComponentDomain } from '@exactjs/core/framework/component-domains';
import { unwrap } from '@exactjs/reactive';
import { isTimeActivation } from './activation.js';
import type {
	PreparedTimeActivation,
	TimeClock,
	TimeEnvironment,
	TimeUpdatePolicy
} from './contracts.js';

/** Retains the provider-owned initial sample alongside its live clock identity. */
type TimeProviderEnvironment = TimeEnvironment & { readonly initialSample?: number };

/** Shared clock environment inherited by descendant clock-update enhancements. */
export const TimeEnvironmentContext = createContext<TimeProviderEnvironment>(
	'@exactjs/time.clock',
	{
		global: true,
		reactive: true,
		keep: 'shared'
	}
);

/** Props accepted by an application-owned clock provider. */
export interface TimeProviderProps {
	clock: TimeClock;
	timeZone?: string;
	calendar?: string;
	weekStartsOn?: number;
	children?: Child | Child[];
}

/** Publishes an authoritative or simulated clock to descendant time ranges. */
export function TimeProvider(this: Component<{ initialSample: number }>, props: TimeProviderProps) {
	if (
		props.weekStartsOn !== undefined &&
		(!Number.isInteger(props.weekStartsOn) || props.weekStartsOn < 0 || props.weekStartsOn > 6)
	)
		throw new TypeError('TimeProvider weekStartsOn must be an integer from 0 through 6');
	if (props.timeZone || props.calendar)
		intl.DateTimeFormat('en', {
			...(props.timeZone ? { timeZone: props.timeZone } : {}),
			...(props.calendar ? { calendar: props.calendar } : {})
		});
	this.state.initialSample = sampleProviderClock(props.clock);
	const thisOwner = this;
	this.setContext(
		TimeEnvironmentContext,
		Object.freeze({
			get initialSample() {
				return thisOwner.state.initialSample;
			},
			get clock() {
				return props.clock;
			},
			get timeZone() {
				return props.timeZone;
			},
			get calendar() {
				return props.calendar;
			},
			get weekStartsOn() {
				return props.weekStartsOn;
			}
		})
	);
	return () => props.children;
}

/** Props accepted by the compiler-owned clock-update enhancement. */
export interface TimeUpdateProps {
	update?: TimeUpdatePolicy | PreparedTimeActivation;
	children?: Child | Child[];
}

/** Owns mounted registration while returning the authored fallback range unchanged. */
export function TimeUpdate(this: Component<{}>, props: TimeUpdateProps) {
	const hydration = isHydrationComponentDomain((this as ComponentInstance<{}>).domain);
	const state: { mountedActivation?: ReturnType<typeof resolveActivation> } = {};
	this.onMount(() => {
		// Component props can expose object values through a reactive proxy. Retain the same raw
		// activation identity used during render so a policy update cannot dispose its own range.
		state.mountedActivation = resolveActivation(unwrap(props.update));
		state.mountedActivation?.mount(resolveTimeEnvironment(this), {
			deferInitialPublish: hydration
		});
	});
	this.onUnmount(() => state.mountedActivation?.dispose());
	this.onDeactivate(() => state.mountedActivation?.suspend());
	this.onActivate(() => state.mountedActivation?.mount(resolveTimeEnvironment(this)));
	return () => renderTimeUpdate(this, props, state);
}

function renderTimeUpdate(
	owner: Component<{}>,
	props: TimeUpdateProps,
	state: { mountedActivation?: ReturnType<typeof resolveActivation> }
): Child | Child[] {
	const activation = resolveActivation(unwrap(props.update));
	if (activation) {
		activation.configure(activation.policy, activation.plan);
		const environment = resolveTimeEnvironment(owner);
		if (environment) activation.configureEnvironment(environment, environment.initialSample);
		if (state.mountedActivation && state.mountedActivation !== activation) {
			state.mountedActivation.dispose();
			state.mountedActivation = activation;
			activation.mount(environment);
		}
	}
	return props.children;
}

function resolveTimeEnvironment(owner: Component<{}>): TimeProviderEnvironment | undefined {
	if (!owner.hasContext(TimeEnvironmentContext)) return undefined;
	const context = owner.getContext(TimeEnvironmentContext);
	return {
		clock: context.clock,
		...(context.initialSample === undefined ? {} : { initialSample: context.initialSample }),
		...(context.timeZone ? { timeZone: context.timeZone } : {}),
		...(context.calendar ? { calendar: context.calendar } : {}),
		...(context.weekStartsOn !== undefined ? { weekStartsOn: context.weekStartsOn } : {})
	};
}

function resolveActivation(value: unknown) {
	return isTimeActivation(value) ? value : undefined;
}

/**
 * Captures a portable TimeClock observation once for the provider's serialized default state.
 * TimeClock.now supplies a finite observation without external effects in either execution target.
 * @exact pure
 */
function sampleProviderClock(clock: TimeClock): number {
	const sample = clock.now().epochMilliseconds;
	if (!Number.isFinite(sample))
		throw new TypeError('TimeProvider clock must return a finite sample');
	return sample;
}
