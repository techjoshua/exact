import { checkNativeFilesystemContracts } from './filesystem.mjs';
import { checkCdpNative } from './agent-cdp.mjs';

/** Collects completed native filesystem and automation checks before starting framework hosts. */
export async function checkNativePreflight(root, temporary) {
	return [
		...(await checkNativeFilesystemContracts(root, temporary)),
		...(await checkCdpNative(root, temporary))
	];
}
