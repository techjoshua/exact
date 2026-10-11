package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

// Clock instrumentation requires native value identity, and finite member syntax preserves that proof.
func TestTimeNativeClockIdentityAndFiniteMembers(t *testing.T) {
	for _, c := range []struct{ name, setup, expression, policy, diagnostic, helper string }{
		{"native-date", "", `Math.floor(Date.now()/1000)`, "", "", "readEpochMilliseconds"},
		{"literal-date", "", `Math.floor(Date["now"]()/1000)`, "", "", "readEpochMilliseconds"},
		{"constant-date", `const method="now" as const;`, `Math.floor(Date[method]()/1000)`, "", "", "readEpochMilliseconds"},
		{"template-date", "", "Math.floor(Date[`now`]()/1000)", "", "", "readEpochMilliseconds"},
		{"optional-date", "", `Math.floor(Date.now?.()/1000)`, "", "", "readEpochMilliseconds"},
		{"literal-math", "", `Math["floor"](Date.now()/1000)`, "", "", "readEpochMilliseconds"},
		{"constant-math", `const method="floor" as const;`, `Math[method](Date.now()/1000)`, "", "", "readEpochMilliseconds"},
		{"local-date", `const Date={now(){return 42000}};`, `Math.floor(Date.now()/1000)`, "", "EXACT_TIME_NO_CLOCK", ""},
		{"local-date-class", `class Date {getTime(){return 42000}};`, `Math.floor(new Date().getTime()/1000)`, "", "EXACT_TIME_NO_CLOCK", ""},
		{"local-math", `const Math={floor(value:number){return value+1}};`, `Math.floor(Date.now()/1000)`, "", "EXACT_TIME_AUTO", ""},
		{"local-math-explicit", `const Math={/** @exact pure */ floor(value:number){return value+1}};`, `Math.floor(Date.now()/1000)`, `="millisecond"`, "", "readEpochMilliseconds"},
		{"local-round", `const formatter={round(options:{smallestUnit:string}){return 1}};`, `Date.now()+formatter.round({smallestUnit:"nanosecond"})`, `="millisecond"`, "", "readEpochMilliseconds"},
		{"native-new-date", "", `Math.floor(new Date().getTime()/1000)`, "", "", "readDate"},
		{"literal-get-time", "", `Math.floor(new Date()["getTime"]()/1000)`, "", "", "readDate"},
		{"constant-get-time", `const method="getTime" as const;`, `Math.floor(new Date()[method]()/1000)`, "", "", "readDate"},
		{"unknown-method", "", `Date[props.method]()`, `="millisecond"`, "EXACT_TIME_NO_CLOCK", ""},
		{"authored-intl-prefix", `const __intlFake=42;`, `__intlFake`, `="millisecond"`, "EXACT_TIME_NO_CLOCK", ""},
		{"independent-effect", `let calls=0;function extra(){calls++;return 1}`, `Date.now()+extra()`, `="millisecond"`, "EXACT_TIME_UNSAFE", ""},
		{"independent-random", "", `Date.now()+Math.random()`, `="millisecond"`, "EXACT_TIME_UNSAFE", ""},
		{"effectful-key", `let calls=0;function method(){calls++;return "now" as const}`, `Date[method()]()`, `="millisecond"`, "EXACT_TIME_UNSAFE", ""},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", c.name, target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "time-clock-identity.tsx", Target: target, Diagnostics: "semantic", Source: `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(props:{method:"now"|"toString"}){` + c.setup + `return()=> <time time:update` + c.policy + `>{` + c.expression + `}</time>}`})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if c.diagnostic != "" {
					if !hasDiagnosticCode(response.Diagnostics, c.diagnostic) {
						t.Fatalf("lost %s: %#v", c.diagnostic, response.Diagnostics)
					}
				} else if len(response.Diagnostics) != 0 {
					t.Fatalf("valid native clock rejected: %#v", response.Diagnostics)
				}
				for _, d := range response.Diagnostics {
					if strings.HasPrefix(d.Code, "TS") {
						t.Fatalf("invalid TypeScript source control: %#v", d)
					}
				}
				if c.diagnostic == "" && (len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic") {
					t.Fatalf("supported clock lost portable placement: %#v", response.Analysis.Components)
				}
				if c.helper != "" && !strings.Contains(response.Code, c.helper) {
					t.Fatalf("native clock missed range instrumentation: %s", response.Code)
				}
				if c.name == "constant-date" && !strings.Contains(response.Code, "void method") {
					t.Fatalf("computed key evaluation removed: %s", response.Code)
				}
			})
		}
	}
}

