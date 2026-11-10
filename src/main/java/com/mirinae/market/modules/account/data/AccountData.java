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

  public void withdraw(long id, String hash, String email, java.time.Instant now) {
    if (jdbc.update(
            "UPDATE accounts SET withdrawn_at=?,display_name='탈퇴회원',email=?,password_hash=?,contact_name=NULL,contact_phone=NULL WHERE id=? AND role='BUYER' AND withdrawn_at IS NULL",
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
