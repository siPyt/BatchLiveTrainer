import type { Dv09Chapter } from './dv09Registry'
import { DV09_CHAPTER4 } from './dv09Ch4Workshops'
import { checkDv09Ch4 } from './dv09Ch4Checks'

// Course DV-09 chapter 4, Configuring DeltaV Alarms (workshops: DV09_CHAPTER4, live checks: checkDv09Ch4).
export const DV09_CH4: Dv09Chapter = {
  number: 4,
  prefix: 'dv09-ch4-',
  module: DV09_CHAPTER4,
  check: ctx => checkDv09Ch4(ctx)
}