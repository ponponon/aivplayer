import { extname } from 'node:path'

const extensions = ['.ts', '.tsx']

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !extname(specifier)) {
    for (const extension of extensions) {
      try {
        return await nextResolve(`${specifier}${extension}`, context)
      } catch {
        // Continue with the next source extension or the default resolver.
      }
    }
  }
  return nextResolve(specifier, context)
}
