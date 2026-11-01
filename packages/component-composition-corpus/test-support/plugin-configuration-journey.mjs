import {
	createPackage,
	createFixtureGraph
} from '../../plugin-host/src/test-support/registry-fixtures.ts';

/** Creates public config/controller modules for observable preparation ownership controls. */
export function createPluginConfigurationFixture(root) {
	const configSource = `
export const contexts=[];
export const phases=[];
export const record=(phase,context)=>{
 contexts.push(context);phases.push(phase);
 context.executionIndex=900;
 context.plugin.packageName='observed-plugin';
 context.contributor.packageName='observed-contributor';
 context.provenance.activationPaths[0]?.push('observed-path');
 context.provenance.orderingAfter.push('observed-order');
};
export default {
 defaults(context){record('defaults',context);return {order:['defaults']};},
 validate(config,context){record('validate',context);},
 buildConfig(config,context){record('build',context);return {order:config.order};}
};`;
	const plugin = createPackage(
		root,
		'@exactjs/example',
		{
			exports: { './config': './config.js' },
			exact: {
				plugin: {
					schemaVersion: 1,
					protocolVersion: '1.0.0',
					configKey: 'example',
					entries: { config: './config' }
				}
			}
		},
		{ 'config.js': configSource }
	);
	const framework = createPackage(
		root,
		'@acme/framework',
		{
			exports: { './exact': './exact.js' },
			exact: {
				pluginForwarding: { schemaVersion: 1, include: { '@exactjs/example': { required: true } } },
				pluginConfiguration: {
					'@exactjs/example': { version: '^1.0.0', subpath: './exact', export: 'configure' }
				}
			}
		},
		{
			'exact.js': `export function configure(config,context){context.executionIndex=900;context.provenance.activationPaths[0].push('contributor-alias');context.provenance.orderingAfter.push('contributor-alias');config.order.push('framework');}`
		},
		{ '@exactjs/example': '^1.0.0' }
	);
	return { graph: createFixtureGraph(root, plugin, framework), plugin };
}

/** Checks ordinary callback metadata and reports without changing private discovery or execution identity. */
export async function verifyPluginConfigurationValues(
	{ discoverExactPlugins, resolveExactPluginConfigurations, importPublicPackageEntry },
	root
) {
	const check = (value, message) => {
		if (!value) throw new Error('Plugin configuration: ' + message);
	};
	const { graph, plugin } = createPluginConfigurationFixture(root);
	const discovery = discoverExactPlugins(graph);
	const before = JSON.stringify(
		[...discovery.participants].map(([id, item]) => [id, item.activationPaths])
	);
	const resolution = await resolveExactPluginConfigurations(discovery, {
		applicationRoot: root,
		environment: 'test',
		hostMode: 'build',
		signal: new AbortController().signal,
		applicationConfig: {
			plugins: {
				example(config, context) {
					context.executionIndex = 900;
					context.provenance.activationPaths[0].push('root-alias');
					context.provenance.orderingAfter.push('root-alias');
					config.order.push('root');
				}
			}
		}
	});
	check(
		JSON.stringify([...discovery.participants].map(([id, item]) => [id, item.activationPaths])) ===
			before,
		'public paths do not mutate private discovery provenance'
	);
	check(
		JSON.stringify(resolution.reports.map((report) => [report.contributor, report.index])) ===
			JSON.stringify([
				['@acme/framework', 0],
				['@app/root', 1]
			]),
		'report identity and indexes use private values'
	);
	check(
		JSON.stringify(resolution.plugins.get('@exactjs/example').build.order) ===
			JSON.stringify(['defaults', 'framework', 'root']),
		'normal transform sequencing'
	);
	resolution.reports[0].outcome = 'replaced';
	resolution.reports.push({ ...resolution.reports[0] });
	const value = resolution.plugins.get('@exactjs/example');
	value.build = { changed: true };
	resolution.reports = [];
	check(
		value.build.changed && resolution.reports.length === 0,
		'ordinary resolution and report aliases'
	);
	const module = await importPublicPackageEntry(plugin, './config');
	check(module.phases.join(',') === 'defaults,validate,build', 'controller phases still execute');
	return true;
}
