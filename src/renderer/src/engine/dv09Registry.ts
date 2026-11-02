import type { useStore } from './store'
import type { useSecurity } from './security'
import type { useSystem } from './systemPreferences'
import type { useLibrary } from './libraryStore'
import type { WModule } from './workshops'
import type { StepCheck } from './workshopChecks'
import { DV09_CHAPTER1 } from './dv09Ch1Workshops'
import { DV09_CHAPTER2 } from './dv09Ch2Workshops'
import { checkDv09Ch1 } from './dv09Ch1Checks'
import { checkDv09Ch2 } from './dv09Ch2Checks'
import { DV09_CH3 } from './dv09Ch3'
import { DV09_CH4 } from './dv09Ch4'
import { DV09_CH5 } from './dv09Ch5'
import { DV09_CH6 } from './dv09Ch6'
import { DV09_CH7 } from './dv09Ch7'
import { DV09_CH8 } from './dv09Ch8'
import { DV09_CH9 } from './dv09Ch9'
import { DV09_CH10 } from './dv09Ch10'
import { DV09_CH11 } from './dv09Ch11'
import { DV09_CH12 } from './dv09Ch12'
import { DV09_CH13 } from './dv09Ch13'

/** Everything a live check may read; the Workshops page passes fresh snapshots on every render. */
export interface Dv09Ctx {
  main: ReturnType<typeof useStore.getState>
  security: ReturnType<typeof useSecurity.getState>
  system: ReturnType<typeof useSystem.getState>
  library: ReturnType<typeof useLibrary.getState>
}

/**
 * One chapter of course DV-09 (Engineering Training Manual): its workshops (exactly as the manual words them) and the live
 * checks that decide each step's Verified verdict. Workshop ids must start with `prefix` (for example dv09-ch3-); step ids
 * of checked steps must be unique across the whole course.
 */
export interface Dv09Chapter {
  number: number
  prefix: string
  module: WModule
  check: (ctx: Dv09Ctx) => StepCheck[]
}

export const DV09_CHAPTERS: Dv09Chapter[] = [
  { number: 1, prefix: 'dv09-ch1-', module: DV09_CHAPTER1, check: ctx => checkDv09Ch1(ctx.main.hardware, ctx.main.eventLog) },
  { number: 2, prefix: 'dv09-ch2-', module: DV09_CHAPTER2, check: ctx => checkDv09Ch2(ctx.main.areas, ctx.main.hardware, ctx.main.eventLog) },
  DV09_CH3, DV09_CH4, DV09_CH5, DV09_CH6, DV09_CH7, DV09_CH8, DV09_CH9, DV09_CH10, DV09_CH11, DV09_CH12, DV09_CH13
]

export const dv09ChapterFor = (workshopId: string): Dv09Chapter | undefined => DV09_CHAPTERS.find(c => workshopId.startsWith(c.prefix))
