# Atlas v2 구현 및 검토

기준: 2026-11-11 main `728441cca15ec58470edf52e2304fa0fb45f9429`.
작업 브랜치: `feat/atlas-v2-wedding-edit` (로컬).

웨딩 스냅을 먼저 발견할 수 있도록 Hero 아래에 3장 화보를 추가하고, 기존 지도/Index와 큰 사진 뷰어를 확장했습니다. 최초 선택은 Wedding Edit Seoul입니다. 원본 JPG와 메인 청첩장은 변경하지 않았습니다.

## 변경 파일

| 파일 | 역할 |
| --- | --- |
| `atlas.html` | 웨딩 화보, 범례, 3개 그룹 Index, 공통 필름 스트립, 접근성 마크업 |
| `atlas.css` | 기존 색/타이포 유지, 마름모·원형 마커, 모바일 간격, 사진 전체 구도, 스크롤 잠금 |
| `atlas.js` | ID 기반 컬렉션 선택과 동기화, 썸네일 지연 로딩, 확대/스와이프/키보드/포커스 복원 |
| `atlas-data.js` | 그룹, 국가, 실제 폴더·파일 목록, 대표사진, 좌표, 설명, 사진 크기의 단일 데이터 원본 |
| `images/atlas-thumbs/` | 160×160 WebP 166장, 총 753,552 bytes |
| `images/atlas-featured/` | 560×700 대표사진 WebP 3장, 총 187,766 bytes |
| `scripts/build-atlas-assets.py` | 파일 검증 및 파생 이미지 재생성 도구. Pillow 필요 |
| `tests/atlas-browser.html`, `tests/atlas-browser.js` | 브라우저에서 실행하는 재현 가능한 검사/미리보기 |
| `docs/atlas-v2-browser-results.txt` | 실제 Chromium 실행 결과 |

`index.html`, `style.css`, `atlas-typography.css`, `main.js`, RSVP/Guestbook 코드와 기존 이미지의 바이트 불변을 확인했습니다.

## 컬렉션

| 번호 | 그룹 | 컬렉션 | 사진 |
| --- | --- | --- | ---: |
| 01 | The Wedding Edit | Seoul | 12 |
| 02 | The Wedding Edit | Sapa | 24 |
| 03 | The Wedding Edit | Tokyo | 7 |
| 04 | The Travel Journal | Tokyo | 24 |
| 05 | The Travel Journal | Sapa | 20 |
| 06 | The Travel Journal | Manado | 18 |
| 07 | The Travel Journal | Bohol | 14 |
| 08 | The Travel Journal | Seoul | 22 |
| 09 | The Travel Journal | Karuizawa | 16 |
| 10 | The Travel Journal | Pattaya | 6 |
| 11 | The Details | The Details | 3 |

합계: 11개 / 166장. Wedding 43장, Travel 120장, Details 3장.
실제 `8. Pataya` 경로를 유지하고 표시명만 Pattaya로 사용합니다. `Seoul_`, `Detail_`, `Pataya_06`까지 실제 파일 목록을 검증했습니다. 옛 사진 폴더 및 `.gitkeep`는 컬렉션으로 읽지 않습니다.

## 디자인 판단

- 대표사진은 전체 웨딩 스냅을 확인하고 서울 06, 사파 13, 도쿄 05로 선정했습니다. 작은 화면에서도 두 사람과 장소의 분위기가 드러나는 사진입니다.
- 원본 사진 순서는 유지합니다. 대표사진을 눌러도 컬렉션 첫 사진부터 보여줍니다.
- 마커 번호와 Index 번호를 01–11로 통일합니다. Details에는 마커가 없습니다.
- 같은 도시의 두 마커는 중심 간 48px, 버튼은 44×44px입니다. 얇은 선으로 연결하고 실제 위경도와 화면 배치를 분리했습니다. 지도는 위치 탐색을 위한 개략 배치입니다.
- 모바일에서 3장 화보를 한 줄로 유지합니다. 기존 Relationship of Melodrame과 잉크 그린/Tiffany Blue/Ivory를 사용합니다.
- 메인 사진은 일정한 프레임에서 모두 `object-fit: contain`으로 보여줍니다. 가로 사진은 여백이 생기지만 인물과 구도를 자르지 않습니다.
- 썸네일 스크롤은 해당 컨테이너만 이동합니다. 사진 변경은 페이지 스크롤을 이동시키지 않습니다.
- 모바일의 지도/Index 선택 및 화보 선택으로만 뷰어로 이동합니다. 최초 진입 자동 스크롤은 없습니다.

