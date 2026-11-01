/** Checks connection generations and highlight cleanup through the built page installation. */
export async function verifyDevtoolsConnectionLifecycle(api) {
	const check = (condition, message) => {
		if (!condition) throw new Error('DevTools lifecycle: ' + message);
	};
	const opened = (id) =>
		Response.json({
			session: {
				id,
				protocol: 1,
				openedAt: Date.now(),
				expiresAt: Date.now() + 60000,
				capabilities: ['catalog']
			}
		});
	for (const action of ['disconnect', 'dispose']) {
		let resolve;
		const opening = new Promise((done) => {
			resolve = done;
		});
		let opens = 0;
		const closed = [];
		const installation = api.installExactDevtoolsRuntime({
			endpoint: '/__exact',
			fetch: async (_url, options) => {
				const body = JSON.parse(options.body);
				if (body.request === 'open') {
					opens++;
					return opening.then((response) => response.clone());
				}
				closed.push(body.sessionId);
				return Response.json({ ok: true });
			}
		});
		try {
			const result = installation.hook.connect().then(
				() => 'unexpected',
				(error) => error.name
			);
			const shared = installation.hook.connect().then(
				() => 'unexpected',
				(error) => error.name
			);
			check(opens === 1, 'concurrent open is shared');
			if (action === 'dispose') await installation.dispose();
			else await installation.hook.disconnect();
			resolve(opened('stale'));
			check(
				(await result) === 'AbortError' && (await shared) === 'AbortError',
				'superseded open rejects'
			);
			check(
				!installation.hook.connected && closed.length === 1 && closed[0] === 'stale',
				'late remote session closes'
			);
			if (action === 'disconnect') {
				check(
					(await installation.hook.connect()).id === 'stale',
					'fresh connection after disconnect'
				);
			} else {
				check(
					(await installation.hook.connect().then(
						() => 'unexpected',
						(error) => error.name
					)) === 'AbortError',
					'disposed installation stays closed'
				);
			}
		} finally {
			resolve(opened('stale'));
			await installation.dispose();
		}
	}
	const installation = api.installExactDevtoolsRuntime();
	const container = document.createElement('section');
	const foreign = document.createElement('div');
	foreign.setAttribute('data-exact-devtools-highlight', '');
	foreign.style.outline = '3px solid green';
	const foreignOutline = foreign.style.outline;
	document.body.append(container, foreign);
	try {
		api.render(api.operation(api.Panel, { label: 'highlight' }), container);
		const session = await installation.hook.connect();
		const subscription = installation.hook.subscribe(
			{ protocol: 1, sessionId: session.id, cursor: 'm:%:3' },
			() => {}
		);
		check(!subscription.closed, 'malformed legacy cursor resumes bounded history');
		subscription.close();
		check(subscription.closed, 'cursor fallback retains subscription cleanup');
		const button = container.querySelector('button');
		button.style.setProperty('outline', '1px solid red', 'important');
		const authoredOutline = button.style.getPropertyValue('outline');
		installation.hook.highlight(installation.hook.ownerOfElement(button));
		container.remove();
		installation.hook.clearHighlight();
		check(!button.hasAttribute('data-exact-devtools-highlight'), 'detached marker removed');
		check(
			button.style.getPropertyValue('outline') === authoredOutline &&
				button.style.getPropertyPriority('outline') === 'important',
			'authored detached outline restored: ' +
				JSON.stringify({
					authoredOutline,
					actual: button.style.getPropertyValue('outline'),
					priority: button.style.getPropertyPriority('outline')
				})
		);

		document.body.append(container);
		installation.hook.highlight(installation.hook.ownerOfElement(button));
		button.style.setProperty('outline', '3px solid green', 'important');
		const updatedOutline = button.style.getPropertyValue('outline');
		installation.hook.clearHighlight();
		check(
			button.style.getPropertyValue('outline') === updatedOutline &&
				button.style.getPropertyPriority('outline') === 'important',
			'later authored outline retained'
		);

		installation.hook.highlight(installation.hook.ownerOfElement(button));
		const priorityOutline = button.style.getPropertyValue('outline');
		button.style.setProperty('outline', priorityOutline, 'important');
		installation.hook.clearHighlight();
		check(
			button.style.getPropertyValue('outline') === priorityOutline &&
				button.style.getPropertyPriority('outline') === 'important',
			'later authored outline priority retained'
		);
		await installation.dispose();
		const replacement = api.installExactDevtoolsRuntime();
		try {
			await replacement.hook.connect();
			const replacementIdentity = replacement.hook.ownerOfElement(button);
			check(replacementIdentity, 'replacement owns retained element');
			installation.hook.highlight(replacementIdentity);
			check(
				!button.hasAttribute('data-exact-devtools-highlight'),
				'disposed hook cannot highlight replacement session'
			);
		} finally {
			await replacement.dispose();
		}
		check(
			foreign.hasAttribute('data-exact-devtools-highlight') &&
				foreign.style.outline === foreignOutline,
			'foreign highlight retained'
		);
	} finally {
		api.unmount(container);
		container.remove();
		foreign.remove();
		await installation.dispose();
	}
}
