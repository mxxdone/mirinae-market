# 미리내 마켓 개발 PLAN

상태: Phase 3 백엔드 푸시 완료. 기존 Phase 2 프런트 스타일로 Phase 3 화면과 실제 백엔드 연결을 구현·검증한다.

## 목표와 참조

백엔드 API와 검증을 먼저 완성한다. 프런트엔드는 별도 작업에서 연결해 시연 서비스를 완성한다. 집계 성능 실험은 동작하는 기준 백엔드를 확보한 뒤 진행하며 프런트엔드 구현과 별개로 수행할 수 있다.

- 요구사항·수용 기준: [Spec](docs/SPEC.md)
- 용어와 설계 이유: [CONTEXT](CONTEXT.md), [ADR](ADR.md)
- 개발·검증·리뷰 규칙: [AGENTS](AGENTS.md)

제품 규칙은 Spec에 유지한다. 이 계획은 구현 순서·남은 일·완료 조건을 관리한다.

## 현재 상태

- 핵심 도메인·스택·세션 인증·한국어 주석·OpenAPI 도입에 합의했다.
- GitHub [mxxdone/mirinae-market](https://github.com/mxxdone/mirinae-market)을 origin으로 연결하고 기존 MIT LICENSE·최초 커밋 위에 main 이력을 유지한다.
- Gradle Wrapper·서버·OpenAPI·검사 gate·로컬 빌드 검증을 완료했다. 실행 방법은 README, 지속 구조·검사 규칙은 AGENTS에 있다.
- GitHub Actions의 [backend workflow](https://github.com/mxxdone/mirinae-market/actions/workflows/backend.yml)가 main push와 PR에서 동일 gate를 실행한다. 실행 결과·검증 보고서는 Actions를 참조한다. branch protection은 별도 미설정이다.
- 구매자 가입·세션 인증·역할/매장 소유권·PostgreSQL/Flyway·데모 기반과 Phase 2 프런트엔드를 구현하고 로컬 검증했다. 상품·주문은 미착수다.
- 중복 초기 설정 문서를 Phase 1에 통합·삭제했고, 백엔드 작업자를 중단했다. 다음 페이즈를 자동으로 시작하지 않는다.

## 페이즈 개요

| Phase | 결과 | 상태 |
|---|---|---|
| 0 | 핵심 요구사항·스택·개발 계획 | 작성 완료, 기능별 세부 계약 잔여 |
| 1 | 실행·빌드·검사 가능한 개발 기반 | 백엔드 완료; 프런트엔드 별도, 원격 CI 연결 |
| 2 | 가입·로그인·권한·데모 기반 | 백엔드 구현·검증 완료; 화면·브라우저 별도 |
| 3 | 상품 등록·검색·가격 비교 | 미착수 |
| 4 | 장바구니·재고 확보·통합 모의 결제 | 미착수 |
| 5 | 취소·환불·수령·미수령 | 미착수 |
| 6 | 원본 기반 판매자 대시보드 | 미착수 |
| 7 | 핵심 시연 서비스 완성 | 미착수 |
| 8 | 집계 성능 측정·개선·포트폴리오 | 미착수 |

## Phase 0 — 요구사항과 작업 계약

목표: 합의 내용을 보존하고 구현에 영향을 주는 미정을 해당 기능 전에 해결한다.

- 전체 스택 논의를 반복하지 않고 Spec·ADR을 기준으로 진행한다.
- 각 페이즈 시작 전 관련 실패·경계 시나리오와 모듈 계약만 보완한다. 모든 미래 기능을 선제 상세 설계하지 않는다.

| 결정 시점 | 남은 계약 |
|---|---|
| Phase 2 전 | 확정: [Spec의 Phase 2 계정·권한 계약](docs/SPEC.md) |
| Phase 3 전 | 품명·규격 비교 기준, 판매 제안 공개 시점, 가격·수량·수령 시간 변경 범위 |
| Phase 4 전 | 재고 확보 유효 시간, 가격 재확인, 결제 성공·중복 요청·응답 유실·00시 경계 처리 |
| Phase 5 전 | 취소 시 재고 반환, 환불 실패·재시도, 수령 코드·시간 경계, 판매 실패 처리 기한 |
| Phase 6 전 | 집계 상태·준비 수량·중복 구매자 정의, 월별 금액 귀속과 환불 반영 기준 |

완료 조건: 각 미정의 결정 시점이 명확하고 해당 작업자 위임 전에 필요한 계약을 확정한다.

## Phase 1 — 개발 기반과 검사 gate

목표: 기능 구현을 반복할 수 있는 실행·검증 환경을 만든다. 아래 작업을 순차 수행하며 빈 제품 모듈·회원/상품/주문 기능을 선제 생성하지 않는다.

### 1.1 백엔드 기동·검사

- 기존 Java 21·Spring Boot 4.1.1·Gradle Wrapper를 재사용한다. 버전을 다시 조사하거나 불필요하게 교체하지 않는다.
- 루트 서버 패키지는 `com.mirinae.market`, 향후 기능 경로는 `modules.<feature>.presentation|business|data`다. 진입점과 `config`는 composition root다.
- Spring MVC·Actuator와 springdoc-openapi로 `/actuator/health`, `/v3/api-docs`, `/swagger-ui/index.html`을 제공한다.
- JUnit 단일 러너에 최소 기동·문서 HTTP 검증을 추가한다. 아직 DB가 없으므로 DB·인증과 Testcontainers는 Phase 2에서 구성한다.
- Google Java Format 기본값의 Spotless check, Java compiler `-Xlint:all`·`-Werror`, PMD의 미사용·오류 가능성·비동기 관련 검사를 실패 gate로 구성한다. 검출 범위·필요 예외를 명시하고 무의미한 style 규칙은 추가하지 않는다.
- ArchUnit을 구성하고 `check`에 format·lint·compile·architecture·test를 연결한다. `build`는 실행 가능한 jar를 생성하며 실패 무시·기본 skip은 금지한다.

### 1.2 아키텍처 차단

- AGENTS의 3계층·모듈 간 허용 방향·순환 금지와 타입 격리·composition root 역참조 금지를 검사한다.
- 모듈 간 공개 Business 진입점은 `business` 패키지 바로 아래의 public 타입이다. Spring 컴포넌트·주입 어노테이션은 필요한 계층에서 허용하되 HTTP/Servlet·JDBC/ORM·외부 SDK는 허용 계층 밖으로 누출하지 않는다.
- 아직 생산 모듈이 없으므로 전용 테스트 fixture로 허용·금지 의존성의 검출을 검증한다. 테스트 fixture를 제품 코드로 생성하지 않는다.
- Java fully-qualified 참조·static import·중간 타입 경유, 계층 건너뛰기·역방향·모듈/클래스 순환을 확인한다.

### 1.3 프런트엔드 — 별도 작업으로 연기

사용자 요청으로 아래 작업은 Phase 1 완료 조건에서 제외하며 지금 구현하지 않는다. 향후 프런트엔드 작업을 요청할 때 수행한다.

- `frontend/`에 React·TypeScript·Vite와 npm lockfile을 구성한다. 최소 화면은 미리내 마켓 제목과 실제 서버 연결 상태를 표시한다.
- UI는 `src/api/`의 일반 타입 기반 HTTP 함수만 호출한다. API 모듈은 UI를 참조하지 않고 클라이언트는 서버 코드·비밀값을 참조하지 않는다.
- Vite 개발 프록시로 `/actuator`와 향후 `/api`를 백엔드에 전달한다. 향후 세션 인증도 동일 출처 API 경로를 사용한다.
- TypeScript strict, ESLint의 미사용·도달 불가·미처리 Promise, Prettier check, import 경계·순환 검사를 `npm run check`에 연결한다.
- import 검사는 상대경로·TS 별칭·재수출 경유에서도 동작해야 한다. `npm run build`로 배포 파일을 생성한다.
- 사용자 흐름이 아직 없으므로 업무 unit·Playwright E2E는 첫 해당 기능에서 추가한다. 초기 화면에 중복 테스트 러너를 도입하지 않는다.

### 1.4 통합·CI·인수인계

- 실제 명령·구조·허용 의존성과 적용 예외를 AGENTS에 추가하되 기존 개발 Rules 전체를 보존한다. Windows 실행 방법은 README에 기록한다.
- `.gitignore`에 로컬 캐시·빌드 산출물·검증 로그를 지정한다. 필요한 증거는 해당 Git 무시 경로에 유지한다.
- GitHub Actions는 같은 gate를 check-only로 실행한다. 원격이 준비되기 전 저장소 생성·push·권한 변경은 하지 않는다.
- 임시 format/lint/type/import 위반·실패 테스트가 실제 실패하는지 확인한 뒤 제거한다. 최종 코드에서 gate·build와 실제 화면/HTTP 응답을 확인한다.
- `규칙 → 설정 파일 → 명령 → 차단 결과`의 핵심 증거·미설정 원격 검사 사유·남은 작업을 이 페이즈 결과에 요약한다. 상세 로그를 문서에 복제하지 않는다.
- task-owned 서버·임시 코드·생성 잡동사니를 정리하고 tracked/untracked 변경을 검토한다.

현재 Phase 1 완료 조건: 최종 backend gate·build와 health·OpenAPI·Swagger 응답이 통과하고 차단 증거가 있다. frontend gate·화면 연결은 별도 작업으로 연기했다. 미실행 검사는 통과로 표시하지 않는다. 기동 테스트를 제품 기능 검증으로 취급하지 않는다.

### Phase 1 결과 · 2026-10-12

- Windows·Temurin 21.0.5에서 `gradlew.bat clean build` 통과. 테스트 20개(기동·문서 HTTP 3, 아키텍처 17), 실패·오류·skip 0.
- 실행 가능한 jar의 health UP, 한국어 제목의 OpenAPI 명세, Swagger UI HTTP 200을 확인했다. 브라우저 렌더링은 미검증이며 제품 기능 수용 검증이 아니다.
- 검사 자체 오류를 성공 처리하던 Gradle PMD 연동을 공식 PMD CLI의 실패 종료 코드 전달로 보완했다. 잘못된 ruleset도 실제 gate 실패를 일으킨다.

| 규칙 | 설정 파일 | 실제 명령 | 차단 결과 |
|---|---|---|---|
| Format | build.gradle · Spotless | spotlessCheck | 임시 형식 위반 실패 |
| 미사용·동시성 lint | config/pmd/pmd-ruleset.xml | pmdMain | PMD exit 4, 미사용 필드·직접 Thread 생성 각각 차단 |
| compile | build.gradle · -Xlint:all/-Werror | compileJava | unchecked 경고가 빌드 실패로 전환 |
| Architecture | ArchitectureRules·StructureRulesTest | test | 생산 JDBC 누출 실패, 개별 계층·모듈·순환·우회 fixture 검출 |
| Test | JUnit | test | 임시 실패 테스트 차단 |
| lint 설정 오류 | build.gradle · PMD CLI | pmdMain | 잘못된 ruleset exit 1 차단 |
| Build | build.gradle | clean build | 정상 복원 후 전체 검사·jar 생성 통과 |

- 임시 위반 코드는 제거했고 이전의 불필요한 fixture는 정리했다. 작업 서버는 종료했다.
- 상세 로그·결과는 Git 무시 경로 `.local/verification/`에 보관한다. 정상 최종 증거는 `final-check-build.log`, `backend-summary.md`와 `build/test-results/test`다.
- 남은 항목: 원격 CI·branch protection(원격 미지정), DB·인증·Testcontainers(Phase 2), 프런트엔드와 브라우저 사용자 흐름(별도 작업).

## Phase 2 — 계정·권한과 데모 기반

목표: 구매자·데모 판매자가 서로 다른 권한으로 실제 DB를 사용하는 서비스에 로그인한다.

- PostgreSQL·Flyway를 연결하고 시장·매장·판매자 데모 데이터를 재현 가능하게 준비한다.
- 구매자 가입, 세션 로그인·로그아웃·현재 사용자와 화면을 연결한다.
- 역할·매장 소유권, 쿠키·CSRF와 프런트엔드 세션 요청을 구현한다. 판매자 가입·승인 화면은 제외한다.
- 첫 DB 기능에 Testcontainers, 첫 완성 로그인 흐름에 Playwright 환경을 추가한다.

완료 조건·검증: 가입·로그인·로그아웃과 중복 계정·잘못된 인증을 검증한다. 미로그인·다른 역할·다른 매장 접근이 거절되고 실제 PostgreSQL 저장·조회·마이그레이션과 브라우저 로그인 흐름이 통과한다.

### Phase 2 결과 · 2026-10-12

- 범위: 백엔드 구현·검증 완료. 입력 계약·수용 기준은 [Spec](docs/SPEC.md)의 Phase 2 계약을 따른다. 사람의 기능 수용 확인은 아직 받지 않았다.
- PostgreSQL 17.10·Flyway V1·JPA 검증과 구매자 가입, 세션 로그인/로그아웃·현재 사용자·CSRF·판매자 역할/매장 소유권을 연결했다. demo 프로필의 시장·매장·계정 초기화는 재기동 시 중복되지 않는다.
- 핵심 규칙 TDD: 구현 전 26개 실패 확인 후 구현·통과. 이후 이메일 최대 길이 검증을 보완했다.
- 최종 명령: Windows Temurin 21.0.5에서 `gradlew.bat spotlessApply check build --console=plain --no-daemon` 통과. 테스트 58개, 실패·오류·skip 0. Spotless·컴파일 경고 실패·PMD·ArchUnit을 유지하고 jar를 생성했다.
- 실제 PostgreSQL과 임의 포트 서버 HTTP로 중복 ID/이메일 경쟁·해시 저장·세션 ID 교체·CSRF 폐기·잘못된 인증·로그아웃 이전 쿠키 차단·타 역할/매장 거절을 검증했다. 같은 DB를 유지한 실제 서버 종료·재기동과 쿠키 HttpOnly/SameSite/Secure 설정·URL 세션 차단도 통과했다.
- 생산 모듈 도입에 따라 빈 선택자 예외를 제거하고 빈 모듈 검사 차단과 기존 양성/음성 fixture를 확인했다. 동시성 테스트의 좁은 PMD 예외 사유는 AGENTS에 기록했다.
- 독립 인증·인가 리뷰의 두 검증 누락을 보완했고 후속 리뷰에서 남은 결함·필수 검증 누락을 발견하지 못했다.
- 최종 증거: `.local/verification/phase2-check-build-4.log`, `phase2-summary.md`, `build/test-results/test`. 실행·데모 방법은 README에 있다. 테스트 서버·임시 DB 컨테이너는 종료됐다. Docker Desktop 엔진은 개발에 사용할 수 있도록 실행 중이다.
- 남은 범위: 프런트엔드·Playwright·사람의 화면 수용 확인, branch protection(미설정). 원격 CI는 아래 저장소·CI 연결 기록을 참조한다. 이번 백엔드 완료 조건에는 화면·브라우저가 포함되지 않는다. Phase 3는 별도 요청을 기다린다.

## Phase 3 — 상품·판매 제안과 가격 비교

### Phase 3 결과 · 2026-10-12

- 기준 커밋 `45dff77`에서 `feat/phase3-backend`와 `.local/worktrees/phase3-backend`로 분리했다. 기존 `feat/phase2-frontend`의 미커밋 변경을 보존했다.
- 사용자 승인으로 자유 상품명·별도 숫자 판매 구성·포장 가격과 단위당 보조 표시를 적용했다. 자동 동일 상품 묶기·가격 정렬은 제외한다. 계약과 AC는 Spec의 Phase 3 항목을 따른다.
- 상품 등록·수정·본인 목록, 날짜별 판매 조건과 공통 매장 수령 시간, 시장 목록·시장별 내일 판매 검색·상세와 한국어 OpenAPI를 연결했다. 추가 전용 V2로 기존 계정·시장·매장 데이터를 보존한다. 트랜잭션 이유와 복구 조건은 ADR-004를 참조한다.
- TDD: 판매 단위 19개, 상품·가격·날짜 규칙 12개의 실제 실패 확인 후 통과. 최종 핵심 업무 Unit 31개다.
- 최종 명령: Windows Java 21에서 `gradlew.bat spotlessApply check build --console=plain --no-daemon` 통과. 전체 98개, 실패·오류·skip 0. Spotless·컴파일 경고 실패·PMD·ArchUnit과 계정·인증·매장 회귀를 유지했다.
- 신규 실제 HTTP/PostgreSQL 흐름 8개와 V1→V2 업그레이드 1개가 통과했다. 등록→즉시 공개→구매자 검색·상세, 역할/소유권·CSRF·시장 격리, literal 검색·페이지, 정상/잘못된 숫자·가격 환산·반올림·품절, 수정 실패 데이터 보존, 자정 경계, 공통 수령 시간, 중복 제안·구성 변경 경쟁과 DB 제약을 확인했다.
- Mock 범위: 업무 Unit은 순수 규칙이다. HTTP·DB·세션 인증은 mock하지 않으며 날짜 경계 HTTP 테스트에서만 Clock을 고정한다. 브라우저·프런트엔드와 주문 동시성은 이번 검증 범위에 포함하지 않는다.
- diff·영향 범위 리뷰에서 타 매장 FK가 중복 제약에 가려지지 않도록 테스트를 분리했고 소수 시간 DB 거절·정확한 반올림 경계·OpenAPI 쿠키+CSRF 결합을 보완했다. 최종 보완본의 필수 gate가 통과했다.
- 상세 증거는 워크트리 `.local/verification/phase3-check-build-final.log`, `phase3-summary.md`, `build/test-results/test`에 있다. 시연·복구 방법은 README를 따른다. 테스트 서버·DB 컨테이너는 종료됐다.
- 남은 항목: 사람의 기능 수용 확인, 원격 CI·PR 리뷰·main 병합, 프런트엔드 화면 연결. 주문 이후 수량·시간 변경과 재고 확보는 Phase 4 계약 확정 때 진행하며 다음 페이즈를 자동 시작하지 않는다.

목표: 판매자가 다음 날 판매할 상품을 등록하고 구매자가 한 시장에서 비교한다.

- 판매자 상품 등록·수정, 날짜별 가격·온라인 수량·수령 시간을 구현한다.
- 시장 선택·자유 상품명 검색·상세와 포장/단위당 보조 가격의 백엔드 API를 제공한다. 화면 연결은 별도 작업이다.
- 판매 단위와 단위당 비교 가격을 표시한다. 다른 규격을 구분하고 현장 재고 관리는 추가하지 않는다.

완료 조건·검증: 단위·가격·수량·날짜·시간 규칙의 정상·실패·경계를 unit으로 검증한다. 매장 소유권과 시장별 데이터 범위를 integration으로 검증하고 판매자 등록 → 구매자 검색·비교 흐름을 확인한다.

## Phase 4 — 장바구니·재고 확보·통합 결제

목표: 여러 매장 상품을 한 번에 모의 결제하고 재고·가격을 보장한다.

- 장바구니 수량 변경, 결제 전 전체 재고 확보·가격 재확인을 구현한다.
- 통합 주문·매장 주문·주문 상품과 결제 시점의 가격·상품 정보를 저장한다.
- 모의 결제의 성공·실패·지연/응답 유실을 재현하고 실패 복구·중복 요청 처리를 구현한다.
- 구매자 결제와 매장별 주문 내역 화면을 연결한다.

완료 조건·검증: 품절·가격 변경·마감 AC를 만족한다. 실제 DB에서 마지막 재고 동시 주문, 부분 확보 실패·롤백·재시도를 검증하고 결제 실패·응답 유실 시 정의된 상태로 수렴한다. 통합 결제 → 매장별 주문 표시 E2E가 통과한다. 동시성 정확성 검증은 후반 성능 실험과 구분한다.

## Phase 5 — 취소·환불·수령 운영

목표: 결제 이후 정상·실패 흐름을 구매자와 판매자가 화면으로 처리한다.

- 일반 취소, 판매 실패 상품 취소·환불, 해당 매장 나머지 취소 선택을 구현한다.
- 환불 요청·완료 상태를 구분하고 모의 환불 실패·재시도를 처리한다.
- 매장별 수령 코드와 일괄 수령, 마감 이후 미수령 처리를 구현한다.
- 판매자의 준비·수령·판매 실패 화면과 구매자의 상태·환불 화면을 연결한다.

완료 조건·검증: 마감·부분 환불·중복 처리·수령/취소 충돌을 unit·integration으로 검증한다. 환불 재시도는 중복 환불을 만들지 않는다. 일부 매장 수령·다른 매장 미수령, 판매 실패 후 해당 매장 전체 취소의 E2E가 통과하고 다른 매장·수령 완료 주문은 영향을 받지 않는다.

## Phase 6 — 정확한 판매자 대시보드

목표: 준비·수령 현황과 주문·구매자·금액 지표를 원본에서 정확히 조회한다.

- 집계 정의를 Spec에 확정한 뒤 원본 조회와 대시보드를 구현한다. 캐시·집계 테이블을 선제 도입하지 않는다.
- 부분/전체 환불, 미수령, 반복 구매자·월 경계가 포함된 기준 데이터로 검증한다.
- 후속 실험에서 비교할 기준 구현과 결과를 식별 가능하게 남긴다.

완료 조건·검증: 각 지표가 원본 기대값과 일치하고 다른 매장 데이터가 섞이지 않는다. 부분 취소·반복 구매자 집계 오류가 없고 주문·환불·수령 후 재조회 결과를 실제 연동에서 확인한다.

## Phase 7 — 시연 서비스 완성

목표: 새 환경에서 핵심 흐름을 재현한다. 첫 서비스 완성 지점이다.

- 화면 연결과 로딩·오류·빈 상태·안내를 정리한다.
- 데모 계정·데이터·시연 순서·실행 방법과 모의 결제 표시를 정리한다.
- 핵심 E2E, 최종 regression·gate·통합 리뷰를 수행한다. 유효한 통과 검증은 불필요하게 반복하지 않는다.

완료 조건·검증: 상품 등록 → 검색·결제 → 수령 → 대시보드를 시연하고 품절·가격 변경·판매 실패·환불·미수령을 재현한다. 실행 안내와 최종 증거가 있고 미충족 필수 검사가 없다. 실제 운영 배포·실결제는 제외한다. 외부 배포를 추가하면 별도 복구·smoke 계획을 세운다.

## Phase 8 — 집계 성능 실험과 개선

목표: 측정한 문제의 해결 과정과 정확성·성능 근거를 포트폴리오로 남긴다.

### 8.1 기준 측정

- 기준 구현·환경·버전·리소스를 고정한다. 예비 규모는 매장 주문 1만 → 10만 → 100만 건이며 자원에 맞춰 조정하고 이유를 기록한다.
- 다수 소규모 매장과 주문 집중 매장, 날짜·반복 구매·취소/환불 분포를 포함한다. 전체 주문이 많다는 이유만으로 매장별 조회도 느리다고 가정하지 않는다.
- 대시보드 단독 조회와 주문·수령·환불이 함께 발생하는 부하를 구분한다.
- API p50/p95/p99·처리량·오류율, SQL 실행 계획·시간, 수집 가능한 DB 자원 지표와 주문 처리 영향을 측정한다.
- 합격 기준·반복 횟수는 실험 전에 정한다. 생성 데이터 실험을 운영 트래픽으로 표현하지 않는다.

### 8.2 병목별 개선

- 근거에 따라 불필요한 count·반복 조회, SQL·인덱스부터 개선한다.
- 부족하면 지표의 최신성 요구를 다시 논의하고 집계 테이블·캐시·배치/증감 방식을 선택한다.
- Redis·큐·복제 DB·파티셔닝은 확인된 병목이나 검증 목적이 있을 때만 검토한다.
- 이중화 도입 시 원본 대사·불일치 검출·복구, 중복 처리·장애 후 재처리를 검증한다.
- 동일 조건으로 재측정하고 조회 개선이 쓰기 지연·정확성에 주는 비용도 비교한다.

### 8.3 포트폴리오 정리

- 문제·측정·대안·선택 이유·전후 결과·한계를 실제 증거로 정리한다.
- 충분히 빠르면 그 결과를 남긴다. 의도적으로 인덱스를 빼거나 요구사항을 늘려 병목을 만들지 않는다.
- 외부 사례의 지연 시간·개선율은 프로젝트 결과로 사용하지 않는다.

완료 조건: 실험이 재현 가능하고 비교가 공정하며 정확성 검증이 유효하다. 병목이 나타나지 않아도 근거와 한계를 기록한다.

## 진행·위임과 차단 요인

- 페이즈별로 완료 결과를 보고한 뒤 멈춘다. 다음 페이즈는 사용자의 별도 구현 요청을 받은 경우에만 시작한다. 사용자가 추가 승인한 Phase 1~2 프런트엔드까지 로컬 구현·검증했다. Phase 3~8 자동 진행은 승인 범위에 포함되지 않는다.

- 실행 순서 변경: 백엔드 API·업무 규칙·DB 검증을 먼저 진행하고 화면 연결은 별도 요청 범위에서 수행한다. Phase 1~2 화면·Playwright 검증은 이번 요청으로 완료했다. 후속 페이즈의 화면 연결은 아직 진행하지 않았다.

- API·화면·관련 검증이 함께 완성되는 작은 작업으로 나눈다. 업무 테스트·integration은 구현 중, 대규모 부하 실험은 시연 완성 후 진행한다.
- Head가 Spec·계약을 검토한 뒤 백엔드/검사는 Paseo Implementation Worker, 화면은 Gemini에 위임한다. 기본은 한 writer씩 순차 진행한다.
- 완료 시 검증·통합 리뷰를 거쳐 이 계획의 상태와 다음 작업을 갱신한다.
- Docker Desktop 엔진 시작·연결 확인 완료(2026-10-12). 실제 PostgreSQL·Testcontainers 검증을 Phase 2에서 통과했다.
- 기본 셸은 `helper_unknown_error: setup refresh had errors`로 실행하지 못했다. 검토 승인된 실행 경로에서 로컬 빌드·검증을 완료했으며 기본 샌드박스 실행 문제 자체는 남아 있다.
- 원격 저장소와 CI workflow를 연결했다. branch protection 설정은 이번 commit·push·CI 확인 범위에 포함하지 않는다.

## 저장소·CI 연결 · 2026-10-12

- 기존 원격 main의 MIT LICENSE 최초 커밋을 보존하고 Phase 1 개발 기반, Phase 2 DB·계정·권한, 제품/실행 문서, CI를 분리한다. force push는 사용하지 않는다.
- 분리한 Phase 1 커밋 후보의 `spotlessApply check build` 통과: 20개, 실패·오류·skip 0. 최종 Phase 2의 `check build`도 통과했고 동일 코드·환경의 유효한 58개 테스트 결과를 재사용했다.
- 로컬 증거: `.local/verification/commit-phase1-check-build.log`, `pre-push-check-build.log`, `phase2-check-build-4.log`. 원격 결과와 JUnit·PMD 보고서는 [backend Actions](https://github.com/mxxdone/mirinae-market/actions/workflows/backend.yml)를 참조한다. 로컬 검증과 원격 검증은 구분한다.
- Phase 2는 구매자 계정·세션 인증·판매자 본인 매장 조회·데모 DB 기반까지다. 시장 선택·상품 등록/검색/가격 비교는 Phase 3이며 아직 구현하지 않았다. 화면·브라우저 검증은 별도 작업이다.

## 다음 구현 요청

현재 범위는 사용자의 푸시 승인에 따라 기능 브랜치 PR·원격 CI를 진행한다. Phase 3 요청을 받으면 품명·규격 비교 기준, 판매 제안 공개 시점과 변경 범위의 관련 계약을 먼저 보완한다. 다음 페이즈를 자동으로 시작하지 않는다.

## Phase 1~2 프런트엔드 · 2026-10-12

- `feat/phase2-frontend`에서 1번의 색감·브랜드와 2번의 분할 구성을 결합해 React·TypeScript 화면을 실제 API에 연결했다. 로그인·가입·완료·계정 요약·판매자 매장 조회를 제공한다.
- Head 리뷰 후 통신 실패를 로그아웃 성공으로 처리하던 문제와 로그인 후 계정 동기화 실패 안내를 개선했다. 오프라인 로그아웃 재시도 회귀 검증을 추가했다. 서버 계약과 다른 E2E 기대 문구·진입 경로를 수정하고 상태·오류 코드를 함께 검증했다.
- 가입 화면의 잘못된 SVG 경로를 제거하고 브라우저 콘솔 회귀 검증을 추가했다. 생성된 Playwright 보고서는 형식 검사 대상에서 제외하며 소스 검사는 유지한다.
- `npm run check`의 타입·lint·형식·의존성 검사와 가입 검증 Unit 17개, `npm run build`가 통과했다. 의존성·HTTP 경계의 임시 위반 입력이 차단되는 것도 확인하고 임시 파일을 제거했다.
- 기존 백엔드 jar와 별도 PostgreSQL 17.10 DB를 사용한 `npm run test:e2e`는 7개 통과, 실패·skip 0. API 응답 mock 없이 실제 서버 세션·CSRF·인가를 사용했다. 최종 로그는 `.local/verification/frontend-final-check.log`, `frontend-final-build.log`, `frontend-e2e.log`다.
- 로그인·가입의 1440px·390px 스크린샷을 검토하고 가로 넘침 없음을 확인했다. 증거는 `.local/design/phase2-hybrid/implementation-*.png`다. 로컬 미리보기는 `http://127.0.0.1:5173/`이며 백엔드는 8081, 전용 테스트 DB는 5433을 사용한다.
- 프런트엔드 CI workflow를 추가했지만 커밋·push·원격 CI 실행은 아직 하지 않았다. 로컬 통과를 원격 CI 통과로 간주하지 않는다. 최초 화면 구현에서는 백엔드 계약을 유지했으며, 아래 보완 작업에서 담당 매장 자동 조회 계약을 추가한다.

## 판매자 담당 매장 자동 조회 보완 · 2026-10-12

- 사용자가 매장 번호 수동 입력 제거를 요청했다. 서버 세션의 계정으로 기존 소유 관계를 조회하는 API를 추가하고, 판매자 로그인·새로고침 후 담당 매장을 자동 표시한다. 기존 번호 지정 조회와 소유권 검사·DB 스키마는 유지한다.
- 매장 자동 조회·미배정 판매자 거부의 HTTP 회귀 테스트와 판매자 A/B 자동 진입·URL 변조·새로고침의 브라우저 회귀 테스트가 기존 코드에서 실패함을 확인했다. 통신 실패 재시도와 세션 만료를 최종 변경에 맞춰 검증한다.
- 최종 백엔드 `spotlessApply check build` 통과: 테스트 60개, 실패·오류·skip 0. 프런트엔드 `check`(Unit 17개 포함)·`build` 통과. 실제 서버·PostgreSQL의 E2E 8개 통과, 실패·skip 0. 자동 매장 조회, 판매자 A/B와 URL 변조, 미배정 판매자 거부, 세션 만료, 통신 실패 재시도를 확인했다. API mock을 사용하지 않았다.
- OpenAPI의 새 경로와 200·401·403 계약을 실제 서버에서 확인했다. 기존 구조·소유권 정책·DB 스키마를 유지했으며 gate와 최종 diff를 검토했다. 증거는 `.local/verification/seller-auto-backend-check-build.log`, `seller-auto-frontend-check.log`, `seller-auto-frontend-build.log`, `seller-auto-e2e.log`다. 실패 재현 증거는 `seller-auto-store-red.log`, `seller-auto-ui-red.log`다.
- 1440px·390px 실제 판매자 화면을 검토했고 매장 번호 입력창 제거와 가로 넘침 없음을 확인했다. 화면 증거는 `.local/design/phase2-hybrid/seller-auto-desktop.png`, `seller-auto-mobile.png`다. 미리보기 서버에 최종 jar를 적용했으며 기존 테스트 DB의 가입 데이터는 유지했다.
- 사용자가 현재 구현 범위의 푸시를 승인했다. 남은 일은 기능 브랜치 커밋·PR·원격 CI 확인이다. 가판대 일러스트 교체와 시장 번호 대신 시장명 표시는 후속 개선 항목이다.
- 원격 E2E 준비: 필요한 GitHub Secrets 5개(`FRONTEND_TEST_DB_PASSWORD`, `E2E_BUYER_LOGIN_ID`, `E2E_SELLER_A_LOGIN_ID`, `E2E_SELLER_B_LOGIN_ID`, `E2E_DEMO_PASSWORD`)가 원격에 등록되어 있음을 확인했다. 이번 작업에서는 비밀값을 등록·변경·삭제하지 않는다. 값의 유효성은 PR의 원격 E2E 통과로 확인하며, 이 상태에서 로컬 통과를 원격 통과로 기록하거나 검사를 생략하지 않는다.
