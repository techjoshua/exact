import { build } from 'esbuild';

const cases = [
	{
		name: 'native',
		imported: 'createExactRouter',
		module: './component-libraries/router/src/index.tsx',
		absent: ['@exactjs/react-compat', 'function Switch', 'createStaticHandler']
	},
	{
		name: 'data',
		imported: 'createMemoryRouter',
		module: './component-libraries/router/src/data.ts',
		absent: ['function Switch', 'Leave?']
	},
	{
		name: 'v5',
		imported: 'Switch',
		module: './component-libraries/router/src/v5.ts',
		absent: ['createStaticHandler', 'StaticRouterProvider']
	}
];

for (const fixture of cases) {
	const result = await build({
		stdin: {
			contents: `import { ${fixture.imported} as value } from ${JSON.stringify(fixture.module)}; console.log(value);`,
			resolveDir: process.cwd(),
			sourcefile: `${fixture.name}.ts`
		},
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'browser',
		treeShaking: true,
		external: [
			'@exactjs/core',
			'@exactjs/request',
			'@exactjs/react-compat',
			'@exactjs/react-compat/interop'
		]
	});
	const source = result.outputFiles[0].text;
	for (const token of fixture.absent) {
		if (source.includes(token))
			throw new Error(`${fixture.name} router bundle retained ${JSON.stringify(token)}`);
	}
	console.log(`${fixture.name} router bundle ok (${Buffer.byteLength(source)} bytes)`);
}
