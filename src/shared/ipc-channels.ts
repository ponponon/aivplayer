export const IPC_CHANNELS = {
  OPEN_MEDIA_FILES: 'dialog:open-media-files',
  CREATE_MEDIA_FILE: 'media:create-file',
  GET_APP_VERSION: 'app:get-version',
  ASR_HEALTH_CHECK: 'asr:health-check',
  ASR_AUTO_DETECT_WHISPER_BINARY: 'asr:auto-detect-whisper-binary',
  ASR_SELECT_WHISPER_BINARY: 'asr:select-whisper-binary',
  ASR_DOWNLOAD_MODEL: 'asr:download-model',
  ASR_MODEL_DOWNLOAD_PROGRESS: 'asr:model-download-progress',
  ASR_GENERATE_SUBTITLE: 'asr:generate-subtitle',
  ASR_JOB_PROGRESS: 'asr:job-progress',
  SHOW_ITEM_IN_FOLDER: 'shell:show-item-in-folder',
  NATIVE_PLAYER_STATUS: 'native-player:status',
  STOP_NATIVE_PLAYER: 'native-player:stop',
  GET_INITIAL_MEDIA_FILES: 'media:get-initial-files',
  MEDIA_FILES_OPENED: 'media:files-opened'
} as const
