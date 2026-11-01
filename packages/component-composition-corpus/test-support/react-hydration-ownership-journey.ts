type HydrationOwnershipApi = Pick<typeof import('@exactjs/react-compat'), 'createElement'> &
	Pick<typeof import('@exactjs/react-dom-compat/client19'), 'createRoot' | 'hydrateRoot'> &
	Pick<typeof import('@exactjs/react-dom-compat'), 'createPortal'>;

/** Checks adopted raw content, retained host modes and portal markers transfer complete ownership without touching foreign content. */
export function verifyReactHydrationOwnership(
	api: HydrationOwnershipApi,
	document: Document
): void {
	const check = (value: boolean, message: string) => {
		if (!value) throw new Error('React hydration ownership: ' + message);
	};
	for (const matches of [true, false]) {
		const container = document.createElement('div');
		container.innerHTML =
			'<section><span>' +
			(matches ? 'raw' : 'server') +
			'</span><!-- authored --><!-- --></section>';
		const host = container.firstChild!;
		const child = host.firstChild!;
		const reports: unknown[] = [];
		const errors: unknown[] = [];
		const root = api.hydrateRoot(
			container,
			api.createElement('section', {
				dangerouslySetInnerHTML: { __html: '<span>raw</span><!-- authored --><!-- -->' }
			}),
			{
				onRecoverableError: (error) => reports.push(error),
				onUncaughtError: (error) => errors.push(error)
			}
		);
		try {
			check(
				matches
					? container.firstChild === host && host.firstChild === child
					: container.firstChild !== host,
				'host adoption follows actual raw markup'
			);
			check(
				reports.length === (matches ? 0 : 1) && errors.length === 0,
				'matching markup has no mismatch report'
			);
			check(container.firstChild?.childNodes.length === 3, 'authored raw comments retained');
			root.render(api.createElement('section', null, 'ordinary'));
			check(container.textContent === 'ordinary', 'raw markup transfers to child ownership');
		} finally {
			root.unmount();
		}
		check(container.childNodes.length === 0, 'host content retires');
	}
	const container = document.createElement('div');
	container.innerHTML = '<section><span>raw</span></section>';
	let reads = 0;
	const payload = {
		get __html() {
			reads++;
			return reads === 1 ? '<span>raw</span>' : undefined;
		}
	};
	const root = api.hydrateRoot(
		container,
		api.createElement('section', { dangerouslySetInnerHTML: payload })
	);
	try {
		root.render(api.createElement('section', null, 'ordinary'));
		check(
			container.textContent === 'ordinary' && reads === 1,
			'old payload not reevaluated on ownership transfer'
		);
	} finally {
		root.unmount();
	}
	const parent = document.createElement('div');
	const target = document.createElement('div');
	const foreign = document.createElement('i');
	foreign.textContent = 'foreign';
	target.append(foreign);
	parent.innerHTML = 'a<!-- -->b';
	const errors: unknown[] = [];
	let releases = 0,
		events = 0;
	const ref = (node: HTMLButtonElement | null) => {
		if (node)
			return () => {
				releases++;
				node.click();
			};
	};
	const portal = (label: string) =>
		api.createPortal(
			api.createElement('button', { ref, onClick: () => events++ }, label),
			target,
			'portal'
		);
	const portalRoot = api.hydrateRoot(parent, ['a', portal('portal'), 'b'], {
		onUncaughtError: (error) => errors.push(error)
	});
	try {
		const children = [...parent.childNodes];
		const button = target.querySelector('button')!;
		check(
			children.length === 3 &&
				children.every((node) => node.nodeType === 3) &&
				children[1]?.nodeValue === '',
			'portal marker adopted into parent range'
		);
		check(target.textContent === 'foreignportal', 'portal keeps foreign target content');
		portalRoot.render(['before', 'a', portal('updated'), 'b']);
		check(
			target.querySelector('button') === button &&
				button.textContent === 'updated' &&
				parent.childNodes[2] === children[1],
			'retained portal moves with its owned marker'
		);
		button.click();
		check(events === 1, 'retained portal event remains owned');
		portalRoot.render(['after']);
		check(
			releases === 1 &&
				events === 1 &&
				target.childNodes.length === 1 &&
				target.firstChild === foreign,
			'portal removal retires ref and listeners without touching foreign content'
		);
	} finally {
		portalRoot.unmount();
	}
	check(parent.childNodes.length === 0 && errors.length === 0, 'portal parent cleanup and reports');
}
