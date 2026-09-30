import { escapeAttr } from '../html.js';
import type { DocumentScript } from './document-output.js';

/** Renders ordinary document scripts without changing their browser loading semantics. */
export function renderDocumentScripts(scripts: readonly DocumentScript[], nonce?: string): string {
	return scripts
		.map(
			(script) =>
				`<script src="${escapeAttr(script.src)}"${script.type === 'classic' ? ' defer' : ' type="module"'}${nonce ? ` nonce="${escapeAttr(nonce)}"` : ''}${script.integrity ? ` integrity="${escapeAttr(script.integrity)}"` : ''}${script.crossOrigin ? ` crossorigin="${escapeAttr(script.crossOrigin)}"` : ''}></script>`
		)
		.join('');
}

/**
 * Defers bootstrap requests until load, or starts immediately when load has already completed.
 * Scripts execute in descriptor order. Integrity and credential-bearing scripts retain native
 * script-element enforcement. The inline loader uses the supplied CSP nonce.
 */
export function renderAfterLoadBootstrap(
	scripts: readonly DocumentScript[],
	nonce?: string
): string {
	if (!scripts.length) return '';
	const first = scripts[0]!;
	if (
		scripts.length === 1 &&
		first.type !== 'classic' &&
		!first.integrity &&
		first.crossOrigin !== 'use-credentials'
	) {
		return `<script${nonce ? ` nonce="${escapeAttr(nonce)}"` : ''}>(function(){function start(){import(new URL(${inlineJson(first.src)},document.baseURI).href);}if(document.readyState==="complete")start();else window.addEventListener("load",start,{once:true});})();</script>`;
	}
	const descriptors = scripts.map((script) => ({
		...script,
		type: script.type === 'classic' ? 'text/javascript' : 'module',
		...(nonce ? { nonce } : {})
	}));
	const json = inlineJson(descriptors);
	return `<script${nonce ? ` nonce="${escapeAttr(nonce)}"` : ''}>(function(scripts){
const anchor=document.currentScript;
function load(script){
if(script.type==="module"&&!script.integrity&&script.crossOrigin!=="use-credentials")return import(new URL(script.src,document.baseURI).href);
return new Promise(function(resolve,reject){
const element=document.createElement("script");
Object.assign(element,script);
element.onload=resolve;
element.onerror=function(){reject(new Error("Failed to load bootstrap script: "+script.src));};
anchor.parentNode.insertBefore(element,anchor);
});
}
function start(){scripts.reduce(function(previous,script){return previous.then(function(){return load(script);});},Promise.resolve());}
if(document.readyState==="complete")start();else window.addEventListener("load",start,{once:true});
})(${json});</script>`;
}

/** Keeps trusted asset configuration inert inside an HTML script element. */
function inlineJson(value: unknown): string {
	return JSON.stringify(value)
		.replaceAll('<', '\\u003c')
		.replaceAll('\u2028', '\\u2028')
		.replaceAll('\u2029', '\\u2029');
}
