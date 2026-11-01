type ReactPreparationApi = Pick<
	typeof import('@exactjs/react-compat'),
	'act' | 'createElement' | 'Fragment'
> &
	Pick<typeof import('@exactjs/react-dom-compat/client19'), 'createRoot'> &
	Pick<typeof import('@exactjs/react-dom-compat'), 'createPortal'>;

function check(value: boolean, message: string): void {
	if (!value) throw new Error('React preparation: ' + message);
}

/** Checks failed range preparation across hosts, fragments, components and portals while preserving old ownership and the primary failure. */
export async function verifyReactPreparation(
	api: ReactPreparationApi,
	document: Document
): Promise<void> {
	for (const mode of ['root', 'host', 'fragment', 'component', 'portal'] as const)
		for (const cleanupFails of [false, true])
			for (const primary of [
				new Error('ref preparation'),
				Object.freeze(new Error('frozen ref preparation')),
				0
			]) {
				const container = document.createElement('div');
				const target = document.createElement('div');
				const foreign = document.createElement('i');
				foreign.textContent = 'foreign';
				target.append(foreign);
				const reports: unknown[] = [];
				const root = api.createRoot(container, { onUncaughtError: (error) => reports.push(error) });
				let baselineReleases = 0,
					firstReleases = 0,
					badReleases = 0,
					events = 0;
				let first: HTMLButtonElement | undefined;
				let bad: HTMLButtonElement | undefined;
				const baseline = api.createElement(
					'p',
					{
						ref: (node: unknown) => {
							if (node)
								return () => {
									baselineReleases++;
								};
						}
					},
					'baseline'
				);
				try {
					await api.act(() =>
						root.render(mode === 'host' ? api.createElement('section', null, baseline) : baseline)
					);
					const old = container.querySelector('p');
					const children = [
						api.createElement(
							'button',
							{
								key: 'a',
								onClick: () => events++,
								ref: (node: HTMLButtonElement | null) => {
									if (!node) return;
									first = node;
									return () => {
										firstReleases++;
										node.click();
										if (cleanupFails) throw new Error('secondary cleanup');
									};
								}
							},
							'first'
						),
						api.createElement(
							'button',
							{
								key: 'b',
								onClick: () => events++,
								ref: (node: HTMLButtonElement | null) => {
									if (node) {
										bad = node;
										throw primary;
									}
									badReleases++;
									bad!.click();
								}
							},
							'bad'
						)
					];
					const candidate =
						mode === 'host'
							? api.createElement('section', null, children)
							: mode === 'fragment'
								? api.createElement(api.Fragment, null, children)
								: mode === 'component'
									? api.createElement(() => children)
									: mode === 'portal'
										? api.createPortal(children, target)
										: children;
					let failed = false;
					let caught: unknown;
					try {
						await api.act(() => root.render(candidate));
					} catch (error) {
						failed = true;
						caught = error;
					}
					check(failed && Object.is(caught, primary), mode + ' preserves initiating failure');
					check(
						reports.length === 1 && Object.is(reports[0], primary),
						mode + ' reports primary once'
					);
					check(firstReleases === 1 && badReleases === 1, mode + ' releases acquired refs once');
					first!.click();
					bad!.click();
					check(events === 0, mode + ' removes listeners before ref cleanup');
					check(
						container.querySelector('p') === old && container.textContent === 'baseline',
						mode + ' retains prior DOM'
					);
					check(baselineReleases === 0, mode + ' retains prior ref ownership');
					check(
						target.childNodes.length === 1 && target.firstChild === foreign,
						mode + ' preserves foreign portal content'
					);
					await api.act(() => root.render(api.createElement('p', null, 'following')));
					check(
						container.textContent === 'following' && baselineReleases === 1,
						mode + ' permits following work'
					);
					await api.act(() => root.unmount());
					check(container.childNodes.length === 0, mode + ' leaves no orphan ranges');
				} finally {
					root.unmount();
					container.remove();
					target.remove();
				}
			}
}
