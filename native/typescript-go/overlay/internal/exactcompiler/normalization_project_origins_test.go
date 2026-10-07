package exactcompiler

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// Imported normalized computations retain browser-data placement after synchronization and updates.
func TestNormalizationImportedTaskOrigins(t *testing.T) {
	root := t.TempDir()
	widget := filepath.Join(root, "Widget.tsx")
	page := filepath.Join(root, "Page.tsx")
	config := filepath.Join(root, "tsconfig.json")
	initial := `export function Widget(this:Component<{width:number}>){this.state.width=window.innerWidth;return()=> <button onClick={()=>this.state.width++}/>;}`
	neutral := `export function Widget(this:Component<{width:number}>){this.state.width=1;return()=> <button onClick={()=>this.state.width++}/>;}`
	if err := os.WriteFile(config, []byte(`{"compilerOptions":{"jsx":"preserve"}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, synchronized := range []bool{false, true} {
		session := NewSession()
		for index, source := range []string{initial, neutral, initial} {
			pageSource := `import {Widget} from './Widget.js';export function Page(){return()=> <main><Widget/></main>;}` + strings.Repeat(" ", index)
			for file, text := range map[string]string{widget: source, page: pageSource} {
				if err := os.WriteFile(file, []byte(text), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			if synchronized {
				r := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: []ProjectSource{{ID: widget, Source: source}, {ID: page, Source: pageSource}}})
				if r.Error != "" {
					t.Fatal(r.Error)
				}
			} else {
				r := session.Execute(Request{Kind: "compile", Root: root, ConfigFile: config, ID: widget, Source: source, Target: TargetClient})
				if r.Error != "" {
					t.Fatal(r.Error)
				}
			}
			r := session.Execute(Request{Kind: "compile", Root: root, ConfigFile: config, ID: page, Source: pageSource, Target: TargetServer})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			boundary := strings.Contains(r.Code, "__exactBoundary")
			if boundary != (index != 1) {
				t.Fatalf("imported placement lost normalization origin (synchronized=%t, transition=%d):\n%s", synchronized, index, r.Code)
			}
		}
	}
}

// Prepared suffixes must not make unchanged synchronized sources invalidate their importers.
// Genuine authored or suffix edits still replace the generation and publish fresh component facts.
func TestNormalizationPreparedSourceIdentity(t *testing.T) {
	root := t.TempDir()
	child := filepath.Join(root, "Child.tsx")
	page := filepath.Join(root, "Page.tsx")
	config := filepath.Join(root, "tsconfig.json")
	suffix := "\nimport type { Marker } from './Marker.js';"
	childSource := `export function Child(){return()=> <span>°😀</span>;}`
	pageSource := `import {Child} from './Child.js';export function Page(){return()=> <main><Child/></main>;}`
	for file, text := range map[string]string{
		config: `{"compilerOptions":{"jsx":"preserve"}}`,
		child:  childSource, page: pageSource,
		filepath.Join(root, "Marker.ts"): `export type Marker = string;`,
	} {
		if err := os.WriteFile(file, []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	for _, preparedSuffix := range []string{"", suffix} {
		session := NewSession()
		request := func(file, source string, target Target) Request {
			boundary := 0
			if preparedSuffix != "" {
				boundary = utf16Length(source)
			}
			return Request{Kind: "compile", Root: root, ConfigFile: config, ID: file,
				Source: source + preparedSuffix, Target: target, PackageEnhancementBoundary: boundary}
		}
		childRequest := request(child, childSource, TargetClient)
		pageRequest := request(page, pageSource, TargetClient)
		synced := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: config,
			Sources: []ProjectSource{
				{ID: child, Source: childRequest.Source, PackageEnhancementBoundary: childRequest.PackageEnhancementBoundary},
				{ID: page, Source: pageRequest.Source, PackageEnhancementBoundary: pageRequest.PackageEnhancementBoundary},
			}})
		if synced.Error != "" || hasErrorDiagnostic(synced.Diagnostics) {
			t.Fatalf("synchronization failed: %s %#v", synced.Error, synced.Diagnostics)
		}
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer, TargetClient} {
			for _, req := range []Request{pageRequest, childRequest} {
				req.Target = target
				cached := session.Execute(req)
				fresh := NewSession().Execute(req)
				if cached.Error != "" || fresh.Error != "" || hasErrorDiagnostic(cached.Diagnostics) {
					t.Fatalf("compilation failed: %s %s %#v", cached.Error, fresh.Error, cached.Diagnostics)
				}
				if cached.Counters.ProgramRebuilds != 0 || cached.Counters.AffectedSourceCount != 0 || cached.Counters.FullInvalidations != 0 {
					t.Fatalf("unchanged prepared source invalidated project facts (suffix=%q): %#v", preparedSuffix, cached.Counters)
				}
				if cached.Code != fresh.Code || !reflect.DeepEqual(cached.Analysis.Components, fresh.Analysis.Components) {
					t.Fatal("retained prepared source diverged from fresh compilation")
				}
			}
		}
		for _, changed := range []Request{
			request(child, strings.ReplaceAll(childSource, "°😀", "changed"), TargetClient),
			request(child, childSource, TargetClient),
		} {
			result := session.Execute(changed)
			if result.Error != "" || result.Counters.ProgramRebuilds == 0 {
				t.Fatalf("authored edit did not replace the generation: %s %#v", result.Error, result.Counters)
			}
			cached := session.Execute(pageRequest)
			fresh := NewSession().Execute(pageRequest)
			if cached.Code != fresh.Code || !reflect.DeepEqual(cached.Analysis.Components, fresh.Analysis.Components) {
				t.Fatal("importer retained stale component facts after an authored edit")
			}
		}
		if preparedSuffix != "" {
			changed := childRequest
			changed.Source += "\ntype AdditionalMarker = number;"
			result := session.Execute(changed)
			if result.Error != "" || result.Counters.ProgramRebuilds == 0 {
				t.Fatalf("suffix edit did not replace the generation: %s %#v", result.Error, result.Counters)
			}
			// Equal prepared text can still have different authored ownership and offset maps.
			changed.PackageEnhancementBoundary = 0
			result = session.Execute(changed)
			if result.Error != "" || result.Counters.ProgramRebuilds != 0 || result.Counters.AffectedSourceCount == 0 {
				t.Fatalf("authored offset change did not invalidate facts without rebuilding: %s %#v", result.Error, result.Counters)
			}
		}
	}
}

// Imported browser computations keep compiler-owned task origins after a prepared module is compiled.
func TestNormalizationPreparedImportedTaskOrigins(t *testing.T) {
	root := t.TempDir()
	widget := filepath.Join(root, "Widget.tsx")
	page := filepath.Join(root, "Page.tsx")
	config := filepath.Join(root, "tsconfig.json")
	suffix := "\nimport type { Marker } from './Marker.js';"
	pageSource := `import {Widget} from './Widget.js';export function Page(){return()=> <main><Widget/></main>;}`
	for file, text := range map[string]string{
		config: `{"compilerOptions":{"jsx":"preserve"}}`, page: pageSource,
		filepath.Join(root, "Marker.ts"): `export type Marker = string;`,
	} {
		if err := os.WriteFile(file, []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	for _, synchronized := range []bool{false, true} {
		session := NewSession()
		for index, value := range []string{"window.innerWidth", "1", "window.innerWidth"} {
			source := `export function Widget(this:Component<{width:number}>){this.state.width=` + value + `;return()=> <button onClick={()=>this.state.width++}>°😀</button>;}`
			if err := os.WriteFile(widget, []byte(source), 0o600); err != nil {
				t.Fatal(err)
			}
			if synchronized {
				r := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: []ProjectSource{
					{ID: widget, Source: source + suffix, PackageEnhancementBoundary: utf16Length(source)},
					{ID: page, Source: pageSource},
				}})
				if r.Error != "" {
					t.Fatal(r.Error)
				}
			}
			r := session.Execute(Request{Kind: "compile", Root: root, ConfigFile: config, ID: widget,
				Source: source + suffix, PackageEnhancementBoundary: utf16Length(source), Target: TargetClient})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			r = session.Execute(Request{Kind: "compile", Root: root, ConfigFile: config, ID: page, Source: pageSource, Target: TargetServer})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			if strings.Contains(r.Code, "__exactBoundary") != (index != 1) {
				t.Fatalf("prepared imported task lost its origin (synchronized=%t, transition=%d):\n%s", synchronized, index, r.Code)
			}
		}
	}
}
