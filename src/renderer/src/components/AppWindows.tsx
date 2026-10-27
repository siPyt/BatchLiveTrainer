import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useUi } from '../ui/uiStore'
import { useWindows, WINDOW_IDS, type WindowId, type WindowRect } from '../ui/windowStore'
import { ExplorerDisplay } from '../displays/ExplorerDisplay'
import { ControlStudioDisplay } from '../displays/ControlStudioDisplay'
import { ClassStudio } from '../displays/ClassStudio'
import { PhaseStudio } from '../displays/PhaseStudio'
import { EmStudio } from '../displays/EmStudio'
import { confirmCloseStudio } from './StudioSaveReminder'

const TITLE: Record<WindowId, string> = { explorer: 'DeltaV Explorer', studio: 'Control Studio' }
const MIN_W = 480
const MIN_H = 280
const TITLEBAR = 26

interface Size { w: number; h: number }

function defaultRect(id: WindowId, size: Size): WindowRect {
  const inset = id === 'explorer' ? 10 : 44
  return { x: inset, y: id === 'explorer' ? 8 : 30, w: Math.max(MIN_W, size.w - inset - 28), h: Math.max(MIN_H, size.h - (id === 'explorer' ? 22 : 44)) }
}

function StudioBody(): JSX.Element {
  const studioClass = useUi(s => s.studioClass)
  const studioPhase = useUi(s => s.studioPhase)
  const studioEm = useUi(s => s.studioEm)
  if (studioEm) return <EmStudio key={`${studioEm.className}/${studioEm.instance ?? ''}`} />
  if (studioPhase) return <PhaseStudio key={studioPhase} />
  if (studioClass) return <ClassStudio key={studioClass} />
  return <ControlStudioDisplay />
}

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

function AppWindow({ id, size }: { id: WindowId; size: Size }): JSX.Element {
  const win = useWindows(s => s.wins[id])
  const active = useUi(s => s.display === id)
  const { focus, minimize, toggleMaximize, close, setRect } = useWindows.getState()
  const rect = win.maximized ? { x: 0, y: 0, w: size.w, h: size.h } : win.rect ?? defaultRect(id, size)
  const drag = useRef<{ px: number; py: number; start: WindowRect; edge: Edge | 'move' } | null>(null)

  const begin = (edge: Edge | 'move') => (e: React.PointerEvent<HTMLElement>): void => {
    if (e.button !== 0 || win.maximized) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, start: rect, edge }
  }
  const move = (e: React.PointerEvent<HTMLElement>): void => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.px
    const dy = e.clientY - d.py
    let { x, y, w, h } = d.start
    if (d.edge === 'move') {
      // Keep the title bar reachable inside the main area.
      x = Math.min(Math.max(d.start.x + dx, 80 - w), size.w - 80)
      y = Math.min(Math.max(d.start.y + dy, 0), size.h - TITLEBAR)
    } else {
      if (d.edge.includes('e')) w = Math.max(MIN_W, d.start.w + dx)
      if (d.edge.includes('s')) h = Math.max(MIN_H, d.start.h + dy)
      if (d.edge.includes('w')) { w = Math.max(MIN_W, d.start.w - dx); x = d.start.x + d.start.w - w }
      if (d.edge.includes('n')) { h = Math.max(MIN_H, d.start.h - dy); y = d.start.y + d.start.h - h }
    }
    setRect(id, { x, y, w, h })
  }
  const end = (e: React.PointerEvent<HTMLElement>): void => {
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return <section className={'app-window' + (active ? ' active' : '') + (win.minimized ? ' minimized' : '') + (win.maximized ? ' maximized' : '')}
    role="group" aria-label={TITLE[id]} data-app-window={id}
    style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: win.z }}
    onPointerDownCapture={() => focus(id)}>
    <header className="app-window-titlebar" onPointerDown={begin('move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      onDoubleClick={() => toggleMaximize(id)}>
      <span className="app-window-title">{TITLE[id]}</span>
      <span className="app-window-buttons" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
        <button type="button" aria-label={`Minimize ${TITLE[id]}`} title="Minimize" onClick={() => minimize(id)}>&#x2013;</button>
        <button type="button" aria-label={`${win.maximized ? 'Restore' : 'Maximize'} ${TITLE[id]}`} title={win.maximized ? 'Restore Down' : 'Maximize'}
          onClick={() => toggleMaximize(id)}>{win.maximized ? '\u2750' : '\u25A1'}</button>
        <button type="button" className="close" aria-label={`Close ${TITLE[id]}`} title="Close"
          onClick={() => { if (id === 'studio') void confirmCloseStudio().then(ok => { if (ok) close(id) }); else close(id) }}>&#x2715;</button>
      </span>
    </header>
    <div className="app-window-body">{id === 'explorer' ? <ExplorerDisplay /> : id === 'studio' ? <StudioBody /> : null}</div>
    {!win.maximized && EDGES.map(edge => <span key={edge} className={`app-window-grip ${edge}`}
      onPointerDown={begin(edge)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />)}
  </section>
}

/** DeltaV Explorer and Control Studio as windows over the main area, with a tray for the minimized ones. */
export function AppWindows(): JSX.Element {
  const wins = useWindows(s => s.wins)
  const layer = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = layer.current
    if (!el) return
    const measure = (): void => setSize(prev => (prev.w === el.clientWidth && prev.h === el.clientHeight ? prev : { w: el.clientWidth, h: el.clientHeight }))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Keep restored windows inside the main area when the browser window shrinks.
  useEffect(() => {
    if (!size.w) return
    for (const id of WINDOW_IDS) {
      const r = useWindows.getState().wins[id].rect
      if (r && (r.x > size.w - 80 || r.y > size.h - TITLEBAR)) {
        useWindows.getState().setRect(id, { ...r, x: Math.min(r.x, size.w - 80), y: Math.min(r.y, size.h - TITLEBAR) })
      }
    }
  }, [size])

  const tray = WINDOW_IDS.filter(id => wins[id].open && wins[id].minimized)
  return <div ref={layer} className="app-window-layer">
    {size.w > 0 && WINDOW_IDS.filter(id => wins[id].open).map(id => <AppWindow key={id} id={id} size={size} />)}
    {tray.length > 0 && <div className="app-window-tray" role="toolbar" aria-label="Minimized windows">
      {tray.map(id => <button key={id} type="button" className="app-window-chip" onClick={() => { useWindows.getState().show(id); useUi.setState({ display: id }) }}>
        {TITLE[id]}</button>)}
    </div>}
  </div>
}
