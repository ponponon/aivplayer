# 媒体详情弹窗多语言支持实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为"完整媒体详情"弹窗中的 ffprobe 字段名添加多语言翻译支持

**Architecture:** 在 i18n 体系中添加字段翻译映射，修改 humanizeKey 函数支持多语言查找

**Tech Stack:** TypeScript, React, i18n

---

## Task 1: 扩展 LocaleCopy 类型

**Files:**
- Modify: `src/shared/i18n.ts:11-301`

- [ ] **Step 1: 在 LocaleCopy 类型中添加 probeFieldLabels 字段**

```typescript
export type LocaleCopy = {
  // ... 现有字段 (第 12-300 行)
  probeFieldLabels: Record<string, string>
}
```

- [ ] **Step 2: 运行类型检查**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/shared/i18n.ts
git commit -m "feat(i18n): add probeFieldLabels type to LocaleCopy"
```

---

## Task 2: 为简体中文添加翻译映射

**Files:**
- Modify: `src/shared/i18n.ts:304-654`

- [ ] **Step 1: 在 zh-CN 的 APP_COPY 中添加 probeFieldLabels**

在 `zh-CN` 对象的 `modelSources` 字段之后添加：

```typescript
'zh-CN': {
  // ... 现有字段
  probeFieldLabels: {
    'filename': '文件名',
    'nb_streams': '流数量',
    'nb_programs': '节目数量',
    'nb_stream_groups': '流组数量',
    'format_name': '格式名称',
    'format_long_name': '格式全称',
    'start_time': '起始时间',
    'duration': '时长',
    'size': '大小',
    'bit_rate': '码率',
    'probe_score': '探测评分',
    'tags.major_brand': '主要品牌',
    'tags.minor_version': '次要版本',
    'tags.compatible_brands': '兼容品牌',
    'tags.encoder': '编码器',
    'tags.comment': '备注',
    'codec_name': '编码名称',
    'codec_long_name': '编码全称',
    'codec_type': '编码类型',
    'codec_tag': '编码标签',
    'codec_tag_string': '编码标签字符串',
    'profile': '配置文件',
    'width': '宽度',
    'height': '高度',
    'coded_width': '编码宽度',
    'coded_height': '编码高度',
    'closed_captions': '隐藏字幕',
    'film_grain': '胶片颗粒',
    'has_b_frames': 'B 帧',
    'sample_aspect_ratio': '采样宽高比',
    'display_aspect_ratio': '显示宽高比',
    'pix_fmt': '像素格式',
    'level': '级别',
    'color_range': '色彩范围',
    'color_space': '色彩空间',
    'color_transfer': '色彩传输',
    'color_primaries': '色彩原色',
    'chroma_location': '色度位置',
    'field_order': '场序',
    'refs': '参考帧',
    'r_frame_rate': '帧率',
    'avg_frame_rate': '平均帧率',
    'time_base': '时间基准',
    'start_pts': '起始 PTS',
    'disposition': ' disposition',
    'channel_layout': '声道布局',
    'channels': '声道数',
    'bits_per_sample': '采样位数',
    'sample_fmt': '采样格式',
    'sample_rate': '采样率'
  }
}
```

- [ ] **Step 2: 运行类型检查**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/shared/i18n.ts
git commit -m "feat(i18n): add zh-CN probe field translations"
```

---

## Task 3: 为英文添加翻译映射

**Files:**
- Modify: `src/shared/i18n.ts:655-1005`

- [ ] **Step 1: 在 en-US 的 APP_COPY 中添加 probeFieldLabels**

在 `en-US` 对象的 `modelSources` 字段之后添加：

