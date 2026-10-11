package exactcompiler

import (
	"strings"
	"testing"
)

func TestIntlUnitDifferencePlans(t *testing.T) {
	for _, c := range []struct {
		role, expression, mode string
		valid                  bool
	}{
		{`unit="temperature-weather" difference`, `current-previous`, "endpoints", true},
		{`unit="temperature-weather" difference`, `80-50`, "endpoints", true},
		{`cldr="temperature-weather" difference`, `current-previous`, "endpoints", true},
		{`unit="temperature-weather" difference={true}`, `(current)-(previous)`, "endpoints", true},
		{`unit="temperature-weather" intl:difference`, `current-previous`, "endpoints", true},
		{`unit={{unit:'temperature-weather',difference:true}}`, `change`, "value", true},
		{`unit="temperature-weather" difference={false}`, `current`, "", true},
		{`unit="temperature-weather" difference={false}`, `current-previous`, "", true},
		{`unit="temperature-weather"`, `current-previous`, "", true},
		{`unit="temperature-weather" difference`, `current+previous`, "value", true},
		{`unit="fuel-economy-road" convertTo="mile-per-gallon" difference`, `change`, "value", true},
		{`unit="fuel-economy-road" difference={{to:current,from:previous}}`, `change`, "endpoints", true},
		{`unit={{unit:'temperature-weather',difference:false}}`, `current`, "", true},
		{`unit="fuel-economy-road" difference`, `current-previous`, "endpoints", true},
		{`unit="fuel-economy-road" difference={{from:previous,to:current}}`, `change`, "endpoints", true},
		{`unit="fuel-economy-road" difference`, `change`, "", false},
		{`unit="temperature-weather" difference={flag}`, `change`, "", false},
		{`unit="temperature-weather" difference="true"`, `change`, "", false},
		{`unit="temperature-weather" difference`, `label`, "", false},
		{`unit="temperature-weather"`, `current`, "", true},
		{`unit={{unit:'temperature-weather'}}`, `current`, "", true},
		{`unit={{...options,unit:'temperature-weather',sourceUnit:'fahrenheit',convertTo:'celsius'}}`, `current`, "", false},
		{`unit={{...options,unit:'temperature-weather',sourceUnit:'fahrenheit',convertTo:'celsius',difference:true}}`, `current-previous`, "endpoints", true},
		{`unit="temperature-weather" difference`, `current-label`, "", false},
		{`unit="temperature-weather" difference={{from:previous}}`, `change`, "", false},
		{`unit="temperature-weather" difference={{start:previous,end:current}}`, `change`, "", false},
		{`unit="temperature-weather" difference={{from:previous,to:label}}`, `change`, "", false},
		{`unit="temperature-weather" difference`, `current}-{previous`, "", false},
	} {
		source := `export function Page(current:number,previous:number,change:number,label:string,flag:boolean,options:object){return()=> <p intl:` + c.role + `>{` + c.expression + `} °F</p>;}`
		if strings.HasPrefix(c.role, `unit="fuel`) {
			source = `export function Page(current:number,previous:number,change:number){return()=> <p intl:` + c.role + `>{` + c.expression + `} MPG</p>;}`
		}
		result := intlExpressionContract(t, source)
		if !c.valid {
			if len(result.Descriptors) != 0 || len(result.Diagnostics) == 0 {
				t.Fatalf("accepted invalid difference %s: %#v", c.role, result)
			}
			continue
		}
		if len(result.Descriptors) != 1 || len(result.Diagnostics) != 0 {
			t.Fatalf("lost difference %s: %#v", c.role, result)
		}
		node := result.Descriptors[0].Source[0]
		if mode, _ := node.Formatter["difference"].(string); mode != c.mode {
			t.Fatalf("mode %s: %#v", c.role, node)
		}
		if c.mode == "endpoints" && len(node.Bindings) != 2 {
			t.Fatalf("lost endpoints: %#v", node)
		}
	}
}

func TestIntlUnitDifferenceMetadata(t *testing.T) {
	for _, role := range []string{"unit", "cldr"} {
		source := `export function Page(value:number){return()=> <p intl:message>Change <span intl:` + role + `="temperature-weather" sourceUnit="fahrenheit" convertTo="celsius" difference>{value} °F</span></p>;}`
		result := intlExpressionContract(t, source)
		if len(result.Descriptors) != 1 || len(result.Diagnostics) != 0 {
			t.Fatalf("lost unit contribution: %#v", result)
		}
		if len(result.Regions[0].Structures) != 1 || len(result.Regions[0].Structures[0].Attributes) != 4 {
			t.Fatalf("retained authoring metadata on reconstructed host: %#v", result.Regions)
		}
	}
}

func TestIntlUnitDifferenceCallOccurrences(t *testing.T) {
	for _, expression := range []string{`read()-read()`, `(read()+1)-(read()+1)`, `new NumberValue().value-new NumberValue().value`} {
		result := intlExpressionContract(t, `declare function read():number;declare class NumberValue{value:number;}export function Page(){return()=> <p intl:unit="temperature-weather" difference>{`+expression+`} °F</p>;}`)
		if len(result.Descriptors) != 1 || len(result.Diagnostics) != 0 || len(result.Regions[0].Values) != 2 {
			t.Fatalf("discarded an authored invocation: %s %#v", expression, result)
		}
	}
}

func TestIntlScalarReadsAfterEffects(t *testing.T) {
	for _, c := range []struct {
		source string
		values int
	}{
		{`export function Page(value:{reading:number}){return()=> <p intl:message>{value.reading} / {value.reading}</p>;}`, 2},
		{`let current=80;function advance(){current=50;return '/'}export function Page(){return()=> <p intl:message>{current} {advance()} {current}</p>;}`, 3},
	} {
		result := intlExpressionContract(t, c.source)
		if len(result.Descriptors) != 1 || len(result.Diagnostics) != 0 || len(result.Regions[0].Values) != c.values {
			t.Fatalf("discarded an observable read: %#v", result)
		}
	}
}

func TestIntlSelectorCompositionReadBoundary(t *testing.T) {
	for _, source := range []string{
		`export function Page(value:string,other:string){return()=> <p intl:message><_ intl:select={value}>{other==='owner'?'Owner':'Member'}</_></p>;}`,
		`export function Page(value:number){return()=> <p intl:message><_ intl:select={value}>{value===1?'One':'Many'}</_></p>;}`,
		`export function Page(value:number){return()=> <p intl:message><_ intl:plural={value}>Count {value}.</_></p>;}`,
		`export function Page(value:number){return()=> <p intl:message><_ intl:plural={value}>{value===1?'One':'Many'} items</_></p>;}`,
	} {
		result := intlExpressionContract(t, source)
		if len(result.Descriptors) != 1 || len(result.Diagnostics) != 0 {
			t.Fatalf("lost selector composition: %#v", result)
		}
	}
}
