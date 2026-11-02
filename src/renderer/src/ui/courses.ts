/** The classes the trainer is meant to cover. Only 7016 has content so far; 7017 and DV-09 are placeholders. */
export type CourseId = '7016' | '7017' | 'DV-09'

export interface CourseInfo {
  id: CourseId
  built: boolean
}

export const COURSES: CourseInfo[] = [
  { id: '7016', built: true },
  { id: '7017', built: false },
  { id: 'DV-09', built: false }
]

export const DEFAULT_COURSE: CourseId = '7016'

export const isCourseId = (v: unknown): v is CourseId => COURSES.some(c => c.id === v)
