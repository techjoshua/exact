package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"path/filepath"
	"strings"
	"testing"
)

// Parsed source nodes retain the parent/symbol shape that plan analysis consumes.
func timeBoundaryExpression(t *testing.T, text string) *ast.Node {
	t.Helper()
	filename, err := filepath.Abs("time-boundary.tsx")
	if err != nil {
		t.Fatal(err)
	}
	source := parseNormalizationSource(filename, "const value="+text+";")
	return source.Statements.Nodes[0].AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes[0].AsVariableDeclaration().Initializer
}

func TestTemporalRoundOptionsRejectPartialProofs(t *testing.T) {
	for _, c := range []struct {
		source, unit, mode string
		increment          float64
		valid              bool
	}{
		{`"second"`, "second", "", 1, true}, {"`minute`", "minute", "", 1, true},
		{`{smallestUnit:"second",roundingMode:"floor",roundingIncrement:2}`, "second", "floor", 2, true},
		{"{smallestUnit:`hour`,roundingMode:`halfEven`,roundingIncrement:3}", "hour", "halfEven", 3, true},
		{`{smallestUnit:"second",largestUnit:"minute"}`, "second", "", 1, true},
		{`{smallestUnit:"second",largestUnit:"auto"}`, "second", "", 1, true},
		{`{smallestUnit:"second",largestUnit:option()}`, "", "", 0, false},
		{`{smallestUnit:"second",unused:option()}`, "", "", 0, false},
		{`{smallestUnit:"second",relativeTo:date}`, "", "", 0, false},
		{`{smallestUnit:"second",roundingIncrement:0}`, "", "", 0, false},
		{`{smallestUnit:"second",roundingIncrement:-1}`, "", "", 0, false},
		{`{smallestUnit:"second",roundingIncrement:1.5}`, "", "", 0, false},
		{`{smallestUnit:"second",roundingIncrement:increment}`, "", "", 0, false},
		{`{smallestUnit:"second",roundingMode:mode}`, "", "", 0, false},
		{`{smallestUnit:"second",...options}`, "", "", 0, false},
		{`{[unit]:"second"}`, "", "", 0, false}, {`options`, "", "", 0, false},
		{`{smallestUnit:unit}`, "", "", 1, false},
	} {
		t.Run(c.source, func(t *testing.T) {
			unit, increment, mode, valid := temporalRoundOptions(timeBoundaryExpression(t, c.source))
			if unit != c.unit || increment != c.increment || mode != c.mode || valid != c.valid {
				t.Fatalf("got %q %v %q %t", unit, increment, mode, valid)
			}
		})
	}
}

func TestTemporalSensitivityPreservesDirectionAndRounding(t *testing.T) {
	for _, mode := range []string{"halfExpand", "floor", "ceil", "trunc", "expand", "halfCeil", "halfFloor", "halfTrunc", "halfEven"} {
		for _, method := range []string{"since", "until"} {
			for _, movingBase := range []bool{false, true} {
				base, argument := "deadline", "Temporal.Now.instant()"
				if movingBase {
					base, argument = argument, base
				}
				expression := timeBoundaryExpression(t, base+"."+method+`(`+argument+`).round({smallestUnit:"second",roundingMode:"`+mode+`",roundingIncrement:2})`)
				_, quantum, boundary, valid := temporalRoundedDurationSensitivity(expression)
				if !valid || quantum != 2000 || boundary == "" {
					t.Fatalf("%s/%s/%t: invalid sensitivity %v %q %t", mode, method, movingBase, quantum, boundary, valid)
				}
			}
		}
	}
	for _, source := range []string{`deadline.since(other).round("second")`, `Temporal.Now.instant().since(Temporal.Now.instant()).round("second")`, `Temporal.Now.instant().since(deadline).round("day")`, `Temporal.Now.instant().since(deadline).round("microsecond")`, `Temporal.Now.instant().since(deadline).round({smallestUnit:"second",roundingMode:"invalid"})`, `Temporal.Now.instant().since(deadline).round()`, `Temporal.Now.instant().since().round("second")`} {
		if _, _, _, valid := temporalRoundedDurationSensitivity(timeBoundaryExpression(t, source)); valid {
			t.Fatalf("unproven shape accepted: %s", source)
		}
	}
}

