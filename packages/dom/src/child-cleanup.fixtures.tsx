import type { Component } from '@exactjs/core';

type BranchState = { show: boolean; label: string };

let styleObject: Component<{ compact: boolean }> | undefined;
let listBranch: Component<{ show: boolean; items: { id: string; label: string }[] }> | undefined;
let dynamicBranch: Component<BranchState> | undefined;
let styleBranch: Component<{ show: boolean; color: string }> | undefined;
let propBranch: Component<BranchState> | undefined;
let textBranch: Component<BranchState> | undefined;

/** Compiler-backed whole-style-object replacement fixture. */
export function StyleObjectCleanup(this: Component<{ compact: boolean }>) {
	styleObject = this;
	this.state.compact = true;
	return () => (
		<div style={this.state.compact ? { color: 'red', paddingTop: '4px' } : { color: 'blue' }} />
	);
}

/** Reads the style-object cleanup fixture instance. */
export function styleObjectCleanupInstance() {
	if (!styleObject) throw new Error('StyleObjectCleanup is not mounted');
	return styleObject;
}

/** Compiler-backed conditional keyed-list lifetime fixture. */
export function ListBranchCleanup(
	this: Component<{ show: boolean; items: { id: string; label: string }[] }>
) {
	listBranch = this;
	this.state.show = true;
	this.state.items = [
		{ id: 'a', label: 'A' },
		{ id: 'b', label: 'B' }
	];
	return () =>
		this.state.show ? (
			<section>
				{this.map(
					this.state.items,
					(item) => item.id,
					(item) => (
						<span>{item.label}</span>
					)
				)}
			</section>
		) : (
			<section>empty</section>
		);
}

/** Reads the conditional list fixture instance. */
export function listBranchCleanupInstance() {
	if (!listBranch) throw new Error('ListBranchCleanup is not mounted');
	return listBranch;
}

/** Compiler-backed dynamic child lifetime fixture. */
export function DynamicBranchCleanup(this: Component<BranchState>) {
	dynamicBranch = this;
	this.state.show = true;
	this.state.label = 'visible';
	return () =>
		this.state.show ? (
			<section>
				<span>{this.state.label}</span>
			</section>
		) : (
			<section>hidden</section>
		);
}

/** Reads the dynamic child fixture instance. */
export function dynamicBranchCleanupInstance() {
	if (!dynamicBranch) throw new Error('DynamicBranchCleanup is not mounted');
	return dynamicBranch;
}

/** Compiler-backed removed style binding fixture. */
export function StyleBranchCleanup(this: Component<{ show: boolean; color: string }>) {
	styleBranch = this;
	this.state.show = true;
	this.state.color = 'red';
	return () =>
		this.state.show ? (
			<section>
				<span style={{ color: this.state.color }}>styled</span>
			</section>
		) : (
			<section>gone</section>
		);
}

/** Reads the removed style binding fixture instance. */
export function styleBranchCleanupInstance() {
	if (!styleBranch) throw new Error('StyleBranchCleanup is not mounted');
	return styleBranch;
}

/** Compiler-backed removed property binding fixture. */
export function PropBranchCleanup(this: Component<BranchState>) {
	propBranch = this;
	this.state.show = true;
	this.state.label = 'ready';
	return () =>
		this.state.show ? (
			<section>
				<button title={this.state.label}>Action</button>
			</section>
		) : (
			<section>gone</section>
		);
}

/** Reads the removed property binding fixture instance. */
export function propBranchCleanupInstance() {
	if (!propBranch) throw new Error('PropBranchCleanup is not mounted');
	return propBranch;
}

/** Compiler-backed removed text binding fixture. */
export function TextBranchCleanup(this: Component<BranchState>) {
	textBranch = this;
	this.state.show = true;
	this.state.label = 'ready';
	return () =>
		this.state.show ? (
			<section>
				<span>{this.state.label}</span>
			</section>
		) : (
			<section>gone</section>
		);
}

/** Reads the removed text binding fixture instance. */
export function textBranchCleanupInstance() {
	if (!textBranch) throw new Error('TextBranchCleanup is not mounted');
	return textBranch;
}
