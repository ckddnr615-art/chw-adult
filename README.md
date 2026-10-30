# 충현복지관 출석 사이트 · GitHub 자동 배포

기관 GitHub 저장소의 main 브랜치에 수정 내용을 저장하면 Cloudflare Workers Builds가 검사하고 새 사이트에 자동 배포합니다.

- 사이트 이름 기본값: chunghyun-attendance
- 사이트 주소: 기관 Cloudflare 계정에서 첫 배포 후 생성되는 workers.dev 주소
- 공동 자료·출결·실적: 기존 Google Sheets + Apps Script
- 사진 축소본: 기존 비공개 Google Drive 폴더
- 배포 대상: dist 안의 화면·폰트·로고만
- D1 바인딩이나 사이트 서버용 비밀번호 설정은 없습니다.

코드와 설정 파일은 준비되어 있습니다. 기관 GitHub/Cloudflare 계정의 실제 저장소 생성·연결·배포는 아직 실행하지 않았습니다.

## 처음 설정하는 순서

### 1. 기관 GitHub 저장소 만들기

기관 공유 GitHub 계정으로 로그인해 New repository를 누릅니다. 저장소 이름은 chunghyun-attendance, 공개 범위는 Private을 권장합니다. 기관 관리 기준에 따라 소유자를 선택합니다.

Add file → Upload files에서 이 프로젝트 폴더의 **내용 전체**를 올립니다. ZIP 파일 자체를 올리는 방식이 아닙니다. 저장소 첫 화면에 package.json, wrangler.jsonc, site, scripts, apps-script, tests가 바로 보여야 합니다. `.github` 폴더도 포함합니다. main 브랜치에 Commit changes를 누릅니다.

폰트 파일도 모두 필요합니다. 비밀번호·공휴일 키·Google 시트 자료·실제 사진 원본·JSON 자료 백업은 저장소에 넣지 않습니다. 이 패키지에는 운영 자료와 기관 사진이 포함되어 있지 않습니다.

### 2. 기관 Cloudflare에서 새 GitHub 연결 사이트 만들기

Workers & Pages → Create application → GitHub 저장소 연결을 선택합니다. 기관 공유 GitHub 계정으로 이 저장소를 선택합니다. GitHub 권한 연결은 기관 담당자가 확인합니다.

아래 값을 사용합니다.

| 설정 | 값 |
| --- | --- |
| Worker / 프로젝트 이름 | chunghyun-attendance |
| 저장소 | 기관계정/chunghyun-attendance |
| Production branch | main |
| Root directory | 저장소 최상위 / 또는 빈칸 |
| Build command | npm run validate |
| Deploy command | npx wrangler deploy |
| Build variable NODE_VERSION | 24 |

자동 의존성 설치는 기본값을 사용합니다. Wrangler는 package-lock.json에 고정되어 있습니다. 이름을 바꾸면 wrangler.jsonc의 name도 실제 프로젝트 이름과 같게 바꿉니다. 비운영 브랜치 자동 배포는 처음에는 끄고 main만 연결합니다.

Save and Deploy를 누릅니다. 첫 연결 후에는 main 변경마다 자동 배포됩니다. GitHub Actions의 Check website도 별도로 검사하지만, 실제 배포는 Cloudflare Builds에서 수행합니다. 배포 명령 앞의 Build command가 테스트와 빌드를 실행하므로 검사 실패 시 배포 단계로 진행하지 않습니다.

Cloudflare가 GitHub 저장소를 직접 읽는 방식입니다. GitHub Secrets에 Cloudflare API 토큰을 복사할 필요가 없습니다. Cloudflare가 자체 배포에 사용하는 권한은 최초 연결 화면에서 설정합니다.

### 3. 새 사이트 주소를 Google에 등록

첫 배포가 완료되면 새 사이트의 기본 주소를 복사합니다. 주소 뒤에 / 또는 #kiosk를 붙이지 않습니다.

Apps Script → 프로젝트 설정 → 스크립트 속성 → SITE_ORIGINS를 다음 형태로 저장합니다. 아래 예시 주소를 실제 생성된 주소로 바꿉니다.

```json
["https://chunghyun-attendance.기관하위도메인.workers.dev"]
```

이전에 접속하던 주소도 당분간 사용할 경우 기존 주소와 새 주소를 배열에 함께 둘 수 있습니다. 현재 요청은 새 사이트 사용을 기준으로 합니다.

SITE_ORIGINS 값만 변경하는 것은 새 웹앱 버전을 만들지 않아도 다음 요청에서 읽습니다. 서버 코드를 함께 바꾸었다면 Apps Script의 기존 배포를 새 버전으로 업데이트합니다.

site/google-config.js에는 사용 중인 공개 Apps Script /exec 주소가 이미 들어 있습니다. 주소가 변경되는 경우에만 따옴표 안의 webAppUrl 값을 수정해 Commit합니다. // 뒤에 붙이면 주석이 되어 연결되지 않습니다.

### 4. 확인

