package com.mirinae.market.modules.account.data;

/** 인증 판단에 필요한 계정 상태다. 비밀번호 해시는 소셜 전용 계정에서 null이다. */
public record AccountAuthRow(
    long id,
    String loginId,
    String passwordHash,
    String displayName,
    String role,
    boolean active,
    long authVersion) {

  public boolean hasLocalPassword() {
    return passwordHash != null && !passwordHash.isBlank();
  }
}
