/** Checks wide raw ranges, independent ordinary inspection values, retained updates and teardown. */
export function verifyDomRangeObservations(
	{
		renderTestTree,
		unmount,
		unsafeHtml,
		inspectDomRoot,
		componentRootLifecycle,
		defaultErrorContext
	},
	document,
	count = 140_000
) {
	const check = (condition, message) => {
		if (!condition) throw new Error('DOM range: ' + message);
	};
	const container = document.createElement('main');
	const reports = [];
	const previousReports = defaultErrorContext.errors.length;
	const html = '<b>head</b>' + '<!--node-->'.repeat(count) + '<i>tail</i>';
	try {
		renderTestTree(unsafeHtml(html), container, {
			allowUnsafeHtml: true,
			maxTreeNodes: count * 2 + 100,
			onErrorReport: (report) => reports.push(report)
		});
		check(
			reports.length === 0 && defaultErrorContext.errors.length === previousReports,
			'mount reported an unexpected framework failure'
		);
		check(
			container.querySelector('b')?.textContent === 'head' &&
				container.querySelector('i')?.textContent === 'tail',
			'mount lost its output'
		);
		const observed = inspectDomRoot(container);
		check(observed?.instance, 'inspection lost the component owner');
		const root = componentRootLifecycle(observed.instance).current;
		check(
			root?.kind === 'range' && root.nodes.length === count + 2,
			'root presentation lost raw nodes'
		);
		root.kind = 'range';
		const detached = root.nodes;
		detached.length = 0;
		check(root.nodes.length === count + 2, 'editing an observation changed the presented range');
		const nodes = [observed];
		for (let index = 0; index < nodes.length; index++)
			for (const child of nodes[index].children) nodes.push(child);
		for (const node of nodes) {
			node.operation.type = 'observation alias';
			node.elements().push(document.createElement('mark'));
			node.ownedElements().push(document.createElement('mark'));
			node.children.length = 0;
		}
		const fresh = inspectDomRoot(container);
		check(
			fresh.instance === observed.instance &&
				fresh.operation.type !== 'observation alias' &&
				fresh.children.length > 0,
			'inspection aliases changed renderer ownership'
		);
		check(
			!fresh.elements().some((element) => element.tagName === 'MARK'),
			'element observations shared list membership'
		);
		renderTestTree(unsafeHtml('<strong>next</strong>'), container);
		check(
			container.querySelector('strong')?.textContent === 'next' && !container.querySelector('b'),
			'subsequent range replacement failed'
		);
		check(
			reports.length === 0 && defaultErrorContext.errors.length === previousReports,
			'update reported an unexpected framework failure'
		);
	} finally {
		unmount(container);
		for (const report of defaultErrorContext.errors.slice(previousReports))
			defaultErrorContext.clear(report);
	}
	check(
		container.childNodes.length === 0 && inspectDomRoot(container) === undefined,
		'unmount retained output or inspection ownership'
	);
}
