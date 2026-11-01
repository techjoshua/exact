import { observeCleanupJourneyLogs } from './react-cleanup-logger.js';
import type { ReactRef } from '@exactjs/react-compat';

type ReactRefApi = Pick<
	typeof import('@exactjs/react-compat'),
	'act' | 'createElement' | 'Component' | 'forwardRef' | 'useImperativeHandle'
> &
	Pick<typeof import('@exactjs/react-dom-compat/client19'), 'createRoot'> &
	Pick<
		typeof import('@exactjs/react-compat/exact'),
		'exactComponentForReactInstance' | 'isUnmountedReactClassInstance'
	>;

function check(value: boolean, message: string): void {
	if (!value) throw new Error('React ref ownership: ' + message);
}

/** Checks independent returned cleanup leases for shared host, class and imperative refs, with legacy controls. */
export async function verifyReactRefCleanup(api: ReactRefApi, document: Document): Promise<void> {
	for (const kind of ['host', 'class', 'imperative'] as const) {
		const container = document.createElement('div');
		const root = api.createRoot(container);
		const attached: unknown[] = [];
		const retired: unknown[] = [];
		let nullCalls = 0;
		const ref = (value: unknown) => {
			if (value === null) {
				nullCalls++;
				return;
			}
			attached.push(value);
			return () => {
				retired.push(value);
			};
		};
		class Item extends api.Component {
			render() {
				return api.createElement('button', null, 'class');
			}
		}
		const Imperative = api.forwardRef<Record<string, unknown>>((_props, handle) => {
			api.useImperativeHandle(handle as ReactRef<{ kind: string }>, () => ({ kind: 'handle' }), []);
			return api.createElement('button', null, 'imperative');
		});
		const type = kind === 'host' ? 'button' : kind === 'class' ? Item : Imperative;
		try {
			await api.act(() =>
				root.render(
					api.createElement(
						'section',
						null,
						api.createElement(type, { key: 'a', ref }, 'a'),
						api.createElement(type, { key: 'b', ref }, 'b')
					)
				)
			);
			check(attached.length === 2, kind + ' attaches two assignments');
			await api.act(() =>
				root.render(
					api.createElement('section', null, api.createElement(type, { key: 'b', ref }, 'updated'))
				)
			);
			check(
				retired.length === 1 && retired[0] === attached[0],
				kind + ' releases only removed assignment'
			);
			check(attached.length === 2, kind + ' retains unchanged ref');
			await api.act(() => root.unmount());
			root.unmount();
			check(
				retired.length === 2 && retired[1] === attached[1],
				kind + ' releases remaining assignment once'
			);
			check(nullCalls === 0, kind + ' uses returned cleanup instead of null callback');
			check(container.childNodes.length === 0, kind + ' releases DOM');
		} finally {
			root.unmount();
			container.remove();
		}
	}
	for (const unmount of [false, true]) {
		const container = document.createElement('div');
		const root = api.createRoot(container);
		const calls: string[] = [];
		class Item extends api.Component {
			render() {
				return api.createElement('button');
			}
		}
		const ref = (name: string) => (value: unknown) => {
			if (value === null) return;
			calls.push('attach ' + name);
			return () => {
				calls.push('release ' + name);
			};
		};
		try {
			await api.act(() => root.render(api.createElement(Item, { ref: ref('a') })));
			await api.act(() => {
				root.render(api.createElement(Item, { ref: ref('b') }));
				if (unmount) root.unmount();
				else root.render(api.createElement(Item, { ref: ref('c') }));
			});
			check(
				JSON.stringify(calls) ===
					JSON.stringify(
						unmount ? ['attach a', 'release a'] : ['attach a', 'release a', 'attach c']
					),
				'queued class refs are fenced by lifetime and revision'
			);
			await api.act(() => root.unmount());
			check(calls.length === (unmount ? 2 : 4), 'accepted class ref releases exactly once');
		} finally {
			root.unmount();
			container.remove();
		}
	}

	for (const primary of [new Error('class unmount'), undefined, 0]) {
		const container = document.createElement('div');
		const reports: unknown[] = [];
		const root = api.createRoot(container, { onUncaughtError: (error) => reports.push(error) });
		let instance: unknown;
		let releases = 0;
		class Item extends api.Component {
			componentWillUnmount() {
				throw primary;
			}
			render() {
				return api.createElement('button');
			}
		}
		try {
			await api.act(() =>
				root.render(
					api.createElement(() =>
						api.createElement(Item, {
							ref: (value: unknown) => {
								instance = value;
								return () => {
									releases++;
									throw new Error('secondary ref failure');
								};
							}
						})
					)
				)
			);
			const owner = api.exactComponentForReactInstance(instance)!;
			const loggedFailures = observeCleanupJourneyLogs(owner.parent!);
			await api.act(() => root.unmount());
			check(
				reports.length === 1 && Object.is(reports[0], primary),
				'class unmount reports primary failure once'
			);
			check(releases === 1, 'class ref cleanup still runs');
			check(loggedFailures() === 1, 'configured logger forwards each lifecycle report');
			check(
				api.exactComponentForReactInstance(instance) === undefined,
				'class ownership is cleared'
			);
			check(api.isUnmountedReactClassInstance(instance), 'class instance is marked unmounted');
			check(container.childNodes.length === 0, 'class failure still removes DOM');
		} finally {
			root.unmount();
			container.remove();
		}
	}

	for (const kind of ['class', 'imperative'] as const) {
		const container = document.createElement('div');
		const reports: unknown[] = [];
		const root = api.createRoot(container, { onUncaughtError: (error) => reports.push(error) });
		const primary = new Error(kind + ' ref attachment');
		let nullCalls = 0;
		let acceptedReleases = 0;
		class Item extends api.Component {
			render() {
				return api.createElement('button');
			}
		}
		const Imperative = api.forwardRef<Record<string, unknown>>((_props, ref) => {
			api.useImperativeHandle(ref as ReactRef<unknown>, () => ({}), []);
			return api.createElement('button');
		});
		const type = kind === 'class' ? Item : Imperative;
		const failed = (value: unknown) => {
			if (value) throw primary;
			nullCalls++;
		};
		const accepted = (value: unknown) => {
			if (value)
				return () => {
					acceptedReleases++;
				};
		};
		try {
			await api.act(() => root.render(api.createElement(type, { ref: failed })));
			check(
				reports.length === 1 && reports[0] === primary,
				kind + ' reports failed ref attachment'
			);
			const button = container.querySelector('button');
			await api.act(() => root.render(api.createElement(type, { ref: accepted })));
			check(
				nullCalls === 1 && container.querySelector('button') === button,
				kind + ' releases failed attachment before replacement'
			);
			await api.act(() => root.unmount());
			check(
				nullCalls === 1 && acceptedReleases === 1 && reports.length === 1,
				kind + ' retires only accepted replacement'
			);
		} finally {
			root.unmount();
			container.remove();
		}
	}
	{
		const container = document.createElement('div');
		const reports: unknown[] = [];
		const root = api.createRoot(container, { onUncaughtError: (error) => reports.push(error) });
		const primary = new Error('imperative factory');
		let refCalls = 0;
		const Item = api.forwardRef<Record<string, unknown>>((_props, ref) => {
			api.useImperativeHandle(
				ref as ReactRef<unknown>,
				() => {
					throw primary;
				},
				[]
			);
			return api.createElement('button');
		});
		try {
			await api.act(() =>
				root.render(
					api.createElement(Item, {
						ref: () => {
							refCalls++;
						}
					})
				)
			);
			await api.act(() => root.unmount());
			check(
				refCalls === 0 && reports.length === 1 && reports[0] === primary,
				'failed value factory never assigns or releases the untouched ref'
			);
		} finally {
			root.unmount();
			container.remove();
		}
	}

	const container = document.createElement('div');
	const root = api.createRoot(container);
	const objectRef = { current: null as Element | null };
	const calls: Array<Element | null> = [];
	try {
		await api.act(() =>
			root.render(
				api.createElement(
					'section',
					null,
					api.createElement('button', { ref: objectRef }),
					api.createElement('button', {
						ref: (node: Element | null) => {
							calls.push(node);
						}
					})
				)
			)
		);
		check(
			objectRef.current !== null && calls.length === 1 && calls[0] !== null,
			'legacy attachment'
		);
		await api.act(() => root.unmount());
		check(objectRef.current === null && calls.length === 2 && calls[1] === null, 'legacy release');
	} finally {
		root.unmount();
		container.remove();
	}
}
