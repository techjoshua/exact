import { createComponentRegistry, Suspense, type Component } from '@exactjs/core';

export const identitySetups: string[] = [];
export const identityUnmounts: string[] = [];
export const sharedSetups: string[] = [];
export const sharedUnmounts: string[] = [];

let identityApp: Component<{ selected: 'compact' | 'comfortable'; label: string }> | undefined;
let sharedApp: Component<{ selected: 'first' | 'second' }> | undefined;
let staleApp: Component<{ selected: 'candidate' | 'ready' }> | undefined;

function RegistryIdentityEntry(this: Component<{}>, props: { label: string }) {
	identitySetups.push(props.label);
	this.onUnmount(() => identityUnmounts.push(props.label));
	return () => <p>{props.label}</p>;
}

function ComfortableRegistryIdentityEntry(this: Component<{}>, props: { label: string }) {
	identitySetups.push(`comfortable:${props.label}`);
	this.onUnmount(() => identityUnmounts.push(`comfortable:${props.label}`));
	return () => <p>comfortable:{props.label}</p>;
}

const IdentityView = createComponentRegistry(() => ({
	compact: RegistryIdentityEntry,
	comfortable: ComfortableRegistryIdentityEntry
}));

/** Compiler-backed finite registry identity fixture. */
export function RegistryIdentityApp(
	this: Component<{ selected: 'compact' | 'comfortable'; label: string }>
) {
	identityApp = this;
	this.state.selected = 'compact';
	this.state.label = 'first';
	const Current = IdentityView[this.state.selected];
	return () => (
		<>
			<span>{this.state.selected}</span>
			<Current label={this.state.label} />
		</>
	);
}

/** Reads the finite registry identity fixture instance. */
export function registryIdentityAppInstance() {
	if (!identityApp) throw new Error('Registry identity fixture has not been mounted');
	return identityApp;
}

const ConcurrentView = createComponentRegistry(({ lazy }) => ({
	deferred: lazy(() =>
		import('./component-registry-concurrent-lazy.fixtures.js').then(
			({ ConcurrentLazy }) => ConcurrentLazy
		)
	)
}));

/** Compiler-backed concurrent lazy registry fixture. */
export function ConcurrentRegistryApp() {
	return () => (
		<Suspense fallback={<p>loading</p>}>
			<ConcurrentView.deferred />
			<ConcurrentView.deferred />
		</Suspense>
	);
}

function SharedRegistryEntry(this: Component<{}>, props: { registryKey: string }) {
	const registryKey = props.registryKey;
	sharedSetups.push(registryKey);
	this.onUnmount(() => sharedUnmounts.push(registryKey));
	return () => <p>{props.registryKey}</p>;
}

const SharedView = createComponentRegistry(() => ({
	first: SharedRegistryEntry,
	second: SharedRegistryEntry
}));

/** Compiler-backed shared-implementation registry-key fixture. */
export function SharedRegistryApp(this: Component<{ selected: 'first' | 'second' }>) {
	sharedApp = this;
	this.state.selected = 'first';
	const Current = SharedView[this.state.selected];
	return () => <Current registryKey={this.state.selected} />;
}

/** Reads the shared registry fixture instance. */
export function sharedRegistryAppInstance() {
	if (!sharedApp) throw new Error('Shared registry fixture has not been mounted');
	return sharedApp;
}

function Ready() {
	return () => <p>ready</p>;
}

const StaleView = createComponentRegistry(({ lazy }) => ({
	candidate: lazy(() =>
		import('./component-registry-stale-lazy.fixtures.js').then(({ StaleLazy }) => StaleLazy)
	),
	ready: Ready
}));

/** Compiler-backed stale lazy-candidate fixture. */
export function StaleRegistryApp(this: Component<{ selected: 'candidate' | 'ready' }>) {
	staleApp = this;
	this.state.selected = 'candidate';
	const Current = StaleView[this.state.selected];
	return () => (
		<Suspense fallback={<p>loading</p>}>
			<Current />
		</Suspense>
	);
}

/** Reads the stale registry fixture instance. */
export function staleRegistryAppInstance() {
	if (!staleApp) throw new Error('Stale registry fixture has not been mounted');
	return staleApp;
}
