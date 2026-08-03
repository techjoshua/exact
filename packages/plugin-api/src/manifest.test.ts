import { describe, expect, it } from 'vitest';
import {
	matchesPackageSelectors,
	packageDirectlyDependsOnPluginApi,
	readExactPackageParticipation,
	readSelectors
} from './index.js';

describe('plugin package manifests', () => {
	it('parses and freezes plugin participation declarations', () => {
		const participation = readExactPackageParticipation({
			name: '@example/plugin',
			exact: {
				plugin: {
					schemaVersion: 1,
					protocolVersion: '1.0.0',
					configKey: 'example',
					entries: { render: './render' }
				},
				pluginConfiguration: {
					'@example/dependency': {
						subpath: './config',
						export: 'configure'
					}
				}
			}
		});

		expect(participation.plugin?.entries.render).toBe('./render');
		expect(participation.configuration['@example/dependency']?.export).toBe('configure');
		expect(Object.isFrozen(participation)).toBe(true);
	});

	it('rejects private or escaping plugin subpaths', () => {
		expect(() =>
			readExactPackageParticipation({
				name: '@example/plugin',
				exact: {
					plugin: {
						schemaVersion: 1,
						protocolVersion: '1.0.0',
						configKey: 'example',
						entries: { render: '../render' }
					}
				}
			})
		).toThrow('public package export subpath');
	});

	it('matches exact package names and scoped prefixes without broadening them', () => {
		const selectors = readSelectors(['react', '@example/'], 'selectors');
		expect(matchesPackageSelectors('react', selectors)).toBe(true);
		expect(matchesPackageSelectors('@example/adapter', selectors)).toBe(true);
		expect(matchesPackageSelectors('react-dom', selectors)).toBe(false);
	});

	it('recognizes direct runtime and optional marker dependencies', () => {
		expect(
			packageDirectlyDependsOnPluginApi({
				optionalDependencies: { '@exactjs/plugin-api': '^1.0.0' }
			})
		).toBe(true);
		expect(
			packageDirectlyDependsOnPluginApi({
				peerDependencies: { '@exactjs/plugin-api': '^1.0.0' }
			})
		).toBe(false);
	});
});
