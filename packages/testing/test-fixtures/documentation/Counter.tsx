import type { Component } from '@exactjs/core';

/** A small component shared by the testing guide and installed-runner acceptance. */
export function Counter(this: Component<{ count: number }, { initial: number }>) {
	this.state.count = this.props.initial;
	return () => <button onClick={() => this.state.count++}>Count: {this.state.count}</button>;
}
