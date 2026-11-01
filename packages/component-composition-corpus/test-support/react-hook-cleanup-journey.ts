import { observeCleanupJourneyLogs } from './react-cleanup-logger.js';

type ReactHookCleanupApi = Pick<
	typeof import('@exactjs/react-compat'),
	| 'Activity'
	| 'act'
	| 'createElement'
	| 'Component'
	| 'useInsertionEffect'
	| 'useLayoutEffect'
	| 'useEffect'
	| 'useSyncExternalStore'
> &
	Pick<typeof import('@exactjs/react-dom-compat/client19'), 'createRoot'> &
	Pick<typeof import('@exactjs/react-compat/exact'), 'exactComponentForReactInstance'>;

function check(value: boolean, message: string): void {
	if (!value) throw new Error('React Hook cleanup: ' + message);
}

/** Checks first-failure preservation and exactly-once release across effect kinds and external-store subscriptions. */
export async function verifyReactHookCleanup(
	api: ReactHookCleanupApi,
	document: Document
): Promise<void> {
	for (const kind of ['insertion', 'layout', 'passive', 'store'] as const)
		for (const primary of [undefined, null, 0, new Error('first cleanup')]) {
			const container = document.createElement('div');
			const reports: unknown[] = [];
			const root = api.createRoot(container, { onUncaughtError: (error) => reports.push(error) });
			let releases = 0;
			let provider: unknown;
			const cleanup = () => {
				releases++;
				throw primary;
			};
			const subscribe = () => cleanup;
			function Item() {
				if (kind === 'store') {
					api.useSyncExternalStore(subscribe, () => 0);
					api.useSyncExternalStore(
						() => () => {
							releases++;
							throw new Error('secondary');
						},
						() => 0
					);
				} else {
					const effect =
						kind === 'insertion'
							? api.useInsertionEffect
							: kind === 'layout'
								? api.useLayoutEffect
								: api.useEffect;
					effect(() => cleanup, []);
					effect(
						() => () => {
							releases++;
							throw new Error('secondary');
						},
						[]
					);
				}
				return api.createElement('button', null, kind);
			}
			class Provider extends api.Component {
				render() {
					return api.createElement(Item);
				}
			}
			try {
				await api.act(() =>
					root.render(
						api.createElement(Provider, {
							ref: (value: unknown) => {
								if (value) provider = value;
							}
						})
					)
				);
				const owner = api.exactComponentForReactInstance(provider)!;
				const logged = observeCleanupJourneyLogs(owner);
				await api.act(() => root.unmount());
				root.unmount();
				check(releases === 2, kind + ' releases every lease once');
				check(
					reports.length === 1 && Object.is(reports[0], primary),
					kind + ' preserves primary report'
				);
				check(logged() === 1, kind + ' forwards the report once');
				check(container.childNodes.length === 0, kind + ' releases DOM');
			} finally {
				root.unmount();
				container.remove();
			}
		}
	for (const kind of ['insertion', 'layout', 'passive', 'store'] as const) {
		const container = document.createElement('div');
		const reports: unknown[] = [];
		const root = api.createRoot(container, { onUncaughtError: (error) => reports.push(error) });
		const primary = new Error('release before Activity resume');
		let starts = 0;
		let releases = 0;
		let provider: unknown;
		let value = 0;
		let notify = () => {};
		const cleanup = () => {
			releases++;
			if (releases === 1) throw primary;
		};
		const subscribe = (callback: () => void) => {
			starts++;
			notify = callback;
			return cleanup;
		};
		const getSnapshot = () => value;
		function Item() {
			if (kind === 'store') {
				const snapshot = api.useSyncExternalStore(subscribe, getSnapshot);
				return api.createElement('button', null, String(snapshot));
			}
			const effect =
				kind === 'insertion'
					? api.useInsertionEffect
					: kind === 'layout'
						? api.useLayoutEffect
						: api.useEffect;
			effect(() => {
				starts++;
				return cleanup;
			}, []);
			return api.createElement('button', null, kind);
		}
		class Provider extends api.Component {
			render() {
				return api.createElement(api.Activity, { mode: this.props.mode }, api.createElement(Item));
			}
		}
		const ref = (instance: unknown) => {
			if (instance) provider = instance;
		};
		try {
			await api.act(() => root.render(api.createElement(Provider, { mode: 'visible', ref })));
			const button = container.querySelector('button');
			const logs = observeCleanupJourneyLogs(api.exactComponentForReactInstance(provider)!);
			await api.act(() => root.render(api.createElement(Provider, { mode: 'hidden', ref })));
			check(reports.length === 1 && reports[0] === primary, kind + ' reports deactivation failure');
			await api.act(() => root.render(api.createElement(Provider, { mode: 'visible', ref })));
			check(
				starts === 2 && releases === 1,
				kind + ' reconnects without releasing a retired lease again'
			);
			check(container.querySelector('button') === button, kind + ' keeps DOM identity');
			if (kind === 'store') {
				await api.act(() => {
					value = 1;
					notify();
				});
				check(button?.textContent === '1', 'reconnected store receives following updates');
			}
			await api.act(() => root.unmount());
			check(
				releases === 2 && reports.length === 1 && logs() === 1,
				kind + ' retires the new lease once'
			);
		} finally {
			root.unmount();
			container.remove();
		}
	}
}
