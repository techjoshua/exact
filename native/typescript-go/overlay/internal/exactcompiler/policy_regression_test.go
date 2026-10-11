package exactcompiler

import "testing"

// TestPolicyCallableResultsRetainQualificationAndPublicProjection protects resolved return ownership.
func TestPolicyCallableResultsRetainQualificationAndPublicProjection(t *testing.T) {
	declarations := `declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};
type Credential=Protected<string>;
interface RecordValue{next?:RecordValue;label:string;credential:Credential}
declare function readRecord():RecordValue;
declare function readNext():RecordValue|undefined;
declare function readCredential():Credential;
declare const callable:()=>Credential;
/** @exact keep=secret */ declare function annotated():RecordValue;
declare const privateService:{read():Credential};
declare const publicService:{read():string};`
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		session := NewSession()
		for _, example := range []struct {
			expression string
			protected  bool
		}{
			{"readRecord().label", false},
			{`readRecord()["label"]`, false},
			{"readNext()?.label", false},
			{"JSON.stringify(readRecord())", true},
			{"JSON.stringify(readNext())", true},
			{"readRecord().credential", true},
			{"readCredential()", true},
			{"callable()", true},
			{"annotated().label", true},
			{"privateService.read()", true},
			{"publicService.read()", false},
		} {
			response := session.Execute(Request{Kind: "analyze", Target: target, ID: "policy-results.tsx", Source: declarations + `export function Panel(){void privateService.read();return()=> <p>{` + example.expression + `}</p>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if hasDiagnosticCode(response.Diagnostics, "EXACT3020") != example.protected {
				t.Fatalf("target %s expression %s has unexpected disclosure policy: %#v", target, example.expression, response.Diagnostics)
			}
		}
	}
}

// TestPolicyConsumeUsesProjectedTaskPlacement protects consumption and originating-host defaults.
func TestPolicyConsumeUsesProjectedTaskPlacement(t *testing.T) {
	declarations := `import{TaskContext,type Component}from '@exactjs/core';import{consume}from '@exactjs/secrets';
/** @exact keep=secret */ declare const credential:string;`
	for _, example := range []struct {
		definition string
		denied     bool
	}{
		{`const load=(_task:TaskContext=TaskContext.server())=>{void consume(credential);this.state.label="public";};`, false},
		{`function load(_task:TaskContext=TaskContext.server()){void consume(credential);this.state.label="public";}`, false},
		{`const load=(_task:TaskContext=TaskContext.client())=>void consume(credential);`, true},
		{`const load=(_task:TaskContext=TaskContext.server(),value=consume(credential))=>void value;`, true},
		{`function helper(){return consume(credential);}const load=(_task:TaskContext=TaskContext.server())=>void helper();`, true},
	} {
		response := NewSession().Execute(Request{Kind: "compile", Target: TargetClient, ID: "policy-task.tsx", Source: declarations + `export function Page(this:Component<{label:string}>){` + example.definition + `return()=> <button onClick={()=>load()}>{this.state.label}</button>;}`})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if hasDiagnosticCode(response.Diagnostics, "EXACT3004") != example.denied {
			t.Fatalf("unexpected client consumption policy: %#v", response.Diagnostics)
		}
	}
}

// TestPolicyPlacementCannotEraseTypeQualification protects declarations without initializer flows.
func TestPolicyPlacementCannotEraseTypeQualification(t *testing.T) {
	prefix := `declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};
`
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		for _, annotation := range []string{"shared", "keep=client", "keep=server"} {
			for _, example := range []struct{ declaration, expression string }{
				{"declare const value:Protected<string>;", "value"},
				{"declare function read():Protected<string>;", "read()"},
				{"declare const read:()=>Protected<string>;", "read()"},
			} {
				response := NewSession().Execute(Request{Kind: "analyze", Target: target, ID: "qualification.tsx", Source: prefix + "/** @exact " + annotation + " */\n" + example.declaration + `export function Panel(){return()=> <p>{` + example.expression + `}</p>;}`})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if !hasDiagnosticCode(response.Diagnostics, "EXACT3020") {
					t.Fatalf("%s %s lost qualification: %#v", target, annotation, response.Diagnostics)
				}
			}
		}
	}
}

// TestPolicyAccessorValuesRetainQualification protects value contracts without rewriting accessors.
func TestPolicyAccessorValuesRetainQualification(t *testing.T) {
	prefix := `declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};
declare class Service{get token():Protected<string>;get label():string;}
declare const service:Service;`
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		for _, example := range []struct {
			expression string
			protected  bool
		}{
			{"service.token", true}, {`service["token"]`, true}, {"service.label", false},
		} {
			response := NewSession().Execute(Request{Kind: "analyze", Target: target, ID: "accessor.tsx", Source: prefix + `export function Panel(){return()=> <p>{` + example.expression + `}</p>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if hasDiagnosticCode(response.Diagnostics, "EXACT3020") != example.protected {
				t.Fatalf("%s %s unexpected accessor policy: %#v", target, example.expression, response.Diagnostics)
			}
		}
	}
}

