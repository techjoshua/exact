/** Builds the owned progress source with a runtime-independent upstream gate. */
export const progressSource = (
	controlOrigin
) => `import {TaskContext,type Component} from '@exactjs/core';
let runs=0; const cleaned=[];
export function runCount() {return {runs,cleaned};}
export function NativeProgress(this: Component<{completed:number}>) {
 this.state.completed=0;
 const report=(snapshot:{completed:number;id:number},_task:TaskContext=TaskContext.client().progress())=>{
  this.state.completed=snapshot.completed;
 };
 const job=async(id:number,mode:string,task:TaskContext=TaskContext.server())=>{
  runs++; task.cleanup(()=>{cleaned.push({id,aborted:task.signal.aborted});});
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
