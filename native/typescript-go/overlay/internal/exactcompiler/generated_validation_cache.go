package exactcompiler

import (
	"context"
	"slices"
)

// generatedValidationProject retains at most the last artifact per executable/checking target.
// It owns a separate program and overlay, never the authored program or an acquired checker.
type generatedValidationProject struct {
	key          string
	project      *projectState
	dependencies *validationDependencies
}

func (entry *generatedValidationProject) reusable(key string, filename string, sources *sourceOverlay) bool {
	if entry == nil || entry.key != key || !entry.dependencies.unchanged() {
		return false
	}
	for path := range entry.project.fs.files {
		if path == entry.project.fs.canonical(filename) {
			continue
		}
		if sources == nil {
			return false
		}
		if _, present := sources.files[path]; !present {
			return false
		}
	}
	if sources != nil {
		for path, text := range sources.files {
			previous, present := entry.project.fs.files[path]
			// New virtual files can change config root discovery or failed resolution probes.
			// Changed non-source overlays can alter compiler options or package exports.
			if !present || previous != text && entry.project.program.GetSourceFile(path) == nil {
				return false
			}
		}
	}
	return true
}

func updateValidationOverlays(project *projectState, sources *sourceOverlay) error {
	if sources == nil {
		return nil
	}
	paths := make([]string, 0, len(sources.files))
	for path, text := range sources.files {
		project.fs.set(path, text)
		paths = append(paths, path)
	}
	slices.Sort(paths)
	for _, path := range paths {
		if source := project.program.GetSourceFile(path); source != nil && source.Text() != sources.files[path] {
			generation, err := project.advance(context.Background(), path, sources.files[path])
			if err != nil {
				return err
			}
			generation.release()
		}
	}
	return nil
}
