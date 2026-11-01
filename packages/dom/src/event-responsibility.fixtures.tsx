import {
	batch,
	ErrorContext,
	createErrorContext,
	type ErrorReport,
	type Child,
	type Component
} from '@exactjs/core';

/** Input operations whose browser and state effects remain application-owned. */
export type EventAction = 'selection' | 'blur' | 'focus' | 'atomic';

/** Compiler-backed controls for delegated, capture, and native direct delivery. */
export function EventResponsibilityPanel(
	this: Component<{ count: number }>,
	props: { action: EventAction; fail: boolean; errors: ErrorReport[] }
) {
	this.state.count = 0;
	this.setContext(ErrorContext, createErrorContext(props.errors));
	const act = (target: HTMLInputElement) => {
		if (props.action === 'atomic') {
			batch(() => {
				this.state.count++;
				throw new Error('explicit atomic failure');
			});
		} else {
			this.state.count++;
			if (props.action === 'selection') target.setSelectionRange(3, 5);
			if (props.action === 'blur') target.blur();
			if (props.action === 'focus')
				target.parentElement?.querySelector<HTMLInputElement>('[data-focus-target]')?.focus();
			if (props.fail) throw new Error('authored event failure');
		}
	};
	return () => (
		<main>
			<input data-path="delegated" onClick={(event) => act(event.currentTarget)} />
			<input data-path="capture" onClickCapture={(event) => act(event.currentTarget)} />
			<input data-path="direct" onMouseEnter={(event) => act(event.currentTarget)} />
			<InputEventContribution act={act}>
				<input data-path="contribution" />
			</InputEventContribution>
			<input data-focus-target />
			<output>{this.state.count}</output>
		</main>
	);
}

/** Contributes a separate listener owner to the existing semantic input. */
function InputEventContribution(props: { act(target: HTMLInputElement): void; children?: Child }) {
	return () => (
		<_target
			onClick={(event) => {
				if (event.currentTarget instanceof HTMLInputElement) props.act(event.currentTarget);
			}}
		/>
	);
}
