import { execFileSync } from 'node:child_process';
import { readlinkSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Records the route actually used by the suite's IPv4 loopback listeners. WSL mirrored
 * networking can route this address through a virtual Ethernet interface instead of lo.
 * Probe failures remain explicit; they must not be reported as verified local traffic.
 */
export function readComparisonNetworkEnvironment({
	platform = process.platform,
	readRoute = () =>
		execFileSync('ip', ['-json', 'route', 'get', '127.0.0.1'], {
			encoding: 'utf8',
			timeout: 5000,
			stdio: ['ignore', 'pipe', 'pipe']
		}),
	readNamespace = () => readlinkSync('/proc/self/ns/net'),
	allowRoutedLoopback = process.env.COMPARISON_ALLOW_ROUTED_LOOPBACK === '1'
} = {}) {
	const environment = {
		platform,
		address: '127.0.0.1',
		status: 'not-probed',
		namespace: null,
		route: null,
		allowRoutedLoopback
	};
	if (platform !== 'linux') return environment;
	try {
		environment.namespace = readNamespace();
	} catch {
		// Route verification does not depend on access to the namespace identifier.
	}
	try {
		const routes = JSON.parse(readRoute());
		if (
			!Array.isArray(routes) ||
			routes.length !== 1 ||
			routes[0]?.dst !== environment.address ||
			typeof routes[0]?.dev !== 'string' ||
			!routes[0].dev
		)
			throw new Error('Invalid IPv4 loopback route probe');
		const route = routes[0];
		environment.route = {
			destination: route.dst,
			device: route.dev,
			type: route.type ?? null,
			table: route.table ?? null,
			gateway: route.gateway ?? null
		};
		environment.status =
			route.type === 'local' && route.dev === 'lo' && !route.gateway
				? 'native-loopback'
				: 'routed-loopback';
	} catch (error) {
		environment.status = 'unverified';
		environment.error = error instanceof Error ? error.message : String(error);
	}
	return environment;
}

/** Rejects routed or unverifiable Linux loopback unless a network experiment explicitly opts in. */
export function assertComparisonNetwork(environment = readComparisonNetworkEnvironment()) {
	if (
		environment.platform === 'linux' &&
		environment.status !== 'native-loopback' &&
		!environment.allowRoutedLoopback
	) {
		const observed = environment.route
			? `${environment.route.device}${environment.route.gateway ? ` via ${environment.route.gateway}` : ''}`
			: (environment.error ?? environment.status);
		throw new Error(
			`Framework comparison requires native Linux loopback; 127.0.0.1 uses ${observed}. ` +
				'See the network isolation instructions in framework-comparison/README.md. ' +
				'COMPARISON_ALLOW_ROUTED_LOOPBACK=1 is reserved for explicit network-path experiments.'
		);
	}
	return environment;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
	console.log(JSON.stringify(assertComparisonNetwork(), null, 2));
