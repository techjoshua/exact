package exactcompiler

import (
	"testing"
)

// Selected signatures preserve concrete secrecy without expanding free generic recursion.
func TestPolicySelectedRecursiveGenericResults(t *testing.T) {
	prefix := `export {};declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};
interface Chain<T>{value:T;resolved:Chain<Awaited<T>>;not:Chain<unknown>;}
function select<T>(value:T):Chain<T>{return {value} as Chain<T>;}
interface Service{select<T>(value:T):Chain<T>;field:<T>(value:T)=>Chain<T>;readonly selected:typeof select;}
declare const service:Service;
declare const credential:Protected<string>;
function overloaded(value:number):Chain<number>;
function overloaded(value:Protected<string>):Chain<Protected<string>>;
function overloaded(value:unknown):Chain<unknown>{return {value} as Chain<unknown>;}
`
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		for _, example := range []struct {
			expression string
			denied     bool
		}{
			{`select(1).value`, false},
			{`select(credential).value`, true},
			{`service.select(1).value`, false},
			{`service.select(credential).value`, true},
			{`service.field(1).value`, false},
			{`service.field(credential).value`, true},
			{`service.selected(1).value`, false},
			{`service.selected(credential).value`, true},
			{`overloaded(1).value`, false},
			{`overloaded(credential).value`, true},
		} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "selected-recursive.tsx", Target: target,
				Source: prefix + `function reference(){void select;void service.select;void overloaded;}export function Panel(){return()=> <p>{` + example.expression + `}</p>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if hasDiagnosticCode(response.Diagnostics, "EXACT3020") != example.denied {
				t.Fatalf("%s %s policy mismatch: %#v", target, example.expression, response.Diagnostics)
			}
			if !example.denied && response.Code == "" {
				t.Fatalf("%s %s did not lower: %#v", target, example.expression, response.Diagnostics)
			}
		}
	}
}

// Whole aggregate disclosure includes deferred callable payloads, while siblings remain selectable.
func TestPolicyDeferredAggregateDisclosure(t *testing.T) {
	prefix := `export {};declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};
declare const credential:Protected<string>;
interface Box { label:string; deferred:()=>Protected<string>; }
declare const box:Box;
interface Growing<T extends unknown[]> {label:string;next:Growing<[...T,0]>;payload:T['length'] extends 12 ? Protected<string> : string;}
declare function growing():Growing<[]>;
function record(){return {label:'public',deferred:()=>credential};}
`
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		for _, c := range []struct {
			expression string
			denied     bool
		}{
			{"growing()", true}, {"growing().next.next.next.next.next.next.next.next.next.next.next.next.payload", true}, {"growing().label", false}, {"box", true}, {"box.deferred", true}, {"box.deferred()", true}, {"box.label", false}, {"record()", true}, {"record().label", false},
		} {
			t.Run(string(target)+"/"+c.expression, func(t *testing.T) {
				result := NewSession().Execute(Request{Kind: "compile", ID: "deferred.tsx", Target: target, Source: prefix + `export function Page(){return()=> <p>{` + c.expression + `}</p>;}`})
				if result.Error != "" {
					t.Fatal(result.Error)
				}
				if hasDiagnosticCode(result.Diagnostics, "EXACT3020") != c.denied {
					t.Fatalf("disclosure mismatch: %#v", result.Diagnostics)
				}
				if !c.denied && result.Code == "" {
					t.Fatalf("public selection did not lower: %#v", result.Diagnostics)
				}
			})
		}
	}
}

// Source replacement and reset must not retain a previous callable qualification.
func TestPolicyDeferredQualificationSessionReplacement(t *testing.T) {
	session := NewSession()
	for _, reset := range []bool{false, true} {
		for _, secret := range []bool{true, false, true} {
			if reset {
				result := session.Execute(Request{Kind: "reset"})
				if result.Error != "" {
					t.Fatal(result.Error)
				}
			}
			annotation := ""
			if secret {
				annotation = "/** @exact keep=secret */"
			}
			source := `export {};declare const marker:unique symbol;
` + annotation + `
type Payload=string&{readonly[marker]:true};declare const box:{label:string;read:()=>Payload};export function Page(){return()=> <p>{box}</p>;}`
			request := Request{Kind: "compile", ID: "replace-deferred.tsx", Source: source, Target: TargetServer}
			for _, result := range []Response{session.Execute(request), NewSession().Execute(request)} {
				if result.Error != "" {
					t.Fatal(result.Error)
				}
				if hasDiagnosticCode(result.Diagnostics, "EXACT3020") != secret {
					t.Fatalf("reset=%v secret=%v stale deferred qualification: %#v", reset, secret, result.Diagnostics)
				}
			}
		}
	}
}

// Narrowing the returned public leaf cannot authorize a secret argument receipt.
func TestPolicySelectedCallProjectionRetainsArgumentPolicy(t *testing.T) {
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		for _, argument := range []string{"1", "credential"} {
			source := `export {};declare const marker:unique symbol;
/** @exact keep=secret */ type Payload=string&{readonly[marker]:true};declare const credential:Payload;declare const service:{read(value:unknown):{label:string};deferred:()=>Payload};export function Page(){return()=> <p>{service.read(` + argument + `).label}</p>;}`
			result := NewSession().Execute(Request{Kind: "compile", ID: "selected-receipt.tsx", Source: source, Target: target})
			if result.Error != "" {
				t.Fatal(result.Error)
			}
			if hasDiagnosticCode(result.Diagnostics, "EXACT3003") != (argument == "credential") {
				t.Fatalf("argument policy lost: %#v", result.Diagnostics)
			}
			if argument == "1" && (hasDiagnosticCode(result.Diagnostics, "EXACT3020") || result.Code == "") {
				t.Fatalf("public call denied: %#v", result.Diagnostics)
			}
		}
	}
}
