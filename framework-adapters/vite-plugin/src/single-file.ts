import type { Plugin } from 'vite';
import { parse, serialize, type DefaultTreeAdapterTypes } from 'parse5';
import type { ExactPluginOptions } from './plugin-contracts.js';
import { exact } from './plugin.js';

/**
 * Builds one offline-capable HTML document. Vite embeds imported assets and folds dynamic imports;
 * final output validation rejects external module edges, unembedded assets, and worker files.
 * Use hash navigation when opening the result directly from disk.
 */
export function exactSingleFile(options: Omit<ExactPluginOptions, 'target' | 'renderMode'> = {}) {
	return [exact({ ...options, requireBrowserOnly: true }), singleFileOutput()];
}

/** Owns embedding after Vite has generated HTML and its associated asset graph. */
function singleFileOutput(): Plugin {
	return {
		name: 'exact:single-file',
		apply: 'build',
		enforce: 'post',
		moduleParsed(info) {
			for (const statement of this.parse(info.code ?? '').body) {
				if (
					statement.type !== 'ImportDeclaration' ||
					statement.source.value !== '@exactjs/core/runtime/tasks'
				)
					continue;
				for (const specifier of statement.specifiers) {
					if (
						specifier.type === 'ImportSpecifier' &&
						(specifier.imported.type === 'Identifier'
							? specifier.imported.name
							: specifier.imported.value) === 'dispatchComponentContinuation'
					)
						throw new Error(
							`eXact single-file output cannot execute a packaged server continuation: ${info.id}`
						);
				}
			}
		},
		config: () => ({
			base: './',
			build: {
				assetsInlineLimit: Number.MAX_SAFE_INTEGER,
				cssCodeSplit: false,
				copyPublicDir: false,
				modulePreload: false,
				sourcemap: false,
				rollupOptions: { output: { inlineDynamicImports: true } }
			}
		}),
		generateBundle: {
			order: 'post',
			handler(_options, bundle) {
				const outputs = Object.values(bundle);
				const documents = outputs.filter(
					(output) => output.type === 'asset' && output.fileName.endsWith('.html')
				);
				if (documents.length !== 1)
					throw new Error('eXact single-file output requires exactly one HTML entry');
				const document = documents[0]!;
				if (document.type !== 'asset') return;
				const html = parse(String(document.source));
				const consumed = new Set([document.fileName]);
				const asset = (url: string) => {
					const name = url.replace(/^\.\//, '');
					const output = bundle[name];
					if (!output)
						throw new Error(
							`eXact single-file output cannot embed ${url}; import local assets through Vite`
						);
					consumed.add(name);
					return output;
				};
				const visit = (node: DefaultTreeAdapterTypes.Node): void => {
					if ('tagName' in node) {
						const attribute = (name: string) =>
							node.attrs.find((attribute) => attribute.name === name)?.value;
						if (node.tagName === 'script' && attribute('src')) {
							const url = attribute('src')!;
							const output = asset(url);
							if (
								output.type !== 'chunk' ||
								output.imports.length ||
								output.dynamicImports.some((name) => name !== output.fileName)
							)
								throw new Error(
									`eXact single-file output has external module dependencies: ${url}`
								);
							node.attrs = node.attrs.filter((attribute) => attribute.name !== 'src');
							node.childNodes = [
								{
									nodeName: '#text',
									value: output.code.replace(/<\/script/gi, '<\\/script'),
									parentNode: node
								}
							];
						} else if (node.tagName === 'link') {
							if (attribute('rel') !== 'stylesheet')
								throw new Error(`eXact single-file output cannot embed link: ${attribute('href')}`);
							const output = asset(attribute('href') ?? '');
							if (output.type !== 'asset') throw new Error('Expected stylesheet asset');
							const css = String(output.source);
							assertEmbeddedCss(css);
							node.tagName = node.nodeName = 'style';
							node.attrs = node.attrs.filter((attribute) =>
								['media', 'nonce', 'title'].includes(attribute.name)
							);
							node.childNodes = [
								{
									nodeName: '#text',
									value: css.replace(/<\/style/gi, '<\\/style'),
									parentNode: node
								}
							];
						} else if (node.tagName === 'style') {
							assertEmbeddedCss(
								node.childNodes
									.filter((child) => child.nodeName === '#text')
									.map((child) => (child as DefaultTreeAdapterTypes.TextNode).value)
									.join('')
							);
						}
						if (attribute('style')) assertEmbeddedCss(attribute('style')!);
						if (
							[
								'img',
								'source',
								'audio',
								'video',
								'iframe',
								'embed',
								'object',
								'image',
								'use'
							].includes(node.tagName)
						) {
							if (
								node.attrs.some(
									(attribute) =>
										attribute.name === 'srcset' ||
										(['src', 'poster', 'data', 'href'].includes(attribute.name) &&
											!/^(data:|#)/i.test(attribute.value))
								)
							)
								throw new Error(
									`eXact single-file HTML contains an unembedded asset: ${node.tagName}`
								);
						}
					}
					if ('childNodes' in node) for (const child of node.childNodes) visit(child);
					if ('content' in node && node.tagName === 'template')
						visit((node as DefaultTreeAdapterTypes.Template).content);
				};
				visit(html);
				for (const output of outputs) {
					if (!consumed.has(output.fileName))
						throw new Error(
							`eXact single-file output contains an unembedded asset or worker: ${output.fileName}. Import assets for inlining; separate worker files are unsupported.`
						);
					if (output !== document) delete bundle[output.fileName];
				}
				document.source = serialize(html);
			}
		}
	};
}

/** Fails closed when CSS would require a network request or a second local file. */
function assertEmbeddedCss(css: string): void {
	if (
		/@import\b/i.test(css) ||
		[...css.matchAll(/url\(([^)]*)\)/gi)].some(
			(match) => !/^(?:data:|#)/.test(match[1]!.trim().replace(/^['"]|['"]$/g, ''))
		)
	)
		throw new Error('eXact single-file CSS contains an external or unresolved asset URL');
}
