import type { Dv09Chapter } from './dv09Registry'
import { DV09_CHAPTER11 } from './dv09Ch11Workshops'
import { checkDv09Ch11 } from './dv09Ch11Checks'

// Course DV-09 chapter 11, FOUNDATION fieldbus Wiring & Installation: a reading workshop and Workshop - Logging On.
export const DV09_CH11: Dv09Chapter = {
  number: 11,
  prefix: 'dv09-ch11-',
  module: DV09_CHAPTER11,
  check: ctx => checkDv09Ch11(ctx.main.eventLog)
}