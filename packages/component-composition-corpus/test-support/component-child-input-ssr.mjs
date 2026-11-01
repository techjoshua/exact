/** Collects the finite SSR input contract with real generated components and renderer entry points.
 * Returns observations before the host asserts them. No Node APIs, durable observers or transport
 * callbacks are introduced, so the native runtime fixture can run this same owner on every host.
 */
export async function observeComponentChildInputSsr({
	receipt,
	fragment,
	renderToString,
	Accessor,
	Leaf
}) {
	const rows = [];
	const first = receipt(Leaf, { children: 'first' }),
		later = receipt(Leaf, { children: 'later' }),
		children = [first];
	let reads = 0,
		otherReads = 0;
	const events = [];
	let inputs;
	class Inputs {
		#label = 'original';
		get children() {
			reads++;
			events.push({ key: 'children', original: this === inputs });
			return reads === 1 ? children : later;
		}
		get other() {
			otherReads++;
			events.push({ key: 'other', original: this === inputs });
			void this.children;
			return this.#label;
		}
		get expected() {
			return children;
		}
	}
	inputs = new Inputs();
	try {
		const output = await renderToString(receipt(Accessor, inputs), { markers: false });
		rows.push({ case: 'receiver', reads, otherReads, events, html: output.html });
	} catch (error) {
		rows.push({ case: 'receiver', reads, otherReads, events, error: String(error) });
	}
	let undefinedReads = 0;
	try {
		const output = await renderToString(
			receipt(Accessor, {
				get children() {
					undefinedReads++;
					return undefined;
				}
			}),
			{ markers: false }
		);
		rows.push({ case: 'undefined', reads: undefinedReads, html: output.html });
	} catch (error) {
		rows.push({ case: 'undefined', reads: undefinedReads, error: String(error) });
	}
	let shadowedReads = 0;
	try {
		const output = await renderToString(
			receipt(
				Accessor,
				{
					get children() {
						shadowedReads++;
						throw new Error('shadowed children');
					}
				},
				{ kind: 'eager', values: [first] }
			),
			{ markers: false }
		);
		rows.push({ case: 'explicit', reads: shadowedReads, html: output.html });
	} catch (error) {
		rows.push({ case: 'explicit', reads: shadowedReads, error: String(error) });
	}
	const failure = new Error('children acquisition');
	let throwReads = 0,
		caught;
	try {
		await renderToString(
			receipt(Accessor, {
				get children() {
					throwReads++;
					throw failure;
				}
			}),
			{ markers: false }
		);
	} catch (error) {
		caught = error;
	}
	rows.push({
		case: 'throw',
		reads: throwReads,
		sameError: caught === failure,
		error: String(caught)
	});
	let occurrenceReads = 0;
	const reused = receipt(Accessor, {
		get children() {
			return ++occurrenceReads === 1 ? first : later;
		}
	});
	try {
		const output = await renderToString(fragment(null, reused, reused), { markers: false });
		rows.push({ case: 'occurrences', reads: occurrenceReads, html: output.html });
	} catch (error) {
		rows.push({ case: 'occurrences', reads: occurrenceReads, error: String(error) });
	}
	return rows;
}
