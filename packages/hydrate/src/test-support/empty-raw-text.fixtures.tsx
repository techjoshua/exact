import type { Component } from '@exactjs/core';
import { createCompiledIntrinsicReceipt } from '@exactjs/core/runtime/component-abi';

function EmptyRawText(this: Component<{ active: boolean }>, props: { tag: 'style' | 'script' }) {
	this.state.active = false;
	return () => (
		<section>
			{createCompiledIntrinsicReceipt(
				props.tag,
				{ type: props.tag === 'script' ? 'application/json' : undefined },
				this.state.active ? (props.tag === 'style' ? 'p{color:red}' : '{"active":true}') : ''
			)}
			<input value="Original" />
			<button
				onclick={() => {
					this.state.active = !this.state.active;
				}}
			>
				Toggle
			</button>
		</section>
	);
}

/** Raw-text receipts exercise parser-elided empty anchors without a theme dependency. */
export const emptyRawTextRoot = (tag: 'style' | 'script') => <EmptyRawText tag={tag} />;
