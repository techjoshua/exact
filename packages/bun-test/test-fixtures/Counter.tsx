import type { Component } from '@exactjs/core';

export function Counter(this: Component<{ count: number }>) {
	this.state.count = 0;
	return () => <button onClick={() => this.state.count++}>Count: {this.state.count}</button>;
}
