/** Checks class-based hydration options, live callbacks, retained DOM identity and disposal. */
export async function verifyHydrationOptions(api) {
	const { Panel, operation, hydrate } = api;
	const container = document.createElement('main');
	container.innerHTML = '<button>initial</button>';
	const button = container.firstChild;
	document.body.append(container);
	let profiles = 0,
		hydrations = 0,
		root;
	class Options {
		#maximum = 100;
		#observe = () => {
			profiles++;
		};
		get maxTreeNodes() {
			return this.#maximum;
		}
		get allowMarkerless() {
			return true;
		}
		get onMismatch() {
			return 'throw';
		}
		get onProfile() {
			return this.#observe;
		}
		onHydration(observation) {
			const previous = observation.outcome;
			observation.outcome = 'updated';
			check(
				observation.outcome === 'updated' && previous !== undefined,
				'ordinary observation alias'
			);
			this.recordHydration();
		}
		recordHydration() {
			hydrations++;
		}
		setObserver(callback) {
			this.#observe = callback;
		}
	}
	const options = new Options();
	const check = (value, message) => {
		if (!value) throw new Error('Hydration options: ' + message);
	};
	try {
		root = hydrate(operation(Panel, { label: 'initial' }), container, options);
		await root.whenSettled();
		check(
			container.querySelector('button') === button && profiles > 0 && hydrations === 1,
			'initial adoption and inherited callbacks'
		);
		const previous = profiles;
		options.setObserver(() => {
			profiles += 10;
		});
		const updated = hydrate(operation(Panel, { label: 'next' }), container, options);
		await updated.whenSettled();
		check(
			updated === root &&
				container.querySelector('button') === button &&
				button.textContent === 'next',
			'retained root and next update'
		);
		check(
			profiles >= previous + 10 && hydrations === 2,
			'live callback alias and next notification'
		);
		root.dispose();
		check(container.childNodes.length === 0, 'owned disposal');
	} finally {
		root?.dispose();
		container.remove();
	}
	return true;
}
