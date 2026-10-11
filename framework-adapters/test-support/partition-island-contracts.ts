import { ownedProtocolIslandSource } from './owned-protocol-island-source.mjs';

/** Source witnesses shared by compiler emission and real adapter hydration journeys. */
export const partitionIslandSource = `
${ownedProtocolIslandSource}
import {TargetAttributeOwnershipProbe} from './target-attribute-ownership.js';
export function ReplayOwnership(this:Component<{value:string}>) {
 this.state.value='initial';
 return()=> <input data-partition="event" value={this.state.value} onInput={(event:any)=>{this.state.value=event.value}}/>;
}
export function DormantAwait(this:Component<{value:string}>) {
 this.state.value='initial';
 return()=> <input data-partition="dormant" value={this.state.value} onInput={(event:any)=>{const later=async()=>{await Promise.resolve()};this.state.value=event.type}}/>;
}
export function CapturedMethod(this:Component<{value:string}>) {
 this.state.value='initial';
 return()=> <input data-partition="method" value={this.state.value} onInput={(event:any)=>{const later={read(){return event.type}};this.state.value=later.read()}}/>;
}
export function DistinctPaths(this:Component<{'a.b':number;a:{b:number}}>) {
 this.state['a.b']=1;this.state.a={b:2};
 return()=> <button data-partition="paths" onClick={()=>{this.state['a.b']++;this.state.a.b++}}>{this.state['a.b']}:{this.state.a.b}</button>;
}
export function OpaqueCallbacks(this:Component<{count:number}>,props:{flag:boolean}) {
 this.state.count=0;
 const attrs=props.flag?{onClick:()=>this.state.count++}:{onDoubleClick:()=>this.state.count++};
 return()=> <button data-partition="opaque" {...attrs}>{this.state.count}</button>;
}
`;

/** Places every witness under a server-owned shell without specializing its definition. */
export const partitionIslandInstances =
	'<OwnedProtocolValues offset={2}/><OwnedProtocolSpreadValues/><ReplayOwnership/><DormantAwait/><CapturedMethod/><DistinctPaths/><OpaqueCallbacks flag={true}/><TargetAttributeOwnershipProbe/>';
