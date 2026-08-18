import {
	createContext,
	intl,
	markExactComponent,
	markExactEnhancementContexts,
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

/** Shared clock environment inherited by descendant clock-update enhancements. */
export const TimeEnvironmentContext = createContext<TimeEnvironment>('@exactjs/time.clock', {
	global: true,
	reactive: true,
	keep: 'shared'
});

/** Props accepted by an application-owned clock provider. */
export interface TimeProviderProps {
	clock: TimeClock;
	timeZone?: string;
	calendar?: string;
	weekStartsOn?: number;
	children?: Child | Child[];
}

/** Publishes an authoritative or simulated clock to descendant time ranges. */
export function TimeProvider(this: Component<{}>, props: TimeProviderProps) {
	validateProviderCalendar(props);
	this.setContext(
		TimeEnvironmentContext,
		Object.freeze({
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
	let mountedActivation: ReturnType<typeof resolveActivation>;
	this.onMount(() => {
		mountedActivation = resolveActivation(props.update);
		mountedActivation?.mount(resolveTimeEnvironment(this), { deferInitialPublish: hydration });
	});
	this.onUnmount(() => mountedActivation?.dispose());
	this.onDeactivate(() => mountedActivation?.suspend());
	this.onActivate(() => mountedActivation?.mount(resolveTimeEnvironment(this)));
	return () => {
		const value = unwrap(props.update);
		const activation = resolveActivation(value);
		if (activation) {
			activation.configure(activation.policy, activation.plan);
			const environment = resolveTimeEnvironment(this);
			if (environment) activation.configureEnvironment(environment);
			if (mountedActivation && mountedActivation !== activation) {
				mountedActivation.dispose();
				mountedActivation = activation;
				activation.mount(environment);
			}
		}
		return props.children;
	};
}

function resolveTimeEnvironment(owner: Component<{}>): TimeEnvironment | undefined {
	if (!owner.hasContext(TimeEnvironmentContext)) return undefined;
	const context = owner.getContext(TimeEnvironmentContext);
	return {
		clock: context.clock,
		...(context.timeZone ? { timeZone: context.timeZone } : {}),
		...(context.calendar ? { calendar: context.calendar } : {}),
		...(context.weekStartsOn !== undefined ? { weekStartsOn: context.weekStartsOn } : {})
	};
}

function resolveActivation(value: unknown) {
	return isTimeActivation(value) ? value : undefined;
}

function validateProviderCalendar(props: TimeProviderProps): void {
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
}

markExactComponent(TimeUpdate, '@exactjs/time:TimeUpdate');
markExactComponent(TimeProvider, '@exactjs/time:TimeProvider');
markExactEnhancementContexts(TimeProvider, { provides: [TimeEnvironmentContext] });
markExactEnhancementContexts(TimeUpdate, { optionallyConsumes: [TimeEnvironmentContext] });
