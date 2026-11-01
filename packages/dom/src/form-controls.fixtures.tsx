import type { Component } from '@exactjs/core';

let statusSelect: Component<{ status: 'todo' | 'doing' | 'done' }> | undefined;

/** Compiler-backed controlled select fixture. */
export function CompiledStatusSelect(this: Component<{ status: 'todo' | 'doing' | 'done' }>) {
	statusSelect = this;
	this.state.status = 'done';
	return () => (
		<select value={this.state.status}>
			<option value="todo">To do</option>
			<option value="doing">Doing</option>
			<option value="done">Done</option>
		</select>
	);
}

/** Reads the mounted controlled select fixture. */
export function compiledStatusSelectInstance() {
	if (!statusSelect) throw new Error('CompiledStatusSelect is not mounted');
	return statusSelect;
}

let implicitSelect: Component<{ option: string }> | undefined;

/** Retains a controlled select while compiler-owned text changes its option's implicit value. */
export function CompiledImplicitSelect(this: Component<{ option: string }>) {
	implicitSelect = this;
	this.state.option = 'dark';
	return () => (
		<select value="dark">
			<option>{this.state.option}</option>
		</select>
	);
}

/** Reads the live implicit-option fixture for state transitions and disposal observations. */
export function compiledImplicitSelectInstance() {
	if (!implicitSelect) throw new Error('CompiledImplicitSelect is not mounted');
	return implicitSelect;
}
