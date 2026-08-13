import { close } from '../src/e2e-server.mjs';

/** Returns the single-process harness teardown after its listeners have started during import. */
export default function globalSetup() {
	return close;
}
