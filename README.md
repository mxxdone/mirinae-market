# 미리내 마켓

Java 21 · Spring Boot 4.1.1 백엔드와 React · TypeScript · Vite 프런트엔드다. PostgreSQL·Flyway·구매자 가입·서버 세션 인증과 판매자 본인 매장 조회를 제공한다. 상품 등록·수정·삭제, 통합 판매 표의 오늘 판매 일괄 적용, 시장 검색·단위당 보조 가격을 제공한다. 주문·결제는 후속 페이즈다.

- 구조·검사 규칙: [AGENTS.md](AGENTS.md)
- 요구사항·계정 입력 규칙·API 계약: [SPEC.md](SPEC.md)
- 진행 상태: `PLAN.md`(프로젝트 루트의 로컬 계획)
- 서비스 맥락·용어: [docs/CONTEXT.md](docs/CONTEXT.md)
- 설계 결정과 이유: [docs/ADR.md](docs/ADR.md)

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

서버 실행 중 다시 빌드할 때는 실행할 jar를 별도 경로로 복사해 사용한다. 실행 중인 `build/libs/` jar를 덮어쓰면 이후 클래스 로딩이 실패할 수 있다. 현재 로컬 시연은 별도 jar로 실행하며 화면 주소는 `http://127.0.0.1:5175`다. 이 주소는 기본 개발 포트 5173과 구분한다.

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

`check`는 Spotless·컴파일 경고 실패·PMD·ArchUnit·JUnit을 실행한다. 핵심 업무 Unit은 가입·소유권·상품·단위·시간·일괄 판매 입력 규칙을 검증한다. 통합 테스트는 Mock DB 없이 Testcontainers PostgreSQL과 실제 임의 포트 서버에서 저장·조회·쿠키·CSRF·인가·동시 변경·일괄 저장의 롤백을 검증한다. Docker 실패 시 테스트를 skip하지 않는다.

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

테스트용 DB를 연결한 백엔드는 `demo,e2e` 프로필과 `--e2e.fixed-instant=2026-10-13T03:00:00Z`로 실행한다. 브라우저도 동일한 시각을 사용하며 실제 HTTP·PostgreSQL·세션 인증을 검증한다. 일반 시연 서버는 `demo` 프로필만 사용해 실제 시간으로 동작한다. 테스트 환경에 계정 정보와 실제 매장 번호를 제공한다. 설정 누락이나 잘못된 고정 시각·백엔드·DB 장애는 실패하며 skip하지 않는다. 테스트 가입 정보는 매 실행마다 고유하게 생성하므로 운영 DB를 대상으로 실행하지 않는다.

```powershell
cd frontend
$env:E2E_FIXED_INSTANT = '2026-10-13T03:00:00Z'
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

## 오늘 판매 등록·검색

데모 판매자로 로그인하고 본인 매장 번호를 지정한다. 기존 HTTP 예시의 로그인 ID를 demo_seller_a로 바꾼 뒤 로그인 후 CSRF 토큰을 다시 조회한다. 상품명과 판매 구성 숫자는 별도이며 상품명을 분석해 숫자를 추출하지 않는다.

```powershell
$storeId = Read-Host '본인 매장 번호'
$ownedStore = Invoke-RestMethod "$apiBase/api/seller/stores/$storeId" -WebSession $marketSession
$headers = @{ 'X-CSRF-TOKEN' = $csrf }
$pickupDate = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Korea Standard Time').ToString('yyyy-MM-dd')

$product = Invoke-RestMethod "$apiBase/api/seller/stores/$storeId/products" -Method Post `
  -WebSession $marketSession -Headers $headers -ContentType 'application/json' `
  -Body (@{ name = '국내산 양파 3kg'; description = '한 봉지'; unitType = 'WEIGHT'; unitAmount = 3000 } | ConvertTo-Json)
# 주문 마감은 현재 한국 시간보다 늦게, 주문 마감 ≤ 수령 시작 < 수령 마감으로 지정
Invoke-WebRequest "$apiBase/api/seller/stores/$storeId/sales/$pickupDate" -Method Put `
  -WebSession $marketSession -Headers $headers -ContentType 'application/json' `
  -Body (@{ orderDeadline = '20:00'; startTime = '21:00'; endTime = '23:00'; products = @(
    @{ productId = $product.id; selling = $true; priceWon = 9000; onlineQuantity = 20 }
  ) } | ConvertTo-Json -Depth 4)
