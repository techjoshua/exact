import {
	Suspense,
	createContext,
	currentComponentDomain,
	dispatchComponentContinuation,
	TaskContext,
	type Component,
	type ComponentInstance
} from '@exactjs/core';

export const TransportStatusContext = createContext<{ message: string }>('status', {
	global: true,
	keep: 'shared'
});
export const LateProfileContext = createContext<{ name: string }>('late-remote-profile');

let lateSetupRoot: string | undefined;
let lateUnmounts = 0;
let lateHost: Component<{ profile: { name: string } }> | undefined;

export function BlockingOptions(this: Component<{ result: string }>) {
	this.state.result = 'waiting';
	const loadOptions = async (task: TaskContext = TaskContext.client().blocking()) =>
		dispatchComponentContinuation(
			this as unknown as ComponentInstance<{ result: string }>,
			'load-options',
			[],
			task.signal
		);
	loadOptions();
	return () => <output>{this.state.result}</output>;
}

function BlockingOptionsPage(this: Component<{}>) {
	return () => (
		<Suspense fallback={<i>Loading</i>}>
			<BlockingOptions />
		</Suspense>
	);
}

function TransportStatus(this: Component<{}>) {
	return () => <output>{this.getContext(TransportStatusContext).message}</output>;
}

export function TransportStatusProvider(this: Component<{}>) {
	this.setContext(TransportStatusContext, { message: 'initial' });
	const publishStatus = async (task: TaskContext = TaskContext.client()) =>
		dispatchComponentContinuation(
			this as unknown as ComponentInstance<{}>,
			'publish-status',
			[],
			task.signal,
			[{ name: 'StatusContext', token: TransportStatusContext }]
		);
	publishStatus();
	return () => <TransportStatus />;
}

export function TransportSearch(this: Component<{ query: string; result: string }>) {
	this.state.query = 'first';
	this.state.result = 'waiting';
	const load = async (query: string, task: TaskContext = TaskContext.client()) =>
		dispatchComponentContinuation(
			this as unknown as ComponentInstance<{ query: string; result: string }>,
			'load',
			[query],
			task.signal
		);
	load(this.state.query);
	return () => <output>{this.state.result}</output>;
}

/** Compiler-owned late island used to verify domain assignment. */
export function DomainLateIsland(this: Component<{}>) {
	lateSetupRoot = currentComponentDomain()?.executionRoot;
	return () => <>Late</>;
}

/** Compiler-owned late island that consumes its logical parent's live context. */
export function ContextLateIsland(this: Component<{}>) {
	const profile = this.getContext(LateProfileContext);
	this.onUnmount(() => lateUnmounts++);
	return () => <strong>{profile.name}</strong>;
}

function LateIslandHost(this: Component<{ profile: { name: string } }>) {
	lateHost = this;
	this.state.profile = { name: 'Ada' };
	this.setContext(LateProfileContext, this.state.profile);
	return () => (
		<section>
			<div id="remote-root">
				<div
					data-exact-client-boundary="late"
					data-exact-client-name="Late"
					data-exact-client-props={'{"props":{}}'}
				/>
			</div>
		</section>
	);
}

/** Compiler-issued blocking transport root. */
export const blockingOptionsRoot = <BlockingOptionsPage />;

/** Compiler-issued public-context transport root. */
export const transportStatusRoot = <TransportStatusProvider />;

/** Compiler-issued continuation hydration root. */
export const transportSearchRoot = <TransportSearch />;

/** Compiler-issued logical-parent host root. */
export const lateIslandHostRoot = <LateIslandHost />;

/** Returns the execution root observed during late-island setup. */
export function readLateSetupRoot(): string | undefined {
	return lateSetupRoot;
}

/** Returns the mounted logical-parent fixture instance. */
export function mountedLateHost(): Component<{ profile: { name: string } }> {
	if (!lateHost) throw new Error('LateIslandHost is not mounted');
	return lateHost;
}

/** Resets and reads the late-island unmount observation. */
export function resetLateUnmounts(): void {
	lateUnmounts = 0;
}

export function readLateUnmounts(): number {
	return lateUnmounts;
}
