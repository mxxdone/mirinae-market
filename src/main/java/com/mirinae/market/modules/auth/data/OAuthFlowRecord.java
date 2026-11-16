package com.mirinae.market.modules.auth.data;

/**
 * OAuth 진행 중 서버가 확인한 흐름 상태다. 브라우저에는 흐름 ID만 HttpOnly 쿠키로 전달하고, 이 값은 Redis에만 TTL로 보관한다. 제공자가 준 email은
 * 후보 조회·가입 보완용 개인정보이므로 SIGNUP 화면에만 노출하고 다른 흐름에는 싣지 않는다.
 *
 * <p>{@code providerEmailVerified}는 제공자 확인 상태의 참고값이며 서비스의 이메일 소유 확인이 아니다. SIGNUP 화면에만 공개하고
 * LINK·REAUTH·ERROR 및 LOGIN 흐름에는 노출하지 않는다. 기존 Redis 흐름 JSON의 누락·null 상태는 생성 시 false로 정규화한다.
 *
 * <p>위치 인자 실수를 막기 위해 이름 있는 정적 팩터리({@link #loginFlow}, {@link #linkFlow}, {@link #reauthFlow},
 * {@link #errorFlow})와 상태를 바꾸는 {@link #verified()}만 제공한다. 중첩 builder 타입은 클래스 순환 검사를 위반하므로 두지 않는다.
 *
 * @param flowId 흐름 식별자
 * @param status LOGIN·SIGNUP·LINK·REAUTH·ERROR
 * @param purpose 시작 목적(login·link·withdraw)
 * @param provider 방금 인증한 제공자
 * @param subject 방금 인증한 제공자 사용자 식별자
 * @param displayName 제공자가 준 표시 이름
 * @param email 제공자가 준 이메일(후보 조회·가입 보완용, SIGNUP 외 화면 비노출)
 * @param providerEmailVerified 제공자가 명시적으로 확인한 이메일 상태(SIGNUP 화면 참고값)
 * @param candidateAccountId 연결 후보 내부 계정 ID
 * @param candidateAuthVersion 연결 후보의 증명 시점 인증 버전
 * @param sourceProvider 재인증에 사용한 기존 제공자
 * @param sourceSubject 재인증에 사용한 기존 제공자 사용자 식별자
 * @param linkVerified 기존 소셜 재인증 증명 완료 여부
 * @param accountId 재인증 대상 계정 ID
 * @param sid 재인증 대상 로그인 ID
 * @param authVersion 재인증 대상 인증 버전
 * @param message 사용자 안내 문구
 */
public record OAuthFlowRecord(
    String flowId,
    String status,
    String purpose,
    String provider,
    String subject,
    String displayName,
    String email,
    Boolean providerEmailVerified,
    Long candidateAccountId,
    Long candidateAuthVersion,
    String sourceProvider,
    String sourceSubject,
    boolean linkVerified,
    Long accountId,
    String sid,
    Long authVersion,
    String message) {

  /** 이전 흐름에 없는 참고 필드를 미확인으로 정규화하며 다른 역직렬화 검증은 완화하지 않는다. */
  public OAuthFlowRecord {
    providerEmailVerified = Boolean.TRUE.equals(providerEmailVerified);
  }

  /** 로그인 계열 흐름(LOGIN·SIGNUP)이다. */
  public static OAuthFlowRecord loginFlow(
      String flowId,
      String status,
      String provider,
      String subject,
      String displayName,
      String email,
      boolean providerEmailVerified,
      String message) {
    return new OAuthFlowRecord(
        flowId,
        status,
        "login",
        provider,
        subject,
        displayName,
        email,
        providerEmailVerified,
        null,
        null,
        null,
        null,
        false,
        null,
        null,
        null,
        message);
  }

  /** 이메일 후보 연결 안내 흐름이다. 확인 상태는 연결 화면에 공개하지 않으므로 미확인으로 둔다. */
  public static OAuthFlowRecord linkFlow(
      String flowId,
      String provider,
      String subject,
      String email,
      long candidateAccountId,
      Long candidateAuthVersion,
      String sourceProvider,
      String sourceSubject,
      boolean linkVerified,
      String message) {
    return new OAuthFlowRecord(
        flowId,
        "LINK",
        "login",
        provider,
        subject,
        null,
        email,
        false,
        candidateAccountId,
        candidateAuthVersion,
        sourceProvider,
        sourceSubject,
        linkVerified,
        null,
        null,
        null,
        message);
  }

  /** 탈퇴 소셜 재인증 흐름이다. 계정·로그인·인증 버전에 묶는다. */
  public static OAuthFlowRecord reauthFlow(
      String flowId,
      String provider,
      long accountId,
      String sid,
      long authVersion,
      boolean linkVerified,
      String sourceProvider,
      String sourceSubject,
      String message) {
    return new OAuthFlowRecord(
        flowId,
        "REAUTH",
        "withdraw",
        provider,
        null,
        null,
        null,
        false,
        null,
        null,
        sourceProvider,
        sourceSubject,
        linkVerified,
        accountId,
        sid,
        authVersion,
        message);
  }

  /** 사용자에게 보여 줄 ERROR 흐름이다. */
  public static OAuthFlowRecord errorFlow(String flowId, String message) {
    return new OAuthFlowRecord(
        flowId, "ERROR", null, null, null, null, null, false, null, null, null, null, false, null,
        null, null, message);
  }

  /** 소셜 재인증 증명을 완료 처리한다. 원래 후보·계정 binding은 유지한다. */
  public OAuthFlowRecord verified(String verifiedProvider, String verifiedSubject) {
    return new OAuthFlowRecord(
        flowId,
        status,
        purpose,
        provider,
        subject,
        displayName,
        email,
        providerEmailVerified,
        candidateAccountId,
        candidateAuthVersion,
        verifiedProvider,
        verifiedSubject,
        true,
        accountId,
        sid,
        authVersion,
        message);
  }

  /** 흐름 화면에 노출하는 응답이다. 서버 확인 정보만 담고 SIGNUP 외에는 이메일·확인 상태·기존 가입 수단을 숨긴다. */
  public FlowView view() {
    boolean signup = "SIGNUP".equals(status);
    return new FlowView(
        status,
        // 연결·재인증 안내에서는 방금 인증한 제공자도 노출하지 않아 기존 가입 수단을 추정할 수 없게 한다.
        "REAUTH".equals(status) ? null : provider,
        signup ? displayName : null,
        signup ? email : null,
        signup && providerEmailVerified,
        linkVerified,
        message);
  }

  /** 흐름 화면 응답 계약이다. {@code providerEmailVerified}는 SIGNUP에서만 의미가 있다. */
  public record FlowView(
      String status,
      String provider,
      String displayName,
      String email,
      boolean providerEmailVerified,
      boolean linkVerified,
      String message) {}
}
