import { GITHUB_REPOSITORY_URL, OFFICIAL_WEBSITE_URL } from './app-links'

/**
 * Keep the prompt ready without showing it to users until the project is ready
 * to ask for public support. Flip this flag to true when the copy and links
 * have been reviewed.
 */
export const SUPPORT_PROMPT_ENABLED = false

export const SUPPORT_PROMPT_DISMISSED_STORAGE_KEY = 'aivplayer.support-prompt.dismissed.v1'

export const SUPPORT_PROMPT_LINKS = [
  { id: 'github', url: GITHUB_REPOSITORY_URL },
  { id: 'website', url: OFFICIAL_WEBSITE_URL }
] as const
