import type { Dv09Chapter } from './dv09Registry'
import { DV09_CHAPTER13 } from './dv09Ch13Workshops'
import { checkDv09Ch13 } from './dv09Ch13Checks'

// Course DV-09 chapter 13, Fieldbus Device Alarm Overview: reading, Workshop - Adding a Column to Alarm List and Workshop - Adding Device Alarms to Banner.
export const DV09_CH13: Dv09Chapter = {
  number: 13,
  prefix: 'dv09-ch13-',
  module: DV09_CHAPTER13,
  check: ctx => checkDv09Ch13(ctx.main.eventLog)
}