import type { Component } from '@exactjs/core';

function Child(
	this: Component<{ clicks: number }>,
	{ value: label = 'fallback', flag }: { value?: string; flag: boolean }
) {
	this.state.clicks = 0;
	return () => (
		<button id="child" onClick={() => this.state.clicks++}>
			{label}:{String(flag)}:{this.state.clicks}
		</button>
	);
}

/** Exercises independently updated destructured props while retaining child state. */
export function DestructuredParent(this: Component<{ value: string | undefined; flag: boolean }>) {
	this.state.value = 'A';
	this.state.flag = false;
	return () => (
		<main>
			<button id="flag" onClick={() => (this.state.flag = !this.state.flag)}>
				flag
			</button>
			<button
				id="value"
				onClick={() => (this.state.value = this.state.value === 'A' ? 'B' : undefined)}
			>
				value
			</button>
			<Child value={this.state.value} flag={this.state.flag} />
		</main>
	);
}

/** Application root used by both target builds. */
export const destructuredRoot = <DestructuredParent />;

async function AsyncDestructured(
	this: Component<{ label: string }>,
	{ value: label = 'fallback' }: { value?: string }
) {
	this.state.label = await Promise.resolve(label);
	return () => <output>{this.state.label}</output>;
}

async function AsyncDestructuredMember(
	this: Component<{ label: string }>,
	{ item }: { item: { label: string } }
) {
	this.state.label = await Promise.resolve(item.label);
	return () => <output>{this.state.label}</output>;
}

/** Exercises normalized props aliases as inputs to inferred server initialization. */
export const asyncDestructuredRoot = (
	<main>
		<AsyncDestructured value="A" />
		<AsyncDestructured />
		<AsyncDestructuredMember item={{ label: 'member' }} />
	</main>
);
