package exactcompiler

import (
	"context"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// Cache planning must preserve receiver ownership and reject formatter identity escapes.
// These source witnesses exercise the planner independently of localization extraction.
func TestIntlCacheBindingOwnership(t *testing.T) {
	for _, c := range []struct {
		name, setup, body string
		bindings, removed int
	}{
		{"shared component formatter", `const format=new Intl.NumberFormat('en-US',{useGrouping:false});`, `format.format(props.value)+format.format(props.other)`, 2, 1},
		{"partial declaration", `const format=new Intl.NumberFormat('en-US'),suffix='!';`, `format.format(props.value)+suffix`, 1, 1},
		{"escaping identity", `const format=new Intl.NumberFormat('en-US');const alias=format;`, `alias.format(props.value)`, 0, 0},
		{"unsupported member", `const format=new Intl.NumberFormat('en-US');const prototype=format.constructor;void prototype;`, `format.format(props.value)`, 0, 0},
		{"detached method", `const format=new Intl.NumberFormat('en-US');const read=format.format;`, `read(props.value)`, 0, 0},
		{"default options", `const format=new Intl.NumberFormat();`, `format.format(props.value)`, 1, 1},
		{"dynamic locale", `const format=new Intl.NumberFormat(props.locale);`, `format.format(props.value)`, 0, 0},
		{"dynamic options", `const format=new Intl.NumberFormat('en-US',{minimumFractionDigits:props.value});`, `format.format(props.value)`, 0, 0},
		{"unused formatter", `const format=new Intl.NumberFormat('en-US');`, `props.value`, 0, 0},
		{"shadowed formatter reference", `const format=new Intl.NumberFormat('en-US');function read(format:{format(value:number):string}){return format.format(2)}`, `format.format(props.value)`, 1, 1},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := `export function Page(props:{value:number,other:number,locale:string}){` + c.setup + `return()=> <output>{` + c.body + `}</output>;}`
			generation := intlCacheGeneration(t, source)
			plan := planIntlOperations(generation.sourceFile, generation.checker, nil)
			if len(plan.bindings) != c.bindings || len(plan.removed) != c.removed {
				t.Fatalf("lost cache ownership: bindings=%d removed=%d, expected %d/%d", len(plan.bindings), len(plan.removed), c.bindings, c.removed)
			}
			if !plan.componentLocalization {
				t.Fatal("native formatter failed to retain component localization capability")
			}
			for span, binding := range plan.bindings {
				if !binding.uses[span] || binding.constructor != "NumberFormat" {
					t.Fatalf("component method lost its receiver: %#v", binding)
				}
			}
		})
	}
}

func TestIntlCacheLoweringSourcePaths(t *testing.T) {
	for _, source := range []string{
		`export function Page(props:{value:number}){const format=new Intl.NumberFormat('en-US');return()=> <output>{format.format(props.value)}</output>;}`,
		`export function Page(props:{value:number}){return()=> <output>{Intl.NumberFormat('en-US').format(props.value)}</output>;}`,
		`export function Page(props:{value:number}){const format=new Intl.NumberFormat;return()=> <output>{format.format(props.value)}</output>;}`,
		`const __exactIntl=1,__exactIntl2=2;export function label(value:number){return new Intl.NumberFormat('en-US').format(value)+__exactIntl+__exactIntl2}export function Page(props:{value:number}){return()=> <output>{label(props.value)}</output>;}`,
		`export function Page(props:{value:number}){const format=Intl.NumberFormat('en-US'),suffix='!';return()=> <output>{format.format(props.value)+suffix}</output>;}`,
		`'use strict';const format=new Intl.NumberFormat('en-US');export function label(value:number){return format.format(value)}export function Page(props:{value:number}){return()=> <output>{label(props.value)}</output>;}`,
	} {
		generation := intlCacheGeneration(t, source)
		for _, target := range []Target{TargetClient, TargetServer} {
			r := NewSession().Execute(Request{Kind: "compile", ID: generation.sourceFile.FileName(), Root: filepath.Dir(generation.sourceFile.FileName()), ConfigFile: filepath.Join(filepath.Dir(generation.sourceFile.FileName()), "tsconfig.json"), Target: target, Source: source})
			if r.Error != "" || r.Code == "" {
				t.Fatalf("cache lowering failed: %s %#v", r.Error, r.Diagnostics)
			}
			if !strings.Contains(r.Code, ".NumberFormat(") || !strings.Contains(r.Code, ".format(") {
				t.Fatalf("formatter method disappeared: %s", r.Code)
			}
			if regexp.MustCompile(`\bIntl\.NumberFormat\(`).MatchString(r.Code) {
				t.Fatalf("native formatter bypassed the shared cache: %s", r.Code)
			}
		}
	}
}

// Optional receivers must keep their authored short-circuit boundary, including skipped options.
func TestIntlPrototypeCacheSourceBoundaries(t *testing.T) {
	for _, c := range []struct {
		name, expression string
		cached           bool
	}{
		{"date", `props.date.toLocaleString('en-US')`, true},
		{"number", `props.value.toLocaleString('en-US')`, true},
		{"bigint", `props.integer.toLocaleString('en-US')`, true},
		{"dynamic locale", `props.date.toLocaleString(props.locale)`, true},
		{"dynamic options", `props.value.toLocaleString('en-US',props.options)`, false},
		{"spread options", `props.value.toLocaleString('en-US',{...props.options})`, false},
		{"optional date", `props.optionalDate?.toLocaleString('en-US')`, false},
		{"optional method", `props.date.toLocaleString?.('en-US')`, false},
		{"nested optional receiver", `props.nested?.date.toLocaleString('en-US')`, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := `export function Page(props:{date:Date,value:number,integer:bigint,locale:string,options:Intl.NumberFormatOptions,optionalDate:Date|null,nested:{date:Date}|null}){return()=> <output>{` + c.expression + `}</output>;}`
			generation := intlCacheGeneration(t, source)
			plan := planIntlOperations(generation.sourceFile, generation.checker, nil)
			if (len(plan.prototypes) == 1) != c.cached {
				t.Fatalf("native cache crossed authored evaluation boundary: %#v", plan.prototypes)
			}
		})
	}
}

func TestIntlOptionalConstructorCacheBoundary(t *testing.T) {
	generation := intlCacheGeneration(t, `export function Page(props:{value:number}){return()=> <output>{Intl.NumberFormat?.('en-US').format(props.value)}</output>;}`)
	plan := planIntlOperations(generation.sourceFile, generation.checker, nil)
	if len(plan.constructors) != 0 || plan.componentLocalization {
		t.Fatalf("optional constructor lost its call boundary: %#v", plan.constructors)
	}
}

// Each test owns a checker generation and releases it before its temporary project is removed.
func intlCacheGeneration(t *testing.T, source string) *projectGeneration {
	t.Helper()
	root := t.TempDir()
	file := filepath.Join(root, "page.tsx")
	if err := os.WriteFile(filepath.Join(root, "tsconfig.json"), []byte(`{"compilerOptions":{"target":"esnext","jsx":"preserve","lib":["esnext","dom"]},"include":["*.tsx"]}`), 0600); err != nil {
		t.Fatal(err)
	}
	state, diagnostics, err := newProjectState(Request{Root: root, ConfigFile: filepath.Join(root, "tsconfig.json"), Source: source}, file)
	if err != nil || len(diagnostics) != 0 {
		t.Fatalf("project preparation failed: %v %#v", err, diagnostics)
	}
	generation, err := state.advance(context.Background(), file, source)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(generation.release)
	return generation
}
