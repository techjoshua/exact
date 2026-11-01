/** Accepts existing ABI diagnostics or the exact removed-helper link boundary of a frozen fixture.
 * This predicate has no runtime package imports so build-script tests work before package emit.
 */
export function isPreservedAbiRejection(error, { version, target, source }) {
	if (!['0.5.0', '0.6.0'].includes(version) || !['client', 'server'].includes(target)) return false;
	if (!('errors' in Object(error)))
		return /Unsupported eXact (?:render-program|component artifact|component contract)/.test(
			error?.message ?? ''
		);
	if (!Array.isArray(error.errors)) return false;
	if (error.errors.length !== 1) return false;
	const client = target === 'client';
	const symbol = client
		? 'createCompiledComponentReceipt'
		: 'createPreparedServerComponentReference';
	const provider = client ? 'runtime/component-operations' : 'framework/server-render-structure';
	const message = error.errors[0];
	const location = message?.location;
	if (
		message?.text !==
			`No matching export in "packages/core/dist/${target}/${provider}.js" for import "${symbol}"` ||
		message.id !== '' ||
		message.pluginName !== '' ||
		!Array.isArray(message.notes) ||
		message.notes.length !== 0 ||
		location?.file !== `fixtures/release-abi/${version}/${target}.js` ||
		!Number.isSafeInteger(location.line) ||
		location.line < 1 ||
		!Number.isSafeInteger(location.column) ||
		location.column < 0 ||
		location.length !== symbol.length
	)
		return false;
	const line = source.split('\n')[location.line - 1];
	return (
		line === location.lineText &&
		line?.slice(location.column, location.column + location.length) === symbol &&
		line.includes(`from "@exactjs/core/${provider}"`)
	);
}
