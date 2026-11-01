type BoundedHydrationApi = Pick<
	typeof import('../../react-dom-compat/src/renderer/root.js'),
	| 'createReactRendererRoot'
	| 'createReactRendererRangeRoot'
	| 'hydrateReactRangeRoot'
	| 'disposeReactRoot'
	| 'renderReactRoot'
> &
	Pick<typeof import('@exactjs/react-compat'), 'createElement' | 'Fragment'>;

/** Checks native-owned hydration delimiters, retained text, empty ranges and foreign sibling ownership. */
export function verifyReactBoundedHydration(api: BoundedHydrationApi, document: Document): void {
	const check = (value: boolean, message: string) => {
		if (!value) throw new Error('React bounded hydration: ' + message);
	};
	for (const mode of ['text', 'fragment', 'empty'] as const) {
		const container = document.createElement('div');
		container.innerHTML =
			'<i>left</i><!--start-->' + (mode === 'empty' ? '' : 'a<!-- -->b') + '<!--end--><b>right</b>';
		const left = container.firstChild!;
		const start = container.childNodes[1]!;
		const right = container.lastChild!;
		const end = right.previousSibling!;
		const text = [...container.childNodes].filter((node) => node.nodeType === 3);
		const owner = api.createReactRendererRoot(container);
		const root = api.createReactRendererRangeRoot(
			container,
			end,
			owner.contexts,
			owner.runtime,
			owner.nativeHost
		);
		try {
			const value =
				mode === 'empty'
					? api.createElement(api.Fragment)
					: mode === 'fragment'
						? api.createElement(api.Fragment, null, 'a', 'b')
						: ['a', 'b'];
			check(api.hydrateReactRangeRoot(root, value, start, end), 'matching bounded range adopts');
			check(
				text.every((node) => node.parentNode === container) && end.parentNode === container,
				'text and native delimiters retained'
			);
			api.renderReactRoot(
				root,
				mode === 'empty'
					? api.createElement(api.Fragment, null, 'later')
					: mode === 'fragment'
						? api.createElement(api.Fragment, null, 'updated', 'b')
						: ['updated', 'b']
			);
			check(
				left.textContent === 'left' &&
					right.textContent === 'right' &&
					left.parentNode === container &&
					right.parentNode === container,
				'following work preserves foreign siblings'
			);
			if (mode !== 'empty')
				check(
					text[0]?.nodeValue === 'updated' && text.every((node) => node.parentNode === container),
					'following update retains adopted text'
				);
		} finally {
			api.disposeReactRoot(root);
			api.disposeReactRoot(owner);
		}
		check(
			container.childNodes.length === 4 &&
				start.parentNode === container &&
				end.parentNode === container &&
				left.parentNode === container &&
				right.parentNode === container,
			'disposal releases only the bounded range'
		);
	}
}
