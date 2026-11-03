import { describe, expect, it } from "vitest";
import {
  formatDistance,
  validateAddress,
  validateLatitude,
  validateLongitude,
  validateMarketName,
  validateMarketRegistration,
  validateRegionCode,
} from "./locationValidation";

describe("locationValidation", () => {
  describe("validateMarketName", () => {
    it("빈 값이나 공백은 에러를 반환한다", () => {
      expect(validateMarketName("")).toBe("시장 이름을 입력해 주세요.");
      expect(validateMarketName("   ")).toBe("시장 이름을 입력해 주세요.");
      expect(validateMarketName(null)).toBe("시장 이름을 입력해 주세요.");
    });

    it("100자를 초과하면 에러를 반환한다", () => {
      const longName = "a".repeat(101);
      expect(validateMarketName(longName)).toBe("시장 이름은 100자 이하여야 합니다.");
    });

    it("제어 문자가 포함되면 에러를 반환한다", () => {
      expect(validateMarketName("시장\u0000이름")).toBe(
        "시장 이름에 제어 문자를 포함할 수 없습니다.",
      );
      expect(validateMarketName("시장\n이름")).toBe("시장 이름에 제어 문자를 포함할 수 없습니다.");
    });

    it("유효한 이름은 null을 반환한다", () => {
      expect(validateMarketName("망원시장")).toBeNull();
      expect(validateMarketName("자갈치시장 1호점")).toBeNull();
    });
  });

  describe("validateRegionCode", () => {
    it("5자리 숫자가 아니면 에러를 반환한다", () => {
      expect(validateRegionCode("")).toBe("시도와 시군구를 선택해 주세요.");
      expect(validateRegionCode("1234")).toBe("시도와 시군구를 선택해 주세요.");
      expect(validateRegionCode("123456")).toBe("시도와 시군구를 선택해 주세요.");
      expect(validateRegionCode("abcde")).toBe("시도와 시군구를 선택해 주세요.");
      expect(validateRegionCode(null)).toBe("시도와 시군구를 선택해 주세요.");
    });

    it("5자리 숫자 코드는 null을 반환한다", () => {
      expect(validateRegionCode("11110")).toBeNull();
      expect(validateRegionCode("51110")).toBeNull();
    });
  });

  describe("validateAddress", () => {
    it("빈 값이나 공백은 에러를 반환한다", () => {
      expect(validateAddress("")).toBe("대표 주소를 입력해 주세요.");
      expect(validateAddress("   ")).toBe("대표 주소를 입력해 주세요.");
      expect(validateAddress(null)).toBe("대표 주소를 입력해 주세요.");
    });

    it("500자를 초과하면 에러를 반환한다", () => {
      const longAddress = "가".repeat(501);
      expect(validateAddress(longAddress)).toBe("대표 주소는 1~500자로 입력해 주세요.");
    });

    it("제어 문자가 포함되면 에러를 반환한다", () => {
      expect(validateAddress("서울시 종로구\t창경궁로")).toBe(
        "대표 주소에 제어 문자를 포함할 수 없습니다.",
      );
    });

    it("유효한 주소는 null을 반환한다", () => {
      expect(validateAddress("서울특별시 종로구 창경궁로 88")).toBeNull();
    });
  });

  describe("validateLatitude and validateLongitude", () => {
    it("위도 유효 범위(-90 ~ 90)를 검증한다", () => {
      expect(validateLatitude(37.5665)).toBeNull();
      expect(validateLatitude(-90)).toBeNull();
      expect(validateLatitude(90)).toBeNull();
      expect(validateLatitude(90.1)).toBe(
        "시장 위치를 확인해 주세요. 목록에서 선택하거나 주소 검색·지도에서 위치를 지정해 주세요.",
      );
      expect(validateLatitude(-90.1)).toBe(
        "시장 위치를 확인해 주세요. 목록에서 선택하거나 주소 검색·지도에서 위치를 지정해 주세요.",
      );
      expect(validateLatitude(NaN)).toBe(
        "시장 위치를 확인해 주세요. 목록에서 선택하거나 주소 검색·지도에서 위치를 지정해 주세요.",
      );
      expect(validateLatitude(Infinity)).toBe(
        "시장 위치를 확인해 주세요. 목록에서 선택하거나 주소 검색·지도에서 위치를 지정해 주세요.",
      );
      expect(validateLatitude(null)).toBe(
        "시장 위치를 확인해 주세요. 목록에서 선택하거나 주소 검색·지도에서 위치를 지정해 주세요.",
      );
    });

    it("경도 유효 범위(-180 ~ 180)를 검증한다", () => {
      expect(validateLongitude(126.978)).toBeNull();
      expect(validateLongitude(-180)).toBeNull();
      expect(validateLongitude(180)).toBeNull();
      expect(validateLongitude(180.1)).toBe(
        "시장 위치를 확인해 주세요. 목록에서 선택하거나 주소 검색·지도에서 위치를 지정해 주세요.",
      );
      expect(validateLongitude(-180.1)).toBe(
        "시장 위치를 확인해 주세요. 목록에서 선택하거나 주소 검색·지도에서 위치를 지정해 주세요.",
      );
      expect(validateLongitude(NaN)).toBe(
        "시장 위치를 확인해 주세요. 목록에서 선택하거나 주소 검색·지도에서 위치를 지정해 주세요.",
      );
      expect(validateLongitude(null)).toBe(
        "시장 위치를 확인해 주세요. 목록에서 선택하거나 주소 검색·지도에서 위치를 지정해 주세요.",
      );
    });
  });

  describe("validateMarketRegistration", () => {
    it("모든 필수 정보가 올바르면 isValid true를 반환한다", () => {
      const result = validateMarketRegistration({
        name: "광장시장",
        regionCode: "11110",
        address: "서울특별시 종로구 창경궁로 88",
        latitude: 37.57,
        longitude: 126.999,
      });
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it("필수 정보가 누락되거나 잘못되면 각각의 에러를 포함한다", () => {
      const result = validateMarketRegistration({
        name: "",
        regionCode: "abc",
        address: "",
        latitude: null,
        longitude: 200,
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.name).toBeDefined();
      expect(result.errors.regionCode).toBeDefined();
      expect(result.errors.address).toBeDefined();
      expect(result.errors.latitude).toBeDefined();
      expect(result.errors.longitude).toBeDefined();
    });
  });

  describe("formatDistance", () => {
    it("거리 값이 없거나 유효하지 않으면 빈 문자열을 반환한다", () => {
      expect(formatDistance(null)).toBe("");
      expect(formatDistance(undefined)).toBe("");
      expect(formatDistance(NaN)).toBe("");
    });

    it("소수점 첫째 자리까지 km 단위로 표시한다", () => {
      expect(formatDistance(0)).toBe("0.0km");
      expect(formatDistance(0.54)).toBe("0.5km");
      expect(formatDistance(2.89)).toBe("2.9km");
      expect(formatDistance(10)).toBe("10.0km");
    });
  });
});
