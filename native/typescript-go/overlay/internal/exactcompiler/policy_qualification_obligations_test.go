package exactcompiler

import (
	"context"
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"strings"
	"testing"
)

// Constructor results are deferred disclosure obligations, just like call results.
func TestPolicyConstructorAggregateDisclosure(t *testing.T) {
	prefix := `export {};declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};
interface Chain<T>{value:T;next:Chain<T>;}
declare const record:{label:string;factory:new()=>{value:Protected<string>}};
declare const publicRecord:{label:string;factory:new()=>{value:string}};
declare const factory:new<T>(value:T)=>Chain<T>;
interface Growing<T>{label:string;value:T;next:Growing<T[]>;}
declare const expanding:new<T>(value:T)=>Growing<T>;
declare const finite:{value:Chain<Chain<Chain<string>>>;swap:Swap<string|number,{value:string}>};
interface Swap<T,U>{first:T;next:Swap<U,T>;}
type Deep<T> = {readonly [K in keyof T]:Deep<T[K]>};
declare const mapped:Deep<{next:{next:{value:string}}}>;
declare const secretMapped:Deep<{label:string;next:{value:Protected<string>}}>;
type AliasGrow<T>={label:string;next:AliasGrow<{value:T}>};
declare const aliasGrowing:AliasGrow<string>;
declare const credential:Protected<string>;
`
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		for _, c := range []struct {
			expression string
			denied     bool
		}{
			{"finite", false}, {"mapped", false}, {"secretMapped", true}, {"secretMapped.label", false}, {"aliasGrowing", true}, {"aliasGrowing.label", false}, {"(new expanding(1)).label", false}, {"new expanding(credential)", true}, {"record", true}, {"record.label", false}, {"record.factory", true},
			{"publicRecord", false}, {"new record.factory()", true}, {"new publicRecord.factory()", false},
			{"(new factory(1)).value", false}, {"(new factory(credential)).value", true},
		} {
			t.Run(string(target)+"/"+c.expression, func(t *testing.T) {
				result := NewSession().Execute(Request{Kind: "compile", ID: "constructor-policy.tsx", Target: target, Source: prefix + `export function Page(){return()=> <p>{` + c.expression + `}</p>;}`})
				if result.Error != "" {
					t.Fatal(result.Error)
				}
				if hasDiagnosticCode(result.Diagnostics, "EXACT3020") != c.denied {
					t.Fatalf("constructor disclosure mismatch: %#v", result.Diagnostics)
				}
				if !c.denied && result.Code == "" {
					t.Fatalf("public constructor did not lower: %#v", result.Diagnostics)
				}
			})
		}
	}
}

// Finite record width must not be confused with expanding recursive instantiation.
func TestPolicyBroadFinitePublicRecord(t *testing.T) {
	var fields strings.Builder
	for index := 0; index < 160; index++ {
		fmt.Fprintf(&fields, "f%d:{value:%d};", index, index)
	}
	prefix := `export {};declare const broad:{` + fields.String() + `};`
	session := NewSession()
	for _, warm := range []bool{false, true, false} {
		var reads strings.Builder
		if warm {
			for index := 0; index < 160; index++ {
				fmt.Fprintf(&reads, "void broad.f%d;", index)
			}
		}
		result := session.Execute(Request{Kind: "compile", ID: "broad-policy.tsx", Source: prefix + reads.String() + `export function Page(){return()=> <p>{broad}</p>;}`})
		if result.Error != "" || hasErrorDiagnostic(result.Diagnostics) || result.Code == "" {
			t.Fatalf("warm=%v finite public record denied: %s %#v", warm, result.Error, result.Diagnostics)
		}
	}
}

