package exactcompiler

import (
	"slices"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// attachNormalizedTaskOrigins grants inferred activation semantics only to inserted declarations.
// Authored names never confer compiler ownership, even when they resemble generated names.
func attachNormalizedTaskOrigins(tasks []Task, sourceFile *ast.SourceFile, normalization normalizedSource) {
	for index := range tasks {
		task := &tasks[index]
		work := nodeAtSpan(sourceFile.AsNode(), task.WorkStart, task.WorkLength)
		if work == nil || !ast.IsFunctionDeclaration(work) || work.Name() == nil {
			continue
		}
		name := work.Name()
		start := nodeTokenStart(sourceFile, name)
		if start >= len(normalization.authoredOffsets)-1 || name.End() >= len(normalization.authoredOffsets) {
			continue
		}
		_, authoredLength := normalization.authoredSpan(start, name.End()-start)
		if authoredLength != 0 {
			continue
		}
		task.CompilerSetup = strings.HasPrefix(name.Text(), "__exactComponentSetupTask_")
		task.CompilerComputation = strings.HasPrefix(name.Text(), "__exactComponentComputation_")
	}
}

// retainNormalization preserves authored identity for imported prepared modules across generations.
// The source text is checked by consumers so stale projections cannot brand replacement code.
func (project *projectState) retainNormalization(fileName string, normalization normalizedSource) {
	if project.normalizations == nil {
		project.normalizations = make(map[string]normalizedSource)
	}
	key := project.fs.canonical(fileName)
	previous, exists := project.normalizations[key]
	project.normalizations[key] = normalization
	if exists && (previous.text != normalization.text || !slices.Equal(previous.authoredOffsets, normalization.authoredOffsets)) {
		project.invalidateChangedProjectSources(fileName)
	}
}
