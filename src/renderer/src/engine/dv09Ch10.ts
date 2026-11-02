import type { Dv09Chapter } from './dv09Registry'
import { DV09_CHAPTER10 } from './dv09Ch10Workshops'

// Course DV-09 chapter 10, FOUNDATION fieldbus Overview: reading only (the chapter has no workshop), so there are no live checks.
export const DV09_CH10: Dv09Chapter = {
  number: 10,
  prefix: 'dv09-ch10-',
  module: DV09_CHAPTER10,
  check: () => []
}