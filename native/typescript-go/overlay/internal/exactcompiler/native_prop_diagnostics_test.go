package exactcompiler

import (
	"strings"
	"testing"
)

func TestNativePropsRejectHTMLPropertiesAndInlineEvents(t *testing.T) {
	for _, props := range []string{`innerHTML="bad"`, `OUTERHTML="bad"`, `dangerouslySetInnerHTML={{__html:"bad"}}`, `onclick="bad"`, `ONCLICK={"bad"}`, `{...{innerHTML: "bad"}}`, `{...{onclick: "bad"}}`} {
		for _, target := range []string{"client", "server"} {
			t.Run(target+props, func(t *testing.T) {
				result := NewSession().Execute(Request{ID: "native-props.tsx", Kind: "compile", Target: Target(target), Source: `export function View() { return () => <button ` + props + `/>; }`})
				found := false
				for _, diagnostic := range result.Diagnostics {
					if diagnostic.Code == "EXACT_NATIVE_PROP" && diagnostic.Severity == "error" {
						found = true
					}
				}
				if !found || result.Code != "" {
					t.Fatalf("unsafe native prop was emitted: %s %#v %s", result.Error, result.Diagnostics, result.Code)
				}
			})
		}
	}
}

func TestNativePropsCanonicalizeBeforeServerPlanning(t *testing.T) {
	result := NewSession().Execute(Request{ID: "native-prop-case.tsx", Kind: "compile", Target: "server", Source: `export function View() { return () => <iframe SRCDOC={payload} onclick={() => {}} CLASSNAME="safe"/>; }`})
	if result.Error != "" || hasErrorDiagnostic(result.Diagnostics) {
		t.Fatalf("compile failed: %s %#v", result.Error, result.Diagnostics)
	}
	if strings.Contains(result.Code, `"SRCDOC"`) || strings.Contains(result.Code, `"onclick"`) || strings.Contains(result.Code, `"CLASSNAME"`) {
		t.Fatalf("authored casing reached the server plan: %s", result.Code)
	}
	if !strings.Contains(result.Code, `"srcdoc"`) {
		t.Fatalf("srcdoc capability was lost: %s", result.Code)
	}
}

func TestNativePropsPreserveComponentAndCustomPropertyNames(t *testing.T) {
	source := `function Card(props: { innerHTML: string; onclick: string }) { return () => <span>{props.innerHTML}</span>; } export function View() { return () => <><Card innerHTML="input" onclick="input"/><my-widget CLASSNAME="custom" data-note="safe"/></>; }`
	result := NewSession().Execute(Request{ID: "custom-props.tsx", Kind: "compile", Target: "client", Source: source})
	for _, diagnostic := range result.Diagnostics {
		if diagnostic.Code == "EXACT_NATIVE_PROP" {
			t.Fatalf("component inputs were treated as native props: %#v", result.Diagnostics)
		}
	}
	if !strings.Contains(result.Code, "CLASSNAME") {
		t.Fatalf("custom property spelling changed: %s %#v %s", result.Error, result.Diagnostics, result.Code)
	}
}

func TestNativePropsRejectUnknownAndMalformedNames(t *testing.T) {
	for _, props := range []string{`tabelIndex={1}`, `{...{"bad name": "value"}}`} {
		result := NewSession().Execute(Request{ID: "bad-native-name.tsx", Kind: "compile", Target: TargetClient, Source: `export function View() { return () => <button ` + props + `/>; }`})
		found := false
		for _, diagnostic := range result.Diagnostics {
			if diagnostic.Code == "EXACT_NATIVE_PROP" {
				found = true
			}
		}
		if !found {
			t.Fatalf("invalid property was not diagnosed: %s %#v", result.Error, result.Diagnostics)
		}
	}
}

func TestNativePropsCanonicalizeLiteralSpreads(t *testing.T) {
	for _, source := range []string{
		`export function View() { return () => <div {...{CLASSNAME: "value"}}/>; }`,
		`const attrs = { CLASSNAME: "value" }; export function View() { return () => <div {...attrs}/>; }`,
	} {
		result := NewSession().Execute(Request{ID: "native-spread-case.tsx", Kind: "compile", Target: TargetServer, Source: source})
		if result.Error != "" || hasErrorDiagnostic(result.Diagnostics) {
			t.Fatalf("compile failed: %s %#v", result.Error, result.Diagnostics)
		}
		if !strings.Contains(result.Code, "className") {
			t.Fatalf("spread casing was not canonicalized: %s", result.Code)
		}
	}
}

// Casing is normalized before a source enters a synchronized project. Repeated targets must
// preserve the generation rather than alternating authored and normalized overlays.
func TestNativePropsStandardCasingRetainsSynchronizedGeneration(t *testing.T) {
	session := NewSession()
	source := `export function View() { return () => <><meta charSet="UTF-8"/><input autoComplete="off" tabindex={0}/><iframe loading="lazy"/></>; }`
	synced := session.Execute(Request{Kind: "synchronize", Sources: []ProjectSource{{ID: "casing-cache.tsx", Source: source}}})
	if synced.Error != "" {
		t.Fatal(synced.Error)
	}
	for index, target := range []Target{TargetClient, TargetServer, TargetClient} {
		result := session.Execute(Request{Kind: "compile", ID: "casing-cache.tsx", Source: source, Target: target})
		if result.Error != "" || hasErrorDiagnostic(result.Diagnostics) {
			t.Fatalf("compile failed: %s %#v", result.Error, result.Diagnostics)
		}
		if index > 0 && !result.CacheHit || result.Counters.ProgramRebuilds != 0 {
			t.Fatalf("casing rebuilt the synchronized program: %#v", result.Counters)
		}
	}
}