```typescript
'en-US': {
  // ... 现有字段
  probeFieldLabels: {
    'filename': 'Filename',
    'nb_streams': 'Stream count',
    'nb_programs': 'Program count',
    'nb_stream_groups': 'Stream group count',
    'format_name': 'Format name',
    'format_long_name': 'Format full name',
    'start_time': 'Start time',
    'duration': 'Duration',
    'size': 'Size',
    'bit_rate': 'Bit rate',
    'probe_score': 'Probe score',
    'tags.major_brand': 'Major brand',
    'tags.minor_version': 'Minor version',
    'tags.compatible_brands': 'Compatible brands',
    'tags.encoder': 'Encoder',
    'tags.comment': 'Comment',
    'codec_name': 'Codec name',
    'codec_long_name': 'Codec full name',
    'codec_type': 'Codec type',
    'codec_tag': 'Codec tag',
    'codec_tag_string': 'Codec tag string',
    'profile': 'Profile',
    'width': 'Width',
    'height': 'Height',
    'coded_width': 'Coded width',
    'coded_height': 'Coded height',
    'closed_captions': 'Closed captions',
    'film_grain': 'Film grain',
    'has_b_frames': 'Has B frames',
    'sample_aspect_ratio': 'Sample aspect ratio',
    'display_aspect_ratio': 'Display aspect ratio',
    'pix_fmt': 'Pixel format',
    'level': 'Level',
    'color_range': 'Color range',
    'color_space': 'Color space',
    'color_transfer': 'Color transfer',
    'color_primaries': 'Color primaries',
    'chroma_location': 'Chroma location',
    'field_order': 'Field order',
    'refs': 'Reference frames',
    'r_frame_rate': 'Frame rate',
    'avg_frame_rate': 'Average frame rate',
    'time_base': 'Time base',
    'start_pts': 'Start PTS',
    'disposition': 'Disposition',
    'channel_layout': 'Channel layout',
    'channels': 'Channels',
    'bits_per_sample': 'Bits per sample',
    'sample_fmt': 'Sample format',
    'sample_rate': 'Sample rate'
  }
}
```

- [ ] **Step 2: 运行类型检查**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/shared/i18n.ts
git commit -m "feat(i18n): add en-US probe field translations"
```

---

## Task 4: 为日语添加翻译映射

**Files:**
- Modify: `src/shared/i18n.ts:1006-1356`

- [ ] **Step 1: 在 ja-JP 的 APP_COPY 中添加 probeFieldLabels**

在 `ja-JP` 对象的 `modelSources` 字段之后添加：

```typescript
'ja-JP': {
  // ... 现有字段
  probeFieldLabels: {
    'filename': 'ファイル名',
    'nb_streams': 'ストリーム数',
    'nb_programs': 'プログラム数',
    'nb_stream_groups': 'ストリームグループ数',
    'format_name': 'フォーマット名',
    'format_long_name': 'フォーマット正式名称',
    'start_time': '開始時間',
    'duration': '再生時間',
    'size': 'サイズ',
    'bit_rate': 'ビットレート',
    'probe_score': 'プローブスコア',
    'tags.major_brand': 'メジャーブランド',
    'tags.minor_version': 'マイナーバージョン',
    'tags.compatible_brands': '互換ブランド',
    'tags.encoder': 'エンコーダー',
    'tags.comment': 'コメント',
    'codec_name': 'コーデック名',
    'codec_long_name': 'コーデック正式名称',
    'codec_type': 'コーデックタイプ',
    'codec_tag': 'コーデックタグ',
    'codec_tag_string': 'コーデックタグ文字列',
    'profile': 'プロファイル',
    'width': '幅',
    'height': '高さ',
    'coded_width': '符号化幅',
    'coded_height': '符号化高さ',
    'closed_captions': 'クローズドキャプション',
    'film_grain': 'フィルムグレイン',
    'has_b_frames': 'B フレーム',
    'sample_aspect_ratio': 'サンプルアスペクト比',
    'display_aspect_ratio': 'ディスプレイアスペクト比',
    'pix_fmt': 'ピクセルフォーマット',
    'level': 'レベル',
    'color_range': 'カラーレンジ',
    'color_space': 'カラースペース',
    'color_transfer': 'カラートランスファー',
    'color_primaries': 'カラープライマリー',
    'chroma_location': 'クロマロケーション',
    'field_order': 'フィールドオーダー',
    'refs': '参照フレーム',
    'r_frame_rate': 'フレームレート',
    'avg_frame_rate': '平均フレームレート',
    'time_base': 'タイムベース',
    'start_pts': '開始 PTS',
    'disposition': ' disposition',
    'channel_layout': 'チャンネルレイアウト',
    'channels': 'チャンネル数',
    'bits_per_sample': 'サンプルあたりビット数',
    'sample_fmt': 'サンプルフォーマット',
    'sample_rate': 'サンプリングレート'
  }
}
```

- [ ] **Step 2: 运行类型检查**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/shared/i18n.ts
git commit -m "feat(i18n): add ja-JP probe field translations"
```

