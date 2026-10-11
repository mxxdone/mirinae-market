package com.mirinae.market.modules.account.business;

import com.mirinae.market.modules.account.data.AccountData;
import com.mirinae.market.modules.account.data.AccountRow;
import com.mirinae.market.modules.account.data.DuplicateAccountDataException;
import java.util.Optional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AccountService {
  private final AccountData data;
  private final PasswordEncoder encoder;

  public AccountService(AccountData data, PasswordEncoder encoder) {
    this.data = data;
    this.encoder = encoder;
  }

  public AccountView signup(String loginId, String password, String displayName, String email) {
    return create(loginId, password, displayName, email, "BUYER");
  }

  private AccountView create(
      String loginId, String password, String displayName, String email, String role) {
    String normalizedEmail = SignupRules.validate(loginId, password, displayName, email);
    try {
      return view(
          data.create(loginId, encoder.encode(password), displayName, normalizedEmail, role));
    } catch (DuplicateAccountDataException exception) {
      throw new DuplicateAccountException(exception);
    }
  }

  public Optional<AccountCredentials> credentials(String loginId) {
    return data.findByLoginId(loginId)
        .map(row -> new AccountCredentials(row.loginId(), row.passwordHash(), row.role()));
  }

  public AccountView current(String loginId) {
    return data.findByLoginId(loginId)
        .map(AccountService::view)
        .orElseThrow(() -> new IllegalArgumentException("계정을 찾을 수 없습니다."));
  }

  public AccountView ensureDemoAccount(
      String loginId, String password, String displayName, String email, String role) {
    Optional<AccountRow> existing = data.findByLoginId(loginId);
    if (existing.isPresent()) {
      AccountRow row = existing.orElseThrow();
      if (!row.role().equals(role)
          || !row.email().equals(email)
          || !encoder.matches(password, row.passwordHash())) {
        throw new IllegalStateException("데모 ID가 기존 계정과 충돌합니다: " + loginId);
      }
      return view(row);
    }
    return create(loginId, password, displayName, email, role);
  }

  private static AccountView view(AccountRow row) {
    return new AccountView(row.id(), row.loginId(), row.displayName(), row.role());
  }
}
