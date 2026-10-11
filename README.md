# 미리내 마켓 백엔드

Java 21 · Spring Boot 4.1.1 · Gradle Wrapper 기반 백엔드다. PostgreSQL·Flyway·구매자 가입·서버 세션 인증과 판매자 매장 소유권을 제공한다. 프런트엔드는 별도 작업이다.

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

화면·Playwright와 상품·주문·결제는 아직 구현하지 않았다. HTTP 흐름 검증은 브라우저 검증과 구분한다. 로컬 검증 로그는 Git에서 제외한 `.local/verification/`에 둔다.