Invoke-RestMethod "$apiBase/api/seller/stores/$storeId/sales/${pickupDate}?page=0&size=20" -WebSession $marketSession
$query = [Uri]::EscapeDataString('양파')
Invoke-RestMethod "$apiBase/api/markets/$($ownedStore.marketId)/offers?query=$query" -WebSession $marketSession
```

이 조회는 포장 가격 9,000원과 표시용 100g당 300.00원을 함께 반환한다. 개수 방식은 COUNT와 한 판매 단위에 포함된 개수를 입력하고 1개당 가격을 표시한다. 구매 수량은 후속 주문에서 포장 개수로 취급한다. 자동 상품 묶기·가격 정렬은 제공하지 않는다. 시장 선택·검색·상세에는 로그인이 필요하다.

같은 매장·수령일의 모든 상품은 공통 시간을 사용한다. `/sales/{pickupDate}`는 공통 시간과 수정한 상품을 한 번에 적용하고 성공 시 본문 없는 204를 반환한다. 미포함 상품은 유지하며 `products`가 빈 배열이면 시간만 변경한다. 행 오류는 `SALE_BATCH_INVALID`와 `issues(productId,message)`로 안내하고 시간·다른 상품도 전부 미적용한다. 상세 요청·실패 계약은 Swagger UI와 Spec을 참조한다.

`selling=false`로 적용하면 오늘 판매만 중단하고 상품·제안 ID·가격·수량·이력을 보존한다. 다시 판매하면 같은 제안 ID를 사용한다. 판매 중인 수량 0은 공개 목록에 남는 품절이다. 기존 단건 판매·시간 API도 유지하며 단건 판매 저장은 중단된 제안을 다시 활성화한다. 판매 제안이 있는 상품의 이름·판매 구성 변경은 새 상품으로 등록하고 설명은 수정할 수 있다. 한국 시간 기준 당일만 판매하며 주문 마감 정각부터 판매 조건 수정과 구매자 공개가 종료된다. 다음 날은 수동 공개한다.

검증은 실제 HTTP·PostgreSQL에서 등록 → 일괄 공개 → 구매자 검색·상세, 역할/소유권·CSRF·시장 격리·환산·입력 오류·트랜잭션 롤백·동시 변경·중단/재공개를 확인한다. 브라우저 E2E도 자체 백엔드에 연결하며 서버·브라우저 시간은 고정한다. 통신 실패 시나리오는 브라우저 요청 실패를 주입하며 HTTP·DB·인증의 정상 흐름은 실제 연동이다. 최종 결과와 재실행 범위는 PLAN을 참조한다. 주문·결제 연동은 후속 페이즈다.

## Phase 3 DB 변경과 복구

V2는 상품·수령 시간·판매 조건 테이블을 추가한다. V3·V4는 상품 삭제 표시와 주문 마감을 추가하고 기존 시간의 마감을 수령 시작으로 채운다. V5는 판매 활성 여부를 추가하며 기존 판매 제안은 활성 상태로 유지한다. 이전 마이그레이션과 기존 데이터는 보존한다.

적용 전에는 `pg_dump`로 현재 DB를 백업하고 이전 jar를 보관한다. 백업은 실제 스키마·데이터를 담으며 Flyway SQL 파일과 구분한다. 복구 전 현재 데이터를 추가 백업한 뒤 서비스를 중지하고 적용 전 백업을 별도 DB에 복원·검증한다. 이후 복원 DB와 그 버전에 맞는 앱으로 연결을 전환한다. 이전 앱은 상품 삭제·판매 중단 표시를 무시하므로 V5 적용 DB에 이전 jar만 연결해 공개하지 않는다. Flyway 이력을 수동 수정하거나 테이블을 삭제하지 않는다. 제약은 ADR-005·ADR-006, 로컬 백업·복원 검증 증거는 PLAN을 참조한다.

## Phase 3 화면 사용

구매자는 로그인한 계정 화면에서 **시장 상품 둘러보기**를 선택한다. 시장·상품명 검색, 포장 가격/100g당·1개당 보조 가격, 매장별 주문 마감·수령 시간과 상세를 확인한다. 목록은 20개씩 번호로 이동하며 현재 페이지를 강조하고 상세에서 브라우저 뒤로·앞으로·새로고침을 지원한다.

판매자의 **판매 관리**는 20개씩 조회하는 통합 표다. 상품 추가·상품명 또는 수정 버튼은 별도 등록/수정 화면으로 이동하고 저장 후 표로 돌아온다. 상품 저장만으로 판매를 시작하지 않는다. 중량은 g/kg 선택과 숫자로 입력하며 서버 전송 전에 정확히 g로 변환한다. 상품 단건 삭제는 수정 화면 하단에서 확인하고 기록을 보존한다. **매장 정보**는 별도 메뉴다.

표에서 판매할 상품을 체크하고 포장 가격·온라인 수량을 입력한다. 매장 공통 주문 마감·수령 시간을 확인한 뒤 **변경 사항 적용**을 누르면 함께 저장한다. 체크 해제는 오늘 판매 중단이며 상품 삭제와 구분한다. 오류가 있으면 전체 미적용하고 입력과 오류 행을 유지한다. 페이지·매장 정보 화면 이동 중 작성값을 유지하며 명시적 새로고침으로 작성값을 버릴 때는 확인한다. 화면 자체 새로고침은 저장된 서버 값을 복원한다.

세션 만료는 개인·매장 상태와 이전 CSRF를 폐기하고 재로그인을 안내한다. 전송 실패를 성공으로 표시하거나 변경 요청을 자동 재전송하지 않는다.

기존 개발·시연 서버를 보존하며 별도 E2E를 실행할 때는 사용하지 않는 포트(예: `$env:E2E_PORT = '5176'`)와 `$env:BACKEND_URL`을 지정한다. 테스트는 시연 DB와 구분한 전용 DB·백엔드를 사용하고 앞서 설명한 데모 계정 환경 변수도 제공한다. CI와 미지정 환경은 5173을 사용한다. 화면 검증 PNG는 Git에서 제외한 `output/playwright/`에 생성된다.


## Phase 4 장바구니·통합 모의 결제

구매자 시장 화면의 상품 상세에서 **장바구니 담기**를 선택한다. 장바구니에서 포장 수량을 적용하고 매장별 수령 조건을 확인한 뒤 **통합 모의 결제**를 실행한다. 장바구니는 서버에 저장하며 재고를 선점하지 않는다. 다른 시장 상품을 담기 전에는 기존 장바구니를 비운다. 가격·시간 변경 안내가 있으면 **변경 조건 확인·수량 적용**으로 재확인한다.

모의 유형은 성공·실패·지연·성공 후 응답 유실이다. 결과가 불확실하면 새 결제를 시작하지 않고 **결제 결과 확인**으로 같은 요청을 조회한다. 서버가 요청을 받지 않은 것으로 조회되면 같은 요청으로 명시적 재시도를 제공한다. 확정 결과에는 통합 주문 번호·총액과 매장별 상품·수량·수령 시간이 표시된다. 실제 결제 금액은 청구하지 않는다.

판매자 수량 수정은 조회한 재고 버전을 함께 보내며, 오래된 입력은 전체 409로 거절한다. 작성값을 확인하고 명시적으로 최신 수량을 다시 조회한다. 확정 주문이 있으면 해당 날짜의 매장 공통 시간은 변경할 수 없다. 계약과 오류 코드는 Spec·Swagger UI, 설계 이유는 ADR-007을 따른다.

V6는 재고 버전·주문 이후 시간 고정 표시와 장바구니·결제·주문 테이블을 추가한다. V1~V5는 수정하지 않는다. DB 변경 전 백업·별도 DB 복원과 이전 앱 복구 순서는 기존 Phase 3 절차를 따르며, 주문 이후 수량 수정 계약이 다른 이전 앱을 V6 DB에 직접 연결해 운영하지 않는다. 이번 기능의 시연 DB 적용과 배포는 별도 작업이다.

브라우저 E2E의 두 매장 통합 결제는 전용 테스트 판매자 fixture가 필요하다. 기존 데모 프로필이 기동한 **테스트 DB**에 아래 fixture를 적용한다. 기존 시연·운영 DB에 적용하지 않는다. 원격 CI도 동일 fixture를 사용하며 실제 결과는 Actions에서 확인한다.

```powershell
Get-Content frontend/e2e/fixtures/checkout.sql -Raw | docker exec -i $testContainer psql -U $testDbUser -d $testDbName -v ON_ERROR_STOP=1 --set "source_seller_a=$env:E2E_SELLER_A_LOGIN_ID" --set "source_seller_b=$env:E2E_SELLER_B_LOGIN_ID"
```

fixture는 기존 테스트 판매자의 비밀번호 해시를 복사해 같은 테스트 비밀번호로 로그인한다. 별도의 두 판매자와 공유 시장을 만들고 기존 두 시장·판매자 데이터는 유지한다. `$testContainer`, `$testDbUser`, `$testDbName`은 준비한 독립 테스트 DB의 값으로 지정한다. 기존 E2E 환경 변수와 실행 명령은 위 브라우저 검증 절차를 따른다.
