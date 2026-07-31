# Jotai adapter guidance

Use the exported provider and atom sources rather than recreating store ownership. Keep the
compilerless native provider explicitly branded with its package-owned stable identity before
exposing it through React compatibility.
