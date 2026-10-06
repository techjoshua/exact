package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

// Each native collection mutator retains its write kind through ordinary and literal-indexed calls.
func TestReactiveCollectionMutationFamilies(t *testing.T) {
	cases := []struct{ path, method, args, operation string }{
		{"rows", "copyWithin", "0,1", "array-mutation"}, {"rows", "fill", "2", "array-mutation"},
		{"rows", "pop", "", "array-mutation"}, {"rows", "push", "2", "array-mutation"},
		{"rows", "reverse", "", "array-mutation"}, {"rows", "shift", "", "array-mutation"},
		{"rows", "sort", "(a,b)=>b-a", "array-mutation"}, {"rows", "splice", "0,1,2", "array-mutation"},
		{"rows", "unshift", "2", "array-mutation"}, {"map", "clear", "", "map-mutation"},
		{"map", "delete", `"a"`, "map-mutation"}, {"map", "set", `"a",2`, "map-mutation"},
		{"set", "add", "2", "set-mutation"}, {"set", "clear", "", "set-mutation"}, {"set", "delete", "2", "set-mutation"},
	}
	for _, test := range cases {
		for _, computed := range []bool{false, true} {
			for _, target := range []Target{TargetClient, TargetServer} {
				member := "." + test.method
				if computed {
					member = fmt.Sprintf("[%q]", test.method)
				}
				source := `export function Page(this:{state:{rows:number[];map:Map<string,number>;set:Set<number>}}){this.state.rows=[1,2];this.state.map=new Map();this.state.set=new Set();return()=> <button onClick={()=>this.state.` + test.path + member + `(` + test.args + `)}>Go</button>;}`
				response := NewSession().Execute(Request{Kind: "compile", ID: "collection-mutators.tsx", Target: target, Source: source})
				assertReactiveCompilation(t, response, source)
				found := false
				for _, write := range response.Analysis.StateWrites {
					found = found || write.Operation == test.operation
				}
				if !found {
					t.Fatalf("%s %s%s: missing %s", target, test.path, member, test.operation)
				}
			}
		}
	}
}

// Native syntax must preserve its assignment classification, including short-circuit
// updates, conversion results, delete and destructuring targets with lazy defaults.
func TestReactiveAssignmentSyntaxContracts(t *testing.T) {
	works := []string{`this.state.n=3`, `this.state.n+=2`, `this.state.n-=2`, `this.state.n*=2`, `this.state.n/=2`, `this.state.n%=2`, `this.state.n**=2`, `this.state.n<<=1`, `this.state.n>>=1`, `this.state.n>>>=1`, `this.state.n&=1`, `this.state.n|=1`, `this.state.n^=1`, `this.state.n&&=2`, `this.state.n||=2`, `this.state.n??=2`, `++this.state.n`, `--this.state.n`, `this.state.n++`, `this.state.n--`, `delete this.state.optional`, `[this.state.n=2]=[]`, `({value:this.state.n=2}={})`, `this.state["n"]+=2`, `const state=this.state;state.n+=2`, `const {nested}=this.state;nested.n++`, `this.state.n=+this.state.n`}
	for _, work := range works {
		for _, target := range []Target{TargetClient, TargetServer} {
			source := `export function Page(this:{state:{n:number;optional?:number;nested:{n:number}}}){this.state.n=1;this.state.nested={n:0};return()=> <button onClick={()=>{` + work + `;}}>{this.state.n}</button>;}`
			response := NewSession().Execute(Request{Kind: "compile", ID: "assignments.tsx", Target: target, Source: source})
			assertReactiveCompilation(t, response, work)
			if len(response.Analysis.StateWrites) < 3 {
				t.Fatalf("lost mutation for %s: %#v", work, response.Analysis.StateWrites)
			}
		}
	}
}

