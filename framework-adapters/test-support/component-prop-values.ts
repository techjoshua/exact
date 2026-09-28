/** Server artifacts called by a general-runtime helper must observe scalar values, including falsy ones. */
export const componentPropValuesSource = `
/** @exact server */
export function ScalarProp(props: {value:unknown}) {
 return () => <output>{typeof props.value}:{String(props.value)}:{props.value ? 'truthy' : 'falsy'}</output>;
}
/** @exact server */
export function ScheduledScalarProp(this: Component<{value:unknown}>, props: {value:unknown}) {
 this.state.value = undefined;
 async function prepare(_task: TaskContext = TaskContext.server().blocking()) {
  void _task; await Promise.resolve(); this.state.value = props.value;
 }
 prepare();
 return () => <output>{typeof this.state.value}:{String(this.state.value)}:{this.state.value ? 'truthy' : 'falsy'}</output>;
}
`;

/** Models the general helper's emitted expression ABI alongside the precompiled server artifact. */
export function componentPropValuesProbe(componentModule: string) {
	return `
import {ScalarProp, ScheduledScalarProp} from ${JSON.stringify(componentModule)};
import {createExpression} from '@exactjs/core/runtime/render-operations';
import {createCompiledComponentReceipt} from '@exactjs/core/runtime/component-operations';
import {renderToString} from '@exactjs/ssr';
import {literalFalse, literalZero, literalEmpty} from './general-helper.mjs';
export async function probeComponentProps() {
 const result=[];
 for(const component of [ScalarProp,ScheduledScalarProp]) {
  for(const value of [false,true,0,'','ready',null,undefined]) {
   const rendered = await renderToString(createCompiledComponentReceipt(component,{value:createExpression(()=>value)}),{markers:false});
   result.push(rendered.html);
  }
 }
 for(const helper of [literalFalse,literalZero,literalEmpty]) result.push((await renderToString(helper(),{markers:false})).html);
 return result;
}
`;
}
