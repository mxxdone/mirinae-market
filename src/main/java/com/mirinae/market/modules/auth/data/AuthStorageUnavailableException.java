package com.mirinae.market.modules.auth.data;

/** Redis 인증 저장소가 응답하지 않을 때 던진다. Business가 503으로 매핑한다. */
public class AuthStorageUnavailableException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  public AuthStorageUnavailableException(Throwable cause) {
    super("인증 저장소를 사용할 수 없습니다.", cause);
  }
}
