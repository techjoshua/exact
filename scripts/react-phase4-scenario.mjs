import { captureExpectedConsole } from './react-conformance/diagnostics.mjs';

/** Collects stable observable Phase 4 class, boundary, PureComponent, and Profiler behavior. */
export async function collectReactPhase4Trace({ React, ReactDOMClient, JSDOM, baseline }) {
	const dom = new JSDOM('<!doctype html><div id="root"></div><div id="boundary"></div>', {
		url: 'https://exact.invalid/'
	});
	const previousGlobals = installDomGlobals(dom.window);
	const diagnostics = captureExpectedConsole(`React ${baseline} phase 4`, [
		/caught|<Broken>|error boundary/i
	]);
	const metrics = {
		mounts: 0,
		updates: 0,
		snapshots: 0,
		callbacks: 0,
		unmounts: 0,
		caught: 0,
		pureRenders: 0
	};
	const profilerPhases = [];
	const Tone = React.createContext('default');
	const counterRef = React.createRef();

	class Counter extends React.Component {
		static contextType = Tone;
		constructor(props) {
			super(props);
			this.state = { count: 0 };
		}
		componentDidMount() {
			metrics.mounts++;
		}
		getSnapshotBeforeUpdate() {
			metrics.snapshots++;
			return this.state.count;
		}
		componentDidUpdate() {
			metrics.updates++;
		}
		componentWillUnmount() {
			metrics.unmounts++;
		}
		render() {
			return React.createElement(
				'button',
				{
					onClick: () =>
						this.setState(
							(state) => ({ count: state.count + 1 }),
							() => {
								metrics.callbacks++;
							}
						)
				},
				`${this.props.label}/${this.state.count}/${this.context}`
			);
		}
	}
	class PureLabel extends React.PureComponent {
		render() {
			metrics.pureRenders++;
			return React.createElement('em', null, this.props.value);
		}
	}
	class Boundary extends React.Component {
		state = { error: null };
		static getDerivedStateFromError(error) {
			return { error };
		}
		componentDidCatch() {
			metrics.caught++;
		}
		render() {
			return this.state.error
				? React.createElement('strong', null, this.state.error.message)
				: this.props.children;
		}
	}
	function Broken() {
		throw new Error('caught');
	}
	function App({ label }) {
		return React.createElement(
			Tone.Provider,
			{ value: 'tone' },
			React.createElement(Counter, { ref: counterRef, label }),
			React.createElement(PureLabel, { value: 'pure' }),
			React.createElement(
				React.Profiler,
				{ id: 'phase4', onRender: (_id, phase) => profilerPhases.push(phase) },
				React.createElement('i', null, label)
			)
		);
	}

	const container = dom.window.document.getElementById('root');
	const boundaryContainer = dom.window.document.getElementById('boundary');
	const root = ReactDOMClient.createRoot(container);
	const boundaryRoot = ReactDOMClient.createRoot(boundaryContainer);
	try {
		await React.act(async () => {
			root.render(React.createElement(App, { label: 'first' }));
		});
		await React.act(async () => {
			boundaryRoot.render(React.createElement(Boundary, null, React.createElement(Broken)));
		});
		const initial = {
			text: container.textContent,
			boundary: boundaryContainer.textContent,
			refAttached: counterRef.current instanceof Counter,
			...metrics
		};
		await React.act(async () => {
			root.render(React.createElement(App, { label: 'second' }));
		});
		const afterProps = { text: container.textContent, ...metrics };
		await React.act(async () => {
			container
				.querySelector('button')
				.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
		});
		const afterState = { text: container.textContent, ...metrics };
		await React.act(async () => {
			root.unmount();
			boundaryRoot.unmount();
		});
		return {
			baseline,
			initial,
			afterProps,
			afterState,
			profilerPhases,
			unmount: {
				html: container.innerHTML,
				boundaryHtml: boundaryContainer.innerHTML,
				refCleared: counterRef.current === null,
				unmounts: metrics.unmounts
			}
		};
	} finally {
		try {
			diagnostics.restoreAndAssert();
		} finally {
			restoreDomGlobals(previousGlobals);
			dom.window.close();
		}
	}
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