// TestPolicyGenericSelectionRetainsQualification protects the instantiated contract and public controls.
func TestPolicyGenericSelectionRetainsQualification(t *testing.T) {
	prefix := `declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};
declare function read<T>():T;
declare function factory():()=>Protected<string>;
declare function publicFactory():()=>string;
declare class Service<T>{read():T;get value():T;field:T;}
declare const privateService:Service<Protected<string>>;
declare const publicService:Service<string>;`
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		for _, example := range []struct {
			expression string
			protected  bool
		}{
			{"read<Protected<string>>()", true}, {"factory()()", true}, {"privateService.read()", true}, {"privateService.value", true}, {"privateService.field", true},
			{"read<string>()", false}, {"publicFactory()()", false}, {"publicService.read()", false}, {"publicService.value", false}, {"publicService.field", false},
		} {
			first := `void read<Protected<string>>();void privateService.read();void privateService.value;void privateService.field;`
			if example.protected {
				first = `void read<string>();void publicService.read();void publicService.value;void publicService.field;`
			}
			response := NewSession().Execute(Request{Kind: "analyze", Target: target, ID: "generic-policy.tsx", Source: prefix + `function prime(){` + first + `}export function Panel(){return()=> <p>{` + example.expression + `}</p>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if hasDiagnosticCode(response.Diagnostics, "EXACT3020") != example.protected {
				t.Fatalf("%s %s unexpected generic policy: %#v", target, example.expression, response.Diagnostics)
			}
		}
	}
}

// TestPolicyNativeInvocations protects result qualification and native argument positions.
func TestPolicyNativeInvocations(t *testing.T) {
	prefix := `declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};
declare const credential:Protected<string>;
declare function tag(strings:TemplateStringsArray):Protected<string>;
declare function publicTag(strings:TemplateStringsArray):string;
declare const Maker:{new():Protected<{value:string}>};
declare const PublicMaker:{new():{value:string}};`
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		for _, example := range []struct {
			expression string
			protected  bool
		}{
			{"tag`value`", true}, {"JSON.stringify(new Maker())", true}, {"publicTag`value`", false}, {"JSON.stringify(new PublicMaker())", false},
		} {
			response := NewSession().Execute(Request{Kind: "analyze", Target: target, ID: "native-invocation.tsx", Source: prefix + `export function Panel(){return()=> <p>{` + example.expression + `}</p>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if hasDiagnosticCode(response.Diagnostics, "EXACT3020") != example.protected {
				t.Fatalf("%s %s unexpected result policy: %#v", target, example.expression, response.Diagnostics)
			}
		}
		for _, example := range []struct {
			definition, expression string
			denied                 bool
		}{
			{"declare class Consumer{constructor(value:string)}", "new Consumer(credential)", true},
			{"declare class Consumer{constructor(value:Protected<string>)}", "new Consumer(credential)", false},
			{"declare function use(strings:TemplateStringsArray,label:string,value:Protected<string>):void;", "use`label:${\"public\"} value:${credential}`", false},
			{"declare function use(strings:TemplateStringsArray,value:string,label:Protected<string>):void;", "use`value:${credential} label:${credential}`", true},
		} {
			response := NewSession().Execute(Request{Kind: "analyze", Target: target, ID: "native-arguments.tsx", Source: prefix + example.definition + `function prime(){void ` + example.expression + `;}export function Panel(){return()=> <p>Public</p>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if hasDiagnosticCode(response.Diagnostics, "EXACT3003") != example.denied {
				t.Fatalf("%s %s unexpected parameter policy: %#v", target, example.expression, response.Diagnostics)
			}
		}
	}
}

// TestPolicyDeclaredReceiptAndNativeForwarding protects authority before generic inference and expansion.
func TestPolicyDeclaredReceiptAndNativeForwarding(t *testing.T) {
	declarations := `declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};
declare const credential:Protected<string>;`
	for _, example := range []struct {
		definition, invocation string
		denied                 bool
	}{
		{`declare function helper<T>(value:T):void;`, `helper(credential)`, true},
		{`declare function helper<T>(value:Protected<T>):void;`, `helper(credential)`, false},
		{`declare function helper(value:Protected<string>):void;`, `helper.call(null,credential)`, false},
		{`declare function helper(value:Protected<string>):void;`, `helper.apply(null,[credential])`, false},
		{`declare function helper(value:Protected<string>):void;`, `helper.bind(null,credential)`, false},
		{`declare function helper<T>(value:T):void;`, `helper.call(null,credential)`, true},
		{`declare class Helper{constructor(value:Protected<string>)}`, `Helper.bind(null,credential)`, false},
		{`declare class Helper{constructor(value:string)}`, `Helper.bind(null,credential)`, true},
		{`declare function helper(...values:[Protected<string>,string]):void;declare const values:[Protected<string>,Protected<string>];`, `helper(...values)`, true},
		{`declare function helper(...values:Protected<string>[]):void;declare const values:Protected<string>[];`, `helper(...values)`, false},
		{`declare function helper(a:Protected<string>,b:Protected<string>,c:string):void;declare const values:[Protected<string>,Protected<string>];`, `helper(...values,credential)`, true},
	} {
		response := NewSession().Execute(Request{Kind: "analyze", Target: TargetServer, ID: "receipt.tsx", Source: declarations + example.definition + `export function Panel(){` + example.invocation + `;return()=> <p>Public</p>;}`})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if hasDiagnosticCode(response.Diagnostics, "EXACT3003") != example.denied {
			t.Fatalf("%s: %#v", example.invocation, response.Diagnostics)
		}
	}
}

// TestPolicyAssignmentReceiptsProtectStorageAndNativeControls prevents qualification erasure through writes.
func TestPolicyAssignmentReceiptsProtectStorageAndNativeControls(t *testing.T) {
	declarations := `import{TaskContext}from '@exactjs/core';declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};
declare const credential:Protected<string>;declare const record:{credential:Protected<string>;label:string};`
	for _, example := range []struct {
		body   string
		denied bool
	}{
		{`let value='';value=credential;console.log(value)`, true},
		{`const helper=(value:string=credential)=>console.log(value);helper()`, true},
		{`const helper=(value:Protected<string>=credential)=>void value;helper()`, false},
		{`const helper=(value:string='public')=>console.log(value);helper()`, false},
		{`let value='';value+=credential;console.log(value)`, true},
		{`let value='';({credential:value}=record);console.log(value)`, true},
		{`let label='';({label}=record);console.log(label)`, false},
		{`let label='';({label=credential}=record);console.log(label)`, true},
		{`let value:Protected<string>=credential;value=credential;void value`, false},
		{`for(const value of [credential])console.log(value)`, true},
		{`let value='';for(value of [credential])console.log(value)`, true},
		{`for(const value of ['public'])console.log(value)`, false},
		{`let value=0;if(credential)value++;console.log(value)`, true},
		{`let value='';while(credential){value='private';break;}console.log(value)`, true},
		{`let value='';switch(credential){case 'x':value='private';}console.log(value)`, true},
	} {
		response := NewSession().Execute(Request{Kind: "analyze", Target: TargetServer, ID: "assignment-receipts.tsx", Source: declarations + `export function Panel(){const run=(_task:TaskContext=TaskContext.server())=>{` + example.body + `};return()=> <button onClick={()=>run()}>Public</button>;}`})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		denied := false
		for _, diagnostic := range response.Diagnostics {
			if diagnostic.Severity == "error" {
				denied = true
			}
		}
		if denied != example.denied {
			t.Fatalf("%s: %#v", example.body, response.Diagnostics)
		}
	}
}
