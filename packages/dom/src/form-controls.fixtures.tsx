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