---

## Task 5: 为韩语添加翻译映射

**Files:**
- Modify: `src/shared/i18n.ts:1357-1707`

- [ ] **Step 1: 在 ko-KR 的 APP_COPY 中添加 probeFieldLabels**

在 `ko-KR` 对象的 `modelSources` 字段之后添加：

```typescript
'ko-KR': {
  // ... 现有字段
  probeFieldLabels: {
    'filename': '파일명',
    'nb_streams': '스트림 수',
    'nb_programs': '프로그램 수',
    'nb_stream_groups': '스트림 그룹 수',
    'format_name': '포맷 이름',
    'format_long_name': '포맷 전체 이름',
    'start_time': '시작 시간',
    'duration': '재생 시간',
    'size': '크기',
    'bit_rate': '비트레이트',
    'probe_score': '프로브 점수',
    'tags.major_brand': '메이저 브랜드',
    'tags.minor_version': '마이너 버전',
    'tags.compatible_brands': '호환 브랜드',
    'tags.encoder': '인코더',
    'tags.comment': '비고',
    'codec_name': '코덱 이름',
    'codec_long_name': '코덱 전체 이름',
    'codec_type': '코덱 유형',
    'codec_tag': '코덱 태그',
    'codec_tag_string': '코덱 태그 문자열',
    'profile': '프로파일',
    'width': '너비',
    'height': '높이',
    'coded_width': '인코딩 너비',
    'coded_height': '인코딩 높이',
    'closed_captions': '폐쇄 자막',
    'film_grain': '필름 그레인',
    'has_b_frames': 'B 프레임',
    'sample_aspect_ratio': '샘플 종횡비',
    'display_aspect_ratio': '디스플레이 종횡비',
    'pix_fmt': '픽셀 포맷',
    'level': '레벨',
    'color_range': '색상 범위',
    'color_space': '색상 공간',
    'color_transfer': '색상 전송',
    'color_primaries': '색상 기본값',
    'chroma_location': '크로마 위치',
    'field_order': '필드 순서',
    'refs': '참조 프레임',
    'r_frame_rate': '프레임 레이트',
    'avg_frame_rate': '평균 프레임 레이트',
    'time_base': '시간 기준',
    'start_pts': '시작 PTS',
    'disposition': ' disposition',
    'channel_layout': '채널 레이아웃',
    'channels': '채널 수',
    'bits_per_sample': '샘플당 비트 수',
    'sample_fmt': '샘플 포맷',
    'sample_rate': '샘플링 레이트'
  }
}
```

- [ ] **Step 2: 运行类型检查**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/shared/i18n.ts
git commit -m "feat(i18n): add ko-KR probe field translations"
```

---

## Task 6: 修改 humanizeKey 函数

**Files:**
- Modify: `src/renderer/src/app/media-details-dialog.tsx:73-86`

- [ ] **Step 1: 修改 humanizeKey 函数签名和实现**

```typescript
function humanizeKey(key: string, probeFieldLabels?: Record<string, string>): string {
  // 尝试精确匹配
  if (probeFieldLabels?.[key]) {
    return probeFieldLabels[key]
  }
  
  // 尝试小写匹配
  const lowerKey = key.toLowerCase()
  if (probeFieldLabels?.[lowerKey]) {
    return probeFieldLabels[lowerKey]
  }
  
  // 尝试带点号的匹配（如 tags.major_brand）
  const dottedKey = key.replace(/_/g, '.')
  if (probeFieldLabels?.[dottedKey]) {
    return probeFieldLabels[dottedKey]
  }
  
  // 回退到原有的格式化逻辑
  return key
    .replace(/\[(\d+)\]/g, ' [$1]')
    .split('.')
    .map((part) => {
      const normalized = part.replace(/_/g, ' ').trim()
      if (normalized.length === 0) {
        return normalized
      }
      return normalized.replace(/\b[a-z]/gi, (character) => character.toUpperCase())
    })
    .join(' · ')
}
```

- [ ] **Step 2: 运行类型检查**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/app/media-details-dialog.tsx
git commit -m "feat(i18n): update humanizeKey to support probeFieldLabels"
```

