/** Collects the Phase 1 observable behavior shared by React and the eXact bridge. */
export async function collectReactPhase1Trace({ React, ReactDOMClient, JSDOM, baseline }) {
	const source = React.createElement('span', { key: 7, title: 'source' }, 'A', 'B');
	const clone = React.cloneElement(source, { title: 'clone' });
	const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://exact.invalid/' });
	const previousGlobals = installDomGlobals(dom.window);
	const renders = [];
	let stableRef;
	let stableCallback;

	function useCounter() {
		const [count, setCount] = React.useState(() => 0);
		const [reduced, dispatch] = React.useReducer(
			(value, action) => (action === 'next' ? value + 1 : value),
			0
		);
		const ref = React.useRef({ id: 'stable' });
		const doubled = React.useMemo(() => count * 2, [count]);
		const increment = React.useCallback(() => setCount((value) => value + 1), []);
		React.useDebugValue(count);
		stableRef ??= ref;
		stableCallback ??= increment;
		renders.push({
			count,
			reduced,
			doubled,
			refStable: stableRef === ref,
			callbackStable: stableCallback === increment
		});
		return { count, reduced, doubled, increment, dispatch };
	}

	function Counter() {
		const state = useCounter();
		return React.createElement(
			'div',
			null,
			React.createElement(
				'button',
				{ id: 'increment', onClick: state.increment, 'data-double': state.doubled },
				String(state.count)
			),
			React.createElement('button', { id: 'same', onClick: () => state.dispatch('same') }, 'same'),
			React.createElement(
				'button',
				{ id: 'reduce', onClick: () => state.dispatch('next') },
				String(state.reduced)
			)
		);
	}

	const container = dom.window.document.getElementById('root');
	const root = ReactDOMClient.createRoot(container);
	const act = React.act;
	if (typeof act !== 'function') throw new Error(`${baseline} runtime does not expose act()`);
	try {
		await act(async () => {
			root.render(React.createElement(Counter));
		});
		const initialHtml = normalizedHtml(container);
		await act(async () => {
			click(dom.window, container, '#same');
		});
		const rendersAfterBailout = renders.length;
		await act(async () => {
			click(dom.window, container, '#increment');
		});
		await act(async () => {
			click(dom.window, container, '#reduce');
		});
		const updatedHtml = normalizedHtml(container);
		await act(async () => {
			root.unmount();
		});
		return {
			baseline,
			element: {
				valid: React.isValidElement(source),
				key: source.key,
				sourceTitle: source.props.title,
				cloneTitle: clone.props.title,
				children: React.Children.toArray(source.props.children).map(String)
			},
			client: {
				initialHtml,
				updatedHtml,
				rendersAfterBailout,
				renders,
				unmountedHtml: normalizedHtml(container)
			}
		};
	} finally {
		restoreDomGlobals(previousGlobals);
		dom.window.close();
	}
}

function click(window, container, selector) {
	container
		.querySelector(selector)
		?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

function normalizedHtml(container) {
	return container.innerHTML.replace(/<!--\/?exact:[^>]*-->/g, '');
}

function installDomGlobals(window) {
	const names = [
		'window',
		'document',
		'navigator',
		'Node',
		'Element',
		'HTMLElement',
		'DocumentFragment',
		'CharacterData',
		'HTMLInputElement',
		'HTMLTextAreaElement',
		'HTMLSelectElement',
		'Event',
		'MouseEvent'
	];
	const previous = new Map();
	for (const name of names) {
		previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: window[name]
		});
	}
	previous.set(
		'IS_REACT_ACT_ENVIRONMENT',
		Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
	);
	Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
		configurable: true,
		writable: true,
		value: true
	});
	return previous;
}

function restoreDomGlobals(previous) {
	for (const [name, descriptor] of previous) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else delete globalThis[name];
	}
}
