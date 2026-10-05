import { type Component } from '@exactjs/core';

/** Exercises conversion and disclosure ownership through shared compiled control paths. */
export function FormBindingProbe(
	this: Component<{
		number: number | null;
		choice: number;
		label: string;
		numbers: number[] | null;
		labels: string[] | undefined;
		expanded: boolean;
		modal: boolean;
	}>,
	props: { modal?: boolean }
) {
	this.state.number = 2;
	this.state.choice = 2;
	this.state.label = '2';
	this.state.numbers = [2];
	this.state.labels = ['2'];
	this.state.expanded = false;
	this.state.modal = false;
	return () => (
		<section id="form-binding-probe">
			<input id="form-number-text" type="text" value:onInput={this.state.number} />
			<input id="form-number-native" type="number" value:onInput={this.state.number} />
			<input
				id="form-radio-two"
				type="radio"
				name="form-choice"
				value="2"
				checked:onChange={this.state.choice}
			/>
			<input
				id="form-radio-three"
				type="radio"
				name="form-choice"
				value={3}
				checked:onChange={this.state.choice}
			/>
			<input
				id="form-label-two"
				type="radio"
				name="form-label"
				value={2}
				checked:onChange={this.state.label}
			/>
			<input
				id="form-label-three"
				type="radio"
				name="form-label"
				value={3}
				checked:onChange={this.state.label}
			/>
			<input
				id="form-group-number"
				type="checkbox"
				value="2"
				checked:onChange={this.state.numbers}
			/>
			<input id="form-group-label" type="checkbox" value={2} checked:onChange={this.state.labels} />
			<select id="form-label-select" multiple value:onChange={this.state.labels}>
				<option value={2}>Two</option>
				<option value="3">Three</option>
			</select>
			<details id="form-disclosure" open:onToggle={this.state.expanded}>
				<summary>Expand</summary>Contents
			</details>
			{props.modal && (
				<dialog id="form-modal" modal:isOpen={this.state.modal}>
					Settings
				</dialog>
			)}
			<button id="form-modal-toggle" onClick={() => (this.state.modal = !this.state.modal)}>
				Toggle modal
			</button>
			<button
				id="form-binding-reset"
				onClick={() => {
					this.state.number = 2;
					this.state.choice = 2;
					this.state.label = '2';
					this.state.numbers = [2];
					this.state.labels = ['2'];
					this.state.expanded = false;
				}}
			>
				Reset
			</button>
			<output id="form-binding-result">
				{[
					String(this.state.number),
					this.state.choice,
					this.state.label,
					String(JSON.stringify(this.state.numbers)),
					String(JSON.stringify(this.state.labels)),
					String(this.state.expanded)
				].join('|')}
			</output>
		</section>
	);
}
