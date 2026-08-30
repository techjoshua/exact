import { RemoteComponent as ServerRemoteComponent } from './client.js?exact-target=server';

function RemotePlaceholderRoot() {
	return () => <ServerRemoteComponent binding="billing" />;
}

/** Compiler-owned server projection for the page-side remote placeholder. */
export const remotePlaceholderRoot = () => <RemotePlaceholderRoot />;
