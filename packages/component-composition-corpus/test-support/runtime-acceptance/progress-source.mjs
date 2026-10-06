/** Builds owned progress with an upstream gate and checks computed collection selection order. */
export const progressSource = (
	controlOrigin
) => `import {TaskContext,type Component} from '@exactjs/core';
let runs=0; const cleaned=[];
function optimistic(){runs++;}
export function runCount() {return {runs,cleaned};}
export function NativeProgress(this: Component<{completed:number;rows:number[];lookup:Map<string,number>;members:Set<number>}>) {
 this.state.completed=0;
 this.state.rows=[];this.state.lookup=new Map();this.state.members=new Set();
 const report=(snapshot:{completed:number;id:number},_task:TaskContext=TaskContext.client().progress())=>{
  const trace:string[]=[];
  this.state.rows[(trace.push('row-key'),'push' as const)]((trace.push('row-args'),snapshot.completed));
  this.state.lookup[(trace.push('map-key'),'set' as const)]('completed',(trace.push('map-args'),snapshot.completed));
  this.state.members[(trace.push('set-key'),'add' as const)]((trace.push('set-args'),snapshot.completed));
  if(trace.join(',')!=='row-key,row-args,map-key,map-args,set-key,set-args') throw new Error('Progress collection selection changed execution order');
  this.state.completed=snapshot.completed;
 };
 const job=async(id:number,mode:string,task:TaskContext=TaskContext.server())=>{
  optimistic(); task.cleanup(()=>{cleaned.push({id,aborted:task.signal.aborted});});
  report({completed:42,id});
  const response=await fetch(${JSON.stringify(controlOrigin)}+'/gate?id='+id,{signal:task.signal});
  const reader=response.body.getReader();
  try {while(!(await reader.read()).done) report({completed:42,id});}
  finally {reader.releaseLock();}
  if(mode==='fail') throw new Error('expected native task failure');
  return id;
 };
 return ()=><button onClick={()=>job(0,'normal')}>{this.state.completed}</button>;
}`;
