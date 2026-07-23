import type { DramaAsset, DramaChapter, DramaPlan, DramaProject, DramaScript } from '../../shared/drama-types'

export function eventSystemPrompt(): string {
  return '你是短剧策划助手。只根据章节原文提取可拍摄的结构化事件，不补写原文没有的剧情。必须返回 JSON：summary、characters、locations、conflict、hook。'
}

export function eventUserPrompt(chapter: DramaChapter): string {
  return JSON.stringify({
    chapter: chapter.chapterIndex,
    title: chapter.title,
    content: chapter.content,
    output: {
      summary: '30-80字，包含动作和结果',
      characters: ['实际参与本章事件的角色'],
      locations: ['实际出现的地点'],
      conflict: '本章核心冲突',
      hook: '本章结尾留下的悬念或下一章钩子'
    }
  })
}

export function skeletonSystemPrompt(): string {
  return '你是短剧故事骨架设计师。根据章节事件设计单线、强冲突、可分集的短剧骨架。必须返回 JSON：storySkeleton。'
}

export function skeletonUserPrompt(project: DramaProject, chapters: DramaChapter[]): string {
  return JSON.stringify({
    project: projectConfig(project),
    events: chapters.map((chapter) => ({ chapter: chapter.chapterIndex, title: chapter.title, event: chapter.event }))
  })
}

export function adaptationSystemPrompt(): string {
  return '你是短剧改编策略师。根据故事骨架和章节事件制定可拍摄、强节奏、低理解成本的改编策略。必须返回 JSON：adaptationStrategy。'
}

export function adaptationUserPrompt(project: DramaProject, plan: DramaPlan | null, chapters: DramaChapter[]): string {
  return JSON.stringify({
    project: projectConfig(project),
    storySkeleton: plan?.storySkeleton ?? '',
    events: chapters.map((chapter) => ({ chapter: chapter.chapterIndex, title: chapter.title, event: chapter.event }))
  })
}

export function scriptSystemPrompt(): string {
  return '你是短剧编剧。根据项目配置、故事骨架、改编策略和章节事件生成一集紧凑、可拍摄的剧本。必须返回 JSON：title、content。不要输出 Markdown 代码块。'
}

export function scriptUserPrompt(project: DramaProject, plan: DramaPlan | null, chapters: DramaChapter[], episodeIndex: number): string {
  return JSON.stringify({
    project: projectConfig(project),
    episodeIndex,
    storySkeleton: plan?.storySkeleton ?? '',
    adaptationStrategy: plan?.adaptationStrategy ?? '',
    events: chapters.map((chapter) => ({ chapter: chapter.chapterIndex, title: chapter.title, event: chapter.event }))
  })
}

export function assetSystemPrompt(): string {
  return '你是短剧美术资产策划师。只根据项目和章节事件提取可复用的角色、场景、道具。必须返回 JSON：assets 数组，每项包含 assetType（character/location/prop）、name、description、visualPrompt。不要生成原文没有的关键资产。'
}

export function assetUserPrompt(project: DramaProject, chapters: DramaChapter[]): string {
  return JSON.stringify({
    project: projectConfig(project),
    events: chapters.map((chapter) => ({ chapter: chapter.chapterIndex, title: chapter.title, event: chapter.event }))
  })
}

export function storyboardSystemPrompt(): string {
  return '你是短剧分镜导演。根据分集剧本、资产清单和改编策略生成可执行的分镜大纲。必须返回 JSON：scenes 数组，每项包含 sceneIndex、title、durationSeconds、location、characters、action、dialogue、visualPrompt、cameraPrompt。每个镜头只表达一个清晰动作，避免超长对白。'
}

export function storyboardUserPrompt(
  project: DramaProject,
  plan: DramaPlan | null,
  script: DramaScript,
  assets: DramaAsset[],
  episodeIndex: number
): string {
  return JSON.stringify({
    project: projectConfig(project),
    episodeIndex,
    storySkeleton: plan?.storySkeleton ?? '',
    adaptationStrategy: plan?.adaptationStrategy ?? '',
    script: { title: script.title, content: script.content },
    assets: assets.map((asset) => ({ type: asset.assetType, name: asset.name, description: asset.description, visualPrompt: asset.visualPrompt }))
  })
}

function projectConfig(project: DramaProject): Record<string, unknown> {
  return {
    title: project.title,
    intro: project.intro,
    genre: project.genre,
    episodeCount: project.episodeCount,
    episodeDurationSeconds: project.episodeDurationSeconds
  }
}
