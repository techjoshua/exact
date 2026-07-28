package exactcompiler

import "fmt"

// Registry owns an immutable, deterministically ordered extension collection.
type Registry struct {
	extensions  []Extension
	byNamespace map[string]Extension
	directives  map[string]map[string]struct{}
}

// NewRegistry validates namespaces and freezes extension execution order.
func NewRegistry(extensions ...Extension) (*Registry, error) {
	seen := make(map[string]struct{}, len(extensions))
	byNamespace := make(map[string]Extension, len(extensions))
	directives := make(map[string]map[string]struct{}, len(extensions))
	ordered := append([]Extension(nil), extensions...)
	for _, extension := range ordered {
		if extension == nil {
			return nil, fmt.Errorf("native compiler extension must not be nil")
		}
		namespace := extension.Namespace()
		if namespace == "" {
			return nil, fmt.Errorf("native compiler extension namespace must not be empty")
		}
		if _, exists := seen[namespace]; exists {
			return nil, fmt.Errorf("duplicate native compiler extension namespace %q", namespace)
		}
		seen[namespace] = struct{}{}
		byNamespace[namespace] = extension
		if owner, ok := extension.(DirectiveExtension); ok {
			names := make(map[string]struct{}, len(owner.Directives()))
			for _, name := range owner.Directives() {
				if name == "" {
					return nil, fmt.Errorf(
						"native compiler extension %q has an empty directive name",
						namespace,
					)
				}
				if _, exists := names[name]; exists {
					return nil, fmt.Errorf(
						"native compiler extension %q declares duplicate directive %q",
						namespace,
						name,
					)
				}
				names[name] = struct{}{}
			}
			directives[namespace] = names
		}
	}
	return &Registry{
		extensions:  ordered,
		byNamespace: byNamespace,
		directives:  directives,
	}, nil
}

func (r *Registry) extension(namespace string) Extension {
	if r == nil {
		return nil
	}
	return r.byNamespace[namespace]
}

func (r *Registry) ownsDirective(namespace string, name string) bool {
	if r == nil {
		return false
	}
	_, exists := r.directives[namespace][name]
	return exists
}

func (r *Registry) all() []Extension {
	if r == nil {
		return nil
	}
	return r.extensions
}