func TestFormatterSensitivityUsesSmallestVisibleField(t *testing.T) {
	for _, c := range []struct {
		options map[string]any
		unit    string
		quantum float64
	}{
		{map[string]any{"fractionalSecondDigits": float64(3)}, "", 1},
		{map[string]any{"second": "numeric", "minute": "numeric"}, "", 1000},
		{map[string]any{"timeStyle": "short"}, "", 60000},
		{map[string]any{"timeStyle": "long"}, "", 1000},
		{map[string]any{"minute": "numeric"}, "", 60000},
		{map[string]any{"hour": "numeric"}, "", 3600000},
		{map[string]any{"day": "numeric"}, "day", 0},
		{map[string]any{"weekday": "long"}, "day", 0},
		{map[string]any{"month": "numeric"}, "month", 0},
		{map[string]any{"year": "numeric"}, "year", 0},
		{nil, "day", 0},
	} {
		unit, quantum := timeFormatterSensitivity(c.options)
		if unit != c.unit || quantum != c.quantum {
			t.Fatalf("%v: got %q %v", c.options, unit, quantum)
		}
	}
	for _, c := range []struct {
		unit    string
		quantum float64
		valid   bool
	}{{"nanosecond", 0.000001, true}, {"microseconds", 0.001, true}, {"millisecond", 1, true}, {"seconds", 1000, true}, {"minute", 60000, true}, {"hour", 3600000, true}, {"day", 0, false}} {
		quantum, valid := temporalFixedUnitMilliseconds(c.unit)
		if quantum != c.quantum || valid != c.valid {
			t.Fatalf("%s: got %v %t", c.unit, quantum, valid)
		}
	}
}

func TestTimeHelperCoordinatesAreProvenWithoutAnEmitter(t *testing.T) {
	root, config := timePlanContractWorkspace(t)
	for _, c := range []struct {
		name, prelude, expression string
		valid                     bool
	}{
		{"date helper", `function elapsed(start:Date,now:number){return Math.floor((now-start.getTime())/1000)}`, `elapsed(new Date(props.anchor),Date.now())`, true},
		{"arrow immediate", ``, `((start:number,now:number)=>Math.floor((now-start)/1000))(props.anchor,Date.now())`, true},
		{"expression immediate", ``, `(function(start:number,now:number){return Math.floor((now-start)/1000)})(props.anchor,Date.now())`, true},
		{"effectful immediate", ``, `((start:number,now:number)=>{props.anchor++;return Math.floor((now-start)/1000)})(props.anchor,Date.now())`, false},
		{"scaled immediate", ``, `((start:number,now:number)=>Math.floor((now-start)/1000))(props.anchor,Date.now()*2)`, false},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "page.tsx"), Root: root, ConfigFile: config, Target: target, Source: `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(props:{anchor:number}){` + c.prelude + `return()=> <time time:update>{` + c.expression + `}</time>;}`})
			if response.Error != "" {
				t.Fatalf("%s/%s: %s", c.name, target, response.Error)
			}
			errors := false
			for _, d := range response.Diagnostics {
				errors = errors || d.Severity == "error"
			}
			if errors == c.valid {
				t.Fatalf("%s/%s: invalid proof result %#v", c.name, target, response.Diagnostics)
			}
		}
	}
}

// Native compilation owns these lowering branches. Runtime values are independently checked
// by the native Temporal oracle in the paired compiler mount/hydration journeys.
func TestTemporalPlansAcrossMovingEndpointsAndTargets(t *testing.T) {
	root, config := timePlanContractWorkspace(t)
	for _, mode := range []string{"ceil", "floor", "trunc", "expand", "halfCeil", "halfFloor", "halfExpand", "halfTrunc", "halfEven"} {
		for _, method := range []string{"since", "until"} {
			for _, movingBase := range []bool{false, true} {
				for _, target := range []Target{TargetClient, TargetServer} {
					base, argument := `Temporal.Instant.fromEpochMilliseconds(props.anchor)`, `Temporal.Now.instant()`
					if movingBase {
						base, argument = argument, base
					}
					source := `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};declare const Temporal:{Now:{instant():Instant};Instant:{fromEpochMilliseconds(value:number):Instant}};interface Instant{epochMilliseconds:number;since(other:Instant):Duration;until(other:Instant):Duration}interface Duration{round(options:{smallestUnit:string;roundingMode:string;roundingIncrement:number}):{seconds:number}}export function Page(props:{anchor:number}){return()=> <time time:update>{` + base + `.` + method + `(` + argument + `).round({smallestUnit:"second",roundingMode:"` + mode + `",roundingIncrement:2}).seconds}</time>;}`
					response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "page.tsx"), Root: root, ConfigFile: config, Target: target, Source: source})
					if response.Error != "" {
						t.Fatal(response.Error)
					}
					for _, diagnostic := range response.Diagnostics {
						if diagnostic.Severity == "error" {
							t.Fatalf("%s/%s/%t/%s rejected: %#v", mode, method, movingBase, target, response.Diagnostics)
						}
					}
					if !strings.Contains(response.Code, "quantumMilliseconds: 2000") || strings.Contains(response.Code, `kind: "continuous"`) {
						t.Fatalf("%s/%s/%t/%s lost finite rounding plan", mode, method, movingBase, target)
					}
				}
			}
		}
	}
}

