import type { Component } from '@exactjs/core';

/** Tracks the state owned by profile. */
export type ProfileState = {
	saves: number;
	status: string;
};

/** Demonstrates a component with server task state and client-side interaction. */
export function ProfilePage(this: Component<ProfileState>, props: { name: string }) {
	this.state.saves = 0;
	this.state.status = 'Loaded on the server';

	this.task.server(async () => {
		await Promise.resolve();
		this.state.status = `Ready for ${props.name}`;
	});

	return () => (
		<section>
			<p>{this.state.status}</p>
			<button onClick={() => this.state.saves++}>Saved {this.state.saves} times</button>
		</section>
	);
}
