package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/vfs"
	"slices"
	"sync"
)

type validationRead struct {
	text  string
	found bool
}

// validationDependencies observes the isolated program's actual filesystem inputs, including
// failed resolution probes. Concurrent parser reads are synchronized. Untracked traversal
// forces a fresh program instead of assuming that unchanged source text proves resolution.
type validationDependencies struct {
	vfs.FS
	mu          sync.Mutex
	reads       map[string]validationRead
	files, dirs map[string]bool
	paths       map[string]string
	entries     map[string]vfs.Entries
	volatile    bool
}

func newValidationDependencies() *validationDependencies {
	return &validationDependencies{reads: make(map[string]validationRead), files: make(map[string]bool), dirs: make(map[string]bool), paths: make(map[string]string), entries: make(map[string]vfs.Entries)}
}

func (fs *validationDependencies) ReadFile(path string) (string, bool) {
	text, found := fs.FS.ReadFile(path)
	fs.mu.Lock()
	fs.reads[path] = validationRead{text, found}
	fs.mu.Unlock()
	return text, found
}
func (fs *validationDependencies) FileExists(path string) bool {
	found := fs.FS.FileExists(path)
	fs.mu.Lock()
	fs.files[path] = found
	fs.mu.Unlock()
	return found
}
func (fs *validationDependencies) DirectoryExists(path string) bool {
	found := fs.FS.DirectoryExists(path)
	fs.mu.Lock()
	fs.dirs[path] = found
	fs.mu.Unlock()
	return found
}
func (fs *validationDependencies) Realpath(path string) string {
	value := fs.FS.Realpath(path)
	fs.mu.Lock()
	fs.paths[path] = value
	fs.mu.Unlock()
	return value
}
func (fs *validationDependencies) GetAccessibleEntries(path string) vfs.Entries {
	value := fs.FS.GetAccessibleEntries(path)
	// Symlink metadata has no stable snapshot here. Retain fresh validation for that host path.
	fs.mu.Lock()
	if len(value.Symlinks) != 0 {
		fs.volatile = true
	}
	fs.entries[path] = vfs.Entries{Files: slices.Clone(value.Files), Directories: slices.Clone(value.Directories)}
	fs.mu.Unlock()
	return value
}
func (fs *validationDependencies) Stat(path string) vfs.FileInfo {
	fs.mu.Lock()
	fs.volatile = true
	fs.mu.Unlock()
	return fs.FS.Stat(path)
}
func (fs *validationDependencies) WalkDir(root string, walk vfs.WalkDirFunc) error {
	fs.mu.Lock()
	fs.volatile = true
	fs.mu.Unlock()
	return fs.FS.WalkDir(root, walk)
}

func (fs *validationDependencies) unchanged() bool {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	if fs.volatile {
		return false
	}
	for path, want := range fs.reads {
		text, found := fs.FS.ReadFile(path)
		if text != want.text || found != want.found {
			return false
		}
	}
	for path, want := range fs.files {
		if fs.FS.FileExists(path) != want {
			return false
		}
	}
	for path, want := range fs.dirs {
		if fs.FS.DirectoryExists(path) != want {
			return false
		}
	}
	for path, want := range fs.paths {
		if fs.FS.Realpath(path) != want {
			return false
		}
	}
	for path, want := range fs.entries {
		value := fs.FS.GetAccessibleEntries(path)
		if len(value.Symlinks) != 0 || !slices.Equal(value.Files, want.Files) || !slices.Equal(value.Directories, want.Directories) {
			return false
		}
	}
	return true
}
