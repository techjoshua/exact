package exactcompiler

import (
	"path/filepath"
	"strings"
	"testing"
)

// Native constructor and method proofs retain calls that escape the finite cache plan.
func TestIntlCacheAdjacentSourceContracts(t *testing.T) {
	for _, c := range []struct {
		setup, expression string
		removed           bool
	}{
		{`const format=new Intl.NumberFormat('en-US');`, `format.format(1)`, true},
		{`const format=new Intl.NumberFormat('en-US');`, `format['format'](1)`, false},
		{`const format=new Intl.NumberFormat('en-US');`, `(format.format)(1)`, false},
		{`const format=new Intl.NumberFormat('en-US');`, `format.format.call(format,1)`, false},
		{`const format=new Intl.NumberFormat('en-US');`, `format.format(1)+String(format)`, false},
		{`const format=new Intl.NumberFormat('en-US',{},'extra');`, `format.format(1)`, false},
		{`const format=new Intl.NumberFormat(['en-US']);`, `format.format(1)`, false},
		{`const {format}=new Intl.NumberFormat('en-US');`, `format(1)`, false},
		{`const format=new Intl.Locale('en-US');`, `format.maximize().toString()`, false},
		{`const format=new Intl.NumberFormat('en-US');function nested(){return format.format(1)}`, `nested()`, true},
	} {
		source := c.setup + `export function label(){return ` + c.expression + `;}`
		g := intlCacheGeneration(t, source)
		plan := planIntlOperations(g.sourceFile, g.checker, nil)
		if (len(plan.removed) > 0) != c.removed {
			t.Fatalf("cache identity changed: %s %#v", source, plan.removed)
		}
		for _, target := range []Target{TargetClient, TargetServer} {
			r := NewSession().Execute(Request{Kind: "compile", ID: g.sourceFile.FileName(), Root: filepath.Dir(g.sourceFile.FileName()), Source: source, Target: target})
			if r.Error != "" || r.Code == "" {
				t.Fatalf("lowering failed: %s %#v", r.Error, r.Diagnostics)
			}
			if !strings.Contains(r.Code, "intl as __exactIntl") {
				t.Fatalf("global cache owner disappeared: %s", r.Code)
			}
		}
	}
}
