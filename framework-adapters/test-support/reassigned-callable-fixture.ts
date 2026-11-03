/** Ordinary module cases shared by paired SDK and adapter artifact acceptance. */
export const reassignedCallableCases = [
	{
		name: 'replacement',
		browser: true,
		source:
			'let notify:()=>string=()=>"safe";notify=()=>document.title;export const value=notify();export const stable="stable";'
	},
	{
		name: 'obsolete body',
		browser: false,
		source:
			'let notify:()=>string=()=>document.title;notify=()=>"safe replacement";export const value=notify();export const stable="stable";'
	}
] as const;

/** Uses the same strict declaration inputs for source preflight and adapter builds. */
export function reassignedCallableProject(entry: string) {
	return {
		compilerOptions: {
			target: 'ES2022',
			module: 'NodeNext',
			moduleResolution: 'NodeNext',
			strict: true,
			lib: ['ES2022', 'DOM'],
			types: [],
			noEmit: true
		},
		files: [entry]
	};
}

/** Checks exported values and actual browser Gets in one isolated artifact process. */
export function reassignedCallableVerifier(
	artifact: string,
	browser: boolean,
	target: 'client' | 'server'
) {
	return `import assert from 'node:assert/strict';
let reads=0;
const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
try {
 Object.defineProperty(globalThis,'document',{configurable:true,value:{get title(){reads++;return 'browser'}}});
 const imported=await import(${JSON.stringify(artifact)});
 const result=imported.default??imported;
 assert.equal(result.stable,'stable');
 ${browser && target === 'server' ? "assert.equal(Object.hasOwn(result,'value'),false);" : `assert.equal(result.value,${JSON.stringify(browser ? 'browser' : 'safe replacement')});`}
 assert.equal(reads,${browser && target === 'client' ? 1 : 0});
 console.log('reassigned callable artifact retained');
} finally {
 if(previous)Object.defineProperty(globalThis,'document',previous);
 else delete globalThis.document;
}
`;
}
