import { TaskContext, type Component } from '@exactjs/core';

type Model = { count: number };
type Recorder = (label: string) => void;
type Form = 'alias' | 'shadow' | 'extracted' | 'higher-order';
type Controls = {
	form: Form;
	record: Recorder;
	wait(signal: AbortSignal): Promise<void>;
	removed(): void;
};

function advance(model: Model, step: number, record: Recorder) {
	record('helper');
	return (model.count += step);
}

const originalAdvance = advance;
const service = {
	step: 2,
	advance(model: Model, record: Recorder) {
		if (this !== service) throw new Error('Helper receiver changed');
		return originalAdvance(model, this.step, record);
	}
};

function createAdvancer(record: Recorder) {
	record('factory');
	return (model: Model) => originalAdvance(model, 2, record);
}

/** Exercises ordinary callable selection inside a component-owned blocking task. */
export function HelperCallSelectionProbe(
	this: Component<{ count: number; result: number }>,
	props: Controls
) {
	this.state.count = 0;
	this.state.result = 0;
	this.onUnmount(() => props.removed());
	const run = async (task: TaskContext = TaskContext.client().latest().blocking()) => {
		let result: number;
		if (props.form === 'alias') {
			const selected = advance;
			if (
				selected !== originalAdvance ||
				selected.name !== 'advance' ||
				selected.length !== 3 ||
				selected.prototype.constructor !== selected
			)
				throw new Error('Ordinary function metadata changed');
			result = selected((props.record('argument'), this.state), 2, props.record);
		} else if (props.form === 'shadow') {
			const advance = (model: Model) => originalAdvance(model, 2, props.record);
			if (advance.name !== 'advance' || advance.length !== 1 || Object.hasOwn(advance, 'prototype'))
				throw new Error('Arrow metadata changed');
			result = advance((props.record('argument'), this.state));
		} else if (props.form === 'extracted') {
			const selected = service.advance;
			if (
				selected !== service.advance ||
				selected.name !== 'advance' ||
				selected.length !== 2 ||
				Object.hasOwn(selected, 'prototype')
			)
				throw new Error('Extracted method metadata changed');
			result = selected.call(
				(props.record('receiver'), service),
				(props.record('argument'), this.state),
				props.record
			);
		} else {
			const selected = createAdvancer(props.record);
			if (selected.name !== '' || selected.length !== 1 || Object.hasOwn(selected, 'prototype'))
				throw new Error('Returned arrow metadata changed');
			result = selected((props.record('argument'), this.state));
		}
		this.state.result = result;
		await props.wait(task.signal);
	};
	return () => (
		<section>
			<button onClick={() => run()}>Run</button>
			<output>
				{this.state.count}:{this.state.result}
			</output>
		</section>
	);
}

/** Supplies the same component boundary for client mounting and paired hydration. */
export function helperCallSelectionRoot(props: Controls) {
	return <HelperCallSelectionProbe {...props} />;
}
