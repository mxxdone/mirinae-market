package com.mirinae.market.modules.auth.business;

/**
 * 인증된 요청의 최소 정보다. 기존 컨트롤러가 사용하는 Principal의 loginId 계약을 그대로 유지하도록 {@link java.security.Principal}을
 * 구현한다. sid는 현재 기기 로그인 정리에만 쓴다.
 */
public record AuthenticatedUser(
    long accountId, String loginId, String role, long authVersion, String sid)
    implements java.security.Principal {

  @Override
  public String getName() {
    return loginId;
  }

  public boolean seller() {
    return "SELLER".equals(role);
  }
}
