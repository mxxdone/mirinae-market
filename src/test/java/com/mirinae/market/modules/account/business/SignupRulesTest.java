package com.mirinae.market.modules.account.business;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class SignupRulesTest {
  @Test
  void acceptsBoundariesAndNormalizesOnlyEmail() {
    assertThat(SignupRules.validate("a1234", "Pass123!", "가나", " User@Example.com "))
        .isEqualTo("user@example.com");
    assertThat(
            SignupRules.validate(
                "a".repeat(20), "A1!" + "a".repeat(29), "가".repeat(10), "x@example.com"))
        .isEqualTo("x@example.com");
  }

  @Test
  void emailLengthBoundaryAppliesAfterNormalization() {
    String email =
        "a".repeat(64) + "@" + "a".repeat(63) + "." + "b".repeat(63) + "." + "c".repeat(61);
    assertThat(email).hasSize(254);
    assertThat(SignupRules.validate("a_12-", "Pass123!", "한글Ab12", " " + email + " "))
        .isEqualTo(email);
    assertThatIllegalArgumentException()
        .isThrownBy(() -> SignupRules.validate("a1234", "Pass123!", "가나", email + "c"));
  }

  @ParameterizedTest
  @MethodSource("invalidInputs")
  void rejectsInvalidInputs(String loginId, String password, String name, String email) {
    assertThatIllegalArgumentException()
        .isThrownBy(() -> SignupRules.validate(loginId, password, name, email));
  }

  static Stream<Arguments> invalidInputs() {
    return Stream.of(
        Arguments.of(null, "Pass123!", "가나", "a@example.com"),
        Arguments.of("abcd", "Pass123!", "가나", "a@example.com"),
        Arguments.of("a".repeat(21), "Pass123!", "가나", "a@example.com"),
        Arguments.of("ABCDE", "Pass123!", "가나", "a@example.com"),
        Arguments.of("abc d", "Pass123!", "가나", "a@example.com"),
        Arguments.of("abcde", null, "가나", "a@example.com"),
        Arguments.of("abcde", "Pass12!", "가나", "a@example.com"),
        Arguments.of("abcde", "A1!" + "a".repeat(30), "가나", "a@example.com"),
        Arguments.of("abcde", "password1", "가나", "a@example.com"),
        Arguments.of("abcde", "Password!", "가나", "a@example.com"),
        Arguments.of("abcde", "1234567!", "가나", "a@example.com"),
        Arguments.of("abcde", "Pass123! ", "가나", "a@example.com"),
        Arguments.of("abcde", "Pass123!한", "가나", "a@example.com"),
        Arguments.of("abcde", "Pass123!", null, "a@example.com"),
        Arguments.of("abcde", "Pass123!", "가", "a@example.com"),
        Arguments.of("abcde", "Pass123!", "가".repeat(11), "a@example.com"),
        Arguments.of("abcde", "Pass123!", "가 나", "a@example.com"),
        Arguments.of("abcde", "Pass123!", "별명😀", "a@example.com"),
        Arguments.of("abcde", "Pass123!", "가나", null),
        Arguments.of("abcde", "Pass123!", "가나", "bad-email"),
        Arguments.of("abcde", "Pass123!", "가나", "x..y@example.com"),
        Arguments.of("abcde", "Pass123!", "가나", "a@-example.com"),
        Arguments.of("abcde", "Pass123!", "가나", "a".repeat(65) + "@example.com"),
        Arguments.of("abcde", "Pass123!", "가나", "한글@example.com"));
  }
}
