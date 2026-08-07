import { expect, it } from 'vitest';
import { loadExactRemoteModule } from './client.js';

const buildKey = '0123456789abcdef0123456789abcdef01234567';
const otherBuildKey = '89abcdef0123456789abcdef0123456789abcdef';

it('rejects component authorization prepared for another remote build', async () => {
	const source = `export default {
		buildKey: "${buildKey}",
		componentAuthorization: { protocol: 1, buildKey: "${otherBuildKey}", fingerprint: "authorization" },
		root: "area",
		component() {},
		registration: {}
	};`;
	const entry = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

	await expect(loadExactRemoteModule(entry)).rejects.toThrow('Invalid eXact remote module');
});
