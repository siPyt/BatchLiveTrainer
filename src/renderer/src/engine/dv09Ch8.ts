import type { Dv09Chapter } from './dv09Registry'
import { DV09_CHAPTER8 } from './dv09Ch8Workshops'
import { checkDv09Ch8 } from './dv09Ch8Checks'

// Course DV-09 chapter 8, DeltaV Security: Defining Users, Export and the optional Electronic Signatures workshop.
export const DV09_CH8: Dv09Chapter = {
  number: 8,
  prefix: 'dv09-ch8-',
  module: DV09_CHAPTER8,
  check: checkDv09Ch8
}