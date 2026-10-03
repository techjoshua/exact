import { reactive } from '@exactjs/reactive';
import { createCompiledIntrinsicReceipt } from '@exactjs/core/runtime/component-operations';
import { createCompiledChildRangeReceipt } from '@exactjs/core/runtime/render-operations';
import type { Child } from '@exactjs/core';
import { createExpression } from '@exactjs/core/runtime/render';
import type { Component } from '@exactjs/core';

export let scalarOwner: Component<{ values: (string | number | null | boolean)[] }>;

/** Supplies dynamic scalar arrays through the ordinary compiler-owned child range. */
export function ScalarArrayPage(
	this: Component<{ values: (string | number | null | boolean)[] }>,
	props: { initial: (string | number | null | boolean)[] }
) {
	scalarOwner = this;
	this.state.values = [...props.initial];
	return () => <p>{this.state.values}</p>;
}

/** Places independent scalar bindings inside a generic array rather than a closed text program. */
export function MixedScalarPage(this: Component<{ first: string; last: string }>) {
	this.state.first = 'a';
	this.state.last = 'b';
	return () => <p>{[this.state.first, ' / ', <b>opaque</b>, this.state.last, '!']}</p>;
}

export const bindingState = reactive({ first: '', last: '' });
const bindingFirst = createExpression(() => bindingState.first);
const bindingLast = createExpression(() => bindingState.last);
/** Supplies independent external reactive values without compiling their helper implementation. */
export function ScalarBindingsPage(this: Component<{}>) {
	return () => <p>{[bindingFirst, bindingLast]}</p>;
}

export let clickOwner: Component<{ values: string[]; step: number }>;
/** Combines a generic scalar range with a direct scalar update lane and authored interaction. */
export function ScalarClickPage(this: Component<{ values: string[]; step: number }>) {
	clickOwner = this;
	this.state.values = ['a', ' / ', 'b'];
	this.state.step = 0;
	return () => (
		<section>
			<p>{this.state.values}</p>
			<button
				onClick={() => {
					this.state.step++;
					this.state.values = this.state.step === 1 ? ['next', '!'] : [];
				}}
			>
				Change
			</button>
			<output>{this.state.step}</output>
		</section>
	);
}

/** Supplies a generic intrinsic range through an unchanged ordinary helper. */
function scalarRange(read: () => Child): Child {
	return createCompiledIntrinsicReceipt('p', {}, createCompiledChildRangeReceipt(read));
}
export let genericOwner: Component<{ values: string[] }>;
/** Exercises compiler-emitted writes against the generic child-range comparison path. */
export function GenericScalarClickPage(this: Component<{ values: string[] }>) {
	genericOwner = this;
	this.state.values = ['a', 'b'];
	return () => (
		<section>
			{scalarRange(() => this.state.values)}
			<button
				onClick={() => {
					this.state.values = ['next', '!'];
				}}
			>
				Change
			</button>
		</section>
	);
}