// Accepted projections execute exactly their selected reads, without constructing
// or invoking a deferred secret member. Rejected disclosure must emit no artifact.
func TestPolicyConstructorProjectionEmittedSemantics(t *testing.T) {
	prefix := `export {};declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};
let reads=0,constructed=0;
const record:{readonly label:string;factory:new()=>{value:Protected<string>}}={get label(){reads++;return 'public'},factory:class{value='private' as Protected<string>;constructor(){constructed++;}}};
const publicRecord={factory:class{value='public';constructor(){constructed++;}}};
`
	for _, c := range []struct {
		expression         string
		denied             bool
		reads, constructed int
	}{
		{"record", true, 0, 0}, {"record.factory", true, 0, 0}, {"new record.factory()", true, 0, 0},
		{"record.label", false, 1, 0}, {"(new publicRecord.factory()).value", false, 0, 1},
	} {
		t.Run(c.expression, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "constructor-emitted.ts", Target: TargetServer, Source: prefix + `export function work(){console.log(` + c.expression + `);return {reads,constructed};}`})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			if hasDiagnosticCode(r.Diagnostics, "EXACT3020") != c.denied {
				t.Fatalf("incorrect emitted authorization: %#v", r.Diagnostics)
			}
			if c.denied {
				if r.Code != "" {
					t.Fatal("unauthorized disclosure emitted an artifact")
				}
				return
			}
			if hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatalf("public projection failed: %#v", r.Diagnostics)
			}
			script := `const fs=require('node:fs'),vm=require('node:vm');const logs=[];const sandbox={exports:{},console:{log:value=>logs.push(value)}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),sandbox);const result=sandbox.exports.work();if(result.reads!==Number(process.argv[2])||result.constructed!==Number(process.argv[3])||JSON.stringify(logs)!=='["public"]')throw Error(JSON.stringify({result,logs}));`
			sourceNodeScript(t, r.Code, script, fmt.Sprint(c.reads), fmt.Sprint(c.constructed))
		})
	}
}

// Completed subtree warmth must neither reject finite width nor discharge an
// expanding family obligation. Inspect actual types from this source Program.
func TestPolicyQualificationCacheOrder(t *testing.T) {
	var fields strings.Builder
	for i := 0; i < 160; i++ {
		fmt.Fprintf(&fields, "f%d:{value:%d};", i, i)
	}
	source := `export {};declare const broad:{` + fields.String() + `};
interface Growing<T>{label:string;next:Growing<T[]>;}
declare const expanding:Growing<string>;`
	filename, err := normalizeFileName("qualification-cache-order.ts", "")
	if err != nil {
		t.Fatal(err)
	}
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: filename, Source: source})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	var project *projectState
	for _, candidate := range session.projects {
		project = candidate
	}
	if project == nil {
		t.Fatal("source Program missing")
	}
	c, release := project.program.GetCheckerPool().GetChecker(context.Background(), nil)
	defer release()
	file := project.program.GetSourceFile(filename)
	types := make(map[string]*checker.Type)
	walkNode(file.AsNode(), func(node *ast.Node) bool {
		if ast.IsVariableDeclaration(node) && ast.IsIdentifier(node.Name()) {
			types[node.Name().Text()] = c.GetTypeAtLocation(node.Name())
		}
		return true
	})
	for _, warm := range []bool{false, true} {
		completed := make(map[checker.TypeId]bool)
		broad := types["broad"]
		if broad == nil {
			t.Fatal("selected broad type missing")
		}
		if warm {
			for _, field := range c.GetPropertiesOfType(broad) {
				cachedPolicyFromCheckerType(c.GetTypeOfSymbol(field), c, completed)
			}
		}
		if _, protected := cachedPolicyFromCheckerType(broad, c, completed); protected {
			t.Fatalf("warm=%v finite record rejected", warm)
		}
		expanding := types["expanding"]
		if expanding == nil {
			t.Fatal("selected expanding type missing")
		}
		if warm {
			cachedPolicyFromCheckerType(c.GetTypeOfSymbol(c.GetPropertyOfType(expanding, "label")), c, completed)
		}
		for range 2 {
			if _, protected := cachedPolicyFromCheckerType(expanding, c, completed); !protected {
				t.Fatal("incomplete expanding obligation released")
			}
			if _, published := completed[expanding.Id()]; published {
				t.Fatal("incomplete qualification published as completed")
			}
		}
	}
}
