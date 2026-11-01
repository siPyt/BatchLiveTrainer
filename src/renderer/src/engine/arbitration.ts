// Course 7016 Chapter 8: equipment arbitration (pp 8-5, 8-6, 8-11) and phase REQUEST codes (pp 8-7, 8-9).
// An equipment or control module "participates" with an Equipment ID (1-99, so it fits the nn of 40nn / 42nn), a number of
// maximum owners and a list of other participating equipment it needs. A resource such as COLOR_HEADER needs the two blender
// color inlets, so acquiring the header also acquires them (and is refused while another phase owns one of them).

export interface ArbConfig { participate: boolean; equipmentId: number; maxOwners: number; needed: string[] }
export interface ArbDeployed extends ArbConfig { controller: string | null; at: number }

export const ARB_MAX_ID = 99
export const ARB_MAX_OWNERS = 99

export const DEFAULT_ARB = (equipmentId: number): ArbConfig => ({ participate: false, equipmentId, maxOwners: 1, needed: [] })

/** Lowest equipment ID (1-99) that no module has been given yet. */
export function nextEquipmentId(configs: Record<string, ArbConfig>): number {
  const used = new Set(Object.values(configs).map(c => c.equipmentId))
  for (let n = 1; n <= ARB_MAX_ID; n++) if (!used.has(n)) return n
  return ARB_MAX_ID
}

/** Problems with a proposed arbitration configuration for `tag`, or null when it can be saved. */
export function arbitrationError(tag: string, next: ArbConfig, configs: Record<string, ArbConfig>, exists: (t: string) => boolean): string | null {
  if (!Number.isInteger(next.equipmentId) || next.equipmentId < 1 || next.equipmentId > ARB_MAX_ID) return `The Equipment ID must be a whole number from 1 to ${ARB_MAX_ID}`
  if (!Number.isInteger(next.maxOwners) || next.maxOwners < 1 || next.maxOwners > ARB_MAX_OWNERS) return `Maximum owners must be a whole number from 1 to ${ARB_MAX_OWNERS}`
  if (next.participate) {
    const clash = Object.entries(configs).find(([t, c]) => t !== tag && c.participate && c.equipmentId === next.equipmentId)
    if (clash) return `Equipment ID ${next.equipmentId} is already used by ${clash[0]}`
  }
  for (const n of next.needed) {
    if (n === tag) return `${tag} cannot need itself`
    if (!exists(n)) return `${n} does not exist`
    if (!configs[n]?.participate) return `${n} does not participate in equipment arbitration; set that up on ${n} first`
  }
  if (new Set(next.needed).size !== next.needed.length) return 'A module can be listed once in Equipment needed'
  if (next.needed.length && !next.participate) return 'Equipment needed is used only when the module participates in equipment arbitration'
  return null
}

export type RequestKind = 'none' | 'download' | 'upload' | 'acquire' | 'release' | 'send' | 'wait' | 'other'
export interface RequestInfo { kind: RequestKind; id?: number; text: string }

/** What a value written to a phase's REQUEST parameter means (slide 8-7 and 8-9). */
export function decodeRequest(code: number): RequestInfo {
  if (!Number.isFinite(code) || code === 0) return { kind: 'none', text: 'No request' }
  if (code === 1000) return { kind: 'download', text: 'Download parameters' }
  if (code === 2000) return { kind: 'upload', text: 'Upload parameters' }
  const hi = Math.floor(code / 100), nn = code % 100
  if (Number.isInteger(code) && nn >= 1) {
    if (hi === 40) return { kind: 'acquire', id: nn, text: `Acquire the resource with Equipment ID ${nn}` }
    if (hi === 42) return { kind: 'release', id: nn, text: `Release the resource with Equipment ID ${nn}` }
    if (hi === 52) return { kind: 'send', id: nn, text: `Send message ${nn} to the other phase` }
    if (hi === 55) return { kind: 'wait', id: nn, text: `Wait for message ${nn} from the other phase` }
  }
  return { kind: 'other', text: `Request ${code}` }
}

export interface OwnerTable { [equipmentId: string]: string[] }

/** The configured equipment (the module itself plus everything it needs) a request for `tag` involves. */
export function resourceSet(tag: string, deployed: Record<string, ArbDeployed>): string[] {
  return [tag, ...(deployed[tag]?.needed ?? [])].filter(t => deployed[t]?.participate)
}

/** Why `phaseKey` cannot acquire `tag` right now, or null when it can. */
export function acquireBlock(tag: string, phaseKey: string, deployed: Record<string, ArbDeployed>, owners: OwnerTable): string | null {
  for (const t of resourceSet(tag, deployed)) {
    const d = deployed[t]
    const current = owners[d.equipmentId] ?? []
    if (!current.includes(phaseKey) && current.length >= d.maxOwners) {
      return `${t} (Equipment ID ${d.equipmentId}) is owned by ${current.join(', ')}; its maximum owners is ${d.maxOwners}. The request stays until it is released`
    }
  }
  return null
}
