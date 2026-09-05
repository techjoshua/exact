import { ErrorContext, type Component, type ErrorContextValue } from '@exactjs/core';

let panelErrors: ErrorContextValue | undefined;
let firstErrors: ErrorContextValue | undefined;
let secondErrors: ErrorContextValue | undefined;

/** Compiler-backed root error fixture. */
export function RootErrorPanel(this: Component<{}>) {
	panelErrors = this.getContext(ErrorContext);
	return () => (
		<button
			onClick={() => {
				throw new Error('root failed');
			}}
		>
			Break
		</button>
	);
}

/** Reads the root error context captured by RootErrorPanel. */
export function rootErrorContext() {
	if (!panelErrors) throw new Error('RootErrorPanel is not mounted');
	return panelErrors;
}

/** Compiler-backed first isolated root fixture. */
export function FirstErrorRoot(this: Component<{}>) {
	firstErrors = this.getContext(ErrorContext);
	return () => (
		<button
			onClick={() => {
				throw new Error('first failed');
			}}
		>
			First
		</button>
	);
}

/** Compiler-backed second isolated root fixture. */
export function SecondErrorRoot(this: Component<{}>) {
	secondErrors = this.getContext(ErrorContext);
	return () => <p>Second ok</p>;
}

/** Reads the two isolated root error contexts. */
export function isolatedRootErrorContexts() {
	if (!firstErrors || !secondErrors) throw new Error('Both isolated error roots must be mounted');
	return [firstErrors, secondErrors] as const;
}