## 로딩

초기 원본 요청은 현재 서울 첫 사진 + 다음 사진 2개입니다. 별도로 대표사진 3개를 로드합니다. 보이지 않는 썸네일은 IntersectionObserver와 lazy loading으로 지연 로딩하며 JPG 원본을 썸네일로 내려받지 않습니다. 현재 원본 로딩 완료 후 다음 1장만 낮은 우선순위로 프리로드하고, Save-Data 환경에서는 생략합니다.

전체 파생 이미지 169장의 용량은 941,318 bytes입니다. 초기 원본 2장과 화보 3장의 합계는 990,314 bytes이며 CSS/폰트 등의 용량은 별도입니다. 원본에 EXIF가 있는 경우 파생 이미지의 방향을 보정하고 EXIF를 포함하지 않습니다.

## 실행한 검증

- `node --check atlas.js`, `node --check atlas-data.js`, `node --check tests/atlas-browser.js` 통과.
- `python scripts/build-atlas-assets.py --check`: 166장 파일 목록·실제 크기·파생 파일 검증 통과.
- `git diff --check` 통과.
- 실제 Chromium 문서의 360 / 390 / 430 / 861 / 1024 / 1440px iframe viewport에서 기능 검사 692개 통과, 0개 실패.
- 초기 선택/자동 스크롤 없음, 화보 3개 선택과 이동, 10개 독립 마커, 11개 Index 및 필름 스트립, 마지막 썸네일 자동 노출, 이전/다음 순환, 사진 변경 시 스크롤 유지, 확대/방향키/ESC/포커스 트랩/스크롤 복원, 합성 터치 스와이프, 가로 넘침 없음, 복귀 링크 및 대상 앵커 검증.
- 344개 사진·파생 이미지·페이지 에셋 HTTP 경로 모두 200. 원본 166장 전부 Chromium 디코딩 성공.
- 데스크톱 및 390px 모바일 렌더링을 직접 확인하고 화면 캡처.

검사를 실행하려면 저장소를 정적 서버로 열고 `tests/atlas-browser.html`에서 **Run checks**를 누릅니다. 테스트 중 해당 Chrome 탭을 전경에 유지해야 합니다. 백그라운드 탭에서는 브라우저가 부드러운 스크롤의 프레임 처리를 억제해 스크롤 검사가 실패할 수 있습니다.

## 제한 사항

- iOS Safari, 실제 Android 기기 및 카카오 인앱 브라우저에서는 직접 테스트하지 않았습니다. 터치 이벤트 검사는 합성 이벤트입니다.
- `prefers-reduced-motion` 분기와 CSS를 적용했지만, 관리형 Chrome이 DevTools를 차단하므로 OS/브라우저 설정을 변경한 실환경 검사는 하지 못했습니다.
- 메인 청첩장 코드는 변경하지 않았습니다. RSVP 전송 및 Guestbook 업로드 등 운영 데이터 생성 테스트는 수행하지 않았습니다.
- GitHub 쓰기 요청이 `403 Resource not accessible by integration`으로 거부되어 원격 브랜치 및 PR은 생성하지 못했습니다. main에는 쓰지 않았습니다.

## 사진 추가·삭제

1. 기존 폴더에 올바른 접두사의 JPG를 추가하거나 삭제합니다.
2. `python scripts/build-atlas-assets.py --refresh`를 실행합니다. 설정된 11개 폴더만 다시 읽고 `atlas-data.js`와 파생 이미지를 갱신합니다.
3. 대표사진을 삭제했다면 `representative`를 존재하는 파일로 먼저 변경합니다.
4. `python scripts/build-atlas-assets.py --check`로 검증합니다. 그룹·전체 사진 수는 브라우저에서 데이터로 계산됩니다.
5. HTML의 초기 안내 숫자 및 아래 테스트의 고정 예상 장수도 새 요구사항에 맞게 갱신합니다.

## GitHub 적용

기존 저장소의 루트에 변경 파일을 같은 경로로 복사한 뒤 별도 브랜치로 커밋·푸시합니다. 또는 제공하는 binary diff를 적용합니다. `images/atlas-thumbs`와 `images/atlas-featured`도 반드시 포함해야 합니다. 원본 사진을 옮기거나 이름을 바꿀 필요는 없습니다.
