import { verifyDeepPartitionInspection } from './dom-partition-inspection-journey.ts';

/** Checks build/session ownership, retained updates, detach, reattachment and final removal. */
export async function verifyDomInspectionIdentity(api) {
	const {
		Panel,
		operation,
		render,
		unmount,
		createExactDomInspectionHost,
		setExactDomInspectionOwnerFactory,
		createExactRuntimeInspectionOwner
	} = api;
	const check = (value, message) => {
		if (!value) throw new Error('DOM inspection ownership: ' + message);
	};
	const container = document.createElement('section');
	document.body.append(container);
	const owner = createExactRuntimeInspectionOwner({
		buildKey: 'inspection-current',
		executionRoot: 'inspection-root',
		binding: 'shop'
	});
	const factory = () => owner;
	const clearPrevious = setExactDomInspectionOwnerFactory(factory);
	const restore = setExactDomInspectionOwnerFactory(factory);
	clearPrevious();
	const host = createExactDomInspectionHost();
	try {
		render(operation(Panel, { label: 'current' }), container);
		host.attach('inspection-session', { publish() {} });
		verifyDeepPartitionInspection(host, container, {
			buildKey: 'inspection-current',
			executionRoot: 'inspection-root'
		});
		const button = container.querySelector('button');
		const identity = host.ownerOfElement(button);
		check(
			identity && host.ownedElements(identity).includes(button),
			'current identity selects its owner'
		);
		const queryService = api.createQueryService({
			sessionId: 'inspection-session',
			serverConnected: false,
			dom: host,
			events: api.createEventStore(100, 100000)
		});
		const query = (selected) =>
			queryService.request({
				protocol: 1,
				id: 'lookup',
				method: 'components.get',
				params: { identity: selected }
			});
		check((await query(identity)).ok, 'current detail query');
		for (const method of ['roots.list', 'components.tree', 'microfrontends.list']) {
			for (const filter of [
				{ binding: 'another-binding' },
				{ buildKey: 'retired-build' },
				{ executionRoot: 'another-root' },
				{ side: 'server' }
			]) {
				const result = await queryService.request({
					protocol: 1,
					id: 'filtered',
					method,
					params: { filter }
				});
				check(
					result.ok && result.result.length === 0,
					method + ' rejects ' + JSON.stringify(filter)
				);
			}
			const current = await queryService.request({
				protocol: 1,
				id: 'current-tree',
				method,
				params: {
					filter: {
						binding: 'shop',
						buildKey: identity.buildKey,
						executionRoot: identity.executionRoot
					}
				}
			});
			check(current.ok && current.result.length === 1, method + ' current ownership');
		}

		for (const changed of [
			{ sessionId: 'retired-session' },
			{ side: 'server' },
			{ binding: 'another-binding' },
			{ buildKey: 'retired-build' },
			{ componentTypeId: 'another-component' },
			{ executionRoot: 'another-root' },
			{ instanceId: 'another-instance' }
		]) {
			const selected = { ...identity, ...changed };
			check(host.ownedElements(selected).length === 0, 'reject ' + JSON.stringify(changed));
			check(!(await query(selected)).ok, 'query rejects ' + JSON.stringify(changed));
		}
		render(operation(Panel, { label: 'updated' }), container);
		check(
			host.ownedElements(identity).includes(button) && button.textContent === 'updated',
			'retained update'
		);
		host.detach('inspection-session');
		check(host.ownedElements(identity).length === 0, 'detached session');
		check(!(await query(identity)).ok, 'detached query');
		host.attach('inspection-next', { publish() {} });
		check(host.ownedElements(identity).length === 0, 'retired session after reattachment');
		const next = host.ownerOfElement(button);
		check(host.ownedElements(next).includes(button), 'new session');
		check(!(await query(next)).ok, 'retired service cannot borrow new session');
		const retiredTree = await queryService.request({
			protocol: 1,
			id: 'retired-tree',
			method: 'components.tree'
		});
		check(
			retiredTree.ok && retiredTree.result.length === 0,
			'retired tree cannot borrow a new session'
		);
		unmount(container);
		check(host.ownedElements(next).length === 0, 'removed owner');
	} finally {
		host.detach();
		unmount(container);
		restore();
		container.remove();
	}
}
