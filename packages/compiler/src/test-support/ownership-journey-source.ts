/** Authored ownership fixture shared by public paired and installed-package checks. */
export const ownershipPanelSource = `import { TaskContext, taskStatus, type Component } from '@exactjs/core';
type Run = { token: number; result: Promise<number> };
const service = () => (globalThis as unknown as { exactOwnership: {
 open(owner: string, signal: AbortSignal): Run; close(token: number): void;
 mounted(owner: string): void; unmounted(owner: string): void;
} }).exactOwnership;
export function Panel(this: Component<{profile:{count:number;note:number}; rows:Map<string,number>; selected:Set<string>;progress:number;events:number}>, props:{owner:string}) {
 const owner = props.owner;
 this.state.profile = {count:0,note:0};
 this.state.rows = new Map(); this.state.selected = new Set();
 this.state.progress = 0; this.state.events = 0;
 function progress(value:number, task:TaskContext=TaskContext.client().progress()) {this.state.progress=value;}
 async function load(offset:number, task:TaskContext=TaskContext.server().latest()) {
  if (owner !== props.owner || (function() { return props.owner; })() !== props.owner) throw new Error('Mismatched owner capture');
  const run = service().open(props.owner, task.signal);
  task.cleanup(() => service().close(run.token));
  progress(1);
  const value = await run.result;
  this.state.profile.count = value + offset;
  this.state.rows.set('remote',value);
  this.state.selected.add('remote');
 }
 async function optimistic(task:TaskContext=TaskContext.client().latest()) {
  task.optimistic(() => {this.state.profile.note=-1; this.state.rows.set('optimistic',-1);this.state.selected.add('optimistic');});
  const run = service().open(props.owner+'-optimistic',task.signal);
  task.cleanup(() => service().close(run.token));
  await run.result;
 }
 const status = taskStatus(optimistic);
 this.onMount(({signal}) => {
  service().mounted(props.owner);
  window.addEventListener('ownership-probe', () => {this.state.events++;}, {signal});
 });
 this.onUnmount(() => service().unmounted(props.owner));
 return () => <section>
  <button onClick={() => load(0)}>Load</button>
  <button onClick={() => {this.state.profile.note++;this.state.rows.set('local',this.state.profile.note);this.state.selected.add('local');}}>Edit</button>
  <button onClick={() => optimistic()}>Optimistic</button>
  <button onClick={() => status.cancel()}>Cancel</button>
  <output>{this.state.profile.count}:{this.state.profile.note}:{this.state.rows.get('remote') ?? 0}:{this.state.rows.get('local') ?? 0}:{this.state.selected.size}:{this.state.progress}:{this.state.events}</output>
 </section>;
}
`;

/** Paired roots for independent owner and task-lifecycle checks. */
export const ownershipJourneySource =
	ownershipPanelSource +
	`
export function Shell(this:Component<{ready:boolean}>, props:{owner:string}) {
 function prepare(task:TaskContext=TaskContext.server().blocking()) {this.state.ready=true;}
 prepare(); return () => <Panel owner={props.owner}/>;
}`;
