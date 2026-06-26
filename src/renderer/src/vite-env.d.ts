/// <reference types="vite/client" />

import type { AivApi } from '../../preload'

declare global {
  interface Window {
    aiv: AivApi
  }
}
