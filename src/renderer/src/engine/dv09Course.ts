import type { WModule } from './workshops'
import { DV09_CHAPTERS } from './dv09Registry'

/** Course DV-09 workshops, in chapter order. Shown on the Workshops page while class DV-09 is selected. */
export const DV09_COURSE: WModule[] = DV09_CHAPTERS.map(c => c.module)
