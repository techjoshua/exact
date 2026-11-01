import { type Component } from '@exactjs/core';
const key: unique symbol = Symbol('x');
/** @exact client */ export function Probe(this: Component<{ [key]: number }>) {
	this.state[key] = 0;
	return () => <button onClick={() => this.state[key]++} />;
}
