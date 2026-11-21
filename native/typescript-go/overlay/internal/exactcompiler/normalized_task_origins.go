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
		if work != nil && ast.IsArrowFunction(work) && work.Parent != nil && ast.IsVariableDeclaration(work.Parent) && work.Parent.Initializer() == work {
			work = work.Parent
		}
		if work == nil || !(ast.IsFunctionDeclaration(work) || ast.IsVariableDeclaration(work)) || work.Name() == nil {
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
		if targetLocalOpaqueComputation(*task) {
			// The containing component retains this uncertainty under its ordinary placement policy.
			// Other diagnostics, including authored task placement, are not reclassified.
			task.Diagnostics = slices.DeleteFunc(task.Diagnostics, func(message string) bool {
				return strings.HasPrefix(message, "error: task placement depends on an opaque call")
			})
		}
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

// currentSourceNormalization accepts only this Program's source and its guarded
// authored projection. An untouched filesystem dependency can install the exact
// identity projection in the same owner; an unproven overlay stays unmappable.
func (project *projectState) currentSourceNormalization(source *ast.SourceFile) (normalizedSource, bool) {
	if source == nil || project.program.GetSourceFile(source.FileName()) != source {
		return normalizedSource{}, false
	}
	if normalization, exists := project.normalizations[project.fs.canonical(source.FileName())]; exists {
		return normalization, normalization.text == source.Text()
	}
	original, exists := project.fs.base.ReadFile(source.FileName())
	if !exists || original != source.Text() {
		return normalizedSource{}, false
	}
	normalization := newNormalizedSource(original)
	project.retainNormalization(source.FileName(), normalization)
	return normalization, true
}
