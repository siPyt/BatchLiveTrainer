import type { Dv09Chapter } from './dv09Registry'
import { DV09_CHAPTER3 } from './dv09Ch3Workshops'
import { checkDv09Ch3 } from './dv09Ch3Checks'

// Course DV-09 chapter 3, DeltaV Control Modules (workshops: DV09_CHAPTER3, live checks: checkDv09Ch3).
export const DV09_CH3: Dv09Chapter = {
  number: 3,
  prefix: 'dv09-ch3-',
  module: DV09_CHAPTER3,
  check: ctx => checkDv09Ch3(ctx)
}
