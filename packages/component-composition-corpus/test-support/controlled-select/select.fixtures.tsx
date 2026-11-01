import { createContext, peek, type Child, type Component } from '@exactjs/core';
import { _ } from '@exactjs/jsx';
const Context = createContext<{ readonly value: 'system' | 'light' | 'dark' }>('probe-value');
/** Compiled select control with an ordinary context or physical target boundary. */
export function Scope(
	this: Component<{ value: 'system' | 'light' | 'dark' }>,
	props: { value: 'system' | 'light' | 'dark'; children?: Child }
) {
	this.state.value = peek(() => props.value);
	const state = this.state;
	this.setContext(Context, {
		get value() {
			return state.value;
		}
	});
	return () => (
		<_ theme:scope theme:appearance={this.state.value}>
			<section data-value={this.state.value}>{props.children}</section>
		</_>
	);
}
/** Compiled select control with an ordinary context or physical target boundary. */
export function Control(this: Component<object>) {
	const control = this.getContext(Context);
	return () => (
		<select theme:field aria-label="Context choice" value={control.value}>
			<option value="system">System</option>
			<option value="light">Light</option>
			<option value="dark">Dark</option>
		</select>
	);
}
/** Compiled select control with an ordinary context or physical target boundary. */
export function ContextProbe(props: { value: 'system' | 'light' | 'dark' }) {
	return () => (
		<Scope value={props.value}>
			<Control />
		</Scope>
	);
}

/** Compiled select control with an ordinary context or physical target boundary. */
export function ThemedDirect(props: { value: 'system' | 'light' | 'dark' }) {
	return () => (
		<_ theme:scope theme:appearance="dark">
			<select theme:field aria-label="Direct" value={props.value}>
				<option value="system">System</option>
				<option value="dark">Dark</option>
			</select>
		</_>
	);
}
/** Compiled select control with an ordinary context or physical target boundary. */
export function ScopeOnly(props: { value: 'system' | 'light' | 'dark' }) {
	return () => (
		<_ theme:scope theme:appearance="dark">
			<select aria-label="Scope only" value={props.value}>
				<option value="system">System</option>
				<option value="dark">Dark</option>
			</select>
		</_>
	);
}

/** Direct program control for initial option placement. */
export function Probe(props: { value: string }) {
	return () => (
		<select aria-label="Choice" value={props.value}>
			<option value="system">System</option>
			<option value="light">Light</option>
			<option value="dark">Dark</option>
		</select>
	);
}

/** Literal controlled values use the same property and server selection contract. */
export function Literal() {
	return () => (
		<select value="dark">
			<option>system</option>
			<option>dark</option>
		</select>
	);
}
/** Multiple selection reaches nested options before initial and hydrated observation. */
export function Multiple() {
	return () => (
		<select multiple value={['light', 'dark']}>
			<optgroup label="Choices">
				<option value="system">System</option>
				<option value="light">Light</option>
				<option value="dark">Dark</option>
			</optgroup>
		</select>
	);
}
