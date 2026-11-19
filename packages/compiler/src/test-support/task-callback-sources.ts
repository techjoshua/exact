/** Callback execution shapes sharing the task-owner acquisition boundary. */
export const callbackTaskCases = [
	{ name: 'named callback', form: 'named' },
	{ name: 'arrow callback', form: 'arrow' },
	{ name: 'returned callback', form: 'returned' },
	{ name: 'recursive helper', form: 'recursive' },
	{ name: 'direct call control', form: 'direct' },
	{ name: 'call receiver', form: 'call' },
	{ name: 'apply receiver', form: 'apply' },
	{ name: 'parent executes callback', form: 'named', invalid: 'parent' },
	{ name: 'same client task executes callback', form: 'named', invalid: 'same' },
	{ name: 'server child reads browser', form: 'named', invalid: 'child' },
	{ name: 'parent and child invoke the same server helper', form: 'named', invalid: 'both' },
	{ name: 'caller argument getter', form: 'named', invalid: 'argument' }
] as const;

/** Supplies an actual server-local callback, preserving ordinary return and receiver behavior. */
export function callbackTaskHelper(form: string): string {
	const callback =
		form === 'arrow'
			? "const defaults=()=>({directory:resolve(process.cwd(),'data')});"
			: "function defaults(){return {directory:resolve(process.cwd(),'data')};}";
	const invoke =
		form === 'recursive'
			? 'function invoke(build:typeof defaults,n=1):string{const result=build().directory;if(n>0)invoke(build,n-1);return result;}'
			: form === 'call'
				? 'function invoke(build:typeof defaults):string{return build.call(undefined).directory;}'
				: form === 'apply'
					? 'function invoke(build:typeof defaults):string{return build.apply(undefined,[]).directory;}'
					: 'function invoke(build:typeof defaults):string{return build().directory;}';
	const body =
		form === 'direct'
			? 'defaults().directory'
			: form === 'returned'
				? 'invoke(acquire())'
				: 'invoke(defaults)';
	return `import{resolve}from 'node:path';${callback}${invoke}
 function acquire(){return defaults;}
 export async function callbackOnly(input:string,signal:AbortSignal):Promise<string>{if(signal.aborted)throw signal.reason;return ${body}+input;}`;
}

/** Emits a browser parent and a canonical server child, or a deliberately invalid owner control. */
export function callbackTaskSource(example: { form: string; invalid?: string }): string {
	const invalid = example.invalid;
	const child = invalid === 'child' ? 'document.title' : 'input';
	const target = invalid === 'parent' || invalid === 'same' ? 'callbackOnly' : 'auditOnServer';
	const argument =
		invalid === 'argument' ? '({get value(){return process.cwd();}}).value' : 'draft';
	const invocation =
		target === 'callbackOnly'
			? `${target}(${argument},new AbortController().signal)`
			: `${target}(${argument})`;
	return `import{TaskContext,type Component}from '@exactjs/core';import{callbackOnly}from './helper.js';
 export function Page(this:Component<{revision:number;draft:string}>){this.state.revision=0;this.state.draft='';
 function auditOnServer(input:string,task:TaskContext=TaskContext.server()):Promise<string>{return callbackOnly(${child},task.signal);}
 const refreshAudit=async(revision:number,draft=this.state.draft${invalid === 'same' ? ',task:TaskContext=TaskContext.client()' : ''})=>{
 if(revision===0)return;
 ${invalid === 'both' ? 'await callbackOnly(draft,new AbortController().signal);' : ''}
 const result=await ${invocation};if(result!=='')location.assign(result);
 };void refreshAudit(this.state.revision);return()=> <button onClick={()=>this.state.revision++}>Run</button>;}`;
}
