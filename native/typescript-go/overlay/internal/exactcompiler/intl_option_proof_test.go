package exactcompiler

import (
	"path/filepath"
	"strings"
	"testing"
)

// Option names must be proven before reading AST text. A dynamic key may execute a helper.
func TestIntlOptionNamesRequireStaticProof(t *testing.T) {
	for _, c := range []struct {
		source string
		valid  bool
	}{
		{`{second:"numeric"}`, true}, {`{"second":"numeric"}`, true}, {`{["second"]:"numeric"}`, true}, {"{[`second`]:`numeric`}", true},
		{`{[option()]:"numeric"}`, false}, {`{second:option()}`, false}, {`{second:"numeric",...options}`, false}, {`{get second(){return "numeric"}}`, false},
	} {
		options, valid := intlObjectOptions(timeBoundaryExpression(t, c.source))
		if valid != c.valid || (valid && options["second"] != "numeric") {
			t.Fatalf("%s: %#v %t", c.source, options, valid)
		}
	}
}

func TestIntlTimeOptionsPreserveEffectDiagnostics(t *testing.T) {
	root, config := timePlanContractWorkspace(t)
	for _, constructor := range []string{"DateTimeFormat", "RelativeTimeFormat", "DurationFormat"} {
		for _, options := range []string{`{[option()]:"numeric"}`, `{unused:option()}`} {
			for _, target := range []Target{TargetClient, TargetServer} {
				value := `Date.now()`
				arguments := value
				if constructor == "RelativeTimeFormat" {
					arguments = `Math.floor((Date.now()-props.anchor)/1000),"second"`
				}
				if constructor == "DurationFormat" {
					arguments = `{seconds:Math.floor((Date.now()-props.anchor)/1000)}`
				}
				response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "page.tsx"), Root: root, ConfigFile: config, Target: target, Source: `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(props:{anchor:number}){let counter=0;function option(){counter++;return "second";}return()=> <time time:update>{new Intl.` + constructor + `("en-US",` + options + `).format(` + arguments + `)}</time>;}`})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				found := false
				for _, d := range response.Diagnostics {
					if d.Severity == "error" && strings.HasPrefix(d.Code, "EXACT_TIME_") {
						found = true
					}
				}
				if !found {
					t.Fatalf("%s/%s/%s accepted effectful options", constructor, options, target)
				}
			}
		}
	}
}
