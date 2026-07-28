package exactcompiler

import (
	"io/fs"
	"slices"
	"strings"
	"time"

	"github.com/microsoft/typescript-go/internal/tspath"
	"github.com/microsoft/typescript-go/internal/vfs"
)

type sourceOverlay struct {
	base  vfs.FS
	files map[string]string
}

func newSourceOverlay(base vfs.FS) *sourceOverlay {
	return &sourceOverlay{
		base:  base,
		files: make(map[string]string),
	}
}

func (overlay *sourceOverlay) set(path string, source string) {
	overlay.files[overlay.canonical(path)] = source
}

func (overlay *sourceOverlay) canonical(path string) string {
	normalized := tspath.NormalizePath(path)
	if overlay.UseCaseSensitiveFileNames() {
		return normalized
	}
	return strings.ToLower(normalized)
}

func (overlay *sourceOverlay) UseCaseSensitiveFileNames() bool {
	return overlay.base.UseCaseSensitiveFileNames()
}

func (overlay *sourceOverlay) FileExists(path string) bool {
	if _, exists := overlay.files[overlay.canonical(path)]; exists {
		return true
	}
	return overlay.base.FileExists(path)
}

func (overlay *sourceOverlay) ReadFile(path string) (string, bool) {
	if source, exists := overlay.files[overlay.canonical(path)]; exists {
		return source, true
	}
	return overlay.base.ReadFile(path)
}

func (overlay *sourceOverlay) WriteFile(string, string) error {
	return fs.ErrPermission
}

func (overlay *sourceOverlay) AppendFile(string, string) error {
	return fs.ErrPermission
}

func (overlay *sourceOverlay) Remove(string) error {
	return fs.ErrPermission
}

func (overlay *sourceOverlay) Chtimes(string, time.Time, time.Time) error {
	return fs.ErrPermission
}

func (overlay *sourceOverlay) DirectoryExists(path string) bool {
	directory := strings.TrimSuffix(overlay.canonical(path), "/") + "/"
	for fileName := range overlay.files {
		if strings.HasPrefix(fileName, directory) {
			return true
		}
	}
	return overlay.base.DirectoryExists(path)
}

func (overlay *sourceOverlay) GetAccessibleEntries(path string) vfs.Entries {
	entries := overlay.base.GetAccessibleEntries(path)
	files := slices.Clone(entries.Files)
	directories := slices.Clone(entries.Directories)
	seenFiles := make(map[string]struct{}, len(files))
	seenDirectories := make(map[string]struct{}, len(directories))
	for _, name := range files {
		seenFiles[overlay.canonical(name)] = struct{}{}
	}
	for _, name := range directories {
		seenDirectories[overlay.canonical(name)] = struct{}{}
	}

	directory := strings.TrimSuffix(overlay.canonical(path), "/") + "/"
	for fileName := range overlay.files {
		relative, belongs := strings.CutPrefix(fileName, directory)
		if !belongs || relative == "" {
			continue
		}
		name, remainder, nested := strings.Cut(relative, "/")
		if nested {
			if _, exists := seenDirectories[name]; !exists {
				directories = append(directories, name)
				seenDirectories[name] = struct{}{}
			}
		} else if _, exists := seenFiles[name]; !exists {
			files = append(files, name)
			seenFiles[name] = struct{}{}
		}
		_ = remainder
	}
	slices.Sort(files)
	slices.Sort(directories)
	return vfs.Entries{
		Files:       files,
		Directories: directories,
		Symlinks:    entries.Symlinks,
	}
}

func (overlay *sourceOverlay) Stat(path string) vfs.FileInfo {
	return overlay.base.Stat(path)
}

func (overlay *sourceOverlay) WalkDir(root string, walkFn vfs.WalkDirFunc) error {
	return overlay.base.WalkDir(root, walkFn)
}

func (overlay *sourceOverlay) Realpath(path string) string {
	if _, exists := overlay.files[overlay.canonical(path)]; exists {
		return tspath.NormalizePath(path)
	}
	return overlay.base.Realpath(path)
}
