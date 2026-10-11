/** Shares owned ref and reactive producer definitions across adapter and native-host journeys. */
export const ownedProtocolIslandSource = `
import {createRef} from '@exactjs/core';
const ownedRef=createRef<HTMLButtonElement>('owned-island-ref');
export function OwnedProtocolValues(this:import('@exactjs/core').Component<{count:number}>,props:{offset:number}) {
 this.state.count=0;
 const ref='ref' as const;const binding=this[ref]?.(ownedRef);
 const makeValue=this['reactive'];const value=makeValue(()=>this.state.count+props.offset);
 return()=> <button data-partition="owned-protocol" ref={binding} onClick={()=>{if(binding.current)this.state.count++}}>{value}</button>;
}
export function OwnedProtocolSpreadValues(this:import('@exactjs/core').Component<{count:number}>) {
 this.state.count=0;const binding=this.ref(ownedRef);
 return()=> <button data-partition="owned-spread" {...{ref:binding,onClick:()=>{if(binding.current)this.state.count++}}}>{this.state.count}</button>;
}
`;
