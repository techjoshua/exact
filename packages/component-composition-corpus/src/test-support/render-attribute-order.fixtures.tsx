import { TaskContext, stageTaskMutation, taskAwait, type Component } from '@exactjs/core';
import { ConditionalClassKeys } from './conditional-class-keys.fixtures.js';
import { MutableEventHandlers } from './event-argument-ownership.fixtures.js';
import { NativeMathProperties } from './native-mathml-properties.fixtures.js';

type AttributeBag = { title?: string; id?: string };
type InputBag = { required?: boolean; maxLength?: number; className?: string };
/** Exposes the durable owner for retained property-group updates. */
export let attributeOrderOwner: Component<{
	bag: AttributeBag;
	inputBag: InputBag;
	generation: string;
}>;

function TextSpread(props: { bag: AttributeBag }) {
	return () => <span {...props.bag}>text</span>;
}

function TextScalar(props: { bag: AttributeBag }) {
	return () => (
		<span className="static" title={props.bag.title}>
			<button onClick={() => {}}>text</button>
		</span>
	);
}

/** Shares native attribute precedence and reconciled spread behavior across acceptance environments. */
export function AttributeOrder(
	this: Component<{ bag: AttributeBag; inputBag: InputBag; generation: string }>
) {
	attributeOrderOwner = this;
	this.state.bag = { title: 'spread', id: 'spread-id' };
	this.state.inputBag = { required: false, maxLength: 2, className: 'spread' };
	this.state.generation = 'waiting';
	const publish = async (task: TaskContext = TaskContext.client().blocking()) => {
		await taskAwait(task.signal, Promise.resolve());
		stageTaskMutation(task.signal, () => {
			this.state.generation = 'published';
		});
	};
	return () => (
		<section data-attribute-order>
			<button
				data-aria-state
				aria-pressed={this.state.bag.title === 'updated'}
				aria-expanded={this.state.bag.title === 'updated'}
				data-selected={this.state.bag.title === 'updated'}
			>
				ARIA state
			</button>
			<ConditionalClassKeys />
			<MutableEventHandlers />
			<NativeMathProperties />
			<div {...this.state.bag} title="fixed" id="fixed-id" data-attribute-fixed />
			<div title="fixed" id="fixed-id" {...this.state.bag} data-attribute-spread />
			<input
				{...this.state.inputBag}
				required
				maxLength={4}
				className="fixed"
				data-attribute-fixed-input
			/>
			<input
				required
				maxLength={4}
				className="fixed"
				{...this.state.inputBag}
				data-attribute-spread-input
			/>
			<output data-generation-state>{this.state.generation}</output>
			<button data-generation-step onClick={() => publish()}>
				Publish
			</button>
			<output title={(() => this.state.bag.title)()}>{this.state.bag.title}</output>
			<textarea data-text-direct>
				<span {...this.state.bag}>text</span>
			</textarea>
			<textarea data-text-compiled>
				<TextSpread bag={this.state.bag} />
			</textarea>
			<textarea data-text-scalar>
				<TextScalar bag={this.state.bag} />
			</textarea>
			<textarea data-text-fragment>
				<>
					<span {...this.state.bag}>text</span>
				</>
			</textarea>
			<button
				data-attribute-step
				onClick={() => {
					this.state.bag =
						this.state.bag.title === 'updated'
							? { title: 'restored', id: 'restored-id' }
							: { title: 'updated' };
					this.state.inputBag =
						this.state.bag.title === 'updated'
							? {}
							: { required: false, maxLength: 2, className: 'spread' };
				}}
			>
				Next
			</button>
		</section>
	);
}

/** Exercises authored literal and spread precedence in one finite intrinsic program. */
export const attributeOrderRoot = () => <AttributeOrder />;
