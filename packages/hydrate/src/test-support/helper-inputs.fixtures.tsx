import type { Component } from '@exactjs/core';

function view(value: string, flag: boolean, state: { clicks: number }, click: () => void) {
	return (
		<button className="helper-child" onClick={click}>
			{value}:{String(flag)}:{state.clicks}
		</button>
	);
}

function nested(value: string, flag: boolean, state: { clicks: number }, click: () => void) {
	return <section>{view(value, flag, state, click)}</section>;
}

function ScalarChild(this: Component<{ clicks: number }>, props: { value: string; flag: boolean }) {
	this.state.clicks = 0;
	return () => view(props.value, props.flag, this.state, () => this.state.clicks++);
}

function NestedChild(this: Component<{ clicks: number }>, props: { value: string; flag: boolean }) {
	this.state.clicks = 0;
	return () => nested(props.value, props.flag, this.state, () => this.state.clicks++);
}

function ObjectChild(this: Component<{}>, props: { value: string; flag: boolean }) {
	return () => objectView(props);
}

function objectView(props: { value: string; flag: boolean }) {
	return (
		<output>
			{props.value}:{String(props.flag)}
		</output>
	);
}

/** Exercises helper argument snapshots and live object forwarding in durable child instances. */
export function HelperInputs(this: Component<{ value: string; flag: boolean; unrelated: number }>) {
	this.state.value = 'A';
	this.state.flag = false;
	this.state.unrelated = 0;
	return () => (
		<main>
			<button id="value" onClick={() => (this.state.value = 'B')}>
				value
			</button>
			<button id="flag" onClick={() => (this.state.flag = !this.state.flag)}>
				flag
			</button>
			<button id="unrelated" onClick={() => this.state.unrelated++}>
				{this.state.unrelated}
			</button>
			<ScalarChild value={this.state.value} flag={this.state.flag} />
			<NestedChild value={this.state.value} flag={this.state.flag} />
			<ObjectChild value={this.state.value} flag={this.state.flag} />
		</main>
	);
}

/** Shared root for mounting and server adoption. */
export const helperInputs = <HelperInputs />;
