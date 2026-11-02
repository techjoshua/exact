package exactcompiler

import (
	"context"
	"fmt"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/parser"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
)

func occurrenceViewFixture(count int) (*sourceValueOwner, []*ast.SourceFile) {
	owner := newSourceValueOwner(nil)
	sources := make([]*ast.SourceFile, count)
	for i := range sources {
		name := fmt.Sprintf("/view-%d.ts", i)
		sources[i] = parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: name, Path: tspath.Path(name)}, "export const value=1", core.ScriptKindTS)
		owner.indexes[sources[i]] = sourceValueIndex{importsPrepared: true, normalOrdinal: i}
	}
	return owner, sources
}

// Deduplication retains first-seen source order and all original charges. More
// selected sources than the inline capacity must still produce the full view.
func TestOccurrenceSourceViewOrderAndOverflow(t *testing.T) {
	owner, sources := occurrenceViewFixture(6)
	query := sourceValueQuery{owner: owner, initializing: sources[1].AsNode(), reading: sources[0].AsNode(), returning: sources[2].AsNode(), remaining: 100}
	result := accessorCandidates{opaque: true, valueIncomplete: true}
	var storage [4]sourceValueIndex
	view := query.occurrenceSourceViewIn(sources[0].AsNode(), &result, []*ast.SourceFile{sources[2], nil, sources[3], sources[4], sources[5], sources[1]}, storage[:0])
	if len(view) != 6 {
		t.Fatal("source view truncated", len(view))
	}
	for i, index := range view {
		if index.normalOrdinal != i {
			t.Fatal("source order changed", i, index.normalOrdinal)
		}
	}
	if owner.work != 9 || query.remaining != 91 || !result.opaque || !result.valueIncomplete {
		t.Fatal("charges or uncertainty changed", owner.work, query.remaining, result)
	}
}

// Preparation refusal and an unprepared index are copied at acquisition time.
// Publishing later ready entries must not update or reload this retained view.
func TestOccurrenceSourceViewRetainsReadiness(t *testing.T) {
	owner, sources := occurrenceViewFixture(2)
	owner.indexPreparing = map[*ast.SourceFile]bool{sources[0]: true}
	owner.indexes[sources[1]] = sourceValueIndex{normalOrdinal: 1}
	query := sourceValueQuery{owner: owner}
	result := accessorCandidates{}
	var storage [4]sourceValueIndex
	view := query.occurrenceSourceViewIn(sources[0].AsNode(), &result, []*ast.SourceFile{sources[1]}, storage[:0])
	delete(owner.indexPreparing, sources[0])
	owner.indexes[sources[0]] = sourceValueIndex{importsPrepared: true, normalOrdinal: 8}
	owner.indexes[sources[1]] = sourceValueIndex{importsPrepared: true, normalOrdinal: 9}
	if len(view) != 2 || !view[0].incomplete || view[1].importsPrepared || view[1].normalOrdinal != 1 {
		t.Fatal("captured readiness replaced", view)
	}
	var nextStorage [4]sourceValueIndex
	next := query.occurrenceSourceViewIn(sources[0].AsNode(), &result, []*ast.SourceFile{sources[1]}, nextStorage[:0])
	if next[0].incomplete || !next[1].importsPrepared || next[1].normalOrdinal != 9 || !view[0].incomplete || view[1].importsPrepared {
		t.Fatal("independent view changed earlier acquisition")
	}
}

// An empty source domain performs no index work or charges.
func TestOccurrenceSourceViewEmpty(t *testing.T) {
	owner, _ := occurrenceViewFixture(0)
	query := sourceValueQuery{owner: owner}
	result := accessorCandidates{}
	var storage [4]sourceValueIndex
	if view := query.occurrenceSourceView(nil, &result, storage[:0]); len(view) != 0 || owner.work != 0 {
		t.Fatal("empty view invented source work")
	}
}

// Real resolver preparation can become available between views. The earlier
// copied index keeps its original import-elision readiness through that change.
func TestOccurrenceSourceViewImportPreparation(t *testing.T) {
	for _, row := range []struct {
		name, usage string
		erased      bool
	}{
		{"unused", "{}", true},
		{"retained", "unused", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			const id = "/virtual/view-entry.ts"
			source := `import {unused} from './view-helper.js';export const value=` + row.usage + `;`
			request := Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"}
			project, diagnostics, err := newProjectStateWithSources(request, id, map[string]string{id: source, "/virtual/view-helper.ts": `export const unused=()=>document.title;`})
			if err != nil || len(diagnostics) != 0 {
				t.Fatal(err, diagnostics)
			}
			generation, err := project.advance(context.Background(), id, source)
			if err != nil {
				t.Fatal(err)
			}
			defer generation.release()
			owner := newSourceValueOwner(generation.checker)
			owner.generation = generation
			owner.program = generation.program
			query := sourceValueQuery{owner: owner}
			result := accessorCandidates{}
			generation.prepareImports = false
			var oldStorage [4]sourceValueIndex
			old := query.occurrenceSourceView(generation.sourceFile.AsNode(), &result, oldStorage[:0])
			generation.prepareImports = true
			if !generation.canPrepareImportElision(generation.sourceFile) {
				t.Fatal("import preparation fixture unavailable")
			}
			var readyStorage [4]sourceValueIndex
			ready := query.occurrenceSourceView(generation.sourceFile.AsNode(), &result, readyStorage[:0])
			if len(old) != 1 || old[0].importsPrepared || len(ready) != 1 || !ready[0].importsPrepared {
				t.Fatal("import readiness not preserved")
			}
			if len(ready[0].runtimeImports) != 1 || ready[0].erasedImports[ready[0].runtimeImports[0]] != row.erased {
				t.Fatal("import elision decision changed")
			}
		})
	}
}

// BenchmarkOccurrenceSourceView isolates retained index copying for the common
// one-source view and overflow, with cached generation-owned source indexes.
func BenchmarkOccurrenceSourceView(b *testing.B) {
	for _, count := range []int{1, 6} {
		b.Run(fmt.Sprint(count), func(b *testing.B) {
			owner, sources := occurrenceViewFixture(count)
			query := sourceValueQuery{owner: owner}
			result := accessorCandidates{}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				var storage [4]sourceValueIndex
				view := query.occurrenceSourceViewIn(sources[0].AsNode(), &result, sources[1:], storage[:0])
				if len(view) != count {
					b.Fatal("lost source")
				}
			}
		})
	}
}
