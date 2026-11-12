package com.mirinae.market.modules.account.data;

import java.util.Optional;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class AccountData {
  private final AccountJpaRepository repository;
  private final org.springframework.jdbc.core.JdbcTemplate jdbc;

  AccountData(AccountJpaRepository repository, org.springframework.jdbc.core.JdbcTemplate jdbc) {
    this.jdbc = jdbc;
    this.repository = repository;
  }

  public MemberRow member(String loginId) {
    return jdbc
        .query("SELECT * FROM accounts WHERE login_id=?", (rs, n) -> memberRow(rs), loginId)
        .stream()
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("계정을 찾을 수 없습니다."));
  }

  public java.util.List<MemberRow> members(String role, String query, int page) {
    return jdbc.query(
        "SELECT * FROM accounts WHERE role=? AND (position(lower(?) in lower(login_id))>0 OR position(lower(?) in lower(coalesce(contact_name,display_name)))>0 OR position(lower(?) in lower(email))>0) ORDER BY id DESC LIMIT 51 OFFSET ?",
        (rs, n) -> memberRow(rs),
        role,
        query,
        query,
        query,
        page * 50);
  }

  private static MemberRow memberRow(java.sql.ResultSet rs) throws java.sql.SQLException {
    return new MemberRow(
        rs.getLong("id"),
        rs.getString("login_id"),
        rs.getString("display_name"),
        rs.getString("role"),
        rs.getString("email"),
        rs.getString("contact_name"),
        rs.getString("contact_phone"),
        rs.getBoolean("password_change_required"));
  }

  public void sellerContact(long id, String name, String phone, String email) {
    if (jdbc.update(
            "UPDATE accounts SET contact_name=?,contact_phone=?,email=? WHERE id=? AND role='SELLER'",
            name,
            phone,
            email,
            id)
        != 1) throw new IllegalArgumentException("판매자를 찾을 수 없습니다.");
  }

  public MemberRow lockMember(long id) {
    return jdbc
        .query("SELECT * FROM accounts WHERE id=? FOR UPDATE", (rs, n) -> memberRow(rs), id)
        .stream()
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("계정을 찾을 수 없습니다."));
  }

  public void requirePasswordChange(long id) {
    jdbc.update("UPDATE accounts SET password_change_required=true WHERE id=?", id);
  }

  public void password(long id, String hash) {
    jdbc.update(
        "UPDATE accounts SET password_hash=?,password_change_required=false WHERE id=?", hash, id);
  }

  @Transactional(readOnly = true)
  public Optional<AccountRow> findByLoginId(String loginId) {
    return jdbc
        .query(
            "SELECT id,login_id,password_hash,display_name,email,role FROM accounts WHERE login_id=?",
            (rs, n) ->
                new AccountRow(
                    rs.getLong("id"),
                    rs.getString("login_id"),
                    rs.getString("password_hash"),
                    rs.getString("display_name"),
                    rs.getString("email"),
                    rs.getString("role")),
            loginId)
        .stream()
        .findFirst();
  }

  public boolean active(String loginId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM accounts WHERE login_id=? AND withdrawn_at IS NULL)",
            Boolean.class,
            loginId));
  }

  public boolean activeBuyer(long id) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM accounts WHERE id=? AND role='BUYER' AND withdrawn_at IS NULL)",
            Boolean.class,
            id));
  }

  /** 인증 판단용 계정 상태를 조회한다. 없는 계정은 비어 있고 DB 장애는 저장소 예외로 구분한다. */
  public Optional<AccountAuthRow> authById(long id) {
    try {
      return jdbc
          .query(
              "SELECT id,login_id,password_hash,display_name,role,withdrawn_at IS NULL AS active,auth_version FROM accounts WHERE id=?",
              (rs, n) -> authRow(rs),
              id)
          .stream()
          .findFirst();
    } catch (org.springframework.dao.DataAccessException exception) {
      throw new AccountStorageUnavailableException(exception);
    }
  }

  public Optional<AccountAuthRow> authByLoginId(String loginId) {
    try {
      return jdbc
          .query(
              "SELECT id,login_id,password_hash,display_name,role,withdrawn_at IS NULL AS active,auth_version FROM accounts WHERE login_id=?",
              (rs, n) -> authRow(rs),
              loginId)
          .stream()
          .findFirst();
    } catch (org.springframework.dao.DataAccessException exception) {
      throw new AccountStorageUnavailableException(exception);
    }
  }

  private static AccountAuthRow authRow(java.sql.ResultSet rs) throws java.sql.SQLException {
    return new AccountAuthRow(
        rs.getLong("id"),
        rs.getString("login_id"),
        rs.getString("password_hash"),
        rs.getString("display_name"),
        rs.getString("role"),
        rs.getBoolean("active"),
        rs.getLong("auth_version"));
  }

  /** 같은 이메일의 활성 계정 ID를 찾는다. 소유 확인 전 후보 정보를 노출하지 않는다. */
  public Optional<Long> activeAccountIdByEmail(String normalizedEmail) {
    return jdbc
        .query(
            "SELECT id FROM accounts WHERE email=? AND withdrawn_at IS NULL",
            (rs, n) -> rs.getLong(1),
            normalizedEmail)
        .stream()
        .findFirst();
  }

  public java.util.List<String> identityProviders(long accountId) {
    return jdbc.query(
        "SELECT provider FROM social_identities WHERE account_id=? ORDER BY provider",
        (rs, n) -> rs.getString(1),
        accountId);
  }

  public String identitySubject(long accountId, String provider) {
    return jdbc.queryForObject(
        "SELECT subject FROM social_identities WHERE account_id=? AND provider=?",
        String.class,
        accountId,
        provider);
  }

  /** 제공자 신원으로 연결된 활성 계정 ID를 조회한다. */
  public Optional<Long> activeAccountIdByIdentity(String provider, String subject) {
    return jdbc
        .query(
            "SELECT a.id FROM social_identities s JOIN accounts a ON a.id=s.account_id WHERE s.provider=? AND s.subject=? AND a.withdrawn_at IS NULL",
            (rs, n) -> rs.getLong(1),
            provider,
            subject)
        .stream()
        .findFirst();
  }

  public Optional<Long> identityAccountId(String provider, String subject) {
    return jdbc
        .query(
            "SELECT account_id FROM social_identities WHERE provider=? AND subject=?",
            (rs, n) -> rs.getLong(1),
            provider,
            subject)
        .stream()
        .findFirst();
  }

  /** 소셜 신원을 연결한다. 동시 연결 경쟁은 (provider,subject) 유일성으로 한 건만 남는다. */
  public void connectIdentity(
      long accountId, String provider, String subject, java.time.Instant now) {
    try {
      jdbc.update(
          "INSERT INTO social_identities(account_id,provider,subject,connected_at) VALUES (?,?,?,?)",
          accountId,
          provider,
          subject,
          java.sql.Timestamp.from(now));
    } catch (DataIntegrityViolationException exception) {
      if (exception.getMostSpecificCause() instanceof java.sql.SQLException sql
          && "23505".equals(sql.getSQLState())) {
        throw new DuplicateAccountDataException(exception);
      }
      throw exception;
    }
  }

  public void removeIdentities(long accountId) {
    jdbc.update("DELETE FROM social_identities WHERE account_id=?", accountId);
  }

  /** 비밀번호 없는 소셜 구매자 계정을 만든다. */
  @Transactional
  public AccountAuthRow createSocial(String loginId, String displayName, String email) {
    try {
      AccountEntity entity =
          repository.saveAndFlush(new AccountEntity(loginId, null, displayName, email, "BUYER"));
      return authById(entity.getId()).orElseThrow();
    } catch (DataIntegrityViolationException exception) {
      if (exception.getMostSpecificCause() instanceof java.sql.SQLException sql
          && "23505".equals(sql.getSQLState())) {
        throw new DuplicateAccountDataException(exception);
      }
      throw exception;
    }
  }

  /** 계정 인증 버전을 증가시켜 모든 기기의 기존 토큰을 이후 요청부터 거절한다. */
  public long bumpAuthVersion(long accountId) {
    return jdbc.queryForObject(
        "UPDATE accounts SET auth_version=auth_version+1 WHERE id=? RETURNING auth_version",
        Long.class,
        accountId);
  }

  public void withdraw(long id, String hash, String email, java.time.Instant now) {
    if (jdbc.update(
            "UPDATE accounts SET withdrawn_at=?,display_name='탈퇴회원',email=?,password_hash=?,contact_name=NULL,contact_phone=NULL,auth_version=auth_version+1 WHERE id=? AND role='BUYER' AND withdrawn_at IS NULL",
            java.sql.Timestamp.from(now),
            email,
            hash,
            id)
        != 1) throw new IllegalStateException("탈퇴할 수 있는 계정을 찾을 수 없습니다.");
  }

  @Transactional(readOnly = true)
  public boolean loginIdExists(String loginId) {
    return repository.existsByLoginId(loginId);
  }

  @Transactional
  public AccountRow create(
      String loginId, String hash, String displayName, String email, String role) {
    try {
      return repository
          .saveAndFlush(new AccountEntity(loginId, hash, displayName, email, role))
          .toRow();
    } catch (DataIntegrityViolationException exception) {
      // 입력 검증 이후에도 동시 가입의 유일성은 DB 제약으로 보장한다.
      if (exception.getMostSpecificCause() instanceof java.sql.SQLException sql
          && "23505".equals(sql.getSQLState())) {
        throw new DuplicateAccountDataException(exception);
      }
      throw exception;
    }
  }
}
