import type { Locator, Page } from 'playwright'

export type SmokeSelectOption = string | { label: string }

function escapeAttributeValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

export async function selectAppOption(page: Page, select: Locator, selection: SmokeSelectOption | readonly SmokeSelectOption[]): Promise<void> {
  const selections = Array.isArray(selection) ? selection : [selection]

  for (const item of selections) {
    const menu = page.locator('.app-select-menu').last()
    if (!(await menu.isVisible().catch(() => false))) {
      await select.click()
    }

    const option = typeof item === 'string'
      ? menu.locator(`[data-value="${escapeAttributeValue(item)}"]`).first()
      : menu.getByRole('option', { name: item.label, exact: true }).first()

    await option.waitFor({ state: 'visible', timeout: 10_000 })
    await option.click()
  }
}

export async function readAppSelectValue(select: Locator): Promise<string> {
  return await select.getAttribute('data-select-value') ?? ''
}

export async function readAppSelectValues(select: Locator): Promise<string[]> {
  const value = await readAppSelectValue(select)
  return value ? value.split(',') : []
}
