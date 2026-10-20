import { useState } from 'react'
import { SimulatorDialog } from './SimulatorDialog'
import { browsePaths } from '../engine/libraryStore'
import {
  ENGINEERING_UNITS, PARAM_TYPE_LABEL, SPECIAL_PARAM_TYPES, instanceConfigurable, paramValueError,
  type ParamDef, type ParamType, type ParamValue, type ScaleValue, type SimulateValue
} from '../engine/classLibrary'

export interface ParamDialogResult { name: string; type: ParamType; value: ParamValue; flag: boolean }

/**
 * DeltaV parameter Properties dialog (course 7016 pp 1-20 and 1-23).
 * mode="class": Control Studio on a Control Module Class — "Allow instance value to be configured".
 * mode="instance": Explorer on a class-based module — "Use default value from library object".
 */
export function LibraryParamDialog({ title, name, def, mode, value, flag, classValue, onOk, onClose, readOnly = false }: {
  title: string
  name: string
  def: ParamDef
  mode: 'class' | 'instance'
  value: ParamValue
  /** class: allowInstance; instance: use default value from library object. */
  flag: boolean
  classValue?: ParamValue
  onOk: (result: ParamDialogResult) => string | null
  onClose: () => void
  readOnly?: boolean
}): JSX.Element {
  const [draftName, setDraftName] = useState(name)
  const [type, setType] = useState<ParamType>(def.type)
  const [current, setCurrent] = useState<ParamValue>(clone(value))
  const [checked, setChecked] = useState(flag)
  const [error, setError] = useState<string | null>(null)
  const [browsing, setBrowsing] = useState(false)
  const special = mode === 'class' && !!def.special
  const configurable = !def.readOnly && !readOnly
  const usingDefault = mode === 'instance' && checked
  const shown = usingDefault && classValue !== undefined ? classValue : current
  const disabled = !configurable || usingDefault || (mode === 'instance' && !instanceConfigurable(def))
  const effectiveDef: ParamDef = { ...def, type }

  const submit = (): void => {
    const err = disabled && !usingDefault ? null : paramValueError(effectiveDef, shown)
    if (err) { setError(err); return }
    const result = onOk({ name: draftName.trim(), type, value: clone(shown), flag: checked })
    if (result) setError(result)
    else onClose()
  }

  const changeType = (next: ParamType): void => {
    setType(next)
    setCurrent(next === 'fstatus' ? 0 : '')
  }

  return <SimulatorDialog className="module-download-dialog lib-param-dialog" label={`${title} Properties`} onClose={onClose}>
    <div className="lib-dlg-grid">
      <div className="lib-dlg-fields">
        <label>Parameter name:
          <input aria-label="Parameter name" value={draftName} readOnly={!special} disabled={!special}
            onChange={e => setDraftName(e.target.value.toUpperCase())} />
        </label>
        <label>Parameter type:
          {special ? <select aria-label="Parameter type" value={type} onChange={e => changeType(e.target.value as ParamType)}>
            {SPECIAL_PARAM_TYPES.map(t => <option key={t} value={t}>{PARAM_TYPE_LABEL[t]}</option>)}
          </select> : <input aria-label="Parameter type" value={PARAM_TYPE_LABEL[def.type]} readOnly disabled />}
        </label>
        <label>Parameter category:
          <input aria-label="Parameter category" value={def.category} readOnly disabled />
        </label>
        {mode === 'class' && configurable && type !== 'extref' && type !== 'intref' && <label className="lib-dlg-check">
          <input type="checkbox" aria-label="Allow instance value to be configured" checked={checked}
            onChange={e => setChecked(e.target.checked)} />
          Allow instance value to be configured
        </label>}
        {mode === 'instance' && configurable && <label className="lib-dlg-check">
          <input type="checkbox" aria-label="Use default value from library object" checked={checked}
            onChange={e => setChecked(e.target.checked)} />
          Use default value from library object
        </label>}
      </div>
      <div className="lib-dlg-buttons">
        <button className="tbtn sm" onClick={submit} disabled={readOnly}>OK</button>
        <button className="tbtn sm" onClick={onClose}>Cancel</button>
        <button className="tbtn sm" disabled title="Parameter filtering is not modeled">Filter...</button>
      </div>
    </div>
    <fieldset className="lib-dlg-props" disabled={disabled}>
      <legend>Properties</legend>
      <ValueEditor def={effectiveDef} value={shown} onChange={setCurrent} onBrowse={() => setBrowsing(true)} instance={mode === 'instance'} />
    </fieldset>
    {browsing && <div className="lib-browse" role="listbox" aria-label="Browse references">
      <div className="exp-props-subhead">Browse (simulated DeltaV database)</div>
      {browsePaths().map(path => <button key={path} className="ctx-item" onClick={() => { setCurrent(path); setBrowsing(false) }}>{path}</button>)}
      <button className="tbtn sm" onClick={() => setBrowsing(false)}>Close</button>
    </div>}
    {error && <p role="alert" className="lib-dlg-error">{error}</p>}
  </SimulatorDialog>
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function ValueEditor({ def, value, onChange, onBrowse, instance }: {
  def: ParamDef; value: ParamValue; onChange: (v: ParamValue) => void; onBrowse: () => void; instance: boolean
}): JSX.Element {
  switch (def.type) {
    case 'scale': {
      const s = value as ScaleValue
      const units = ENGINEERING_UNITS.includes(s.units) ? ENGINEERING_UNITS : [...ENGINEERING_UNITS, s.units]
      return <>
        <label>100% scale:<input aria-label="100% scale" type="number" value={s.hi} onChange={e => onChange({ ...s, hi: Number(e.target.value) })} /></label>
        <label>0% of scale:<input aria-label="0% of scale" type="number" value={s.lo} onChange={e => onChange({ ...s, lo: Number(e.target.value) })} /></label>
        <label>Engineering unit:
          <select aria-label="Engineering unit" value={s.units} onChange={e => onChange({ ...s, units: e.target.value })}>
            {units.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label>Decimal places:<input aria-label="Decimal places" type="number" min={0} max={6} value={s.decimals}
          onChange={e => onChange({ ...s, decimals: Number(e.target.value) })} /></label>
      </>
    }
    case 'simulate': {
      const s = value as SimulateValue
      return <>
        <label>Simulate:
          <select aria-label="Simulate enable" value={s.enabled ? 'Enabled' : 'Disabled'} onChange={e => onChange({ ...s, enabled: e.target.value === 'Enabled' })}>
            <option>Disabled</option><option>Enabled</option>
          </select>
        </label>
        <label>Simulate value:<input aria-label="Simulate value" type="number" value={s.value} onChange={e => onChange({ ...s, value: Number(e.target.value) })} /></label>
        <span className="exp-hint">When SIMULATE_IN is connected, the connected value replaces the simulate value.</span>
      </>
    }
    case 'enum': case 'mode':
      return <label>{def.type === 'mode' ? 'Target mode:' : 'Value:'}
        <select aria-label="Parameter value" value={value as string} onChange={e => onChange(e.target.value)}>
          {(def.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    case 'bitstring':
      return <>{(def.options ?? []).map(o => <label key={o} className="lib-dlg-check">
        <input type="checkbox" aria-label={o} checked={(value as string[]).includes(o)}
          onChange={e => onChange(e.target.checked ? [...(value as string[]), o] : (value as string[]).filter(x => x !== o))} />{o}
      </label>)}</>
    case 'float': case 'fstatus':
      return <label>Value{def.units ? ` (${def.units})` : ''}:
        <input aria-label="Parameter value" type="number" value={value as number} onChange={e => onChange(Number(e.target.value))} />
      </label>
    case 'extref': case 'intref':
      return <>
        <label>{def.type === 'extref' ? 'External' : 'Internal'} parameter path:
          <input aria-label="External parameter path" value={value as string} placeholder="MODULE/PARAMETER"
            onChange={e => onChange(e.target.value.toUpperCase())} />
        </label>
        <button className="tbtn sm" type="button" onClick={onBrowse}>Browse...</button>
        {!instance && <span className="exp-hint">In a class, leave the path blank; each instance supplies its own path.</span>}
      </>
    case 'ioref': case 'string':
      return <label>Value:<input aria-label="Parameter value" value={value as string} onChange={e => onChange(e.target.value)} /></label>
    default:
      return <span className="exp-hint">Dynamic parameter — its value is computed by the block at run time and cannot be configured.</span>
  }
}
