import type { Dv09Chapter } from './dv09Registry'
import { DV09_CHAPTER7 } from './dv09Ch7Workshops'
import { checkDv09Ch7 } from './dv09Ch7Checks'

// Course DV-09 chapter 7, Sequential Function Charts (SFCs) (workshops: DV09_CHAPTER7, live checks: checkDv09Ch7).
export const DV09_CH7: Dv09Chapter = {
  number: 7,
  prefix: 'dv09-ch7-',
  module: DV09_CHAPTER7,
  check: ctx => checkDv09Ch7(ctx)
}