---

## Task 7: 修改 renderProbeEntries 函数

**Files:**
- Modify: `src/renderer/src/app/media-details-dialog.tsx:116-127`

- [ ] **Step 1: 修改 renderProbeEntries 函数签名**

```typescript
function renderProbeEntries(
  entries: MediaProbeEntry[], 
  probeFieldLabels?: Record<string, string>
): ReactElement {
  return (
    <div className="media-details-grid">
      {entries.map((entry) => (
        <div className="media-details-item" key={entry.key}>
          <span>{humanizeKey(entry.key, probeFieldLabels)}</span>
          <strong title={formatDetailValue(entry.value)}>{formatDetailValue(entry.value)}</strong>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 运行类型检查**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/app/media-details-dialog.tsx
git commit -m "feat(i18n): update renderProbeEntries to accept probeFieldLabels"
```

---

## Task 8: 在组件中传递 probeFieldLabels

**Files:**
- Modify: `src/renderer/src/app/media-details-dialog.tsx:216,230`

- [ ] **Step 1: 更新 renderProbeEntries 调用**

在 `MediaDetailsDialog` 组件中，找到两处 `renderProbeEntries` 调用，添加 `copy.probeFieldLabels` 参数：

```typescript
// 第一处：formatDetails 渲染（约第 216 行）
{formatDetails ? renderProbeEntries(flattenProbeEntries(formatDetails), copy.probeFieldLabels) : <div className="media-details-empty">{copy.mediaDetailsDialog.noDetails}</div>}

// 第二处：streamDetails 渲染（约第 230 行）
{renderProbeEntries(flattenProbeEntries(stream), copy.probeFieldLabels)}
```

- [ ] **Step 2: 运行类型检查**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: 运行构建**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/app/media-details-dialog.tsx
git commit -m "feat(i18n): pass probeFieldLabels to renderProbeEntries in MediaDetailsDialog"
```

---

## Task 9: 更新 FEATURE.md

**Files:**
- Modify: `FEATURE.md:35-38`

- [ ] **Step 1: 更新多语言功能描述**

在 `## 多语言` 部分添加新功能描述：

```markdown
## 多语言
- 播放器主界面、设置页、下载弹窗和运行提示已接入统一的多语言词条。
- 支持根据设置切换简体中文、英文、日语、韩语，避免不同模块出现混合语言。
- 媒体详情弹窗中的 ffprobe 字段名已支持多语言翻译。
```

- [ ] **Step 2: Commit**

```bash
git add FEATURE.md
git commit -m "docs: update FEATURE.md with media details i18n"
```

---

## Task 10: 手动测试验证

- [ ] **Step 1: 启动开发服务器**

Run: `npm run dev`

- [ ] **Step 2: 测试简体中文**

1. 打开设置，切换到简体中文
2. 打开一个视频文件
3. 点击"信息" tab
4. 点击"查看完整详情"
5. 验证字段名显示为中文（如"文件名"、"流数量"、"时长"等）

- [ ] **Step 3: 测试英文**

1. 打开设置，切换到英文
2. 重复步骤 2-4
3. 验证字段名显示为英文（如"Filename"、"Stream count"、"Duration"等）

- [ ] **Step 4: 测试日语**

1. 打开设置，切换到日语
2. 重复步骤 2-4
3. 验证字段名显示为日语（如"ファイル名"、"ストリーム数"、"再生時間"等）

- [ ] **Step 5: 测试韩语**

1. 打开设置，切换到韩语
2. 重复步骤 2-4
3. 验证字段名显示为韩语（如"파일명"、"스트림 수"、"재생 시간"等）

- [ ] **Step 6: 测试回退逻辑**

1. 验证未翻译的字段名回退到原有的格式化逻辑（如"Codec Name"变成"Codec Name"）
