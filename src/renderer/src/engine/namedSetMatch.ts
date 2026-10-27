// The course spells the same named set two ways ('EM_Outlet_State' in Chapter 5, 'EM-Outlet_State' in Chapter 6
// and on slide 6-5). Expressions accept either: an exact (case-insensitive) match wins, then a match ignoring - and _.

const squash = (name: string): string => name.trim().toLowerCase().replace(/[-_\s]/g, '')

export function findNamedSet<T extends { name: string }>(sets: Record<string, T>, name: string): T | undefined {
  const all = Object.values(sets)
  const exact = name.trim().toLowerCase()
  return all.find(s => s.name.toLowerCase() === exact) ?? all.find(s => squash(s.name) === squash(name))
}
