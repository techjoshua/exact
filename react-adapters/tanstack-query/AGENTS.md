# TanStack Query adapter guidance

Use the exported provider and observer sources rather than recreating query ownership. Keep the
compilerless native provider explicitly branded with its package-owned stable identity before
exposing it through React compatibility.
