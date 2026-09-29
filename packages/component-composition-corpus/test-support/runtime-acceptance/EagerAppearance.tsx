import { type Component } from '@exactjs/core';

/** An eager owner with a supported selection handler that must survive delayed adoption. */
export function EagerAppearance(this: Component<{ value: string; changes: number }>) {
	this.state.value = 'system';
	this.state.changes = 0;
	return () => (
		<section onKeyDown={() => {}}>
			<select
				aria-label="Appearance"
				value={this.state.value}
				onChange={(event) => {
					this.state.value = event.currentTarget.value;
					this.state.changes++;
				}}
			>
				<option value="system">System</option>
				<option value="light">Light</option>
				<option value="dark">Dark</option>
			</select>
			<output>
				{this.state.value}:{this.state.changes}
			</output>
		</section>
	);
}

/** @exact server */
export function EagerPage() {
	return () => <EagerAppearance />;
}
