export type DramaProjectStatus = 'draft' | 'active' | 'archived'
export type DramaChapterEventStatus = 'pending' | 'running' | 'completed' | 'failed'
export type DramaTaskStatus = 'running' | 'completed' | 'failed'
export type DramaAssetType = 'character' | 'location' | 'prop'
export type DramaAssetStatus = 'draft' | 'ready'

export type DramaProject = {
  id: string
  title: string
  intro: string
  genre: string
  episodeCount: number
  episodeDurationSeconds: number
  status: DramaProjectStatus
  createdAt: number
  updatedAt: number
}

export type DramaChapter = {
  id: string
  projectId: string
  chapterIndex: number
  volume: string
  title: string
  content: string
  event?: DramaChapterEvent
  eventStatus: DramaChapterEventStatus
  eventError?: string
  createdAt: number
  updatedAt: number
}

export type DramaChapterEvent = {
  summary: string
  characters: string[]
  locations: string[]
  conflict: string
  hook: string
}

export type DramaPlan = {
  projectId: string
  storySkeleton: string
  adaptationStrategy: string
  updatedAt: number
}

export type DramaScript = {
  id: string
  projectId: string
  episodeIndex: number
  title: string
  content: string
  status: 'draft' | 'completed'
  error?: string
  createdAt: number
  updatedAt: number
}

export type DramaAsset = {
  id: string
  projectId: string
  assetType: DramaAssetType
  name: string
  description: string
  visualPrompt: string
  status: DramaAssetStatus
  createdAt: number
  updatedAt: number
}

export type DramaAssetInput = {
  assetType: DramaAssetType
  name: string
  description?: string
  visualPrompt?: string
}

export type DramaStoryboard = {
  id: string
  projectId: string
  episodeIndex: number
  sceneIndex: number
  title: string
  durationSeconds: number
  location: string
  characters: string[]
  action: string
  dialogue: string
  visualPrompt: string
  cameraPrompt: string
  status: 'draft' | 'ready'
  createdAt: number
  updatedAt: number
}

export type DramaStoryboardInput = {
  sceneIndex: number
  title: string
  durationSeconds?: number
  location?: string
  characters?: string[]
  action?: string
  dialogue?: string
  visualPrompt?: string
  cameraPrompt?: string
}

export type DramaTask = {
  id: string
  projectId: string
  stage: 'events' | 'skeleton' | 'adaptation' | 'script' | 'assets' | 'storyboard'
  targetId?: string
  status: DramaTaskStatus
  progress: number
  message: string
  error?: string
  startedAt: number
  completedAt?: number
}

export type DramaCreateProjectInput = {
  title: string
  intro?: string
  genre?: string
  episodeCount?: number
  episodeDurationSeconds?: number
}

export type DramaImportChapterInput = {
  chapterIndex: number
  volume?: string
  title: string
  content: string
}

export type DramaProgress = {
  stage: DramaTask['stage']
  current: number
  total: number
  message: string
}

export type DramaStageResult = {
  projectId: string
  stage: DramaTask['stage']
  completed: number
  skipped: number
  failed: number
  errors: Array<{ targetId: string; message: string }>
}

export type DramaProjectData = {
  project: DramaProject
  chapters: DramaChapter[]
  plan: DramaPlan | null
  scripts: DramaScript[]
  assets: DramaAsset[]
  storyboards: DramaStoryboard[]
}

export type DramaProviderRequest = {
  stage: DramaTask['stage']
  system: string
  user: string
  signal?: AbortSignal
}

export type DramaProviderSettings = {
  apiBaseUrl: string | null
  model: string | null
  useMock: boolean
  apiKeyConfigured: boolean
}

export type DramaProviderSettingsInput = {
  apiBaseUrl?: string | null
  model?: string | null
  apiKey?: string | null
  useMock?: boolean
}

export type DramaProviderTestResult = {
  success: boolean
  message: string
  model: string | null
  usedMock: boolean
}
