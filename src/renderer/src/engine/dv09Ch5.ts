import type { Dv09Chapter } from './dv09Registry'
import { DV09_CHAPTER5 } from './dv09Ch5Workshops'
import { checkDv09Ch5 } from './dv09Ch5Checks'

// Course DV-09 chapter 5, DeltaV Motor Control (workshops: DV09_CHAPTER5, live checks: checkDv09Ch5).
export const DV09_CH5: Dv09Chapter = {
  number: 5,
  prefix: 'dv09-ch5-',
  module: DV09_CHAPTER5,
  check: ctx => checkDv09Ch5(ctx)
}