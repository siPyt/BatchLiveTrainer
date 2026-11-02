import type { Dv09Chapter } from './dv09Registry'
import { DV09_CHAPTER9 } from './dv09Ch9Workshops'
import { checkDv09Ch9 } from './dv09Ch9Checks'
import { usePictures } from './pictureStore'

// Course DV-09 chapter 9, DeltaV Serial Interface: Workshop 1, Modbus Tie-Back.
export const DV09_CH9: Dv09Chapter = {
  number: 9,
  prefix: 'dv09-ch9-',
  module: DV09_CHAPTER9,
  check: ctx => checkDv09Ch9(ctx.main, usePictures.getState().pictures)
}