// Native Temporal categories share ownership, finite member proof and precision diagnostics.
func TestTimeTemporalCategoryAndReceiverProof(t *testing.T) {
	config := timeSemanticConfig(t)
	for _, c := range []struct{ name, setup, expression, diagnostic string }{
		{"instant", "", `Temporal.Now.instant().epochMilliseconds`, ""},
		{"zoned", "", `Temporal.Now.zonedDateTimeISO("UTC").epochMilliseconds`, ""},
		{"plain-date-time", "", `Temporal.Now.plainDateTimeISO("UTC").second`, ""},
		{"plain-date", "", `Temporal.Now.plainDateISO("UTC").day`, ""},
		{"plain-time", "", `Temporal.Now.plainTimeISO("UTC").second`, ""},
		{"literal-chain", "", `Temporal["Now"]["instant"]()["epochMilliseconds"]`, ""},
		{"constant-chain", `const namespace="Now" as const;const operation="instant" as const;`, `Temporal[namespace][operation]().epochMilliseconds`, ""},
		{"round-chain", "", `Temporal.Now.instant().since(Temporal.Instant.fromEpochMilliseconds(0))["round"]({smallestUnit:"second"}).seconds`, ""},
		{"precise-clock", "", `Temporal.Now.instant().round({smallestUnit:"nanosecond"}).epochMilliseconds`, "EXACT_TIME_PRECISION"},
		{"computed-precise-clock", "", `Temporal.Now.instant()["round"]({smallestUnit:"microsecond"}).epochMilliseconds`, "EXACT_TIME_PRECISION"},
		{"ordinary-round", `const formatter={round(options:{smallestUnit:string}){return 1}};`, `Date.now()+formatter.round({smallestUnit:"nanosecond"})`, ""},
		{"local-temporal", `const Temporal={Now:{instant(){return {epochMilliseconds:42000}}}};`, `Temporal.Now.instant().epochMilliseconds`, "EXACT_TIME_NO_CLOCK"},
		{"zone-id", "", `Temporal.Now.timeZoneId()`, "EXACT_TIME_NO_CLOCK"},
		{"timezone-effect", `let calls=0;function zone(){calls++;return "UTC"}`, `Temporal.Now.zonedDateTimeISO(zone()).epochMilliseconds`, "EXACT_TIME_UNSAFE"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "temporal-clock-identity.tsx", ConfigFile: config, Target: target, Diagnostics: "semantic", Source: `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(){` + c.setup + `return()=> <time time:update="millisecond">{` + c.expression + `}</time>}`})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if c.diagnostic != "" {
					if !hasDiagnosticCode(response.Diagnostics, c.diagnostic) {
						t.Fatalf("lost %s: %#v", c.diagnostic, response.Diagnostics)
					}
				} else if len(response.Diagnostics) != 0 {
					t.Fatalf("supported category rejected: %#v", response.Diagnostics)
				}
				for _, d := range response.Diagnostics {
					if strings.HasPrefix(d.Code, "TS") {
						t.Fatalf("invalid TypeScript control: %#v", d)
					}
				}
				if c.diagnostic == "" && (len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic") {
					t.Fatalf("supported Temporal clock lost portable placement: %#v", response.Analysis.Components)
				}
				if c.diagnostic == "" && c.name != "ordinary-round" && !strings.Contains(response.Code, "readTemporalNow") {
					t.Fatal("native Temporal category lost its owner")
				}
				if c.name == "constant-chain" && (!strings.Contains(response.Code, "void namespace") || !strings.Contains(response.Code, "void operation")) {
					t.Fatal("computed namespace or operation key was erased")
				}
			})
		}
	}
}
