import { type Child, type Component } from '@exactjs/core';

let clicks = 0;
let receivedProps: unknown;
let remoteRenders = 0;

/** Resets mutable observations shared by compiled island fixtures. */
export function resetIslandFixtureObservations(): void {
	clicks = 0;
	receivedProps = undefined;
	remoteRenders = 0;
}

/** Returns clicks delivered to the compiled clickable island. */
export function readIslandClicks(): number {
	return clicks;
}

/** Returns the sanitized props received by the compiled observation island. */
export function readIslandProps(): unknown {
	return receivedProps;
}

/** Returns the number of compiled remote-island constructions. */
export function readRemoteIslandRenders(): number {
	return remoteRenders;
}

/** Static island used by eager hydration coverage. */
export function EagerCounter() {
	return () => <button>Count</button>;
}

/** Stateful island whose compiler resumption contract restores the SSR count. */
export function ResumableIslandCounter(this: Component<{ count: number }>) {
	// Keep this fixture non-reconstructible so the test can supply a divergent server activation.
	this.state.count = Number('0');
	return () => <output>{this.state.count}</output>;
}

/** Clickable island used to verify disposal before a server replacement. */
export function ClickCounter() {
	return () => <button onClick={() => clicks++}>Old</button>;
}

/** Props-driven island shared by patch and placeholder hydration coverage. */
export function PropsCounter(this: Component<{ count: number }>, props: { count: number }) {
	this.state.count = props.count;
	return () => <button>{this.state.count}</button>;
}

function NestedInner() {
	return () => <button>Inner</button>;
}

/** Island that creates another discoverable client boundary during hydration. */
export function NestedOuter() {
	return () => (
		<section>
			<div data-exact-client-boundary="inner" data-exact-client-name="Inner" />
		</section>
	);
}

export { NestedInner };

/** Records sanitized server-authored props without retaining unsafe keys. */
export function PropsObserver(props: { count?: number }) {
	receivedProps = props;
	return () => <button>{props.count}</button>;
}

/** Records the bounded props object accepted for an over-deep payload. */
export function DeepPropsObserver(props: unknown) {
	receivedProps = props;
	return () => null;
}

/** Preserves a compiler-recognized server child slot inside an island host. */
export function IslandShell(props: { children?: Child | Child[] }) {
	return () => <section>{props.children}</section>;
}

/** Stable shell used while its server-owned child slot refreshes. */
export function StableIslandShell(props: { children?: Child | Child[] }) {
	return () => <section data-shell="stable">{props.children}</section>;
}

/** Props-driven remote island used by registration and refresh coverage. */
export function RemoteIsland(props: { label: string }) {
	remoteRenders++;
	return () => <button>{props.label}</button>;
}

/** Stable remote island identity used by idempotent registration coverage. */
export function StaticRemoteIsland() {
	return () => <button>Remote</button>;
}

/** Conflicting remote island identity used by rejection coverage. */
export function OtherRemoteIsland() {
	return () => <button>Other</button>;
}

/** Compiler-issued root used by disposal coverage. */
export const clickCounterRoot = <ClickCounter />;

let inputObserver = () => {};

/** Installs the authored input read used by island receiving-attempt lifecycle coverage. */
export function observeIslandInput(observer: () => void): void {
	inputObserver = observer;
}

function readIslandLabel(): string {
	inputObserver();
	return 'Count';
}

/** Exposes a real compiled child input while keeping one inspectable clickable instance. */
export function IslandInputProbe(this: Component<{ count: number }>) {
	this.state.count = 0;
	return () => (
		<button onClick={() => this.state.count++}>
			{readIslandLabel()}
			{this.state.count}
		</button>
	);
}

/** Owns an ordinary public hydration root around a separately activated island boundary. */
export function IslandInputPage() {
	return () => (
		<main>
			<div
				data-exact-client-boundary="probe"
				data-exact-client-name="Probe"
				data-exact-client-hydration="eager"
			>
				<button>Count0</button>
			</div>
		</main>
	);
}

/**
 * Server-owned caller partitions its existing interactive child as an independent island.
 * @exact server
 */
function BootstrapServerPage() {
	return () => <ClickCounter />;
}

/** Paired server root used without manually authored island markup. */
export const bootstrapCounterRoot = <BootstrapServerPage />;
