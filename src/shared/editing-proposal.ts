import type { EditingProject } from './editing-types'

export const EDITING_PROPOSAL_SCHEMA_VERSION = 1 as const

export type EditingProposalBase = {
  projectId: string
  schemaVersion: EditingProject['schemaVersion']
  revision: string
  updatedAt: number
}

export type EditingProposalSourceRange = {
  sourceId: string
  sourceStartSeconds: number
  sourceEndSeconds: number
  scriptSegmentIds: string[]
  reason: 'delete-script-segments'
}

export type EditingProposalOperation = {
  type: 'delete-source-range'
  sourceId: string
  sourceStartSeconds: number
  sourceEndSeconds: number
  scriptSegmentIds: string[]
  reason: 'delete-script-segments'
}

export type EditingProposalSegmentChange = {
  id: string
  sourceId: string
  sourceStartSeconds: number
  sourceEndSeconds: number
  text: string
  translationText: string | null
  deletedBefore: boolean
  deletedAfter: boolean
}

export type EditingProposalTimelineSummary = {
  durationSeconds: number
  clipCount: number
  captionCount: number
  scriptSegmentCount: number
}

export type EditingProposalCaptionDiff = {
  beforeCount: number
  afterCount: number
  removedIds: string[]
  changedIds: string[]
}

export type EditingProposalDiff = {
  before: EditingProposalTimelineSummary
  after: EditingProposalTimelineSummary
  durationDeltaSeconds: number
  removedEditedRanges: Array<{ startSeconds: number; endSeconds: number }>
  removedSourceRanges: EditingProposalSourceRange[]
  retainedSourceRanges: EditingProposalSourceRange[]
  scriptSegments: EditingProposalSegmentChange[]
  captions: EditingProposalCaptionDiff
}

export type EditingProposal = {
  schemaVersion: typeof EDITING_PROPOSAL_SCHEMA_VERSION
  id: string
  kind: 'delete-script-segments'
  title: string
  summary: string
  base: EditingProposalBase
  operations: EditingProposalOperation[]
  diff: EditingProposalDiff
  resultRevision: string
}
