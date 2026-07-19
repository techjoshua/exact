/** Collects a deterministic public-behavior trace from an installed React baseline. */
export async function collectReactReferenceTrace({
	React,
	ReactDOM,
	ReactDOMClient,
	ReactDOMServer,
	ReactJsxRuntime,
	ReactJsxDevRuntime,
	ReactCompilerRuntime,
	JSDOM,
	baseline
}) {
	const element = React.createElement('div', { key: 'item' }, 'A', 'B');
	const Context = React.createContext('missing');
	function ServerView() {
		const value = React.useContext(Context);
		const [count] = React.useState(2);
		return React.createElement('p', { 'data-count': count }, value);
	}
	const serverHtml = ReactDOMServer.renderToString(
		React.createElement(Context.Provider, { value: 'server' }, React.createElement(ServerView))
	);

	const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://exact.invalid/' });
	const previousGlobals = installDomGlobals(dom.window);
	const events = [];
	let renders = 0;

	function Counter() {
		const [count, setCount] = React.useState(0);
		renders++;
		React.useLayoutEffect(() => {
			events.push(`layout:${count}`);
			return () => events.push(`layout-cleanup:${count}`);
		}, [count]);
		React.useEffect(() => {
			events.push(`effect:${count}`);
			return () => events.push(`effect-cleanup:${count}`);
		}, [count]);
		return React.createElement(
			'button',
			{ type: 'button', onClick: () => setCount((value) => value + 1) },
			String(count)
		);
	}

	const container = dom.window.document.getElementById('root');
	const root = ReactDOMClient.createRoot(container);
	const act = React.act ?? ReactDOM.act;
	if (typeof act !== 'function') throw new Error(`React ${React.version} does not expose act()`);
	try {
		await act(async () => {
			root.render(React.createElement(Counter));
		});
		const initialHtml = container.innerHTML;
		await act(async () => {
			container
				.querySelector('button')
				?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
		});
		const updatedHtml = container.innerHTML;
		await act(async () => {
			root.unmount();
		});
		return {
			baseline,
			version: React.version,
			exports: {
				react: publicExports(React),
				'react/jsx-runtime': publicExports(ReactJsxRuntime),
				'react/jsx-dev-runtime': publicExports(ReactJsxDevRuntime),
				'react-dom': publicExports(ReactDOM),
				'react-dom/client': publicExports(ReactDOMClient),
				'react-dom/server': publicExports(ReactDOMServer),
				...(ReactCompilerRuntime
					? { 'react/compiler-runtime': publicExports(ReactCompilerRuntime) }
					: {})
			},
			element: {
				type: element.type,
				key: element.key,
				children: React.Children.toArray(element.props.children).map(String)
			},
			serverHtml,
			client: { initialHtml, updatedHtml, renders, events }
		};
	} finally {
		restoreDomGlobals(previousGlobals);
		dom.window.close();
	}
}

export function benchmarkReactReference({ React, ReactDOMServer, baseline, iterations = 200 }) {
	function Tree({ offset }) {
		return React.createElement(
			'ul',
			null,
			Array.from({ length: 100 }, (_, index) =>
				React.createElement('li', { key: index }, `Item ${offset + index}`)
			)
		);
	}
	const start = performance.now();
	let bytes = 0;
	for (let iteration = 0; iteration < iterations; iteration++) {
		bytes += ReactDOMServer.renderToString(React.createElement(Tree, { offset: iteration })).length;
	}
	return { baseline, iterations, bytes, durationMs: performance.now() - start };
}

function publicExports(module) {
	return Object.keys(module)
		.filter((name) => name !== 'default' && name !== 'module.exports')
		.sort();
}

function installDomGlobals(window) {
	const names = [
		'window',
		'document',
		'navigator',
		'Node',
		'Element',
		'HTMLElement',
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
