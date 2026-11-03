import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("메인 스크립트만 로드된 동안에는 준비 완료로 처리하지 않는다", async () => {
  vi.useFakeTimers();
  vi.resetModules();
  const browser: Record<string, unknown> = {};
  const script = { src: "", onload: () => {}, onerror: () => {}, parentNode: null };
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", { createElement: () => script, head: { appendChild: () => {} } });
  const sdk = await import("./mapSdk");
  sdk.setMapClientIdForTesting("test-client-id");
  let settled = false;
  const ready = sdk.loadMapSdk().then(() => {
    settled = true;
  });
  browser.naver = { maps: { Map: class {} } };
  script.onload();
  await Promise.resolve();
  expect(settled).toBe(false);
  const callback = new URL(script.src).searchParams.get("callback");
  expect(callback).toBeTruthy();
  browser.naver = { maps: { Map: class {}, Service: {} } };
  (browser[callback!] as () => void)();
  await ready;
  expect(settled).toBe(true);
});

it("주소 서비스가 응답하지 않으면 재시도를 안내한다", async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.stubGlobal("window", {
    naver: { maps: { Map: class {}, Service: { Status: { OK: 200 }, geocode: () => {} } } },
  });
  const sdk = await import("./mapSdk");
  const result = expect(sdk.geocodeAddress("테스트 주소")).rejects.toThrow(
    "주소 조회 시간이 초과되었습니다.",
  );
  await vi.advanceTimersByTimeAsync(10000);
  await result;
});

it("취소된 화면은 SDK가 준비돼도 지도 객체를 만들지 않는다", async () => {
  const sdk = await import("./mapSdk");
  const mount = vi.fn();
  sdk.setMapSdkProvider({
    loadSdk: () => Promise.resolve(),
    geocode: vi.fn(),
    reverseGeocode: vi.fn(),
    mountAdminPicker: mount,
    mountBuyerOverview: mount,
  });
  try {
    const abort = new AbortController();
    const pending = sdk.mountAdminPickerMap(
      {} as HTMLElement,
      { onCoordsChange: () => {} },
      abort.signal,
    );
    abort.abort();
    await expect(pending).rejects.toThrow("지도 표시 요청이 취소되었습니다.");
    expect(mount).not.toHaveBeenCalled();
  } finally {
    sdk.setMapSdkProvider(null);
  }
});
