import type { Dv09Chapter } from './dv09Registry'
import { DV09_CHAPTER6 } from './dv09Ch6Workshops'
import { checkDv09Ch6 } from './dv09Ch6Checks'

// Course DV-09 chapter 6, DeltaV Regulatory Control (workshops: DV09_CHAPTER6, live checks: checkDv09Ch6).
export const DV09_CH6: Dv09Chapter = {
  number: 6,
  prefix: 'dv09-ch6-',
  module: DV09_CHAPTER6,
  check: ctx => checkDv09Ch6(ctx)
}