// Shared computations preserve native selection, pattern defaults and authored type queries.
func TestReactiveDerivedOwnershipContracts(t *testing.T) {
	works := []string{
		`const label=props.value.trim();`,
		`const label=props.value["trim"]();`,
		`const first=props.value.trim();const label=first.toUpperCase();`,
		`const label=props.value.trim();const alias=label;void alias;`,
		`const {value:label="fallback",...rest}=props;void rest;`,
		`const [label="fallback",...rest]=props.rows;void rest;`,
		`const {nested:{value:label="fallback"}}=props;`,
		`const {value:first="fallback",other:label=first}=props;`,
		`const label:string=props.value.trim();type Authored=typeof label;const check:Authored="ok";void check;`,
		`const value={label:props.value.trim()};type Authored=typeof value.label;const check:Authored="ok";void check;const label=value.label;`,
		`function read(){return props.value.trim();}const alias=read;const label=alias();`,
		`const helper={read(){return props.value.trim();}};const label=helper.read();`,
		`const label=props.rows.map(value=>value.trim()).join(",");`,
		`const label=props.rows.flatMap(value=>[value.trim()]).join(",");`,
		`const label=props.rows.reduceRight((value,row)=>value+row,"");`,
		`const label=props.rows.findIndex(value=>value.length>0).toString();`,
		`const label=props.rows.some(value=>value.length>0).toString();`,
		`const label=props.rows.every(value=>value.length>0).toString();`,
		`const label=props.value.length>0 ? props.value : "fallback";`,
	}
	for _, work := range works {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "derived-ownership.tsx", Target: target, Source: `export function Page(props:{value:string;other?:string;rows:string[];nested:{value?:string}}){` + work + `return()=> <p title={label}>{label}</p>;}`})
			assertReactiveCompilation(t, response, work)
			if len(response.Analysis.ReactiveBindings) == 0 {
				t.Fatalf("missing derived owner: %s", work)
			}
		}
	}
}

// Equivalent availability guards must preserve neutral placement independently of operator spelling.
func TestReactiveHelperAvailabilityGuards(t *testing.T) {
	guards := []string{
		`if(typeof window !== "undefined")window.alert("x");`,
		`if(typeof window != "undefined")window.alert("x");`,
		`if(typeof window == "undefined"){}else window.alert("x");`,
		`typeof window !== "undefined" ? window.alert("x") : undefined;`,
		`typeof window === "undefined" ? undefined : window.alert("x");`,
		`(typeof (window)) !== ("undefined") ? window.alert("x") : undefined;`,
		`typeof window !== "undefined" && window.alert("x");`,
		`typeof window === "undefined" || window.alert("x");`,
	}
	for _, work := range guards {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "guarded-helper.ts", Target: target, Source: `export function run(){` + work + `}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if !strings.Contains(response.Code, "function run") {
				t.Fatalf("guarded helper pruned: %s %s", target, work)
			}
		}
	}
}

func assertReactiveCompilation(t *testing.T, response Response, source string) {
	t.Helper()
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Severity == "error" {
			t.Fatalf("valid source rejected %s: %#v", source, response.Diagnostics)
		}
	}
	if response.Code == "" {
		t.Fatal("missing executable projection")
	}
}

// Primitive conversion does not authorize custom object hooks with the same member names.
func TestReactivePrimitiveConversionOwners(t *testing.T) {
	for _, test := range []struct {
		types, expression string
		safe              bool
	}{
		{`value:boolean`, `props.value.toString()`, true},
		{`value:Readonly<boolean>`, `props.value.toString()`, true},
		{`value:boolean`, `props.value["toString"]()`, true},
		{`value:symbol`, `props.value.toString()`, true},
		{`value: {toString():string}`, `props.value.toString()`, false},
		{`value: Boolean`, `props.value.toString()`, false},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "primitive-conversion.tsx", Target: target, Source: `export function Page(props:{` + test.types + `}){const label=` + test.expression + `;return()=> <p>{label}</p>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			rejected := false
			for _, d := range response.Diagnostics {
				rejected = rejected || d.Code == "EXACT2202"
			}
			if rejected == test.safe {
				t.Fatalf("conversion safety for %s %s: %#v", test.types, test.expression, response.Diagnostics)
			}
		}
	}
}

// Function and arrow task definitions bind collection ownership to the durable component.
// Computed member keys and suspension use the same mutation contract in each concrete target.
func TestReactiveTaskMutationBoundaries(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, function := range []bool{false, true} {
			for _, work := range []string{`this.state.rows["push"](2);`, `this.state.map["set"]("a",2);`, `this.state.set["add"](2);`, `this.state.n += await Promise.resolve(2);`, `this.state.rows["push"](await Promise.resolve(2));`} {
				definition := `const run=async (task:TaskContext=TaskContext.` + string(target) + `().latest().blocking())=>{void task;` + work + `};`
				if function {
					definition = `async function run(task:TaskContext=TaskContext.` + string(target) + `().latest().blocking()){void task;` + work + `}`
				}
				response := NewSession().Execute(Request{Kind: "compile", ID: "task-members.tsx", Target: target, Source: `import {TaskContext} from '@exactjs/core';export function Page(this:{state:{n:number;rows:number[];map:Map<string,number>;set:Set<number>}}){this.state.n=0;this.state.rows=[];this.state.map=new Map();this.state.set=new Set();` + definition + `return()=> <button onClick={()=>run()}>{this.state.n}</button>;}`})
				assertReactiveCompilation(t, response, definition)
				if len(response.Analysis.Tasks) == 0 {
					t.Fatalf("missing task owner %s", definition)
				}
			}
		}
	}
}

