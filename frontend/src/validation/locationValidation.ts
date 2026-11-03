/**
 * 시장 위치 및 지역 선택 유효성 검증
 * Spec의 '시장 위치와 지역별 선택 추가 계약'과 MarketLocationRules 비즈니스 규칙을 따릅니다.
 */

function hasControlChar(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if ((code >= 0 && code <= 31) || (code >= 127 && code <= 159)) {
      return true;
    }
  }
  return false;
}

const REGION_CODE_REGEX = /^[0-9]{5}$/;

export function validateMarketName(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "시장 이름을 입력해 주세요.";
  }
  const trimmed = value.trim();
  if (trimmed.length > 100) {
    return "시장 이름은 100자 이하여야 합니다.";
  }
  if (hasControlChar(trimmed)) {
    return "시장 이름에 제어 문자를 포함할 수 없습니다.";
  }
  return null;
}

export function validateRegionCode(value: unknown): string | null {
  if (typeof value !== "string" || !REGION_CODE_REGEX.test(value)) {
    return "시도와 시군구를 선택해 주세요.";
  }
  return null;
}

export function validateAddress(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "대표 주소를 입력해 주세요.";
  }
  const trimmed = value.trim();
  if (trimmed.length > 500) {
    return "대표 주소는 1~500자로 입력해 주세요.";
  }
  if (hasControlChar(trimmed)) {
    return "대표 주소에 제어 문자를 포함할 수 없습니다.";
  }
  return null;
}

export function validateLatitude(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < -90 || value > 90) {
    return "시장 위치를 확인해 주세요. 목록에서 선택하거나 주소 검색·지도에서 위치를 지정해 주세요.";
  }
  return null;
}

export function validateLongitude(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < -180 || value > 180) {
    return "시장 위치를 확인해 주세요. 목록에서 선택하거나 주소 검색·지도에서 위치를 지정해 주세요.";
  }
  return null;
}

export interface MarketFormValidation {
  name?: string;
  regionCode?: string;
  address?: string;
  latitude?: string;
  longitude?: string;
}

export function validateMarketRegistration(input: {
  name: unknown;
  regionCode: unknown;
  address: unknown;
  latitude: unknown;
  longitude: unknown;
}): { isValid: boolean; errors: MarketFormValidation } {
  const errors: MarketFormValidation = {};

  const nameError = validateMarketName(input.name);
  if (nameError) errors.name = nameError;

  const regionError = validateRegionCode(input.regionCode);
  if (regionError) errors.regionCode = regionError;

  const addressError = validateAddress(input.address);
  if (addressError) errors.address = addressError;

  const latError = validateLatitude(input.latitude);
  if (latError) errors.latitude = latError;

  const lngError = validateLongitude(input.longitude);
  if (lngError) errors.longitude = lngError;

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function formatDistance(distanceKm: number | null | undefined): string {
  if (distanceKm === null || distanceKm === undefined || !Number.isFinite(distanceKm)) {
    return "";
  }
  return `${distanceKm.toFixed(1)}km`;
}
