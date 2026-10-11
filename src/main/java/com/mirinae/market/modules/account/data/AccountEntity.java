package com.mirinae.market.modules.account.data;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "accounts")
class AccountEntity {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "login_id", nullable = false, length = 20, unique = true)
  private String loginId;

  @Column(name = "password_hash", nullable = false, length = 100)
  private String passwordHash;

  @Column(name = "display_name", nullable = false, length = 10)
  private String displayName;

  @Column(nullable = false, length = 254, unique = true)
  private String email;

  @Column(nullable = false, length = 6)
  private String role;

  protected AccountEntity() {}

  AccountEntity(
      String loginId, String passwordHash, String displayName, String email, String role) {
    this.loginId = loginId;
    this.passwordHash = passwordHash;
    this.displayName = displayName;
    this.email = email;
    this.role = role;
  }

  AccountRow toRow() {
    return new AccountRow(id, loginId, passwordHash, displayName, email, role);
  }
}
