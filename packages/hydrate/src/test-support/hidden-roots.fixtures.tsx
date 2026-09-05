import { createContext, type AnyComponentInstance, type Component } from '@exactjs/core';
import type { ExactClient } from '../types.js';
import { createExactRoot } from '../runtime/root.js';

const HiddenRootTheme = createContext<{ name: string }>('hidden-root-theme', { reactive: true });

let pageChild: AnyComponentInstance | undefined;
let remoteShell: AnyComponentInstance | undefined;
let remoteButton: AnyComponentInstance | undefined;
let hiddenRemoteClient: ExactClient | undefined;

function SharedButton(this: Component<{}>) {
	remoteButton = this as AnyComponentInstance;
	const theme = this.getContext(HiddenRootTheme);
	return () => <button>{theme.name}</button>;
}

function PageChild(this: Component<{}>) {
	pageChild = this as AnyComponentInstance;
	const theme = this.getContext(HiddenRootTheme);
	return () => <strong>{theme.name}</strong>;
}

export function RemoteShell(this: Component<{}>, props: { children?: unknown }) {
	remoteShell = this as AnyComponentInstance;
	return () => (
		<section>
			<SharedButton />
			{props.children}
		</section>
	);
}

export function HiddenRootPage(this: Component<{ theme: { name: string } }>) {
	this.state.theme = { name: 'violet' };
	this.setContext(HiddenRootTheme, this.state.theme);
	const child = <PageChild />;
	const remoteClient = hiddenRemoteClient;
	if (!remoteClient) throw new Error('Hidden remote client has not been configured');
	return () => createExactRoot(remoteClient, RemoteShell, undefined, child);
}

export function HiddenRootArea() {
	return () => <p>area</p>;
}

export function resetHiddenRootObservations(): void {
	pageChild = undefined;
	remoteShell = undefined;
	remoteButton = undefined;
	hiddenRemoteClient = undefined;
}

/** Supplies the exact client object without passing it through reactive component props. */
export function configureHiddenRemoteClient(client: ExactClient): void {
	hiddenRemoteClient = client;
}

export function readHiddenRootInstances() {
	if (!pageChild || !remoteShell || !remoteButton)
		throw new Error('Hidden root fixture has not constructed every component');
	return { pageChild, remoteShell, remoteButton };
}
