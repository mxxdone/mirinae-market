package com.mirinae.market.modules.auth.business;

/**
 * 인증·인가 실패를 안정적인 코드로 전달한다. HTTP 상태 매핑은 composition root가 담당하며 Business는 HTTP 타입을 참조하지 않는다. flowId는
 * 같은 이메일 후보로 연결 화면을 이어갈 때만 함께 전달한다.
 */
public class AuthException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  private final String code;
  private final String flowId;

  public AuthException(String code, String message) {
    this(code, message, null);
  }

  public AuthException(String code, String message, String flowId) {
    super(message);
    this.code = code;
    this.flowId = flowId;
  }

  public String code() {
    return code;
  }

  public String flowId() {
    return flowId;
  }

  public static AuthException unauthenticated() {
    return new AuthException("UNAUTHENTICATED", "로그인이 필요합니다. 다시 로그인해 주세요.");
  }

  public static AuthException invalidCredentials() {
    return new AuthException("INVALID_CREDENTIALS", "ID 또는 비밀번호가 올바르지 않습니다.");
  }

  public static AuthException refreshReused() {
    return new AuthException("REFRESH_REUSED", "이미 사용한 인증 정보입니다. 다시 로그인해 주세요.");
  }

  public static AuthException unavailable() {
    return new AuthException("AUTH_UNAVAILABLE", "인증 서버를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }

  public static AuthException providerError() {
    return new AuthException("OAUTH_PROVIDER_ERROR", "소셜 로그인 제공자와 통신하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  public static AuthException linkConflict() {
    return new AuthException("LINK_CONFLICT", "이미 다른 계정에 연결된 소셜 계정입니다.");
  }

  /** 같은 이메일의 기존 회원이 있어 가입 대신 연결 화면으로 전환해야 한다. */
  public static AuthException linkRequired(String flowId) {
    return new AuthException("LINK_REQUIRED", "같은 이메일의 기존 계정이 있습니다. 계정 연결을 확인해 주세요.", flowId);
  }

  public static AuthException forbidden() {
    return new AuthException("FORBIDDEN", "요청 권한이 없습니다.");
  }

  public static AuthException invalidInput(String message) {
    return new AuthException("INVALID_INPUT", message);
  }

  public static AuthException flowExpired() {
    return new AuthException("UNAUTHENTICATED", "인증 확인 시간이 지났습니다. 다시 시작해 주세요.");
  }
}
