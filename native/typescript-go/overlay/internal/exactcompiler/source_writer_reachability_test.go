package exactcompiler

import "testing"

// Indexed writer preconditions are source queries, not separate invocations of
// the same original Call. Dormant alternatives must terminate conservatively.
func TestMemberWriterReachabilityOccurrence(t *testing.T) {
	source := `declare function make():{field:{value:string}};const box=make();function put(box:{field:{value:string}}){box.field={get value(){return document.title}}}function first(){if(box.field)put(box)}function second(){if(box.field)put(box)}export const value=box.field.value;`
	_, _, summary := currentProxyCaller(t, source, "export const value")
	browser, unknown := false, false
	for _, effect := range summary.EffectSources {
		browser = browser || effect.Environment == "browser"
		unknown = unknown || effect.Environment == "unknown"
	}
	if browser || !unknown {
		t.Fatal("dormant writer executed or opaque receiver lost", summary.EffectSources)
	}
}

// Eligible source Calls keep their own supplied/default inputs. A possibly
// reached writer still contributes, while a bypassed default stays unobserved.
func TestMemberWriterReachabilityCallInputs(t *testing.T) {
	for _, test := range []struct {
		name, body, setup string
		browser           bool
	}{
		{"dormant", `put(box,next);`, ``, false},
		{"current-call", `put(box,next);`, `first();`, true},
		{"second-call", `put(box,next);`, `second();`, false},
		{"supplied-safe", `put(box,next);`, `first({value:'safe'});`, false},
		{"supplied-undefined", `put(box,next);`, `first(undefined);`, true},
		{"supplied-browser", `put(box,next);`, `first({get value(){return document.title}});`, true},
		{"Throw-before-Put", `throw 9;put(box,next);`, `try{first()}catch{}`, false},
		{"Throw-after-Put", `put(box,next);throw 9;`, `try{first()}catch{}`, true},
		{"independent-unknown", `put(box,next);`, `first();foreign(box);`, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := `type Value={value:string};type Box={field:Value};declare function make():Box;declare function foreign(value:unknown):void;const box=make();function put(box:Box,next:Value){box.field=next}function first(next:Value={get value(){return document.title}}){if(box.field){` + test.body + `}}function second(){if(box.field)put(box,{value:'safe'})}` + test.setup + `export const value=box.field.value;`
			_, _, summary := currentProxyCaller(t, source, "export const value")
			browser, unknown := false, false
			for _, effect := range summary.EffectSources {
				browser = browser || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown"
			}
			if browser != test.browser || !unknown {
				t.Fatal("original Call/default/Throw alternatives lost", summary.EffectSources)
			}
		})
	}
}
