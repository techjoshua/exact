package exactcompiler

import "testing"

// Protected results must survive accessor and closure projections without contaminating public siblings.
func TestPolicyAccessorAndClosureResults(t *testing.T) {
	prefix := `declare const marker:unique symbol;
/** @exact keep=secret */ type Credential=string&{readonly[marker]:true};
declare const credential:Credential;declare const label:string;
function record(){return {get credential(){return credential;},get label(){return label;},get deferred(){return ()=>credential;},read(){return credential;}};}
const service=record();const alias=service.read;const copy=service;
const {label:publicLabel,credential:privateValue}=copy;
/** @exact keep=secret */ declare const kept:{label:string};const keptAlias=kept;`
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		for _, c := range []struct {
			expression string
			denied     bool
		}{
			{"record().credential", true}, {"record().label", false}, {"record().deferred()", true},
			{"service.credential", true}, {"service.label", false}, {"alias()", true},
			{"record()['credential']", true}, {"record()['label']", false},
			{"record()?.credential", true}, {"record()?.label", false},
			{"copy.label", false}, {"copy.credential", true}, {"publicLabel", false}, {"privateValue", true},
			{"kept.label", true}, {"keptAlias.label", true},
		} {
			t.Run(string(target)+"/"+c.expression, func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "analyze", ID: "accessor-policy.tsx", Target: target, Source: prefix + `export function Page(){return()=> <p>{` + c.expression + `}</p>;}`})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if hasDiagnosticCode(response.Diagnostics, "EXACT3020") != c.denied {
					t.Fatalf("incorrect disclosure policy: %#v", response.Diagnostics)
				}
			})
		}
	}
}

// Replacing a typed aggregate with an explicitly kept receiver must revoke public-member narrowing.
func TestPolicyAliasReplacementRetainsWholeReceiverPolicy(t *testing.T) {
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		for _, assignment := range []string{"", "service=record();", "service=kept;", "[service]=[kept];"} {
			for _, annotation := range []string{"", ":ReturnType<typeof record>"} {
				source := `declare const marker:unique symbol;/** @exact keep=secret */ type Credential=string&{readonly[marker]:true};declare const credential:Credential;
function record(){return {credential,label:'public'};}
/** @exact keep=secret */ declare const kept:ReturnType<typeof record>;
let service` + annotation + `=record();` + assignment + `const copy=service;export function Page(){return()=> <p>{copy.label}</p>;}`
				result := NewSession().Execute(Request{Kind: "analyze", ID: "replacement-policy.tsx", Source: source, Target: target})
				if result.Error != "" {
					t.Fatal(result.Error)
				}
				denied := assignment == "service=kept;" || assignment == "[service]=[kept];"
				rejected := hasDiagnosticCode(result.Diagnostics, "EXACT3020") || hasDiagnosticCode(result.Diagnostics, "EXACT3003")
				if rejected != denied {
					t.Fatalf("target=%s assignment=%s annotation=%s policy=%#v", target, assignment, annotation, result.Diagnostics)
				}
			}
		}
	}
}