func TestAdjacentFiniteTimePlanLowering(t *testing.T) {
	root, config := timePlanContractWorkspace(t)
	for _, c := range []struct{ setup, expression string }{
		{"const anchor=props.anchor;", `Math.abs(Math.floor((Date.now()-anchor)/1000))<2?"inside":"outside"`},
		{"const anchor=props.anchor;", `Math.abs(Math.floor((Date.now()-anchor)/1000))>=0?"inside":"outside"`},
		{"const anchor=props.anchor;", `2>Math.abs(Math.floor((Date.now()-anchor)/1000))?"inside":"outside"`},
		{"const anchor=props.anchor;", `-2>=Math.floor((Date.now()-anchor)/1000)?"before":"after"`},
		{"", `new Intl.DateTimeFormat("en-US",{timeStyle:"short",timeZone:"UTC"}).format(Date.now())`},
		{"const anchor=props.anchor;", `new Intl.DurationFormat("en-US").format({minutes:Math.floor((Date.now()-anchor)/60000),seconds:Math.floor((Date.now()-anchor)/1000)%60})`},
		{"const anchor=props.anchor;function elapsed(start:Date,now:number){return Math.floor((now-start.getTime())/1000)}", `elapsed(new Date(anchor),Date.now())`},
		{"const anchor=props.anchor;", `((start:number,now:number)=>Math.floor((now-start)/1000))(anchor,Date.now())`},
		{"const anchor=props.anchor;", `Math.trunc((anchor-Date.now())/1000)`},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "page.tsx"), Root: root, ConfigFile: config, Target: target, Source: `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(props:{anchor:number}){` + c.setup + `return()=> <time time:update>{` + c.expression + `}</time>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, d := range response.Diagnostics {
				if d.Severity == "error" {
					t.Fatalf("%s/%s: %#v", c.expression, target, response.Diagnostics)
				}
			}
			if !strings.Contains(response.Code, "createTimeActivation") || strings.Contains(response.Code, `kind: "continuous"`) {
				t.Fatalf("%s/%s lost finite activation", c.expression, target)
			}
		}
	}
}

// A partial literal cannot silently stand in for the runtime rounding options. Protect the
// author-facing diagnostic boundary as well as the options parser's conservative decision.
func TestTemporalAutomaticPolicyRejectsUnprovenOptions(t *testing.T) {
	root, config := timePlanContractWorkspace(t)
	for _, options := range []string{`{smallestUnit:"second",...props.options}`, `{smallestUnit:"second",roundingMode:props.mode}`, `{smallestUnit:"second",roundingIncrement:props.increment}`, `{smallestUnit:"second",largestUnit:option()}`, `{smallestUnit:"second",unused:option()}`} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "page.tsx"), Root: root, ConfigFile: config, Target: target, Source: `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};declare const Temporal:{Now:{instant():Instant};Instant:{fromEpochMilliseconds(value:number):Instant}};interface Instant{epochMilliseconds:number;since(other:Instant):Duration}interface Duration{round(options:Record<string,unknown>):{seconds:number}}export function Page(props:{anchor:number;options:{roundingMode:string};mode:string;increment:number}){let counter=0;function option(){counter++;return "minute";}return()=> <time time:update>{Temporal.Now.instant().since(Temporal.Instant.fromEpochMilliseconds(props.anchor)).round(` + options + `).seconds}</time>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			found := false
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Severity == "error" && strings.HasPrefix(diagnostic.Code, "EXACT_TIME_") {
					found = true
				}
			}
			if !found {
				t.Fatalf("%s/%s silently accepted unproven rounding options: %#v", options, target, response.Diagnostics)
			}
		}
	}
}
