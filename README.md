# 미리내 마켓

Java 21 · Spring Boot 4.1.1 백엔드와 React · TypeScript · Vite 프런트엔드다. PostgreSQL·Flyway·구매자 가입·서버 세션 인증과 판매자 본인 매장 조회를 제공한다. 상품·주문·결제는 후속 페이즈다.

- 구조·검사 규칙: [AGENTS.md](AGENTS.md)
- 요구사항·계정 입력 규칙·API 계약: [docs/SPEC.md](docs/SPEC.md)
- 진행 상태: [PLAN.md](PLAN.md)

## 실행

JDK 21과 Linux 컨테이너를 실행할 수 있는 Docker 엔진이 필요하다. 첫 실행에는 Gradle 의존성과 PostgreSQL 이미지를 내려받는 인터넷 연결이 필요하다. 시스템 Gradle은 사용하지 않는다.

```powershell
# 저장소 루트에서 실행
# Docker Desktop이 꺼져 있으면 시작
# docker desktop start

docker compose up -d --wait
.\gradlew.bat bootRun

# 데모 계정·시장·매장 생성
.\gradlew.bat bootRun --args='--spring.profiles.active=demo'

# 전체 검사와 실행 가능한 jar 생성
.\gradlew.bat check build
# 형식 자동 수정
.\gradlew.bat spotlessApply

# jar 실행
java -jar build\libs\mirinae-market-0.0.1-SNAPSHOT.jar --spring.profiles.active=demo
```

기본 연결값은 compose의 로컬 개발 전용 계정과 일치한다. `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` 환경변수로 바꿀 수 있다. HTTPS 환경에서는 `SESSION_COOKIE_SECURE=true`를 설정한다. compose는 DB 포트를 127.0.0.1에만 열며 예제 비밀번호를 운영용으로 사용하지 않는다.

DB 스키마는 Flyway가 생성하고 Hibernate는 검증만 한다. PostgreSQL 데이터는 named volume에 유지된다. 종료는 `docker compose stop`, 컨테이너 정리는 `docker compose down`을 사용한다. 데이터 복구가 필요한 경우 삭제 전에 백업하며, 볼륨 삭제 옵션을 기본 실행 절차에 포함하지 않는다. 최초 V1 마이그레이션은 빈 개발 DB를 대상으로 하며 기존 타 서비스 DB에 적용하지 않는다.