새 사이트에서 관리자 로그인을 합니다. 기존 공동 저장소가 연결되면 기존 참여자·소속·일정·출결을 불러옵니다. 저장소를 다시 초기화하거나 기존 시트를 비울 필요는 없습니다.

새 Google 시트를 처음 연결해 아직 운영 자료가 없는 경우에는 화면 맨 위의 ‘현재 자료로 공유 저장소 시작’을 먼저 실행합니다. 관리자 로그인만으로 공동 저장소가 자동 초기화되지는 않습니다. 최초 준비를 마친 다음 사진과 배너를 등록하세요. 기존 운영 자료가 있으면 이 작업을 반복하지 않습니다.

검수용 참여자로 출석 → 실적 1행 → 같은 영역 중복 방지 → 결석 정정 시 실적 취소 → 다른 기기에서도 같은 결과 표시 순서로 확인합니다. 이 패키지를 로컬에서 검사했지만 기관 계정 자동 배포와 새 주소의 Google 연결은 최초 설정 후 확인이 필요합니다.

## 이후 수정 방법

GitHub에서 수정할 파일 선택 → 연필(Edit) → 수정 → Commit changes(main) 순서입니다. Cloudflare Builds에서 Success가 나오면 사이트를 새로고침합니다. 더 큰 변경은 브랜치와 Pull Request로 검토한 뒤 main에 합칩니다.

| 바꾸려는 것 | 수정 위치 / 방법 |
| --- | --- |
| 프로그램·참여자·출결·일정·배너 사진·배너 문구 | 운영 사이트 관리자 화면에서 변경, GitHub 배포 불필요 |
| 디자인·화면 배치·새 기능 | site 안의 JS·CSS·HTML 수정 후 Commit |
| 색상·여백·글자 스타일 | site/styles.css, admin.css, usability.css, typography.css 등 |
| Google 웹앱 주소 | site/google-config.js의 webAppUrl 따옴표 안 |
| Google 처리 규칙 / 서버 함수 | apps-script 수정 후 Apps Script에도 적용, 기존 배포 새 버전 업데이트 |
| API 키·직원 비밀번호·시트 ID | Apps Script 스크립트 속성에서만 설정 |

GitHub 자동 배포는 홈페이지 파일을 반영합니다. apps-script 폴더의 변경을 Google 서버에 자동 업로드하지는 않습니다. 기존에 작동하는 Google 설정은 그대로 유지합니다.

## 폴더 구조

```text
site/                  실제 수정할 홈페이지 원본
apps-script/           Google 서버 코드 사본, dist에 포함되지 않음
scripts/               검사·빌드·로컬 미리보기
tests/                 출석·시간표·실적·사진·Google 통신 검사
.github/workflows/     GitHub 코드 검사
docs/                  최초 연결과 운영 설명
package.json           실행 명령
package-lock.json      배포 도구 버전 고정
wrangler.jsonc         정적 파일 자동 배포 설정
dist/                  빌드 결과, GitHub에 올리지 않음
```

## 컴퓨터에서 수정하고 확인할 때

Node.js 24 이상이 있으면 INSTALL.cmd를 한 번 실행해 도구를 설치합니다. START-LOCAL.cmd로 http://127.0.0.1:4182 를 열 수 있습니다. 로컬에서 Google 공동 저장까지 연결하려면 SITE_ORIGINS에 해당 로컬 주소도 추가해야 합니다. 같은 Google 저장소를 연결하면 로컬의 출결 변경도 공동 저장소에 반영되므로 검수용 시트를 사용합니다.

명령어 사용 시 npm ci → npm run validate → npm run dev 순서입니다. 수정은 site에서 하고, dist는 빌드로 생성합니다. scripts/build.mjs는 이 프로젝트의 dist만 재생성합니다.

## 오류가 나면

| 증상 | 확인할 곳 |
| --- | --- |
| Worker name mismatch | wrangler.jsonc name과 Cloudflare 프로젝트 이름 |
| package.json을 찾지 못함 | 저장소 최상위에 파일 업로드, Root directory 확인 |
| npm 또는 Node 버전 오류 | Build variable NODE_VERSION=24, package-lock.json 포함 |
| 코드 변경 후 반영 안 됨 | main에 Commit했는지, Cloudflare Builds의 최근 결과와 Build command 확인 |
| Google 연결 오류 | 새 사이트 주소를 SITE_ORIGINS JSON 배열에 등록했는지 확인 |
| 웹앱 주소 오류 | site/google-config.js의 webAppUrl 값이 비어 있지 않은지 확인 |
| 사진 저장 시 최초 준비 필요 | 관리자 로그인 후 화면 맨 위의 공동 저장소 시작 버튼 확인 |
| 사진 저장 시 관리자 인증 만료 | 관리자 재로그인 후 저장, 선택한 사진은 이동 전까지 현재 편집 화면에 유지 |

## 공식 문서

- 새 Worker GitHub 연결: https://developers.cloudflare.com/workers/ci-cd/builds/
- 빌드·배포 명령 설정: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- 정적 파일 배포: https://developers.cloudflare.com/workers/static-assets/get-started/
- Google 서버 버전 관리: https://developers.google.com/apps-script/concepts/deployments
