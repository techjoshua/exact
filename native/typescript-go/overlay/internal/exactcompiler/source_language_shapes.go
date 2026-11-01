package exactcompiler

// storageDomain is a positive builder-only acquired-value fact. The zero value
// is unavailable. It never enters an executable recipe, receipt or continuation.
type storageDomain struct {
	kind   storageDomainKind
	owner  *storageBuilder
	object *storageShape
}
type storageDomainKind uint8

const (
	storageUnavailableDomain storageDomainKind = iota
	storagePrimitiveDomain
	storageObjectDomain
)

// storageOwnProperty carries descriptor knowledge shared by direct Get and rest.
type storageOwnProperty struct {
	domain            storageDomain
	enumerable, known bool
}

// storageShape names a planned allocation only within its builder. Aliases share
// a handle, while equal field sets do not merge handles. Ordinary primitive Put
// preserves membership. Array length transitions update this shared population.
// Actual ObjectIds and persistent storage remain the only semantic authority.
type storageShape struct {
	owner  *storageBuilder
	fields map[string]storageOwnProperty
	array  bool
	length uint32
}

func (p *storageBuilder) primitiveDomain() storageDomain {
	if !p.discover() {
		return storageDomain{}
	}
	return storageDomain{kind: storagePrimitiveDomain, owner: p}
}
func (p *storageBuilder) objectDomain() storageDomain {
	if !p.discover() {
		return storageDomain{}
	}
	return storageDomain{kind: storageObjectDomain, owner: p, object: &storageShape{owner: p, fields: make(map[string]storageOwnProperty)}}
}

// validDomain rejects missing, contradictory and foreign facts without recursively
// rebuilding nested shapes. Field edges are checked when inserted and acquired.
func (p *storageBuilder) validDomain(d storageDomain) bool {
	if !p.discover() || d.owner != p {
		return false
	}
	switch d.kind {
	case storagePrimitiveDomain:
		return d.object == nil
	case storageObjectDomain:
		return d.object != nil && d.object.owner == p && d.object.fields != nil
	default:
		return false
	}
}
func (p *storageBuilder) isPrimitive(d storageDomain) bool {
	return p.validDomain(d) && d.kind == storagePrimitiveDomain
}
func (p *storageBuilder) fieldDomain(d storageDomain, key string) (storageDomain, bool) {
	if !p.validDomain(d) || d.kind != storageObjectDomain || !p.discover() {
		return storageDomain{}, false
	}
	field, ok := d.object.fields[key]
	return field.domain, ok && p.validDomain(field.domain)
}
func (p *storageBuilder) insertDomain(d storageDomain, key string, field storageDomain) bool {
	if !p.validDomain(d) || d.kind != storageObjectDomain || !p.validDomain(field) || !p.discover() {
		return false
	}
	d.object.fields[key] = storageOwnProperty{domain: field, enumerable: true, known: true}
	return true
}

// restDomain creates a fresh outer map and retains nested handles shallowly.
// Discovery pays each visited field, exclusion and insertion before work.
func (p *storageBuilder) restDomain(source storageDomain, excluded []string) (storageDomain, bool) {
	if !p.validDomain(source) || source.kind != storageObjectDomain {
		return storageDomain{}, false
	}
	target := p.objectDomain()
	if !p.validDomain(target) || !p.discover() {
		return storageDomain{}, false
	}
	omit := make(map[string]bool)
	for _, key := range excluded {
		if !p.discover() {
			return storageDomain{}, false
		}
		omit[key] = true
	}
	for key, field := range source.object.fields {
		if !p.discover() {
			return storageDomain{}, false
		}
		if omit[key] {
			continue
		}
		if !field.known {
			return storageDomain{}, false
		}
		if !field.enumerable {
			continue
		}
		if !p.insertDomain(target, key, field.domain) {
			return storageDomain{}, false
		}
	}
	return target, !p.exhausted
}
