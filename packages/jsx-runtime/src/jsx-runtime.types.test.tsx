/** @jsxImportSource @exactjs/jsx */
import {
	Activity,
	createComponentRegistry,
	createRef,
	Suspense,
	type Component,
	type RefBinding
} from '@exactjs/core';
import { getCellVNode, isCellVNode } from '@exactjs/core/runtime/render';
import { describe, expect, it } from 'vitest';
import type { JSX } from './jsx-runtime.js';
import { _ } from './jsx-runtime.js';

type LabelProps = {
	text: string;
	children?: JSX.Element;
};

function Label(this: Component<{}>, props: LabelProps) {
	return () => (
		<span className="label">
			{props.text}
			{props.children}
		</span>
	);
}

async function AsyncLabel(this: Component<{ text?: string }>, props: { text: string }) {
	this.state.text = await Promise.resolve(props.text);
	return () => <span>{this.state.text}</span>;
}

const DirectLabel = (props: { text: string }) => <span>{props.text}</span>;

const _defineLabels = () =>
	createComponentRegistry(({ lazy }) => ({
		direct: DirectLabel,
		async: lazy(async () => AsyncLabel)
	}));
const Labels = {
	direct: DirectLabel,
	async: AsyncLabel
} as ReturnType<typeof _defineLabels>;

describe('@exactjs/jsx types', () => {
	it('compiles TSX through the automatic runtime', () => {
		const button = createRef<HTMLButtonElement>('button');
		const ref = {
			current: undefined,
			key: button,
			owner: undefined as never,
			fulfill() {}
		} satisfies RefBinding<HTMLButtonElement>;
		const event: JSX.EventHandler = (mouseEvent) => {
			expect(mouseEvent.type).toBe('click');
		};
		const query = { value: '' };

		const vnode = (
			<section className="panel" className:active={true} data-kind="example">
				<Suspense fallback={<span>Loading</span>}>
					<Activity mode="active">
						<span>Ready</span>
					</Activity>
				</Suspense>
				<Label text="Save">
					<button
						ref={ref}
						disabled={false}
						onClick={event}
						style={{ backgroundColor: 'black', opacity: 1 }}
					>
						Go
					</button>
				</Label>
				<AsyncLabel text="Loaded" />
				<DirectLabel text="Direct" />
				<Labels.direct text="Registry direct" />
				<Labels.async text="Registry async" />
				<input
					value={query.value}
					onInput={(inputEvent) => {
						const currentTarget: HTMLInputElement = inputEvent.currentTarget;
						const nativeEvent: Event = inputEvent;
						query.value = currentTarget.value;
						expect(nativeEvent.type).toBe('input');
						// @ts-expect-error Contextual typing must not widen the input element to any.
						void inputEvent.currentTarget.rows;
					}}
				/>
				<textarea
					onKeyDown={(keyboardEvent) => {
						const currentTarget: HTMLTextAreaElement = keyboardEvent.currentTarget;
						const nativeEvent: KeyboardEvent = keyboardEvent;
						expect(currentTarget.value).toBe(query.value);
						expect(nativeEvent.key).toBeDefined();
					}}
				/>
				<_ key="tail">tail</_>
			</section>
		);

		expect(isCellVNode(vnode)).toBe(true);
		if (!isCellVNode(vnode)) throw new Error('Expected cell vnode');
		const inner = getCellVNode(vnode);
		expect(inner.type).toBe('section');
		expect(inner.children).toHaveLength(9);
	});
});
