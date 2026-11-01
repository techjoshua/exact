import { expect, it } from 'vitest';
import { readExactPackageParticipation } from './index.js';

const plugin = {
	schemaVersion: 1,
	protocolVersion: '1.0.0',
	configKey: 'example',
	entries: { render: './render' }
};

it.each(['.', './render', './nested/render'])('accepts public plugin entries: %s', (subpath) => {
	const result = readExactPackageParticipation({
		exact: { plugin: { ...plugin, entries: { render: subpath } } }
	});
	expect(result.plugin?.entries.render).toBe(subpath);
});

it.each([
	'render',
	'./',
	'./nested\\render',
	'./nested/../render',
	'./render?raw',
	'./render#fragment'
])('rejects escaping or host-qualified plugin entries: %s', (subpath) => {
	expect(() =>
		readExactPackageParticipation({
			exact: { plugin: { ...plugin, entries: { render: subpath } } }
		})
	).toThrow(/public package export subpath/);
});

it.each([
	{ schemaVersion: 2 },
	{ protocolVersion: ' ' },
	{ configKey: 'invalid-key' },
	{ entries: [] },
	{ entries: { unknown: './render' } },
	{ entries: { render: 0 } },
	{ unknown: true }
])('rejects malformed plugin declarations: %j', (override) => {
	expect(() =>
		readExactPackageParticipation({ exact: { plugin: { ...plugin, ...override } } })
	).toThrow();
});

it('parses forwarding choices and configuration versions', () => {
	const result = readExactPackageParticipation({
		exact: {
			pluginForwarding: {
				schemaVersion: 1,
				include: { '@example/plugin': { required: true } },
				ignore: ['@other/']
			},
			pluginConfiguration: {
				'@example/plugin': { version: '^1.0.0', subpath: '.', export: 'default' }
			}
		}
	});
	expect(result.forwarding?.include['@example/plugin']?.required).toBe(true);
	expect(result.configuration['@example/plugin']?.version).toBe('^1.0.0');
});

it.each([
	{ pluginForwarding: { schemaVersion: 2, include: {} } },
	{ pluginForwarding: { schemaVersion: 1, include: { '@example/plugin': { required: 'yes' } } } },
	{
		pluginForwarding: {
			schemaVersion: 1,
			include: { '@example/plugin': {} },
			ignore: ['@example/']
		}
	},
	{ pluginForwarding: { schemaVersion: 1, include: {}, ignore: ['@example/', '@example/'] } },
	{ pluginForwarding: { schemaVersion: 1, include: {}, ignore: ['invalid/'] } },
	{ pluginConfiguration: { '@example/plugin': { subpath: './config', export: 'invalid-name' } } },
	{
		pluginConfiguration: {
			'@example/plugin': { subpath: './config', export: 'default', version: ' ' }
		}
	}
])('rejects inconsistent forwarding and configuration declarations: %j', (exact) => {
	expect(() => readExactPackageParticipation({ exact })).toThrow();
});
