package com.mirinae.market.modules.account.data;

import java.util.Optional;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class AccountData {
  private final AccountJpaRepository repository;

  AccountData(AccountJpaRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public Optional<AccountRow> findByLoginId(String loginId) {
    return repository.findByLoginId(loginId).map(AccountEntity::toRow);
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
