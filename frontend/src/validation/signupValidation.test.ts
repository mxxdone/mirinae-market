import { describe, expect, it } from "vitest";
import {
  validateDisplayName,
  validateEmail,
  validateLoginId,
  validatePassword,
} from "./signupValidation";

describe("signupValidation", () => {
  describe("validateLoginId", () => {
    it("정상 아이디를 허용한다 (5~20자 소문자, 숫자, _, -)", () => {
      expect(validateLoginId("market_lover")).toBeNull();
      expect(validateLoginId("user-01")).toBeNull();
      expect(validateLoginId("buyer1234")).toBeNull();
    });

    it("빈 문자열이면 필수 입력 오류를 반환한다", () => {
      expect(validateLoginId("")).toBe("아이디를 입력해 주세요.");
    });

    it("5자 미만 또는 20자 초과이면 형식 오류를 반환한다", () => {
      expect(validateLoginId("abc")).toBe(
        "영문 소문자·숫자·_·-만 사용하여 5~20자로 입력해 주세요.",
      );
      expect(validateLoginId("a".repeat(21))).toBe(
        "영문 소문자·숫자·_·-만 사용하여 5~20자로 입력해 주세요.",
      );
    });

    it("대문자나 공백이 포함되면 형식 오류를 반환한다 (임의 trim/정규화 금지)", () => {
      expect(validateLoginId("Market_lover")).toBe(
        "영문 소문자·숫자·_·-만 사용하여 5~20자로 입력해 주세요.",
      );
      expect(validateLoginId(" market_lover ")).toBe(
        "영문 소문자·숫자·_·-만 사용하여 5~20자로 입력해 주세요.",
      );
    });
  });

  describe("validateEmail", () => {
    it("유효한 ASCII 이메일을 허용한다", () => {
      expect(validateEmail("user@example.com")).toBeNull();
      expect(validateEmail("buyer.01@market.co.kr")).toBeNull();
    });

    it("빈 이메일이면 필수 오류를 반환한다", () => {
      expect(validateEmail("")).toBe("이메일 주소를 입력해 주세요.");
    });

    it("254자 초과 또는 비ASCII 이메일은 오류를 반환한다", () => {
      expect(validateEmail("홍길동@example.com")).toBe("유효한 이메일 주소를 입력해 주세요.");
      expect(validateEmail("a".repeat(245) + "@example.com")).toBe(
        "유효한 이메일 주소를 입력해 주세요.",
      );
    });

    it("형식이 잘못된 이메일은 오류를 반환한다", () => {
      expect(validateEmail("user@")).toBe("유효한 이메일 주소를 입력해 주세요.");
      expect(validateEmail("user@invalid")).toBe("유효한 이메일 주소를 입력해 주세요.");
    });
  });

  describe("validateDisplayName", () => {
    it("2~10자 한글, 영문, 숫자를 허용한다", () => {
      expect(validateDisplayName("김단골")).toBeNull();
      expect(validateDisplayName("단골1호")).toBeNull();
      expect(validateDisplayName("Market01")).toBeNull();
    });

    it("빈 문자열이면 필수 오류를 반환한다", () => {
      expect(validateDisplayName("")).toBe("표시 이름을 입력해 주세요.");
    });

    it("2자 미만 또는 10자 초과이면 형식 오류를 반환한다", () => {
      expect(validateDisplayName("김")).toBe("한글·영문·숫자를 사용하여 2~10자로 입력해 주세요.");
      expect(validateDisplayName("매우긴단골손님표시이름입니다")).toBe(
        "한글·영문·숫자를 사용하여 2~10자로 입력해 주세요.",
      );
    });

    it("특수문자나 자음/모음 낱자, 공백이 포함되면 오류를 반환한다 (임의 trim 금지)", () => {
      expect(validateDisplayName("김 단골")).toBe(
        "한글·영문·숫자를 사용하여 2~10자로 입력해 주세요.",
      );
      expect(validateDisplayName("단골!!")).toBe(
        "한글·영문·숫자를 사용하여 2~10자로 입력해 주세요.",
      );
      expect(validateDisplayName("ㄱㄴㄷ")).toBe(
        "한글·영문·숫자를 사용하여 2~10자로 입력해 주세요.",
      );
    });
  });

  describe("validatePassword", () => {
    it("8~32자 영문, 숫자, 특수문자를 모두 포함한 ASCII 비밀번호를 허용한다", () => {
      expect(validatePassword("password123!")).toBeNull();
      expect(validatePassword("Secure#2026")).toBeNull();
    });

    it("빈 문자열이면 필수 오류를 반환한다", () => {
      expect(validatePassword("")).toBe("비밀번호를 입력해 주세요.");
    });

    it("8자 미만 또는 32자 초과이면 오류를 반환한다", () => {
      expect(validatePassword("pass1!")).toBe(
        "공백 없이 영문·숫자·특수문자를 모두 포함하여 8~32자로 입력해 주세요.",
      );
      expect(validatePassword("A1!" + "a".repeat(30))).toBe(
        "공백 없이 영문·숫자·특수문자를 모두 포함하여 8~32자로 입력해 주세요.",
      );
    });

    it("영문, 숫자, 특수문자 중 하나라도 누락되면 오류를 반환한다", () => {
      expect(validatePassword("onlyletters")).toBe(
        "공백 없이 영문·숫자·특수문자를 모두 포함하여 8~32자로 입력해 주세요.",
      );
      expect(validatePassword("letters1234")).toBe(
        "공백 없이 영문·숫자·특수문자를 모두 포함하여 8~32자로 입력해 주세요.",
      );
      expect(validatePassword("special!@#$")).toBe(
        "공백 없이 영문·숫자·특수문자를 모두 포함하여 8~32자로 입력해 주세요.",
      );
    });

    it("공백이 포함되면 오류를 반환한다 (비밀번호 trim 금지)", () => {
      expect(validatePassword("pass 123!word")).toBe(
        "공백 없이 영문·숫자·특수문자를 모두 포함하여 8~32자로 입력해 주세요.",
      );
      expect(validatePassword(" password123! ")).toBe(
        "공백 없이 영문·숫자·특수문자를 모두 포함하여 8~32자로 입력해 주세요.",
      );
    });
  });
});