Linux 검사 명령은 `bash ./gradlew check build`다. CI는 [GitHub Actions](https://github.com/mxxdone/mirinae-market/actions/workflows/backend.yml)에서 동일한 gate를 실행한다. 실행별 결과와 JUnit·PMD 보고서는 Actions에서 확인한다.

## 데모

`demo` 프로필에서만 아래 계정과 시장·매장이 생성된다. 비밀번호는 모두 `Demo1234!`다. 생성은 재기동 시 중복되지 않으며 기존 계정과 충돌하면 해당 계정을 변경하지 않고 기동이 실패한다. 데모 프로필을 끄는 것은 이미 저장한 데이터를 삭제하는 기능이 아니다.

| 로그인 ID | 역할 | 시장·매장 |
|---|---|---|
| demo_buyer | 구매자 | 없음 |
| demo_seller_a | 판매자 | 미리내시장 · 미리내청과 |
| demo_seller_b | 판매자 | 은하시장 · 은하수산 |

이메일은 example.com 데모 주소다. 실제 메일 발송·소유 확인·비밀번호 재설정·소셜 로그인은 제공하지 않는다.

## HTTP 확인

- 기동 상태: `http://localhost:8080/actuator/health`
- OpenAPI: `http://localhost:8080/v3/api-docs`
- Swagger UI: `http://localhost:8080/swagger-ui/index.html`

세션 쿠키를 유지하고 CSRF 토큰을 변경 요청 헤더에 보낸다. 가입은 JSON, 로그인은 폼 데이터다. 로그인·로그아웃 후에는 새 CSRF 토큰을 조회한다. 예시는 데모 프로필로 실행한 서버를 대상으로 한다.

```powershell
$apiBase = 'http://localhost:8080'
$tokenResponse = Invoke-WebRequest "$apiBase/api/auth/csrf" -SessionVariable marketSession
$csrf = ($tokenResponse.Content | ConvertFrom-Json).token
Invoke-WebRequest "$apiBase/api/auth/login" -Method Post -WebSession $marketSession `
  -Headers @{ 'X-CSRF-TOKEN' = $csrf } `
  -Body @{ loginId = 'demo_buyer'; password = 'Demo1234!' }
Invoke-RestMethod "$apiBase/api/auth/me" -WebSession $marketSession
$csrf = (Invoke-RestMethod "$apiBase/api/auth/csrf" -WebSession $marketSession).token
Invoke-WebRequest "$apiBase/api/auth/logout" -Method Post -WebSession $marketSession `
  -Headers @{ 'X-CSRF-TOKEN' = $csrf }
```

매장 ID는 DB가 발급한다. 판매자 계정으로 로그인한 뒤 해당 매장 ID로 `/api/seller/stores/{storeId}`를 조회한다. 다른 판매자의 매장과 구매자 접근은 403, 미로그인은 401이다. 각 API의 입력·응답·실패 계약은 Swagger UI에서 확인한다.

## 검증 범위

`check`는 Spotless·컴파일 경고 실패·PMD·ArchUnit·JUnit을 실행한다. 핵심 업무 Unit은 가입 규칙·소유권을 검증한다. 통합 테스트는 Mock DB 없이 Testcontainers PostgreSQL에서 Flyway·JPA와 실제 임의 포트 서버의 쿠키·CSRF·인증·인가·동시 중복 가입을 검증한다. Docker 실패 시 테스트를 skip하지 않는다.

화면의 핵심 흐름은 실제 백엔드와 PostgreSQL을 포함한 Playwright로 검증한다. HTTP 통합 테스트와 브라우저 검증은 구분한다. 로컬 검증 로그는 Git에서 제외한 `.local/verification/`에 둔다.

## 프런트엔드 실행

Node.js 24와 npm을 사용한다. 위의 백엔드를 먼저 실행한 뒤 별도 터미널에서 시작한다.

```powershell
cd frontend
npm ci
npm run dev

# 정적 검사·단위 테스트 및 배포 번들 생성
npm run check
npm run build
```

브라우저 주소는 `http://127.0.0.1:5173`이다. `/api`와 `/actuator`는 Vite가 백엔드로 전달한다. 기본 대상은 `http://127.0.0.1:8080`이며 다른 백엔드를 사용할 때는 개발 서버 실행 전에 `$env:BACKEND_URL`을 지정한다. 인증 정보를 브라우저 저장소에 보관하지 않으며 새로고침 시 서버 세션으로 현재 사용자를 복원한다.

가입 후 로그인은 별도로 수행한다. 판매자는 로그인 후 서버 세션에 연결된 담당 매장을 자동으로 확인한다. 매장 번호를 입력할 필요가 없다. 아래 DB 조회는 E2E 기대값 확인용이며 사용자 화면의 입력 절차가 아니다.

```powershell
docker compose exec postgres psql -U mirinae -d mirinae -c "SELECT s.id, a.login_id, s.name FROM stores s JOIN accounts a ON a.id = s.owner_account_id ORDER BY s.id;"
```

## 브라우저 연동 검증

데모 프로필 백엔드를 준비하고 테스트 실행 환경에 계정 정보와 실제 매장 번호를 제공한다. 환경 값 누락이나 백엔드·DB 장애를 skip으로 처리하지 않는다. 테스트 가입 정보는 매 실행마다 고유하게 생성하므로 운영 DB를 대상으로 실행하지 않는다.

```powershell
cd frontend
$env:E2E_BUYER_LOGIN_ID = Read-Host '데모 구매자 로그인 ID'
$env:E2E_SELLER_A_LOGIN_ID = Read-Host '데모 판매자 A 로그인 ID'
$env:E2E_SELLER_B_LOGIN_ID = Read-Host '데모 판매자 B 로그인 ID'
$env:E2E_DEMO_PASSWORD = Read-Host '데모 계정 비밀번호'
$env:E2E_STORE_A_ID = Read-Host '판매자 A 매장 번호'
$env:E2E_STORE_B_ID = Read-Host '판매자 B 매장 번호'

# 설치된 Edge를 사용하는 Windows 로컬 검증
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

Chromium을 별도로 설치하는 환경에서는 `npx playwright install chromium`을 실행하고 `PLAYWRIGHT_CHANNEL`을 지정하지 않는다. Playwright는 Vite를 시작하며 백엔드는 위 절차로 준비한다. `BACKEND_URL`을 변경했다면 Vite도 같은 값으로 다시 실행한다. 테스트 결과는 `frontend/playwright-report/`와 `frontend/test-results/`에 생성된다.

프런트엔드 CI는 `.github/workflows/frontend.yml`에서 검사·빌드와 실제 PostgreSQL·백엔드·브라우저 검증을 수행한다. 저장소에 `FRONTEND_TEST_DB_PASSWORD`, `E2E_BUYER_LOGIN_ID`, `E2E_SELLER_A_LOGIN_ID`, `E2E_SELLER_B_LOGIN_ID`, `E2E_DEMO_PASSWORD` GitHub Secrets를 설정해야 한다. 계정은 위 데모 프로필과 일치해야 하며 DB 비밀번호는 CI의 독립 테스트 DB용이다. 원격 CI 결과는 로컬 통과와 별도로 확인한다.
