<p align="center">
  <img src="brand/icon.png" width="120" alt="AIVPlayer Logo">
</p>

<h1 align="center">AIVPlayer</h1>

<p align="center">
  <strong>재생, 자막, 비주얼 미디어 라이브러리와 숏드라마 제작을 위한 로컬 우선 AI 동영상 워크스테이션</strong>
</p>

<p align="center">
  <a href="https://aivplayer.pages.dev/">제품 사이트</a> ·
  <a href="https://github.com/ponponon/aivplayer/releases">GitHub 다운로드</a>
</p>

<p align="center">
  <a href="https://github.com/ponponon/aivplayer/releases">
    <img src="https://img.shields.io/github/v/release/ponponon/aivplayer" alt="Release">
  </a>
  <a href="https://github.com/ponponon/aivplayer/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/ponponon/aivplayer" alt="License">
  </a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform">
</p>

<p align="center">
  <a href="#빠른-시작">빠른 시작</a> ·
  <a href="#기능">기능</a> ·
  <a href="#명령줄-인터페이스">CLI</a> ·
  <a href="#소스에서-개발">개발</a> ·
  <a href="#문제-해결">문제 해결</a> ·
  <a href="#기여">기여</a>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.ja-JP.md">日本語</a> ·
  <a href="README.ko-KR.md">한국어</a>
</p>

---

## 소개

AIVPlayer는 Electron 기반의 크로스 플랫폼 데스크톱 동영상 워크스테이션입니다. 로컬 동영상 재생, 오프라인 ASR 자막, 자막 번역, AI 콘텐츠 요약, 비주얼 미디어 라이브러리, 이미지 처리, AI 숏드라마 텍스트 제작을 하나의 애플리케이션에 담았습니다.