// Restrictions follow the actual helper argument or receiver and stop at rebinding
// or ordinary objects. Native loop assignment and reflection are separate rejections.
func TestReactiveHelperRestrictionBoundaries(t *testing.T) {
	for _, test := range []struct {
		work   string
		reject bool
	}{
		{`function update(value:{count:number}){for(value.count of [1,2]){}}update(this.state.nested);`, true},
		{`function update(value:{text:string}){for(value.text in {a:1}){}}update(this.state.nested);`, true},
		{`function update(value:{count:number}){const {set}=Reflect;set(value,"count",2);}update(this.state.nested);`, true},
		{`function update(this:{count:number}){Reflect.set(this,"count",2);}update.call(this.state.nested);`, true},
		{`function update(value:{count:number}){value={count:0};Reflect.set(value,"count",2);}update(this.state.nested);`, false},
		{`function update(value:{count:number}){Reflect.set(value,"count",2);}update({count:0});`, false},
		{`function update(value:{count:number}){value.count++;}update(this.state.nested);`, false},
		{`function update(value:{count:number}){const alias=value;value={count:0};Reflect.set(alias,"count",2);}update(this.state.nested);`, true},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "helper-restrictions.tsx", Target: target, Source: `export function Page(this:{state:{nested:{count:number;text:string}}}){this.state.nested={count:0,text:""};return()=> <button onClick={()=>{` + test.work + `}}>Go</button>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			rejected := false
			for _, d := range response.Diagnostics {
				rejected = rejected || d.Code == "EXACT_STATE_WRITE"
			}
			if rejected != test.reject {
				t.Fatalf("helper restriction %s: %#v", test.work, response.Diagnostics)
			}
		}
	}
}

// Immediate collection callbacks carry their captured state effects into the caller.
// A literal-indexed call must not lose remote write authority compared with dot syntax.
func TestReactiveImmediateCallbackEffects(t *testing.T) {
	for _, method := range []string{"map", "flatMap", "forEach", "some", "every", "findIndex", "sort", "reduceRight"} {
		for _, computed := range []bool{false, true} {
			member := "." + method
			if computed {
				member = fmt.Sprintf("[%q]", method)
			}
			response := NewSession().Execute(Request{Kind: "compile", ID: "callback-effects.tsx", Target: TargetClient, Source: `export function Page(this:{state:{n:number}}){this.state.n=0;const run=()=>[1,2]` + member + `(()=>this.state.n++);return()=> <button onClick={()=>run()}>{this.state.n}</button>;}`})
			assertReactiveCompilation(t, response, member)
			found := false
			for _, callable := range response.Analysis.Callables {
				if callable.Name == "run" {
					found = len(callable.StateWrites) > 0
				}
			}
			if !found {
				t.Fatalf("callback lost captured effect for %s: %#v", member, response.Analysis.Callables)
			}
		}
	}
}

// Progress tasks publish collections separately from blocking pending-state tasks.
// Computed selection must execute in the authored invocation before its arguments.
func TestReactiveProgressCollectionSelection(t *testing.T) {
	for _, work := range []string{`this.state.rows[((trace.push("key")),"push" as const)]((trace.push("args"),value));`, `this.state.map[((trace.push("key")),"set" as const)]("x",(trace.push("args"),value));`, `this.state.set[((trace.push("key")),"add" as const)]((trace.push("args"),value));`} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "progress-selection.tsx", Target: target, Source: `import {TaskContext} from '@exactjs/core';export function Page(this:{state:{rows:number[];map:Map<string,number>;set:Set<number>}}){this.state.rows=[];this.state.map=new Map();this.state.set=new Set();function run(value:number,task:TaskContext=TaskContext.client().progress()){void task;const trace:string[]=[];` + work + `trace.push("after");if(trace.join(",")!=="key,args,after")throw new Error("selection order");}const start=(value:number,task:TaskContext=TaskContext.server())=>{void task;run(value);};return()=> <button onClick={()=>start(1)}>Go</button>;}`})
			assertReactiveCompilation(t, response, work)
		}
	}
}
