import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSellerLocation,
  readProductPage,
  readSellerPage,
  writeProductPage,
  writeSellerPage,
} from "./sellerLocation";

interface MockWindow {
  location: { hash: string };
  history: {
    pushState: ReturnType<typeof vi.fn>;
    replaceState: ReturnType<typeof vi.fn>;
  };
}

describe("sellerLocation", () => {
  let mockWindow: MockWindow;

  beforeEach(() => {
    mockWindow = {
      location: { hash: "" },
      history: {
        pushState: vi.fn(),
        replaceState: vi.fn(),
      },
    };
    (globalThis as unknown as { window: MockWindow }).window = mockWindow;
  });

  describe("isSellerLocation", () => {
    it("판매자 관련 해시 경로를 올바르게 판별한다", () => {
      mockWindow.location.hash = "#seller";
      expect(isSellerLocation()).toBe(true);

      mockWindow.location.hash = "#seller/orders";
      expect(isSellerLocation()).toBe(true);

      mockWindow.location.hash = "#seller/dashboard";
      expect(isSellerLocation()).toBe(true);

      mockWindow.location.hash = "#seller/store";
      expect(isSellerLocation()).toBe(true);

      mockWindow.location.hash = "#seller/product/1";
      expect(isSellerLocation()).toBe(true);

      mockWindow.location.hash = "#seller/product/new";
      expect(isSellerLocation()).toBe(true);
    });

    it("판매자 이외의 해시 경로는 false를 반환한다", () => {
      mockWindow.location.hash = "#buyer";
      expect(isSellerLocation()).toBe(false);

      mockWindow.location.hash = "#admin";
      expect(isSellerLocation()).toBe(false);

      mockWindow.location.hash = "#cart";
      expect(isSellerLocation()).toBe(false);

      mockWindow.location.hash = "";
      expect(isSellerLocation()).toBe(false);
    });
  });

  describe("readSellerPage", () => {
    it("#seller/dashboard는 dashboard를 반환한다", () => {
      expect(readSellerPage("#seller/dashboard")).toBe("dashboard");
    });

    it("#seller/orders는 orders를 반환한다", () => {
      expect(readSellerPage("#seller/orders")).toBe("orders");
    });

    it("#seller/store는 store를 반환한다", () => {
      expect(readSellerPage("#seller/store")).toBe("store");
    });

    it("#seller 및 기타 경로는 sales를 반환한다", () => {
      expect(readSellerPage("#seller")).toBe("sales");
      expect(readSellerPage("#seller/product/1")).toBe("sales");
      expect(readSellerPage("#unknown")).toBe("sales");
    });
  });

  describe("writeSellerPage", () => {
    it("dashboard 페이지를 쓰면 #seller/dashboard로 이동한다", () => {
      writeSellerPage("dashboard");
      expect(mockWindow.history.pushState).toHaveBeenCalledWith(null, "", "#seller/dashboard");
    });

    it("orders 페이지를 쓰면 #seller/orders로 이동한다", () => {
      writeSellerPage("orders");
      expect(mockWindow.history.pushState).toHaveBeenCalledWith(null, "", "#seller/orders");
    });

    it("store 페이지를 쓰면 #seller/store로 이동한다", () => {
      writeSellerPage("store");
      expect(mockWindow.history.pushState).toHaveBeenCalledWith(null, "", "#seller/store");
    });

    it("sales 페이지를 쓰면 #seller로 이동한다", () => {
      writeSellerPage("sales");
      expect(mockWindow.history.pushState).toHaveBeenCalledWith(null, "", "#seller");
    });

    it("push가 false이면 replaceState를 사용한다", () => {
      writeSellerPage("dashboard", false);
      expect(mockWindow.history.replaceState).toHaveBeenCalledWith(null, "", "#seller/dashboard");
    });

    it("현재 hash와 같으면 상태 변경을 건너뛴다", () => {
      mockWindow.location.hash = "#seller/dashboard";
      writeSellerPage("dashboard");
      expect(mockWindow.history.pushState).not.toHaveBeenCalled();
      expect(mockWindow.history.replaceState).not.toHaveBeenCalled();
    });
  });

  describe("readProductPage & writeProductPage", () => {
    it("신규 상품 및 ID 번호를 올바르게 읽는다", () => {
      expect(readProductPage("#seller/product/new")).toBe("new");
      expect(readProductPage("#seller/product/42")).toBe(42);
      expect(readProductPage("#seller/product/0")).toBeNull();
      expect(readProductPage("#seller")).toBeNull();
    });

    it("상품 페이지 해시를 올바르게 작성한다", () => {
      writeProductPage("new");
      expect(mockWindow.history.pushState).toHaveBeenCalledWith(null, "", "#seller/product/new");

      writeProductPage(123);
      expect(mockWindow.history.pushState).toHaveBeenCalledWith(null, "", "#seller/product/123");

      writeProductPage(null);
      expect(mockWindow.history.pushState).toHaveBeenCalledWith(null, "", "#seller");
    });
  });
});
