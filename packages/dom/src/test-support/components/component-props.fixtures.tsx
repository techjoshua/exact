import type { Child, Component } from '@exactjs/core';

type Item = { id: string; status: 'open' | 'done' };

let filteredParent: Component<{ items: Item[] }> | undefined;
let primitiveParent: Component<{ message: string }> | undefined;
let structuralParent: Component<{ mode: 'one' | 'two' }> | undefined;
let controlParent: Component<{ expanded: boolean }> | undefined;

function FilteredColumn(props: { items: Item[] }) {
	return () => (
		<section>
			<span>{props.items.length}</span>
			<ul>
				{props.items.map((item) => (
					<li key={item.id}>{item.id}</li>
				))}
			</ul>
		</section>
	);
}

/** Compiled parent-to-child filtered collection receipt fixture. */
export function FilteredPropParent(this: Component<{ items: Item[] }>) {
	filteredParent = this;
	this.state.items = [
		{ id: 'a', status: 'open' },
		{ id: 'b', status: 'done' }
	];
	return () => <FilteredColumn items={this.state.items.filter((item) => item.status === 'open')} />;
}

/** Reads the filtered prop fixture instance. */
export function filteredPropParentInstance() {
	if (!filteredParent) throw new Error('Filtered prop fixture has not been mounted');
	return filteredParent;
}

function ChildrenWrapper(props: { children?: Child | Child[] }) {
	return () => <section>{props.children}</section>;
}

/** Compiled primitive props.children receipt fixture. */
export function PrimitiveChildrenParent(this: Component<{ message: string }>) {
	primitiveParent = this;
	this.state.message = 'Hello';
	return () => <ChildrenWrapper>{this.state.message}</ChildrenWrapper>;
}

/** Reads the primitive child fixture instance. */
export function primitiveChildrenParentInstance() {
	if (!primitiveParent) throw new Error('Primitive child fixture has not been mounted');
	return primitiveParent;
}

function One() {
	return () => <span>one</span>;
}

function Two() {
	return () => <strong>two</strong>;
}

/** Compiled structural props.children receipt fixture. */
export function StructuralChildrenParent(this: Component<{ mode: 'one' | 'two' }>) {
	structuralParent = this;
	this.state.mode = 'one';
	return () => <ChildrenWrapper>{this.state.mode === 'one' ? <One /> : <Two />}</ChildrenWrapper>;
}

/** Reads the structural child fixture instance. */
export function structuralChildrenParentInstance() {
	if (!structuralParent) throw new Error('Structural child fixture has not been mounted');
	return structuralParent;
}

function ControlChild(props: { expanded: boolean }) {
	return () => (props.expanded ? <strong>Full</strong> : <span>Compact</span>);
}

/** Compiled child-control-flow prop receipt fixture. */
export function ControlFlowParent(this: Component<{ expanded: boolean }>) {
	controlParent = this;
	this.state.expanded = false;
	return () => <ControlChild expanded={this.state.expanded} />;
}

/** Reads the control-flow fixture instance. */
export function controlFlowParentInstance() {
	if (!controlParent) throw new Error('Control-flow fixture has not been mounted');
	return controlParent;
}
