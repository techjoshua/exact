/** Authored source witnesses for paired island extraction and shared adapter execution. */
export const islandLexicalSources = [
	[
		'List',
		'import type { Component } from "@exactjs/core";\nimport { Leaf } from "./Leaf.js";\ntype Item = { id: string; label: string };\nexport function List(this: Component<{ active: string }>, props: { items: readonly Item[] }) {\n this.state.active = "";\n return () => <ul>{props.items.map(item => <Leaf key={item.id} text={item.label} active={this.state.active === item.id} onEnter={() => this.state.active = item.id} />)}</ul>;\n}\n'
	],
	[
		'GenericOwner',
		'import type { Component } from "@exactjs/core";\nimport { Leaf } from "./Leaf.js";\ntype Item = { id: string; label: string };\nexport function List<T extends Item>(this: Component<{ active: string }>, props: { items: readonly T[] }) {\n this.state.active = "";\n return () => <ul>{props.items.map(item => <Leaf key={item.id} text={item.label} active={this.state.active === item.id} onEnter={() => this.state.active = item.id} />)}</ul>;\n}\n'
	],
	[
		'Annotated',
		'import type { Component } from "@exactjs/core";\nimport { Leaf } from "./Leaf.js";\ntype Item = { /** @exact key */ id: string; label: string };\nexport function List(this: Component<{ active: string }>, props: { items: readonly Item[] }) {\n this.state.active = "";\n return () => <ul>{props.items.map(item => <Leaf text={item.label} active={this.state.active === item.id} onEnter={() => this.state.active = item.id} />)}</ul>;\n}\n'
	],
	[
		'ExplicitMap',
		'import type { Component } from "@exactjs/core";\nimport { Leaf } from "./Leaf.js";\ntype Item = { id: string; label: string };\nexport function List(this: Component<{ active: string }>, props: { items: readonly Item[] }) {\n this.state.active = "";\n return () => <ul>{this.map(props.items, item => item.id, item => <Leaf key={item.id} text={item.label} active={this.state.active === item.id} onEnter={() => this.state.active = item.id} />)}</ul>;\n}\n'
	],
	[
		'LocalScalar',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{count:number}>,props:{item:{label:string}}){type LocalItem={label:string};const item:LocalItem=props.item;this.state.count=0;return()=> <button onClick={()=>this.state.count++}>{item.label}{this.state.count}</button>}'
	],
	[
		'LocalAlias',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){type LocalItem={id:string,label:string};const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}'
	],
	[
		'Nested',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\ntype Item={id:string,label:string};export function List(this:Component<{active:string}>,props:{groups:readonly {id:string,items:readonly Item[]}[]}){this.state.active="";return()=> <ul>{props.groups.map(group=><section key={group.id}>{group.items.map(item=><Leaf key={item.id} text={item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</section>)}</ul>}'
	],
	[
		'FunctionCallback',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\ntype Item={id:string,label:string};export function List(this:Component<{active:string}>,props:{items:readonly Item[]}){this.state.active="";const owner=this;return()=> <ul>{props.items.map(function(item){return <Leaf key={item.id} text={item.label} active={owner.state.active===item.id} onEnter={()=>owner.state.active=item.id}/>})}</ul>}'
	],
	[
		'FindingShape',
		"import type {Component} from '@exactjs/core';\ntype RowProps={tone:'notice'|'critical';tag:string;message:string;detail:string;lit:boolean;onEnter:()=>void;onLeave:()=>void};\ntype Finding=Omit<RowProps,'lit'|'onEnter'|'onLeave'>&{id:string;pointsAt:string};\nfunction FindingRow(row:RowProps){return()=> <li onMouseEnter={row.onEnter} onMouseLeave={row.onLeave}>{row.message}{row.lit?' active':''}</li>;}\nexport function List(this:Component<{litId:string}>,props:{findings:readonly Finding[]}){\n this.state.litId='';return()=> <div><ul>{props.findings.map(finding=><FindingRow key={finding.id} tone={finding.tone} tag={finding.tag} message={finding.message} detail={finding.detail} lit={this.state.litId===finding.id} onEnter={()=>this.state.litId=finding.id} onLeave={()=>this.state.litId=''}/>)}</ul><p>{props.findings.find(finding=>finding.id===this.state.litId)?.pointsAt??'Point at a finding.'}</p></div>;\n}"
	],
	[
		'RecursiveLocalRuntime',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){type LocalItem={readonly id:string;readonly label:string;children?:readonly LocalItem[]}; const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}'
	],
	[
		'MutualLocal',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){type LocalItem={readonly id:string;readonly label:string;children?:readonly Branch[]};type Branch={item:LocalItem}; const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}'
	],
	[
		'RecursiveInterface',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){interface Base{readonly id:string;readonly label:string} interface LocalItem extends Base{children?:readonly LocalItem[]} const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}'
	],
	[
		'GenericRecursive',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List<T extends {id:string,label:string}>(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){type LocalItem={readonly id:string;readonly label:string;extra?:T;children?:readonly LocalItem[]}; const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}'
	],
	[
		'RecursiveSetupQuery',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){const seed={label:\'example\'};type Unused=typeof seed;type LocalItem={readonly id:string;readonly label:string;example?:typeof seed;children?:readonly LocalItem[]}; const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}'
	],
	[
		'MergedInterface',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){interface Base{readonly id:string;readonly label:string} interface LocalItem extends Base{children?:readonly LocalItem[]} interface LocalItem{extra?:number} const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}'
	],

	[
		'QueryParameter',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){type LocalItem={readonly id:string;readonly label:string;example?:typeof props;children?:readonly LocalItem[]}; const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}'
	],
	[
		'QueryParameterMember',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){type LocalItem={readonly id:string;readonly label:string;example?:typeof props.items;children?:readonly LocalItem[]}; const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}'
	],
	[
		'QueryMaterialized',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){type LocalItem={readonly id:string;readonly label:string;children?:readonly LocalItem[]}; const items:(typeof props)["items"]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.label.trim()} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}'
	],
	[
		'QueryFunction',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){type LocalItem={readonly id:string;readonly label:string;children?:readonly LocalItem[]}; function read(row:(typeof props.items)[number]){return row.label.trim();} const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={read(item)} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}'
	],
	[
		'GenericRequiredMeaning',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){type Box<T>={value:T;next?:Box<T>};type LocalItem={readonly id:string;readonly label:string;children?:readonly LocalItem[]; box?:Box<number>}; const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.box?.next?.next?.value.toFixed() ?? item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}'
	],
	[
		'GenericDefaultDeeper',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){type Box<T=string>={value:T;next?:Box<T>};type LocalItem={readonly id:string;readonly label:string;children?:readonly LocalItem[]; box?:Box<number>}; const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.box?.next?.next?.value.toFixed() ?? item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}'
	],
	[
		'GenericShadowMeaning',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List<T extends {id:string,label:string}>(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){type Box<T>={value:T;next?:Box<T>};type LocalItem={readonly id:string;readonly label:string;children?:readonly LocalItem[]; box?:Box<number>}; const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.box?.next?.next?.value.toFixed() ?? item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}'
	],
	[
		'InferredGeneric',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){type Box<T=string>={value:T;next?:Box<T>};type LocalItem={readonly id:string;readonly label:string;children?:readonly LocalItem[]; box?:Box<number>}; const input:readonly LocalItem[]=props.items;const items=input;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.box?.next?.next?.value.toFixed() ?? item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}'
	],
	[
		'UnusedPropsAlias',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){const source=props;type LocalItem={readonly id:string;readonly label:string;children?:readonly LocalItem[]}; const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}'
	],
	[
		'GuardedUnionChildren',
		'import type {Component,RenderResult} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{active:string}>,props:({kind:"a";children?:RenderResult}|{kind:"b"})&{items:readonly {id:string,label:string}[]}){const source=props;type LocalItem={readonly id:string;readonly label:string;children?:readonly LocalItem[]}; const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul data-children={\'children\' in props?\'present\':\'absent\'}>{items.map(item=><Leaf key={item.id} text={item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}{\'children\' in props ? props.children : undefined}</ul>}\n/** @exact server */ export function ServerChild(){return()=> <em data-owned>Owned</em>;}'
	],
	[
		'InferredCallbackCapture',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){type Box<T=string>={value:T;next?:Box<T>};type LocalItem={readonly id:string;readonly label:string;children?:readonly LocalItem[]; box?:Box<number>}; const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><button key={item.id} title={item.box?.next?.value.toFixed()} onClick={()=>{}}>{item.label}</button>)}</ul>}'
	],
	[
		'InferredQueryCapture',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){type LocalItem={readonly id:string;readonly label:string;example?:typeof props;children?:readonly LocalItem[]}; const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><button key={item.id} title={item.example?.items[0]?.label.trim()} onClick={()=>{}}>{item.label}</button>)}</ul>}'
	],
	[
		'ReceiverQueryHeader',
		'import type {Component} from "@exactjs/core";\nimport {Leaf} from "./Leaf.js";\nexport function List(this:Component<{active:string;initial?:typeof props.items}>,props:{items:readonly {id:string,label:string}[]}){type LocalItem={readonly id:string;readonly label:string;example?:typeof props;children?:readonly LocalItem[]}; const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}'
	]
] as const;
