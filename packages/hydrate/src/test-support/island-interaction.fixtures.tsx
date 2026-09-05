import { type Component } from '@exactjs/core';

let clicks = 0;
let submissions = 0;
let inputValue = 'server';
let componentDomain: unknown;
const inputValues: string[] = [];
let focusNotifications = 0;

/** Resets observations shared by compiled interaction-island fixtures. */
export function resetInteractionFixture(): void {
	clicks = 0;
	submissions = 0;
	inputValue = 'server';
	componentDomain = undefined;
	inputValues.length = 0;
	focusNotifications = 0;
}

export const readInteractionClicks = () => clicks;
export const readInteractionSubmissions = () => submissions;
export const readInteractionInputValue = () => inputValue;
export const readInteractionDomain = () => componentDomain;
export const readInteractionInputValues = () => [...inputValues];
export const readFocusNotifications = () => focusNotifications;

/** Click target whose DOM shape matches its server placeholder. */
export function InteractionCounter() {
	return () => (
		<button data-exact-id="counter-button" onClick={() => clicks++}>
			Count
		</button>
	);
}

/** Records the durable component domain selected by the owning hydration client. */
export function DomainCounter(this: Component<{}>) {
	componentDomain = (this as Component<{}> & { domain: unknown }).domain;
	return () => <button data-exact-id="counter-button">Count</button>;
}

/** Input target used to replay the browser-owned latest value. */
export function InteractionInput() {
	return () => (
		<input
			data-exact-id="name"
			value={inputValue}
			onInput={(event) => (inputValue = event.currentTarget.value)}
		/>
	);
}

/** Checkbox target used to preserve the native toggle before replay. */
export function InteractionChoice() {
	return () => (
		<input data-exact-id="choice-box" type="checkbox" checked={false} onClick={() => clicks++} />
	);
}

/** Submit target used to verify one replayed requestSubmit interaction. */
export function InteractionForm() {
	return () => (
		<form
			data-exact-id="profile-form"
			onSubmit={(event) => {
				event.preventDefault();
				submissions++;
			}}
		>
			<button type="submit">Save</button>
		</form>
	);
}

/** Mismatching client target used to force replacement before replay. */
export function ReplacementCounter() {
	return () => (
		<button data-exact-id="counter-button" onClick={() => clicks++}>
			Client
		</button>
	);
}

/** Lazy click target shared by ordered replay coverage. */
export const LazyCounter = InteractionCounter;

/** Lazy input target that records only replayed values. */
export function LazyInput() {
	return () => (
		<input data-exact-id="name" onInput={(event) => inputValues.push(event.currentTarget.value)} />
	);
}

/** Static lazy target used when an unauthorized event must not load it. */
export function LazyStaticCounter() {
	return () => <button>Count</button>;
}

/** Focus target used for notification-only replay. */
export function LazyFocus() {
	return () => <input data-exact-id="focus-input" onFocusIn={() => focusNotifications++} />;
}

/** Empty form target used by bounded submit-queue coverage. */
export function LazyCheckoutForm() {
	return () => <form data-exact-id="checkout" />;
}

/** Lazy click target used after abort or generation replacement. */
export function LazyRelease() {
	return () => (
		<button data-exact-id="release-button" onClick={() => clicks++}>
			Open
		</button>
	);
}
