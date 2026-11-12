package com.mirinae.market.modules.account.business;

/** 인증 판단에 필요한 계정 상태다. 비밀번호 해시는 소셜 전용 계정에서 null이며, auth 기능은 이 값으로 로컬 로그인 가능 여부를 판단한다. */
public record AccountAuthentication(
    long id, String loginId, String role, String passwordHash, boolean active, long authVersion) {

  public boolean hasLocalPassword() {
    return passwordHash != null && !passwordHash.isBlank();
  }
}
