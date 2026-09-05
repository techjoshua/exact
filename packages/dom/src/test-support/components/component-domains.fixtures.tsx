import {
	createContext,
	currentComponentDomain,
	withComponentDomain,
	type Child,
	type Component,
	type ComponentDomain,
	type ComponentInstance
} from '@exactjs/core';
import { createCompiledDynamicComponent } from '@exactjs/core/runtime/dynamic-components';

export const DomainTone = createContext<{ name: string }>('@test/cross-root-tone');

let pageChild: Component<{ showDescendant: boolean }> | undefined;
let ownedPanel: Component<{}> | undefined;

/** Compiler-backed component that exposes the domain selected for its receipt. */
export function DomainButton() {
	const executionRoot = currentComponentDomain()!.executionRoot;
	return () => <button>{executionRoot}</button>;
}

/** Emits two children carrying independently selected component domains. */
export function DomainButtonHost(props: { page: ComponentDomain; remote: ComponentDomain }) {
	return () => (
		<section>
			{withComponentDomain(props.page, () => (
				<DomainButton />
			))}
			{withComponentDomain(props.remote, () => (
				<DomainButton />
			))}
		</section>
	);
}

/** Compiler-backed domain replacement fixture. */
export function DomainArea(this: Component<{}>, props: { onUnmount(): void }) {
	this.onUnmount(props.onUnmount);
	const executionRoot = currentComponentDomain()!.executionRoot;
	return () => <span>{executionRoot}</span>;
}

function DomainDescendant(this: Component<{}>) {
	const current = this.getContext(DomainTone);
	return () => <i>{current.name}</i>;
}

/** Page-owned child retained while its remote shell is replaced. */
export function DomainPageChild(
	this: Component<{ showDescendant: boolean }>,
	props: { onMount(): void; onUnmount(): void }
) {
	pageChild = this;
	this.state.showDescendant = false;
	const captured = this.getContext(DomainTone);
	this.onMount(props.onMount);
	this.onUnmount(props.onUnmount);
	return () => (
		<strong>
			{captured.name}
			{this.state.showDescendant ? <DomainDescendant /> : null}
		</strong>
	);
}

/** Remote shell that receives a page-domain child as an opaque input. */
export function DomainShell(this: Component<{}>, props: { tone: string; children?: Child }) {
	this.setContext(DomainTone, { name: props.tone });
	return () => <section>{props.children}</section>;
}

/** Reads the retained page child fixture. */
export function domainPageChildInstance(): ComponentInstance<{ showDescendant: boolean }> {
	if (!pageChild) throw new Error('DomainPageChild is not mounted');
	return pageChild as ComponentInstance<{ showDescendant: boolean }>;
}

/** Compiler-backed ownership fixture. */
export function DomainOwnedPanel(this: Component<{}>) {
	ownedPanel = this;
	return () => (
		<section>
			<button>
				<span>Save</span>
			</button>
		</section>
	);
}

/** Reads the ownership fixture instance. */
export function domainOwnedPanelInstance() {
	if (!ownedPanel) throw new Error('DomainOwnedPanel is not mounted');
	return ownedPanel;
}

/** Compiler-backed root-prop update fixture. */
export function DomainInspectedPanel(props: { label: string }) {
	return () => <button>{props.label}</button>;
}

/** Compiler-backed target inspection fixture. */
export function DomainInspectionField() {
	return () => (
		<_target title="contributed" className="layer">
			<button className="authored">Inspect</button>
		</_target>
	);
}

/** Compiler-backed dynamic inspection leaf. */
export function DomainDynamicPanel() {
	return () => <p>dynamic</p>;
}

/** Compiler-backed dynamic inspection host. */
export function DomainDynamicHost() {
	const boundary = createCompiledDynamicComponent({
		id: 'fixture:dynamic-inspection',
		source: () => DomainDynamicPanel,
		props: { label: 'visible' }
	});
	return () => boundary;
}
