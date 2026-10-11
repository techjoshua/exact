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
