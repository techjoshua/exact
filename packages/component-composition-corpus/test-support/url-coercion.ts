/** Supplies a changing conversion to prove that URL publication retains the value it checked. */
export function changingUrl(
	first = '/safe?first=1&second=2',
	second = 'javascript:probe',
	method: 'primitive' | 'string' = 'primitive'
) {
	let calls = 0;
	const convert = () => (++calls === 1 ? first : second);
	return {
		value: method === 'primitive' ? { [Symbol.toPrimitive]: convert } : { toString: convert },
		calls: () => calls
	};
}
