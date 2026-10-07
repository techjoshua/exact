package exactcompiler

import (
	"strings"
	"testing"
)

// Native construction must stay eager and retain the complete native formatter type.
func TestIntlDurationConstructionSource(t *testing.T) {
	config := timeSemanticConfig(t)
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, expression := range []string{
			`new Intl.DurationFormat('en-US').format({seconds:1})`,
			`new Intl.DurationFormat('en-US').formatToParts({seconds:1})`,
			`new Intl.DurationFormat('en-US').resolvedOptions()`,
		} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "intl-duration-construction.ts", ConfigFile: config, Target: target, Diagnostics: "semantic", Source: `const __exactRequireDuration=1;export function result(){return ` + expression + `;}`})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("native method contract rejected: %s %#v", response.Error, response.Diagnostics)
			}
			if !strings.Contains(response.Code, "requireIntlDurationFormatter as __exactRequireDuration2") {
				t.Fatalf("missing collision-free strict construction: %s", response.Code)
			}
		}
		response := NewSession().Execute(Request{Kind: "compile", ID: "intl-duration-binding.ts", ConfigFile: config, Target: target, Diagnostics: "semantic", Source: `export function construct(){const formatter=new Intl.DurationFormat('en-US');return()=>formatter.format({seconds:1});}`})
		if response.Error != "" || len(response.Diagnostics) != 0 || !strings.Contains(response.Code, "const formatter =") {
			t.Fatalf("duration construction was deferred: %s %#v\n%s", response.Error, response.Diagnostics, response.Code)
		}
	}
}
