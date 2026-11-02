import type { Dv09Chapter } from './dv09Registry'
import { DV09_CHAPTER12 } from './dv09Ch12Workshops'
import { checkDv09Ch12 } from './dv09Ch12Checks'

// Course DV-09 chapter 12, Assembling an H1 Segment: System Preferences, Wire Fieldbus Segment and Adding an H1 Card.
export const DV09_CH12: Dv09Chapter = {
  number: 12,
  prefix: 'dv09-ch12-',
  module: DV09_CHAPTER12,
  check: checkDv09Ch12
}