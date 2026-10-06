import type { Child, Component } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';

/** Contributes changing props while retaining the caller-owned semantic child. */
function AttributeContribution(props: { step: number; children?: Child }) {
	return () => (
		<_target
			title={'value ' + props.step}
			className={'phase-' + props.step}
			style={{ color: props.step % 2 ? 'blue' : 'red' }}
			aria-describedby={'phase-' + props.step}
			disabled={props.step % 2 === 1}
		/>
	);
}

/** Retains authored root props separately from changing SSR and client target contributions. */
export function TargetAttributeOwnershipProbe(this: Component<{ step: number }>) {
	this.state.step = 0;
	return () => (
		<section data-target-attribute-ownership>
			<button data-target-advance onClick={() => this.state.step++}>
				Next
			</button>
			<AttributeContribution step={this.state.step}>
				<button
					data-target-owned
					className="authored"
					style={{ border: '1px solid black' }}
					aria-describedby="authored-description"
				>
					Child
				</button>
			</AttributeContribution>
			<AttributeContribution step={this.state.step}>
				<button data-target-fixed title="fixed">
					Fixed
				</button>
			</AttributeContribution>
		</section>
	);
}

/** Compiler-owned root shared by mount and hydration corpus journeys. */
export function targetAttributeOwnership() {
	return createCompiledComponentReceipt(TargetAttributeOwnershipProbe, {});
}