제품 소개, 기능 데모와 다운로드 링크는 **[aivplayer.pages.dev](https://aivplayer.pages.dev/)** 에서 확인할 수 있습니다. 데스크톱 설치 파일은 [GitHub Releases](https://github.com/ponponon/aivplayer/releases)에서 다운로드하세요.

### 로컬 우선 구조와 AI 요청 범위

- 재생, 미디어 분석, 자막 캐시, 비주얼 라이브러리 인덱싱과 대부분의 처리는 로컬에서 수행됩니다.
- ASR은 로컬 [whisper.cpp](https://github.com/ggerganov/whisper.cpp) 엔진을 사용하므로 동영상을 온라인 음성 변환 서비스에 업로드할 필요가 없습니다.
- 자막 번역, 콘텐츠 요약과 AI 숏드라마 텍스트 생성에는 OpenAI 호환 서비스 설정이 필요합니다. 기능을 켜면 관련 텍스트가 사용자가 설정한 제공업체로 전송됩니다.
- 비주얼 미디어 라이브러리는 로컬 SigLIP2 모델과 LanceDB에 인덱스를 저장하며, 원본 동영상과 이미지는 업로드하지 않습니다.

### 코드 서명 정책

릴리스 서명 절차는 [Code signing policy](CODE_SIGNING_POLICY.md)에 설명되어 있습니다.

> Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/)

## 빠른 시작

### 1. 다운로드 및 설치

[제품 사이트](https://aivplayer.pages.dev/)에서 기능을 확인하거나 아래 릴리스 페이지에서 플랫폼에 맞는 설치 파일을 다운로드하세요.

- [GitHub Releases](https://github.com/ponponon/aivplayer/releases)

macOS, Windows와 Linux를 지원합니다. 패키지 형식과 `aivcli` 명령 설치 방법은 [설치](#설치) 절을 참고하세요.

### 2. 동영상 열기

설치 후 동영상을 창으로 드래그하거나 파일 선택기로 열 수 있습니다. 플레이어는 재생 목록, 재생 기록, 이어보기, 자막 트랙, 클립 내보내기, 스크린샷과 화면 녹화를 지원합니다.

### 3. 처음 로컬 자막 생성하기

자막 패널을 열고 안내에 따라 whisper.cpp 런타임과 ASR 모델을 준비하세요. 모델은 ModelScope 또는 Hugging Face에서 다운로드할 수 있습니다. 언어를 선택해 자막을 생성하면 결과가 로컬에 캐시되어 다음에 같은 동영상을 열 때 재사용됩니다.

### 4. 필요할 때 클라우드 AI 설정

자막 번역, 콘텐츠 요약 또는 AI 숏드라마 스튜디오를 사용하려면 설정이나 해당 패널에서 OpenAI 호환 API를 구성하세요. API Key는 로컬 장치에 안전하게 저장됩니다. CLI의 `provider show/test`는 마스킹된 상태만 표시하며 Key를 명령줄 인자로 직접 받지 않습니다.

## 기능

### 재생 및 미디어 처리

- MP4, WebM, MOV, MKV, AVI, FLV, WMV, MPEG-TS, 3GP, VOB, MXF, RMVB, MPEG elementary stream, F4V, OGM, NUT, DV, GXF, CAVS, Dirac, R3D, WTV, FLI/FLC, RoQ, Smacker, Motion JPEG, Bink, Y4M, raw H.264/H.265 stream 등 일반 및 전문 동영상 형식을 지원합니다. 브라우저에서 호환되지 않는 미디어는 자동 변환할 수 있으며 드래그 앤 드롭과 재생 목록을 지원합니다.
- LAN 전용 Web 재생을 실행할 수 있습니다. Chrome, Firefox, Safari 또는 모바일 브라우저에서 데스크톱 앱이 공유한 재생 목록과 선택한 디렉터리에 접근할 수 있습니다. 미디어는 HTTP Range로 스트리밍되고 Web 페이지에서 디렉터리를 새로 고쳐 새 파일을 찾을 수 있습니다. 여러 네트워크 인터페이스가 있는 장치는 사용 가능한 모든 주소와 로컬 QR 코드를 표시하며, 휴대폰과 태블릿에서는 홈 화면에 추가할 수 있습니다.
- LAN Web 미디어 라이브러리는 디렉터리 트리, 검색, 정렬, 즐겨찾기와 다중 선택을 지원합니다. 선택한 파일을 일괄 다운로드하거나 현재 디렉터리를 ZIP으로 묶을 수 있으며 디렉터리 구조가 유지됩니다.
- LAN Web 디렉터리 스캔은 일반 이미지 형식도 지원합니다. 이미지를 목록 / 그리드 미디어 라이브러리에서 미리 보고, 즐겨찾기하고, 링크를 복사하거나 다운로드할 수 있으며 동영상과 디렉터리 탐색 및 일괄 작업을 공유합니다.
- LAN Web에는 현재 세션 작업 센터가 있어 동영상 변환의 대기, 실행 중, 완료와 실패 상태를 한곳에 표시합니다. 실패한 작업은 바로 재시도할 수 있고 작업을 선택하면 해당 미디어로 돌아갑니다.
- 브라우저에서 호환되지 않는 미디어를 필요할 때 로컬에서 H.264 + AAC MP4로 변환할 수 있습니다. 원본 파일은 수정하지 않으며 변환 결과는 원본 파일 지문으로 캐시됩니다.
- 여러 LAN 장치가 동시에 변환을 요청하면 로컬 동시 실행 한도에 따라 작업을 큐에 넣어 여러 대용량 동영상이 리소스를 모두 사용하지 않도록 합니다.
- 변환 전에 캐시 디스크 공간을 확인합니다. 만료된 결과와 비정상 종료로 남은 임시 파일은 자동 정리되며 원본 파일이 교체된 후 오래된 호환 버전을 잘못 재사용하지 않습니다.
- 재생 기록은 로컬에 저장되며 이어보기, 미완료 항목 필터, 유효하지 않은 파일 정리와 컨텍스트 메뉴를 지원합니다. 재생 상태는 미디어 지문별로 저장되므로 교체된 파일이 잘못된 이전 진행 상태를 사용하지 않습니다.
- 자막 트랙, 볼륨, 재생 속도, 전체 화면, 키보드 단축키와 컨트롤 바 자동 숨김을 지원합니다. 재생 종료 동작은 정지, 다음 항목 재생, 현재 항목 반복, 재생 목록 반복, 셔플 중에서 선택할 수 있으며 컨테이너 챕터와 사용자 북마크는 타임라인에서 바로 이동할 수 있습니다.
- 15초, 30초, 60초 클립을 내보낼 수 있으며 동영상만, 외부 자막 파일 포함, 자막 번인 중에서 선택할 수 있습니다.
- 현재 화면 스크린샷, 예약 화면 녹화와 GIF 내보내기를 지원하고 저장 폴더, 형식과 파일명 규칙을 설정할 수 있습니다.
- 재생 시간, 해상도, 코덱, 프레임 레이트, 비트레이트, 오디오 트랙과 자막 트랙 등의 미디어 정보를 확인할 수 있습니다.

### 로컬 AI 자막 및 콘텐츠 이해

- whisper.cpp 기반 로컬 ASR로 중국어, 영어, 일본어, 한국어 등 여러 언어를 인식합니다.
- VTT와 SRT를 동시에 생성하며 자막 캐시, 기본 언어, 타임라인 조정과 생성 상태 확인을 지원합니다.
- OpenAI 호환 서비스를 통한 자막 번역을 지원하며 캐시, 재시도, 취소, 용어집과 대상 언어 전환을 제공합니다.
- 스포일러 없는 요약, 상세 요약, 챕터와 타임라인 이동을 생성하고 Markdown, TXT 또는 JSON으로 내보낼 수 있습니다.
- AI 워크플로는 안내형 처리와 한 번에 처리하는 방식을 지원하며 캐시, 취소, 재시도와 이어하기를 제공합니다.

### 비주얼 미디어 라이브러리

- 로컬 SigLIP2 모델로 동영상에서 일정 간격으로 프레임을 추출하고 벡터를 로컬 LanceDB에 저장합니다.
- 텍스트 설명 검색, 이미지로 검색, 텍스트 / 비주얼 / 파일명 혼합 검색을 지원합니다.
- 검색 결과에서 일치하는 자막 구간을 표시하고 동영상의 해당 시점으로 바로 이동할 수 있습니다.
- 로컬 SigLIP2로 사람, 차량, 동물, 가방, 카메라, 컴퓨터, 스마트폰, 실내 / 실외 등의 고정 어휘 엔터티 라벨을 선택적으로 생성할 수 있습니다. 네트워크 통신, 사람 신원 인식 또는 물체 바운딩 박스 검출은 수행하지 않습니다.
- 로컬 엔터티 라벨 카탈로그에서 사용자 지정 검색 라벨 생성, 이름 변경, 별칭 추가, 숨김 및 병합을 설정할 수 있으며 다음 엔터티 색인과 검색 결과에 적용됩니다.
- 디렉터리 재귀 스캔, 증분 인덱싱, 백그라운드 인덱스 큐, 인덱스 진행률과 단계별 소요 시간 표시를 지원합니다. 비주얼 인덱싱은 사용자가 수동 작업을 명시적으로 시작한 경우에만 실행되며, 동영상을 여는 것만으로는 연산 자원을 사용하지 않습니다.
- 전체 비주얼 검색 결과 내보내기는 작업 센터에서 백그라운드로 실행되며 검색 / 작성 진행률과 취소를 지원합니다. JSON / CSV는 임시 파일에 청크 단위로 작성한 뒤 원자적으로 확정하므로 실패나 취소 시 반쪽짜리 파일을 남기지 않으며, 최대 100만 개의 색인 결과로 제한됩니다.
- CLI에서도 스캔, 인덱싱, 상태 확인과 검색을 실행할 수 있어 개인 동영상 라이브러리의 일괄 관리에 적합합니다.

### AI 숏드라마 텍스트 스튜디오

- 숏드라마 프로젝트를 만들고 TXT / Markdown 소설에서 챕터를 인식해 반복해서 가져올 수 있습니다.
- 스토리 이벤트, 스토리 뼈대, 각색 전략과 에피소드 대본을 생성하며 단계별 결과를 로컬 SQLite에 저장합니다.
- 대본에서 인물, 장면과 소품 에셋을 추출하고 구조화된 스토리보드를 생성합니다.
- OpenAI 호환 Provider, 로컬 Mock, 연결 테스트, 작업 상태, 캐시와 이어하기를 지원합니다.
- 이미지 / 동영상 / 오디오용 독립 생성 작업 큐를 제공하며 대기, 실행 중, 진행률, 완료, 실패와 취소 상태를 관리합니다. 앱이 재시작되면 실행 중 중단된 작업은 대기 상태로 돌아갑니다.
- 로컬 결과 경로가 있는 완료 작업은 편집 프로젝트가 열려 있을 때 기존 편집 타임라인으로 되돌릴 수 있습니다. 기존 미디어 소스, 메인 트랙 추가, 실행 취소 / 다시 실행과 프로젝트 저장 흐름을 재사용합니다. 편집 프로젝트가 열려 있지 않으면 타임라인을 변경하지 않습니다.
- 현재는 텍스트 기획과 스토리보드에 초점을 두고 있으며 특정 이미지 또는 동영상 생성 업체와는 아직 연결되지 않았습니다.

### 이미지 작업 공간

- 여러 이미지를 가져오고 자르기, 회전, 뒤집기와 일괄 처리를 수행할 수 있습니다.
- 형식, 품질, 목표 용량 압축, 일괄 내보내기와 덮어쓰기 정책을 설정할 수 있습니다.

### 언어 및 인터페이스

- 중국어 간체, English, 일본어와 한국어를 지원합니다.
- 컨트롤 바가 자동으로 숨겨지는 어두운 시네마 스타일 인터페이스이며 다양한 창 크기에 대응합니다.
- macOS는 네이티브 창 컨트롤을 사용하고 Windows / Linux는 애플리케이션 테마에 맞는 자체 그린 창 컨트롤을 사용합니다.

## 명령줄 인터페이스

설치 파일에는 `aivcli` 명령이 포함됩니다. CLI는 데스크톱 앱과 ASR, 자막 캐시, 비주얼 라이브러리, AI 숏드라마 데이터를 공유합니다. 먼저 로컬 실행 환경을 확인하세요.

```bash
aivcli doctor
aivcli doctor --json
```

### 미디어 및 자막

```bash
aivcli media info ./movie.mp4
aivcli asr ./movie.mp4 --format both --output-dir ./subtitles
aivcli subtitle convert ./movie.vtt
aivcli subtitle translate ./movie.vtt --to zh --output-dir ./subtitles
```

### 편집 프로젝트 읽기 전용 조회

`aivcli edit`는 프로젝트, 미디어 또는 자막 파일을 수정하지 않습니다. `inspect`는 검토 가능한 타임라인과 자막 통계를 출력하고, `captions`는 원문 또는 번역문으로 대본 줄을 검색하면서 삭제 표시된 줄도 유지합니다. `propose`는 프로젝트 revision이 포함된 구조화된 계획만 생성하므로 나중에 확인 흐름에 연결하기 전에 사람이 검토할 수 있습니다.

```bash
aivcli edit inspect ./project.aivproj --json
aivcli edit captions ./project.aivproj --query "멈춤 구간 삭제" --limit 20 --json
aivcli edit propose delete-script ./project.aivproj segment-1 segment-2 --json
```

`edit propose delete-script`는 삭제할 원본 시간 구간, 유지할 구간, 영향을 받는 대본 줄, 자막 변경과 예상 길이를 출력합니다. Proposal은 프로젝트 스냅샷 지문으로 stale 검사를 수행하며 현재 CLI는 JSON만 생성하고 `.aivproj`에 다시 쓰지 않습니다.

데스크톱 편집기에서 대본 줄을 삭제하면 먼저 같은 Proposal 미리 보기를 열고 확인 후에만 편집 기록과 로컬 프로젝트 캐시에 기록합니다. Shift를 누른 채 대본 줄을 여러 개 선택하면 하나의 일괄 Proposal을 만들 수 있습니다. 확인 전에 프로젝트가 변경되면 작업을 거부하고 새 계획을 생성하도록 요청합니다.

### 로컬 편집 MCP

고정된 프로젝트를 로컬 stdio MCP 방식으로 Agent에 제공할 수 있습니다. 기본 서비스는 `inspect`, `captions`, `propose delete-script` 세 가지 읽기 전용 도구만 노출하며 네트워크 포트를 열지 않고 Proposal 적용, 파일 쓰기, 미디어 삭제 또는 셸 실행을 할 수 없습니다.

```bash
aivcli mcp serve ./project.aivproj
```

MCP 클라이언트 설정 예시:

```json
{
  "mcpServers": {
    "aivplayer-editing": {
      "command": "aivcli",
      "args": ["mcp", "serve", "/absolute/path/project.aivproj"]
    }
  }
}
```

프로젝트 경로는 서비스 시작 시 고정되므로 Agent가 도구 인자로 다른 파일로 전환할 수 없습니다. 실제 적용은 데스크톱 확인 대화상자로 돌아가 프로젝트 revision 검증을 통과해야 합니다.

신뢰할 수 있는 로컬 Agent가 현재 열려 있는 데스크톱 편집기로 Proposal을 보내 확인하도록 하려면 `--desktop`을 추가합니다.

```bash
aivcli mcp serve ./project.aivproj --desktop
```

데스크톱 모드는 사용자별 로컬 Unix socket(Windows는 named pipe)과 실행마다 새로 생성되는 토큰을 사용합니다. 일치하는 `.aivproj`가 열려 있을 때만 기존 확인 대화상자에 표시하며 거부, 만료, 취소 및 revision 충돌 결과를 Agent에 반환합니다. 직접 apply 도구, 네트워크 수신, 임의 파일 접근, 미디어 삭제, 셸 실행 또는 Provider 자격 증명은 제공하지 않습니다. 데스크톱 앱과 CLI가 의도적으로 서로 다른 사용자 데이터 디렉터리를 사용할 때만 `--bridge-manifest path`를 지정하세요.

### 비주얼 미디어 라이브러리

```bash
aivcli library status
aivcli library scan ./Videos --recursive
aivcli library index ./Videos --recursive
aivcli library search "해변 장면"
aivcli library search --image ./reference.jpg
```

### 일괄 처리

```bash
aivcli batch ./Videos --recursive --asr --translate zh --index --output-dir ./subtitles
aivcli batch ./Videos --recursive --asr --translate zh --index --resume
```

`batch`는 ASR, 자막 번역과 비주얼 라이브러리 인덱싱을 조합합니다. 기본적으로 개별 동영상이 실패해도 계속 처리하며 상태를 AIVPlayer 사용자 데이터 디렉터리에 저장합니다. `--state-file ./batch-state.json`으로 상태 파일을 지정하고, `--retry 0..5`로 복구 가능한 오류의 재시도 횟수를 조정하거나, `--fail-fast`로 오류 발생 시 즉시 중지할 수 있습니다. 중단 후 같은 인자에 `--resume`을 추가하면 결과물이 아직 있는 완료 단계는 건너뜁니다.

`--asr` 없이 `--translate`만 지정하면 CLI는 동영상 옆의 동일한 이름을 가진 `.vtt` 파일을 읽습니다. `--output-dir`를 지정하면 번역 자막에 `movie.zh.vtt`와 같은 대상 언어 접미사가 붙고 원문 자막을 덮어쓰지 않습니다. 주요 명령은 `--json`을 지원하므로 셸, CI 및 다른 자동화 도구에 연결할 수 있습니다.

### AI 숏드라마

```bash
aivcli drama list
aivcli drama create "내 숏드라마" --genre "미스터리" --episodes 6
aivcli drama import <project-id> ./novel.txt
aivcli drama events generate <project-id>
aivcli drama plan generate <project-id> --stage skeleton
aivcli drama script generate <project-id> --episode 1
aivcli drama assets generate <project-id>
aivcli drama storyboard generate <project-id> --episode 1
aivcli drama provider show
aivcli drama provider test
```

전체 옵션은 `aivcli --help`, `aivcli batch --help` 또는 `aivcli drama --help`에서 확인할 수 있습니다.

## 설치

### 시스템 요구 사항

- **macOS**: 12.0 이상
- **Windows**: Windows 10 이상
- **Linux**: Ubuntu 18.04 또는 동등한 배포판

### 설치 파일 다운로드

[GitHub Releases](https://github.com/ponponon/aivplayer/releases)에서 플랫폼에 맞는 패키지를 다운로드하세요.

| 플랫폼 | 패키지 |
| --- | --- |
| macOS | `.dmg` / `.zip` |
| Windows | `.exe` (NSIS 설치 프로그램) |
| Linux | `.AppImage` / `.deb` |

Windows NSIS와 Linux `.deb`는 `aivcli` 런처를 설치하고 시스템 명령 경로에 추가합니다. macOS `.dmg` / `.zip`과 Linux `.AppImage`는 포터블 형식이라 PATH를 자동으로 수정하지 않습니다. 포터블 형식에서는 앱의 `--cli` 모드를 직접 실행하거나 직접 명령줄 런처를 만들 수 있습니다.

### 자동 업데이트

정식 Windows 및 Linux 설치 파일은 시작 후 백그라운드에서 GitHub Releases를 확인하고 현재 플랫폼에 맞는 새 버전을 자동으로 다운로드합니다. 다운로드가 끝나면 창 상단에 “다시 시작하고 업데이트” 버튼이 나타나며, 버튼을 눌러야 종료 및 설치가 진행됩니다. 현재 재생이나 편집을 강제로 중단하지 않습니다. macOS는 현재 런타임 정책으로 자동 업데이트를 비활성화하고 있으므로 0.6.0 DMG / ZIP이 서명 및 공증되었더라도 GitHub에서 수동으로 다운로드해야 합니다. 개발 모드와 `aivcli`는 자동 업데이트에 참여하지 않습니다.

자동 업데이트에는 GitHub 릴리스 페이지의 `latest*.yml` 메타데이터와 해당 설치 / 업데이트 패키지가 필요하므로 릴리스 과정에서 모두 업로드해야 합니다.

### 소스에서 빌드

```bash
git clone https://github.com/ponponon/aivplayer.git
cd aivplayer
npm install
npm run dev
```

Node.js 22.12.0 이상이 필요합니다. 일부 네트워크 환경에서는 npm, ModelScope 또는 Hugging Face에 접근하기 위해 프록시를 설정해야 합니다.

## 문제 해결

### “연결 프로그램으로 열기”로 시작하면 `Cannot find module 'apache-arrow'`가 표시됨

이 문제는 이전 설치 파일이 LanceDB 런타임 의존성을 함께 패키징하지 않아 발생한 시작 오류입니다. 동영상 파일명, 외장 드라이브 경로 또는 MP4 인코딩이 원인이 아닙니다. 현재 `v0.6.0` 릴리스에는 수정 사항이 포함되어 있습니다. 해당 Release의 설치 파일을 다운로드하고 앱 번들 안에 npm 의존성을 직접 설치하지 마세요.

현재 릴리스는 `v0.6.0`이므로 해당 Release의 설치 파일을 우선 사용하세요.

### 자막 생성 실패

먼저 실행하세요.

```bash
aivcli doctor
```

소스 개발 환경이라면 백엔드와 ASR 런타임도 각각 확인하세요.

```bash
npm run doctor:backend
npm run doctor:asr
```

whisper.cpp, ASR 모델과 ffmpeg가 준비되어 있는지 확인하세요. macOS에서 GPU 초기화가 실패하면 앱은 인식 가능한 Metal 리소스 오류에 대해 자동으로 CPU로 대체합니다.

### 번역, 요약 또는 숏드라마 생성 실패

OpenAI 호환 주소, 모델과 Key가 올바른지 확인하고 해당 패널에서 먼저 연결 테스트를 실행하세요. API Key를 Issue, 스크린샷, 터미널 명령 또는 커밋에 붙여 넣지 마세요. 문제를 제보할 때는 URL, Key, 경로와 전체 응답 내용을 먼저 마스킹하세요.

### 문제를 제보할 때 포함할 내용

- 운영체제, AIVPlayer 버전과 설치 파일 형식;
- 재현 절차, 동영상 형식과 외장 드라이브 사용 여부;
- Key가 제거된 `aivcli doctor --json` 결과;
- 오류가 발생한 패널 또는 CLI 명령과 Key를 제거한 로그 일부.

[GitHub Issues](https://github.com/ponponon/aivplayer/issues)에 문제를 등록하거나 [제품 사이트](https://aivplayer.pages.dev/)에서 최신 기능과 다운로드 정보를 확인하세요.

## 소스에서 개발

### 자주 사용하는 명령

```bash
npm run dev              # 개발 모드 시작
npm run build            # 프로덕션 버전 빌드
npm run preview          # 빌드 결과 미리 보기
npm run pack             # 설치 파일을 만들지 않고 패키징
npm run dist             # 설치 파일 생성

npm run typecheck        # TypeScript 타입 검사
npm run test             # 단위 테스트 실행
npm run doctor:backend   # 백엔드 의존성 확인
npm run doctor:asr       # ASR 런타임 확인
npm run smoke:all        # 주요 UI 회귀 테스트
npm run smoke:web-format-matrix -- --ffmpeg /path/to/ffmpeg  # 실제 동영상 형식 및 Web 변환 매트릭스
npm run smoke:web-concurrency -- --ffmpeg /path/to/ffmpeg     # 다중 클라이언트 동시성, 중복 제거와 변환 큐 smoke
npm run smoke:web-real-file -- ./movie.mp4                     # 실제 대용량 파일의 길이, 마지막 Range와 패키징 Web smoke
```

로컬 ASR 런타임 준비:

```bash
npm run release:prepare-runtime -- \
  --whisper-dir /path/to/whisper.cpp/build/bin \
  --ffmpeg-bin /path/to/ffmpeg
```

### 프로젝트 구조

```text
aivplayer/
├── src/
│   ├── desktop/         # Electron 메인 프로세스와 데스크톱 연동
│   ├── core/            # 데스크톱과 CLI가 공유하는 비즈니스 기능
│   │   ├── ai/          # ASR, 번역, 요약과 비주얼 라이브러리
│   │   ├── drama/       # AI 숏드라마 텍스트 워크플로
│   │   └── media/       # 미디어 분석 및 내보내기
│   ├── preload/         # IPC 브리지
│   ├── renderer/        # React 렌더러 프로세스
│   └── shared/          # 공유 타입
├── resources/           # whisper.cpp, ffmpeg 등의 런타임 리소스
├── scripts/             # 빌드, 진단과 smoke 도구
├── tests/               # 단위 테스트와 통합 테스트
└── docs/
    ├── site/            # Cloudflare Pages 제품 사이트
    └── ...              # 릴리스 및 프로젝트 문서
```

### 기술 스택

| 분류 | 기술 |
| --- | --- |
| 데스크톱 프레임워크 | Electron |
| 프론트엔드 프레임워크 | React 19 |
| 빌드 도구 | Vite + electron-vite |
| 타입 시스템 | TypeScript |
| 로컬 ASR | whisper.cpp |
| 비주얼 검색 | SigLIP2 + LanceDB + Apache Arrow |
| AI 인터페이스 | OpenAI-compatible Provider |
| 테스트 | Vitest + Playwright |
| 패키징 | electron-builder |

## 기여

Issue와 Pull Request를 환영합니다. 먼저 `FEATURE.md`와 `FailureExperience.md`를 읽고 기능 범위와 프로젝트에 기록된 시행착오를 확인해 주세요.

1. 저장소를 Fork합니다.
2. `git switch -c feat/amazing-feature`와 같이 기능 브랜치를 만듭니다.
3. 로컬 타입 검사와 관련 테스트를 실행합니다.
4. 변경 사항은 [Conventional Commits](https://www.conventionalcommits.org/)를 사용해 커밋합니다.
5. 브랜치를 Push하고 Pull Request를 생성합니다.

주요 커밋 유형은 `feat`, `fix`, `docs`, `refactor`, `test`, `chore`입니다. 새 기능은 `FEATURE.md`에 기록하고 피드백으로 드러난 문제를 수정했다면 재사용 가능한 경험을 `FailureExperience.md`에 기록해 주세요.

## 라이선스

이 프로젝트는 [MIT License](LICENSE)로 공개됩니다.

## 감사의 글

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — 로컬 음성 인식 엔진
- [Electron](https://electronjs.org/) — 크로스 플랫폼 데스크톱 애플리케이션 프레임워크
- [React](https://react.dev/) — UI 프레임워크
- [LanceDB](https://github.com/lancedb/lancedb) — 로컬 벡터 데이터베이스
- [lucide-react](https://lucide.dev/) — 아이콘 라이브러리

<p align="center">
  AIVPlayer가 유용했다면 <a href="https://aivplayer.pages.dev/">제품 사이트</a>를 방문하거나 저장소에 ⭐ Star를 남겨 주세요.
</p>
