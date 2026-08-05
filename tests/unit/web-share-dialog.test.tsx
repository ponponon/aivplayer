import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { WebShareStatus } from '../../src/shared/web-types'
import { zhCN } from '../../src/shared/i18n/locales/zh-CN'
import { WebShareDialog } from '../../src/renderer/src/app/web-share-dialog'

describe('WebShareDialog', () => {
  it('renders every LAN access address with its own actions', () => {
    const status: WebShareStatus = {
      running: true,
      port: 43821,
      urls: ['http://192.168.1.20:43821/?access=alpha', 'http://10.0.0.8:43821/?access=beta'],
      sharedFileCount: 1,
      sharedDirectoryCount: 0,
      sharedDirectoryPaths: [],
      allowRemoteControl: false
    }
    const markup = renderToStaticMarkup(<WebShareDialog
      copy={zhCN}
      status={status}
      error={null}
      notice={null}
      playlistCount={1}
      directoryPaths={[]}
      onStart={() => undefined}
      onStop={() => undefined}
      onRefresh={() => undefined}
      onAddDirectory={() => undefined}
      onRemoveDirectory={() => undefined}
      allowRemoteControl={false}
      onToggleRemoteControl={() => undefined}
      onCopy={() => undefined}
      onOpen={async () => true}
      onClose={() => undefined}
    />)

    expect(markup.match(/class="web-share-url-item"/g)).toHaveLength(status.urls.length)
    expect(markup.match(/class="web-share-url-actions"/g)).toHaveLength(status.urls.length)
    expect(markup.match(/class="settings-secondary-button" type="button" aria-label=/g)).toHaveLength(status.urls.length * 2)
    expect(markup).toContain(zhCN.webShare.openUrl)
    expect(markup).toContain(zhCN.webShare.defaultBrowserHint)
    for (const url of status.urls) expect(markup).toContain(url)
  })
})
