package com.mirinae.market.modules.account.data;

public record AccountRow(
    long id, String loginId, String passwordHash, String displayName, String email, String role) {

  /** 소셜 전용 계정은 로컬 비밀번호가 없다. */
  public boolean hasLocalPassword() {
    return passwordHash != null && !passwordHash.isBlank();
  }
}
