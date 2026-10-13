/**
 * 공개 가입 규칙에 따른 클라이언트 입력값 유효성 검증
 *
 * 규칙 요약:
 * - ID: 5~20 영문 소문자, 숫자, _, - (임의 trim/정규화 금지)
 * - 이름: 2~10 완성형 한글, 영문, 숫자 (임의 trim/정규화 금지)
 * - 비밀번호: 8~32 공백 없는 ASCII 영문·숫자·특수문자 각각 포함 (임의 trim 금지)
 * - 이메일: 필수 ASCII 일반 이메일 (최대 254자)
 */

export function validateLoginId(loginId: string): string | null {
  if (!loginId) {
    return "아이디를 입력해 주세요.";
  }
  if (!/^[a-z0-9_-]{5,20}$/.test(loginId)) {
    return "영문 소문자·숫자·_·-만 사용하여 5~20자로 입력해 주세요.";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  if (!email) {
    return "이메일 주소를 입력해 주세요.";
  }
  if (email.length > 254) {
    return "유효한 이메일 주소를 입력해 주세요.";
  }
  // ASCII 검사 (0~127 범위 외 문자 차단)
  for (let i = 0; i < email.length; i++) {
    if ((email.charCodeAt(i) ?? 0) > 127) {
      return "유효한 이메일 주소를 입력해 주세요.";
    }
  }
  // 일반적인 이메일 형식 검사 (공백 제외 및 @, . 도메인 구조)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return "유효한 이메일 주소를 입력해 주세요.";
  }
  return null;
}

export function validateDisplayName(displayName: string): string | null {
  if (!displayName) {
    return "표시 이름을 입력해 주세요.";
  }
  // 완성형 한글(가-힣), 영문, 숫자 2~10자
  if (!/^[가-힣A-Za-z0-9]{2,10}$/.test(displayName)) {
    return "한글·영문·숫자를 사용하여 2~10자로 입력해 주세요.";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) {
    return "비밀번호를 입력해 주세요.";
  }
  // 8~32자, 공백 없는 ASCII(0x21~0x7E), 영문/숫자/특수문자 모두 포함
  if (
    password.length < 8 ||
    password.length > 32 ||
    !/^[\x21-\x7E]+$/.test(password) ||
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return "공백 없이 영문·숫자·특수문자를 모두 포함하여 8~32자로 입력해 주세요.";
  }
  return null;
}
