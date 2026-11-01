/** Finite native-pattern witnesses shared by ordinary and owned publication checks. */
export const nativePatternSources = {
	reported:
		'type Owner={value:number;values:number[];trace:string[]};export function work(owner:Owner){const input:[number?,number?]=[,4];[owner.value=3,owner.values[0]=0]=input;return JSON.stringify({value:owner.value,values:[...owner.values],trace:[...owner.trace]});}',
	'dense-skipped':
		'type Owner={value:number;values:number[];trace:string[]};export function work(owner:Owner){const input=[5,4];[owner.value=3,owner.values[0]=0]=input;return JSON.stringify({value:owner.value,values:[...owner.values],trace:[...owner.trace]});}',
	'no-default-result':
		'type Owner={value:number|undefined;values:(number|undefined)[];trace:string[]};export function work(owner:Owner){const input:[number?,number?]=[,4];const result=([owner.value,owner.values[0]]=input);owner.trace.push(String(result===input));return JSON.stringify({value:owner.value,values:[...owner.values],trace:[...owner.trace]});}',
	'named-default':
		'type Owner={value:number;values:number[];trace:string[]};export function work(owner:Owner){const input:number[]=[];[owner.value=3]=input;return JSON.stringify({value:owner.value,values:[...owner.values],trace:[...owner.trace]});}',
	'object-default':
		'type Owner={value:number;values:number[];trace:string[]};export function work(owner:Owner){const input:{value?:number}={};({value:owner.value=3}=input);return JSON.stringify({value:owner.value,values:[...owner.values],trace:[...owner.trace]});}',
	'pure-no-default':
		'export function work(owner:{value:number;values:number[]},input:number[]){return ([owner.value,owner.values[0]]=input);}',
	'receiver-default-result':
		'export function work(owner:{values:number[];replacement:number[]},input:(number|undefined)[]){return ([owner.values[0]=(owner.values=owner.replacement,3)]=input);}',
	'abrupt-iterator':
		'export function work(owner:{value:number;values:number[]},input:Iterable<number|undefined>){return ([owner.value=3,owner.values[0]=0]=input);}',
	'generation-default':
		'export function work(owner:{value:number;values:number[];stop:void},input:Iterable<number|undefined>){return ([owner.value=3,owner.values[0]=(owner.stop,4)]=input);}'
} as const;
