import { parseISO, isValid } from 'date-fns'
import { FeedbackTag } from '../types'

export class Validators {
  static isValidISODate(date: string): boolean {
    return isValid(parseISO(date))
  }

  static isValidFeedbackTag(tag: string): tag is FeedbackTag {
    return ['Bug', 'Feature', 'UX', 'Other'].includes(tag)
  }
}
