/** Checks inherited render options without changing their receiver or inspection ownership. */
export function verifyDomRootOptions(api) {
	const {
		Panel,
		operation,
		intrinsic,
		renderIntrinsic,
		render,
		unmount,
		createExactRuntimeInspectionOwner,
		setExactDomInspectionOwnerFactory
	} = api;
	const check = (value, message) => {
		if (!value) throw new Error('DOM root options: ' + message);
	};
	for (const path of ['component', 'intrinsic']) {
		const mount = path === 'component' ? render : renderIntrinsic;
		const child = (label) =>
			path === 'component'
				? operation(Panel, { label })
				: intrinsic('div', null, intrinsic('button', null, label), intrinsic('span', null, label));
		for (const inspectionMode of ['none', 'explicit', 'ambient']) {
			const owner = createExactRuntimeInspectionOwner({
				buildKey: 'root-options',
				executionRoot: 'page'
			});
			const restore = setExactDomInspectionOwnerFactory(
				inspectionMode === 'ambient' ? () => owner : undefined
			);
			try {
				const container = document.createElement('main');
				let reads = 0;
				class LimitedOptions {
					#maximum = 1;
					get inspection() {
						return inspectionMode === 'explicit' ? owner : undefined;
					}
					get maxTreeNodes() {
						reads++;
						return this.#maximum;
					}
				}
				let failure;
				try {
					mount(child('limited'), container, new LimitedOptions());
				} catch (error) {
					failure = error;
				} finally {
					unmount(container);
				}
				// The component or nested intrinsic children must exceed the one-value budget.
				check(
					failure?.name === 'DomTreeWorkError' && reads === 1,
					path +
						'/' +
						inspectionMode +
						' inherited work bound: ' +
						String(failure) +
						', reads=' +
						reads
				);
				let profiles = 0;
				class LiveOptions {
					#profile = () => {
						profiles++;
					};
					get inspection() {
						return inspectionMode === 'explicit' ? owner : undefined;
					}
					get onProfile() {
						return this.#profile;
					}
					get maxTreeNodes() {
						return 100;
					}
				}
				const options = Object.freeze(new LiveOptions());
				try {
					mount(child('first'), container, options);
					const button = container.querySelector('button');
					check(
						button?.textContent === 'first' && profiles > 0,
						'inherited profile and initial mount'
					);
					const previousProfiles = profiles;
					mount(child('next'), container, options);
					check(
						container.querySelector('button') === button &&
							button.textContent === 'next' &&
							profiles > previousProfiles,
						'retained root update'
					);
					check(unmount(container) && container.childNodes.length === 0, 'root cleanup');
				} finally {
					unmount(container);
				}
			} finally {
				restore();
			}
		}
	}
	return true;
}
