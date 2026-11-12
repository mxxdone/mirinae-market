package com.mirinae.market.modules.auth.data;

/** OAuth 제공자 호출이 실패했을 때 던진다. Business가 502로 매핑한다. */
public class OAuthProviderUnavailableException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  public OAuthProviderUnavailableException(String message) {
    super(message);
  }

  public OAuthProviderUnavailableException(String message, Throwable cause) {
    super(message, cause);
  }
}
