import { createContext, type Component } from '@exactjs/core';
import { RemoteComponent } from './client.js';

const shellProfile = createContext<{ name: string }>('remote-test-profile', {
	global: false,
	reactive: true
});
const replacementProfile = createContext<{ name: string }>('replacement-profile', {
	global: false,
	reactive: true
});

let shellPageInstance: Component<{ profile: { name: string } }> | undefined;
let patchingChildInstance: Component<{ count: number }> | undefined;
let patchingMounts = 0;
let patchingUnmounts = 0;
let replacementPageInstance: Component<{ profile: { name: string } }> | undefined;
let replacementChildInstance: Component<{ count: number }> | undefined;
let updateShellProfile: (name: string) => void = () => undefined;
let incrementPatchingCount = (): void => undefined;
let updateReplacementState: (name: string, count: number) => void = () => undefined;
let updateReplacementCount: (count: number) => void = () => undefined;

function ShellPageChild(this: Component<{}>) {
	const profile = this.getContext(shellProfile);
	return () => <strong>{profile.name}</strong>;
}

function ShellPage(this: Component<{ profile: { name: string } }>) {
	shellPageInstance = this;
	this.state.profile = { name: 'Ada' };
	updateShellProfile = (name) => (this.state.profile.name = name);
	this.setContext(shellProfile, this.state.profile);
	return () => (
		<RemoteComponent binding="shell">
			<ShellPageChild />
		</RemoteComponent>
	);
}

function PatchingPageChild(this: Component<{ count: number }>) {
	patchingChildInstance = this;
	this.state.count = 0;
	incrementPatchingCount = () => this.state.count++;
	this.onMount(() => patchingMounts++);
	this.onUnmount(() => patchingUnmounts++);
	return () => <strong data-page-child="">{this.state.count}</strong>;
}

function PatchingPage() {
	return () => (
		<RemoteComponent binding="patching">
			<PatchingPageChild />
		</RemoteComponent>
	);
}

function ReplacementPageChild(this: Component<{ count: number }>) {
	replacementChildInstance = this;
	this.state.count = 0;
	updateReplacementCount = (count) => (this.state.count = count);
	const profile = this.getContext(replacementProfile);
	return () => <strong>{`${profile.name}:${this.state.count}`}</strong>;
}

function ReplacementPage(this: Component<{ profile: { name: string } }>) {
	replacementPageInstance = this;
	this.state.profile = { name: 'Ada' };
	updateReplacementState = (name, count) => {
		this.state.profile.name = name;
		if (!replacementChildInstance) throw new Error('Replacement child fixture is not mounted');
		updateReplacementCount(count);
	};
	this.setContext(replacementProfile, this.state.profile);
	return () => (
		<RemoteComponent binding="retiringShell">
			<ReplacementPageChild />
		</RemoteComponent>
	);
}

function RemoteRoot(props: { binding: string; remoteProps?: Record<string, unknown> }) {
	return () => <RemoteComponent binding={props.binding} props={props.remoteProps} />;
}

/** Issues one compiled remote wrapper with optional remote props. */
export const remoteRoot = (binding: string, props?: Record<string, unknown>) => (
	<RemoteRoot binding={binding} remoteProps={props} />
);

/** Issues one compiled remote wrapper with a page-owned fallback. */
export const fallbackRemoteRoot = (binding: string, text: string, alert = false) => (
	<RemoteComponent
		binding={binding}
		fallback={alert ? <p role="alert">{text}</p> : <p>{text}</p>}
	/>
);

function PairedRetiring() {
	return () => (
		<div>
			<RemoteComponent binding="retiring" key="left" />
			<RemoteComponent binding="retiring" key="right" />
		</div>
	);
}

/** Issues two keyed remote wrappers for coordinated replacement coverage. */
export const pairedRetiringRoot = () => <PairedRetiring />;

/** Issues the page-context remote shell fixture. */
export const shellPageRoot = () => <ShellPage />;
/** Issues the cross-root protocol-patching fixture. */
export const patchingPageRoot = () => <PatchingPage />;
/** Issues the remote build-replacement fixture. */
export const replacementPageRoot = () => <ReplacementPage />;

/** Updates the mounted page profile supplied through the remote shell. */
export function setShellProfileName(name: string): void {
	if (!shellPageInstance) throw new Error('Shell page fixture is not mounted');
	updateShellProfile(name);
}

/** Resets lifecycle counters for the page-owned patching child. */
export function resetPatchingLifecycle(): void {
	patchingMounts = 0;
	patchingUnmounts = 0;
	patchingChildInstance = undefined;
}

/** Reads the durable page-owned patching child instance. */
export function patchingChild(): Component<{ count: number }> {
	if (!patchingChildInstance) throw new Error('Patching child fixture is not mounted');
	return patchingChildInstance;
}

/** Increments the retained page-owned patching child. */
export function incrementPatchingChild(): void {
	if (!patchingChildInstance) throw new Error('Patching child fixture is not mounted');
	incrementPatchingCount();
}

/** Reads mount and unmount counts for the page-owned patching child. */
export function patchingLifecycle(): Readonly<{ mounts: number; unmounts: number }> {
	return { mounts: patchingMounts, unmounts: patchingUnmounts };
}

/** Updates the page state retained across a remote build replacement. */
export function updateReplacementPage(name: string, count: number): void {
	if (!replacementPageInstance || !replacementChildInstance)
		throw new Error('Replacement page fixture is not mounted');
	updateReplacementState(name, count);
}
