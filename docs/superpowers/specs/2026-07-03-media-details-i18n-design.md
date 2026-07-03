# 媒体详情弹窗多语言支持设计

## 背景

"完整媒体详情"弹窗中展示的 ffprobe 字段名（如 FILENAME、NB STREAMS、DURATION 等）目前是英文硬编码，需要支持简体中文、英文、日语、韩语四种语言。

## 目标

为 `media-details-dialog.tsx` 中的 ffprobe 字段名添加多语言翻译支持，与现有 i18n 体系保持一致。

## 现状

- 项目已有完整的 i18n 支持（`src/shared/i18n.ts`）
- `humanizeKey` 函数只做了简单的格式化（下划线转空格、首字母大写）
- ffprobe 返回的字段名是英文的，需要映射到多语言标签

## 设计方案

### 1. 扩展 `LocaleCopy` 类型

在 `src/shared/i18n.ts` 中添加 `probeFieldLabels` 字段：

```typescript
export type LocaleCopy = {
  // ... 现有字段
  probeFieldLabels: Record<string, string>
}
```

### 2. 添加翻译映射

为四种语言添加翻译映射，覆盖 ffprobe 常用字段：

```typescript
'zh-CN': {
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
    'start_time.2': '起始时间',
    'disposition': ' disposition',
    'channel_layout': '声道布局',
    'channels': '声道数',
    'bits_per_sample': '采样位数',
    'sample_fmt': '采样格式',
    'sample_rate': '采样率',
  }
}
```

### 3. 修改 `humanizeKey` 函数

在 `src/renderer/src/app/media-details-dialog.tsx` 中修改 `humanizeKey` 函数：

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

### 4. 更新组件调用

在 `MediaDetailsDialog` 组件中传递 `copy` 到 `renderProbeEntries`：

```typescript
// 修改 renderProbeEntries 函数签名
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

// 在组件中传递 probeFieldLabels
{formatDetails ? renderProbeEntries(flattenProbeEntries(formatDetails), copy.probeFieldLabels) : ...}
```

## 实现步骤

1. 在 `src/shared/i18n.ts` 的 `LocaleCopy` 类型中添加 `probeFieldLabels` 字段
2. 为四种语言（zh-CN、en-US、ja-JP、ko-KR）添加翻译映射
3. 修改 `src/renderer/src/app/media-details-dialog.tsx` 中的 `humanizeKey` 函数
4. 修改 `renderProbeEntries` 函数，接收 `probeFieldLabels` 参数
5. 在 `MediaDetailsDialog` 组件中传递 `copy.probeFieldLabels`

## 测试验证

1. 切换到简体中文，打开"完整媒体详情"弹窗，验证字段名显示为中文
2. 切换到英文，验证字段名显示为英文
3. 切换到日语，验证字段名显示为日语
4. 切换到韩语，验证字段名显示为韩语
5. 验证未翻译的字段名回退到原有的格式化逻辑

## 风险与注意事项

1. ffprobe 返回的字段名可能很多，需要覆盖常用字段
2. 翻译表可以随着需求逐步扩展
3. 未翻译的字段名会回退到原有的格式化逻辑，不会影响用户体验
