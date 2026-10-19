import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  createMarket,
  getAdminMarkets,
  getAdminOrderItems,
  getAdminRows,
  registerStore,
  renameManaged,
  updateMarket,
  updateSellerContact,
  type AdminRow,
  type AdminSection,
  type AdminFilters,
} from "../../api/admin";
import {
  cancelAdminStoreOrder,
  formatRefundStatus,
  formatStoreOrderStatus,
  getAdminManagedStoreOrders,
  resolveAdminStoreReport,
  retryAdminRefund,
  updateStoreOperation,
  type AdminCancellationReasonType,
  type StoreOrderView,
} from "../../api/operations";
import { ApiError, type LocatedMarketView } from "../../api/types";
import { AdminMarketLocationForm } from "../components/AdminMarketLocationForm";
import { validateMarketRegistration } from "../../validation/locationValidation";

const sections: [AdminSection, string][] = [
  ["markets", "시장"],
  ["stores", "매장"],
  ["sellers", "판매자"],
  ["buyers", "구매자"],
  ["orders", "주문"],
  ["sales", "판매 현황"],
  ["changes", "변경 이력"],
  ["refunds", "환불"],
  ["store-reports", "매장 제보"],
];

const labels: Record<string, string> = {
  id: "번호",
  name: "이름",
  marketId: "시장 번호",
  marketName: "시장",
  ownerId: "판매자 번호",
  loginId: "로그인 ID",
  displayName: "계정 이름",
  role: "역할",
  email: "이메일",
  contactName: "담당자 이름",
  contactPhone: "담당자 전화번호",
  buyerLoginId: "구매자 ID",
  buyerName: "구매자 이름",
  totalWon: "주문 금액(원)",
  confirmedAt: "결제 시각",
  storeId: "매장 번호",
  storeName: "매장",
  productName: "상품",
  unitType: "단위 종류",
  unitAmount: "단위량",
  priceWon: "가격(원)",
  onlineQuantity: "잔여 온라인 수량",
  active: "판매 활성",
  archived: "상품 삭제",
  pickupDate: "수령일",
  startTime: "수령 시작",
  endTime: "수령 마감",
  quantity: "구매 수량",
  actorLoginId: "처리 관리자",
  occurredAt: "변경 시각",
  targetType: "대상 종류",
  targetId: "대상 번호",
  beforeValue: "변경 전",
  afterValue: "변경 후",
  storeOrderId: "매장 주문 번호",
  regionLabel: "지역",
  regionCode: "지역 코드",
  provinceCode: "시도 코드",
  address: "대표 주소",
  latitude: "위도",
  longitude: "경도",
  distanceKm: "거리(km)",
  amountWon: "환불 금액(원)",
  status: "상태",
  attempts: "시도 횟수",
  lastError: "최근 오류",
  createdAt: "접수/생성 시각",
  completedAt: "완료 시각",
  description: "제보 내용",
  resolution: "처리 결과",
  type: "제보 유형",
  unresolvedClosureCount: "미처리 폐업 의심 수",
  needsContact: "연락 확인 필요",
  suspended: "운영 중지 여부",
  operationReason: "운영 상태 사유",
  MARKET: "시장",
  STORE: "매장",
  SELLER: "판매자",
  STORE_ORDER: "매장 주문",
  REFUND: "환불",
  STORE_REPORT: "매장 제보",
};

const columns: Record<AdminSection, string[]> = {
  markets: ["id", "name", "regionLabel", "address"],
  stores: ["id", "name", "marketName", "loginId"],
  sellers: ["id", "loginId", "contactName", "contactPhone"],
  buyers: ["id", "loginId", "displayName", "email"],
  orders: ["id", "buyerLoginId", "buyerName", "totalWon", "confirmedAt"],
  sales: ["storeName", "productName", "priceWon", "onlineQuantity", "active"],
  changes: ["occurredAt", "actorLoginId", "targetType", "targetId"],
  refunds: [
    "id",
    "storeOrderId",
    "amountWon",
    "status",
    "attempts",
    "lastError",
    "createdAt",
    "completedAt",
  ],
  "store-reports": [
    "id",
    "storeName",
    "type",
    "status",
    "buyerLoginId",
    "contactName",
    "contactPhone",
    "unresolvedClosureCount",
    "createdAt",
  ],
};

function formatAdminTimestamp(value: unknown): string {
  const normalized = String(value)
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map(({ type, value: part }) => [type, part]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function text(row: AdminRow, key: string): string {
  const value = row[key];
  if (value === null || value === undefined) {
    if (key === "contactName" || key === "contactPhone") {
      return "담당자 정보 미등록";
    }
    if (key === "regionLabel") {
      return "위치 미등록";
    }
    if (key === "operationReason") {
      return "-";
    }
    return "-";
  }
  if (key === "occurredAt" || key === "confirmedAt" || key === "createdAt" || key === "completedAt")
    return formatAdminTimestamp(value);
  if (key === "targetType") {
    if (value === "MARKET") return "시장";
    if (value === "STORE") return "매장";
    if (value === "SELLER") return "판매자";
    if (value === "STORE_ORDER") return "매장 주문";
    if (value === "REFUND") return "환불";
    if (value === "STORE_REPORT") return "매장 제보";
  }
  if (key === "type") {
    if (value === "CLOSURE_SUSPECTED") return "폐업 의심";
    if (value === "INACTIVE") return "장기 미운영";
    if (value === "LOCATION_ERROR") return "위치 오류";
  }
  if (key === "status") {
    if (value === "OPEN") return "접수";
    if (value === "REVIEWING") return "확인 중";
    if (value === "RESOLVED") return "처리 완료";
    if (value === "WAITING") return "수령 대기";
    if (value === "PICKED_UP") return "수령 완료";
    if (value === "NO_SHOW") return "미수령";
    if (value === "CANCELLED") return "취소 완료";
    if (value === "PENDING") return "처리 대기";
    if (value === "COMPLETED") return "환불 완료";
    if (value === "NEEDS_ATTENTION") return "관리자 확인 필요";
  }
  if (key === "amountWon" || key === "totalWon" || key === "priceWon") {
    try {
      return BigInt(value as string | number).toLocaleString();
    } catch {
      return String(value);
    }
  }
  if (typeof value === "boolean") {
    return value ? "예" : "아니오";
  }
  return String(value ?? "");
}

function dateToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function initialAdminFilters(): AdminFilters {
  return { query: "", page: 0, date: dateToday(), type: "", from: "", until: "", targetId: "" };
}

interface AdminListData {
  rows: AdminRow[];
  filters: AdminFilters;
}

export function AdminScreen({
  onLogout,
  onSessionExpired,
  logoutError,
  isLoggingOut,
}: {
  onLogout: () => void;
  onSessionExpired: () => void;
  logoutError: string | null;
  isLoggingOut: boolean;
}) {
  const [section, setSection] = useState<AdminSection>("markets");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState<{ section: AdminSection; data?: AdminListData }>({
    section: "markets",
  });
  const [navigationPending, setNavigationPending] = useState(false);
  const [navigationError, setNavigationError] = useState("");
  const [navigationAttempt, setNavigationAttempt] = useState(0);

  useEffect(() => {
    if (section === loaded.section) {
      setNavigationPending(false);
      setNavigationError("");
      return;
    }
    const controller = new AbortController();
    let active = true;
    const filters = initialAdminFilters();
    setNavigationPending(true);
    setNavigationError("");
    void getAdminRows(section, filters, controller.signal)
      .then((rows) => {
        if (active) setLoaded({ section, data: { rows, filters } });
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) onSessionExpired();
        else
          setNavigationError(
            `${sections.find(([id]) => id === section)?.[1]} 화면을 불러오지 못했습니다. 다시 시도해 주세요.`,
          );
      })
      .finally(() => {
        if (active) setNavigationPending(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [section, loaded.section, navigationAttempt, onSessionExpired]);

  useEffect(() => {
    function restore() {
      const tab = window.location.hash.replace("#admin/", "");
      if (sections.some(([id]) => id === tab)) {
        setSection(tab as AdminSection);
      }
    }
    restore();
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, []);

  return (
    <section className="hybrid-card admin-workspace" aria-label="관리자 업무">
      <aside className="admin-sidebar" data-menu-open={menuOpen}>
        <div className="admin-brand-row">
          <h1>
            <span>미리내 마켓</span> <span>관리자</span>
          </h1>
          <button
            type="button"
            className="admin-mobile-menu"
            aria-expanded={menuOpen}
            aria-controls="adminNavigation"
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? "메뉴 닫기" : `${sections.find(([id]) => id === section)?.[1]} · 메뉴`}
          </button>
        </div>
        <div id="adminNavigation">
          <nav aria-label="관리 메뉴">
            {sections.map(([id, label]) => (
              <a
                key={id}
                id={`admin-nav-${id}`}
                href={`#admin/${id}`}
                aria-current={loaded.section === id ? "page" : undefined}
                onClick={() => {
                  setSection(id);
                  setMenuOpen(false);
                }}
              >
                {label}
              </a>
            ))}
          </nav>
          <button type="button" id="btnAdminLogout" disabled={isLoggingOut} onClick={onLogout}>
            {isLoggingOut ? "로그아웃 중…" : "로그아웃"}
          </button>
        </div>
        {logoutError && <p role="alert">{logoutError}</p>}
        {navigationError && (
          <div className="admin-navigation-error" role="alert">
            <p>{navigationError}</p>
            <button type="button" onClick={() => setNavigationAttempt((value) => value + 1)}>
              다시 시도
            </button>
          </div>
        )}
        {navigationPending && (
          <p className="admin-navigation-announcement" role="status">
            {sections.find(([id]) => id === section)?.[1]} 화면을 불러오는 중…
          </p>
        )}
      </aside>
      <AdminList
        key={loaded.section}
        section={loaded.section}
        initialData={loaded.data}
        navigationPending={navigationPending}
        onSessionExpired={onSessionExpired}
      />
    </section>
  );
}

function AdminList({
  section,
  initialData,
  navigationPending,
  onSessionExpired,
}: {
  section: AdminSection;
  initialData?: AdminListData;
  navigationPending: boolean;
  onSessionExpired: () => void;
}) {
  const listMounted = useRef(true);
  useEffect(() => {
    listMounted.current = true;
    return () => {
      listMounted.current = false;
    };
  }, []);
  const [initialFilters] = useState(() => initialData?.filters ?? initialAdminFilters());
  const [filters, setFilters] = useState<AdminFilters>(initialFilters);
  const [rows, setRows] = useState<AdminRow[]>(initialData?.rows ?? []);
  const [selected, setSelected] = useState<AdminRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(initialData === undefined);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (initialData && filters === initialFilters && version === 0) return;
    const controller = new AbortController();
    let active = true;
    setBusy(true);
    setRows([]);
    setSelected(null);
    setError("");

    void getAdminRows(section, filters, controller.signal)
      .then((value) => {
        if (active) setRows(value);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) onSessionExpired();
        else setError(err instanceof Error ? err.message : "목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [section, filters, version, onSessionExpired, initialData, initialFilters]);

  function filter(key: keyof AdminFilters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value, page: 0 }));
    setCreating(false);
  }

  function saved() {
    setCreating(false);
    setSelected(null);
    setVersion((v) => v + 1);
    setNotice("저장했습니다.");
  }

  const primaryKey = columns[section]?.[0] ?? "id";

  if ((section === "markets" && (creating || selected)) || (section === "stores" && creating)) {
    return (
      <div
        className={`admin-content ${section === "markets" ? "market-workspace" : "admin-store-registration"}`}
        data-navigation-pending={navigationPending}
        aria-busy={navigationPending}
        inert={navigationPending}
      >
        <AdminDetail
          key={creating ? "new" : selected?.id}
          section={section}
          row={selected}
          onSaved={saved}
          onClose={() => {
            setCreating(false);
            setSelected(null);
          }}
          onSessionExpired={onSessionExpired}
        />
      </div>
    );
  }

  return (
    <div
      className={`admin-content ${section === "markets" ? "admin-market-list" : ""}`}
      data-density={rows.length === 0 ? "empty" : rows.length <= 5 ? "compact" : "wide"}
      data-navigation-pending={navigationPending}
      aria-busy={navigationPending}
      inert={navigationPending}
    >
      <header className="admin-heading">
        <h2>
          {section === "markets" ? "시장 목록" : sections.find(([id]) => id === section)?.[1]}
        </h2>
        {(section === "markets" || section === "stores") && (
          <button
            type="button"
            id="btnAdminCreate"
            onClick={() => {
              setCreating(true);
              setSelected(null);
              setNotice("");
            }}
          >
            {section === "markets" ? "시장 등록" : "매장·판매자 등록"}
          </button>
        )}
      </header>

      <div className="admin-filters">
        {!["changes", "refunds", "store-reports"].includes(section) && (
          <label>
            {section === "markets" ? "시장명 검색" : "검색"}
            <input
              type="search"
              id="adminSearchQuery"
              value={filters.query}
              onChange={(e) => filter("query", e.target.value)}
              placeholder={section === "markets" ? "시장명 입력" : "이름 또는 ID 검색"}
            />
          </label>
        )}
        {section === "store-reports" && (
          <label>
            제보 상태
            <select
              id="adminStoreReportsStatus"
              value={filters.type}
              onChange={(e) => filter("type", e.target.value)}
            >
              <option value="">전체 상태</option>
              <option value="OPEN">접수</option>
              <option value="REVIEWING">확인 중</option>
              <option value="RESOLVED">처리 완료</option>
            </select>
          </label>
        )}
        {section === "sales" && (
          <label>
            판매 날짜
            <input
              type="date"
              id="adminSalesDate"
              value={filters.date}
              onChange={(e) => filter("date", e.target.value)}
            />
          </label>
        )}
        {section === "changes" && (
          <>
            <label>
              이력 대상
              <select
                id="adminChangesType"
                value={filters.type}
                onChange={(e) => filter("type", e.target.value)}
              >
                <option value="">전체</option>
                <option value="MARKET">시장</option>
                <option value="STORE">매장</option>
                <option value="SELLER">판매자</option>
                <option value="STORE_ORDER">매장 주문</option>
                <option value="REFUND">환불</option>
                <option value="STORE_REPORT">매장 제보</option>
              </select>
            </label>
            <label>
              대상 번호
              <input
                type="number"
                id="adminChangesTargetId"
                min="1"
                step="1"
                value={filters.targetId}
                onChange={(e) => filter("targetId", e.target.value)}
                placeholder="대상 번호"
              />
            </label>
            <label>
              시작 날짜
              <input
                type="date"
                id="adminChangesFrom"
                value={filters.from}
                onChange={(e) => filter("from", e.target.value)}
              />
            </label>
            <label>
              종료 날짜
              <input
                type="date"
                id="adminChangesUntil"
                value={filters.until}
                onChange={(e) => filter("until", e.target.value)}
              />
            </label>
          </>
        )}
        <button
          type="button"
          id="btnAdminRefresh"
          disabled={busy}
          onClick={() => setVersion((v) => v + 1)}
        >
          새로고침
        </button>
      </div>

      {notice && (
        <p id="adminNoticeBox" role="status">
          {notice}
        </p>
      )}
      {busy && (
        <p id="adminBusyBox" role="status">
          불러오는 중…
        </p>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setVersion((v) => v + 1)}>
            다시 조회
          </button>
        </p>
      )}

      {!busy && !error && (
        <>
          <div className="admin-table-wrap">
            <table className="info-data-table" data-section={section}>
              <thead>
                <tr>
                  {columns[section].map((key) => (
                    <th key={key} data-column={key} scope="col">
                      {labels[key] ?? key}
                    </th>
                  ))}
                  <th scope="col">상세</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((row) => (
                  <tr key={row.id}>
                    {columns[section].map((key) => (
                      <td
                        key={key}
                        data-column={key}
                        data-empty={key === "address" && !String(row[key] ?? "").trim()}
                        data-label={labels[key] ?? key}
                      >
                        {key === "storeName" &&
                          section === "store-reports" &&
                          Boolean(row.needsContact) && (
                            <span className="badge-tag badge-alert" style={{ marginRight: 6 }}>
                              연락 확인 필요
                            </span>
                          )}
                        {text(row, key)}
                      </td>
                    ))}
                    <td>
                      {section === "refunds" && row.status === "NEEDS_ATTENTION" && (
                        <button
                          type="button"
                          id={`btnRetryRefund-${row.id}`}
                          className="btn-danger-outline"
                          style={{ marginRight: 6 }}
                          onClick={async () => {
                            try {
                              await retryAdminRefund(row.id);
                              if (!listMounted.current) return;
                              setNotice("환불 재처리를 요청했습니다.");
                              setVersion((v) => v + 1);
                            } catch (err: unknown) {
                              if (!listMounted.current) return;
                              if (err instanceof ApiError && err.status === 401) onSessionExpired();
                              else
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : "환불 재처리에 실패했습니다.",
                                );
                            }
                          }}
                        >
                          재처리
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`${text(row, primaryKey)} 상세`}
                        onClick={() => {
                          setSelected(row);
                          setCreating(false);
                          setNotice("");
                        }}
                      >
                        상세
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <div className="admin-empty" role="status">
              <p>조회 결과가 없습니다.</p>
            </div>
          )}
          <nav className="admin-pages" aria-label="목록 페이지">
            <button
              type="button"
              disabled={filters.page === 0}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              이전
            </button>
            <span>{filters.page + 1}페이지</span>
            <button
              type="button"
              disabled={rows.length <= 50}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              다음
            </button>
          </nav>
        </>
      )}

      {(creating || selected) && (
        <AdminDetail
          key={creating ? "new" : selected?.id}
          section={section}
          row={selected}
          onSaved={saved}
          onClose={() => {
            setCreating(false);
            setSelected(null);
          }}
          onSessionExpired={onSessionExpired}
        />
      )}
    </div>
  );
}

function AdminDetail({
  section,
  row,
  onSaved,
  onClose,
  onSessionExpired,
}: {
  section: AdminSection;
  row: AdminRow | null;
  onSaved: () => void;
  onClose: () => void;
  onSessionExpired: () => void;
}) {
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [name, setName] = useState(row && row.name != null ? String(row.name) : "");
  const [regionCode, setRegionCode] = useState(
    row && row.regionCode != null ? String(row.regionCode) : "",
  );
  const [address, setAddress] = useState(row && row.address != null ? String(row.address) : "");
  const [latitude, setLatitude] = useState<number | null>(
    row && row.latitude != null ? Number(row.latitude) : null,
  );
  const [longitude, setLongitude] = useState<number | null>(
    row && row.longitude != null ? Number(row.longitude) : null,
  );
  const [editLocationEnabled, setEditLocationEnabled] = useState(false);
  const [marketReady, setMarketReady] = useState(Boolean(row));
  const [mapPending, setMapPending] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState(row && row.email != null ? String(row.email) : "");
  const [contactName, setContactName] = useState(
    row && row.contactName != null ? String(row.contactName) : "",
  );
  const [phone, setPhone] = useState(
    row && row.contactPhone != null ? String(row.contactPhone) : "",
  );
  const [marketId, setMarketId] = useState("");
  const [markets, setMarkets] = useState<LocatedMarketView[]>([]);
  const [items, setItems] = useState<AdminRow[] | null>(null);
  const [storeOrders, setStoreOrders] = useState<StoreOrderView[] | null>(null);
  const [cancelReasons, setCancelReasons] = useState<Record<number, string>>({});
  const cancellationIntents = useRef<Record<number, { signature: string; key: string }>>({});
  const [cancelReasonTypes, setCancelReasonTypes] = useState<
    Record<number, AdminCancellationReasonType>
  >({});
  const [operationReason, setOperationReason] = useState("");
  const [reportNextStatus, setReportNextStatus] = useState<string>(() =>
    row?.status === "OPEN" ? "REVIEWING" : "RESOLVED",
  );
  const [reportResolution, setReportResolution] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);

  const editable = section === "markets" || section === "stores" || section === "sellers";

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setError("");

    if (section === "stores" && !row) {
      void getAdminMarkets(controller.signal)
        .then((value) => {
          if (active && mountedRef.current) {
            setMarkets(value);
          }
        })
        .catch((err: unknown) => {
          if (!active || !mountedRef.current) return;
          if (err instanceof ApiError && err.status === 401) onSessionExpired();
          else setError(err instanceof Error ? err.message : "상세 정보를 불러오지 못했습니다.");
        });
    } else if (section === "orders" && row) {
      void getAdminOrderItems(row.id, controller.signal)
        .then((value) => {
          if (active && mountedRef.current) {
            setItems(value);
          }
        })
        .catch((err: unknown) => {
          if (!active || !mountedRef.current) return;
          if (err instanceof ApiError && err.status === 401) onSessionExpired();
          else setError(err instanceof Error ? err.message : "상세 정보를 불러오지 못했습니다.");
        });
      void getAdminManagedStoreOrders(row.id, controller.signal)
        .then((value) => {
          if (active && mountedRef.current) {
            setStoreOrders(value);
          }
        })
        .catch((err: unknown) => {
          if (!active || !mountedRef.current) return;
          if (err instanceof ApiError && err.status === 401) onSessionExpired();
          else setError("주문 취소·환불 운영 정보를 불러오지 못했습니다. 다시 조회해 주세요.");
        });
    }

    return () => {
      active = false;
      controller.abort();
    };
  }, [section, row, onSessionExpired, loadVersion]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mapPending) {
      setError("지도 위치 변경을 적용하거나 취소해 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (section === "markets") {
        if (row) {
          if (editLocationEnabled) {
            const validation = validateMarketRegistration({
              name,
              regionCode,
              address,
              latitude,
              longitude,
            });
            if (!validation.isValid) {
              const firstErr = Object.values(validation.errors)[0];
              setError(firstErr ?? "위치 입력 정보를 확인해 주세요.");
              setBusy(false);
              return;
            }
            await updateMarket(row.id, {
              name,
              location: {
                regionCode,
                address,
                latitude: latitude!,
                longitude: longitude!,
              },
            });
          } else {
            if (!name.trim()) {
              setError("시장 이름을 입력해 주세요.");
              setBusy(false);
              return;
            }
            await updateMarket(row.id, { name });
          }
        } else {
          const validation = validateMarketRegistration({
            name,
            regionCode,
            address,
            latitude,
            longitude,
          });
          if (!validation.isValid) {
            const firstErr = Object.values(validation.errors)[0];
            setError(firstErr ?? "필수 위치 정보를 모두 입력해 주세요.");
            setBusy(false);
            return;
          }
          await createMarket({
            name,
            regionCode,
            address,
            latitude: latitude!,
            longitude: longitude!,
          });
        }
      } else if (section === "stores") {
        if (row) await renameManaged("stores", row.id, name);
        else
          await registerStore({
            marketId: Number(marketId),
            name,
            loginId,
            password,
            email,
            contactName,
            contactPhone: phone,
          });
      } else if (section === "sellers" && row) {
        await updateSellerContact(row.id, { email, contactName, contactPhone: phone });
      }
      if (!mountedRef.current) return;
      setPassword("");
      onSaved();
    } catch (err) {
      if (!mountedRef.current) return;
      setPassword("");
      if (err instanceof ApiError && err.status === 401) onSessionExpired();
      else
        setError(
          err instanceof Error
            ? err.message
            : "저장 결과를 확인하지 못했습니다. 목록을 조회한 뒤 다시 시도해 주세요.",
        );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  return (
    <section className="admin-detail" aria-label="선택한 항목 상세">
      <header className="admin-heading">
        <h3>
          {row
            ? editable
              ? "수정 및 상세 정보"
              : "상세 정보"
            : section === "markets"
              ? "새 시장 등록"
              : "매장·판매자 등록"}
        </h3>
        {!(section === "markets" && !row && marketReady) && (
          <button
            type="button"
            id="btnAdminDetailClose"
            className="admin-text-action"
            disabled={busy}
            onClick={onClose}
          >
            {section === "markets"
              ? "← 시장 목록"
              : section === "stores" && !row
                ? "← 매장 목록"
                : "닫기"}
          </button>
        )}
      </header>

      {row && (
        <dl className="admin-values">
          {Object.entries(row)
            .filter(
              ([key]) =>
                !(section === "sellers" && key === "displayName") &&
                !(
                  section === "markets" &&
                  ["latitude", "longitude", "regionCode", "provinceCode", "distanceKm"].includes(
                    key,
                  )
                ),
            )
            .map(([key]) => (
              <div key={key}>
                <dt>{labels[key] ?? key}</dt>
                <dd>{text(row, key)}</dd>
              </div>
            ))}
        </dl>
      )}

      {editable && (
        <form
          className={`market-form ${section === "stores" && !row ? "store-registration-form" : ""}`}
          onSubmit={(event) => void submit(event)}
        >
          {section === "markets" ? (
            <AdminMarketLocationForm
              onSessionExpired={onSessionExpired}
              onStageChange={setMarketReady}
              onMapPendingChange={setMapPending}
              name={name}
              onNameChange={setName}
              regionCode={regionCode}
              onRegionCodeChange={setRegionCode}
              address={address}
              onAddressChange={setAddress}
              latitude={latitude}
              onLatitudeChange={setLatitude}
              longitude={longitude}
              onLongitudeChange={setLongitude}
              isEdit={!!row}
              editLocationEnabled={editLocationEnabled}
              onToggleEditLocation={setEditLocationEnabled}
              currentRegionLabel={row?.regionLabel != null ? String(row.regionLabel) : null}
              currentAddress={row?.address != null ? String(row.address) : null}
              currentLatitude={row?.latitude != null ? Number(row.latitude) : null}
              currentLongitude={row?.longitude != null ? Number(row.longitude) : null}
            />
          ) : section === "stores" && row ? (
            <label>
              매장 이름
              <input
                id="adminInputName"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          ) : null}
          {section === "stores" && !row && (
            <>
              <fieldset className="admin-field-group">
                <legend>매장 정보</legend>
                <label>
                  소속 시장
                  <select
                    id="adminSelectMarket"
                    required
                    value={marketId}
                    onChange={(e) => setMarketId(e.target.value)}
                  >
                    <option value="">시장을 선택해 주세요</option>
                    {markets.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  매장 이름
                  <input
                    id="adminInputName"
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              </fieldset>
              <fieldset className="admin-field-group">
                <legend>판매자 계정</legend>
                <label>
                  판매자 로그인 ID
                  <input
                    id="adminInputLoginId"
                    required
                    autoComplete="off"
                    minLength={5}
                    maxLength={20}
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                  />
                </label>
                <label>
                  첫 비밀번호
                  <input
                    id="adminInputPassword"
                    required
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={32}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <p className="field-help-text">
                  첫 비밀번호는 판매자에게 별도로 전달해 주세요. 첫 로그인 후 변경이 필요합니다.
                </p>
              </fieldset>
            </>
          )}

          {(section === "sellers" || (section === "stores" && !row)) && (
            <fieldset className="admin-field-group admin-contact-fields">
              <legend>담당자 정보</legend>
              <label>
                담당자 이름
                <input
                  id="adminInputContactName"
                  required
                  maxLength={100}
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </label>
              <label>
                담당자 전화번호
                <input
                  id="adminInputContactPhone"
                  required
                  type="tel"
                  value={phone}
                  placeholder="010-1234-5678"
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              <label>
                이메일
                <input
                  id="adminInputEmail"
                  required
                  type="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <p>담당자 정보는 구매자에게 공개하지 않습니다.</p>
            </fieldset>
          )}

          {(section !== "markets" || marketReady) && (
            <div className="admin-form-actions">
              <button
                type="submit"
                id="btnAdminSubmit"
                className="admin-primary-action"
                disabled={busy || mapPending}
              >
                {busy
                  ? "저장 중…"
                  : !row
                    ? section === "markets"
                      ? "시장 등록"
                      : "매장·판매자 등록"
                    : "저장"}
              </button>
            </div>
          )}
        </form>
      )}

      {section === "orders" &&
        (items ? (
          <div className="admin-table-wrap">
            <table className="info-data-table">
              <thead>
                <tr>
                  {[
                    "storeName",
                    "productName",
                    "priceWon",
                    "quantity",
                    "pickupDate",
                    "startTime",
                    "endTime",
                  ].map((k) => (
                    <th key={k} scope="col">
                      {labels[k] ?? k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index}>
                    {[
                      "storeName",
                      "productName",
                      "priceWon",
                      "quantity",
                      "pickupDate",
                      "startTime",
                      "endTime",
                    ].map((k) => (
                      <td key={k}>{text(item, k)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !error && <p role="status">주문 상품을 불러오는 중…</p>
        ))}

      {/* 매장 운영 중지 / 재개 관리 (section === "stores" && row) */}
      {section === "stores" && row && (
        <div
          className="admin-operation-box"
          id="adminStoreOperationSection"
          style={{ marginTop: 24 }}
        >
          <h4>매장 운영 상태 변경</h4>
          <p>
            현재 운영 상태: <strong>{row.suspended ? "운영 중지" : "정상 운영 중"}</strong>
            {row.operationReason ? ` (사유: ${String(row.operationReason)})` : ""}
          </p>
          <div className="field-group" style={{ marginTop: 8 }}>
            <label htmlFor="adminOperationReasonInput">
              {row.suspended ? "운영 재개 사유" : "운영 중지 사유"} (1~500자 필수)
            </label>
            <textarea
              id="adminOperationReasonInput"
              className="input-box"
              rows={3}
              maxLength={500}
              value={operationReason}
              disabled={busy}
              onChange={(e) => setOperationReason(e.target.value)}
              placeholder={
                row.suspended
                  ? "운영 재개 사유를 구체적으로 입력해 주세요."
                  : "운영 중지 사유를 구체적으로 입력해 주세요."
              }
            />
          </div>
          <button
            type="button"
            id="btnAdminToggleOperation"
            className={row.suspended ? "btn-query-store" : "btn-danger-outline"}
            disabled={busy || !operationReason.trim()}
            onClick={async () => {
              const trimmed = operationReason.trim();
              if (!trimmed) {
                setError("운영 변경 사유를 입력해 주세요.");
                return;
              }
              setBusy(true);
              setError("");
              try {
                await updateStoreOperation(row.id, {
                  suspended: !row.suspended,
                  reason: trimmed,
                });
                if (mountedRef.current) onSaved();
              } catch (err: unknown) {
                if (!mountedRef.current) return;
                if (err instanceof ApiError && err.status === 401) onSessionExpired();
                else
                  setError(
                    err instanceof Error ? err.message : "매장 운영 상태를 변경하지 못했습니다.",
                  );
              } finally {
                if (mountedRef.current) setBusy(false);
              }
            }}
          >
            {row.suspended ? "매장 운영 재개" : "매장 운영 중지"}
          </button>
        </div>
      )}

      {/* 매장 제보 확인 / 처리 완료 관리 (section === "store-reports" && row) */}
      {section === "store-reports" && row && (
        <div
          className="admin-report-resolve-box"
          id="adminStoreReportResolveSection"
          style={{ marginTop: 24 }}
        >
          <h4>매장 제보 처리</h4>
          <p>
            제보자: {String(row.buyerLoginId)} · 판매자 담당자:{" "}
            {row.contactName
              ? `${String(row.contactName)} (${String(row.contactPhone || "-")})`
              : "담당자 연락처 누락"}
          </p>
          {row.status !== "RESOLVED" ? (
            <>
              <div className="field-group" style={{ marginTop: 8 }}>
                <label htmlFor="adminReportNextStatus">변경할 상태</label>
                <select
                  id="adminReportNextStatus"
                  className="input-box"
                  value={reportNextStatus}
                  disabled={busy}
                  onChange={(e) => setReportNextStatus(e.target.value)}
                >
                  {row.status === "OPEN" && <option value="REVIEWING">확인 중</option>}
                  <option value="RESOLVED">처리 완료</option>
                </select>
              </div>
              {reportNextStatus === "RESOLVED" && (
                <div className="field-group" style={{ marginTop: 8 }}>
                  <label htmlFor="adminReportResolutionInput">완료 처리 내용 (1~500자 필수)</label>
                  <textarea
                    id="adminReportResolutionInput"
                    className="input-box"
                    rows={3}
                    maxLength={500}
                    required
                    value={reportResolution}
                    disabled={busy}
                    onChange={(e) => setReportResolution(e.target.value)}
                    placeholder="현장 확인 결과 및 처리 내용을 구체적으로 입력해 주세요."
                  />
                </div>
              )}
              <button
                type="button"
                id="btnAdminResolveReport"
                className="btn-query-store"
                disabled={busy || (reportNextStatus === "RESOLVED" && !reportResolution.trim())}
                onClick={async () => {
                  if (!row) return;
                  if (reportNextStatus === "RESOLVED" && !reportResolution.trim()) {
                    setError("완료 처리 내용을 입력해 주세요.");
                    return;
                  }
                  const reportId = row.id;
                  setBusy(true);
                  setError("");
                  try {
                    await resolveAdminStoreReport(reportId, {
                      status: reportNextStatus,
                      resolution: reportNextStatus === "RESOLVED" ? reportResolution.trim() : "",
                    });
                    if (mountedRef.current) onSaved();
                  } catch (err: unknown) {
                    if (!mountedRef.current) return;
                    if (err instanceof ApiError && err.status === 401) onSessionExpired();
                    else setError(err instanceof Error ? err.message : "제보 처리에 실패했습니다.");
                  } finally {
                    if (mountedRef.current) setBusy(false);
                  }
                }}
              >
                상태 변경 저장
              </button>
            </>
          ) : (
            <p className="notice-text">
              <strong>완료 처리 내용:</strong> {String(row.resolution || "처리 완료")}
            </p>
          )}
        </div>
      )}

      {/* 주문 상세 운영 및 관리자 대신 취소 (section === "orders" && row) */}
      {section === "orders" && storeOrders && (
        <div
          className="admin-store-orders-section"
          id="adminStoreOrdersSection"
          style={{ marginTop: 24 }}
        >
          <h4>매장별 주문 운영 상세</h4>
          {storeOrders.map((storeOrder) => (
            <section
              key={storeOrder.id}
              className="admin-store-order-card"
              data-store-order-id={storeOrder.id}
              style={{
                border: "1px solid var(--color-border)",
                padding: 16,
                borderRadius: "var(--radius-sm)",
                marginBottom: 16,
              }}
            >
              <div
                className="admin-store-order-header"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <strong>
                  {storeOrder.storeName} (매장 주문 #{storeOrder.id})
                </strong>
                <span className={`badge-tag badge-${storeOrder.status.toLowerCase()}`}>
                  {formatStoreOrderStatus(storeOrder.status)}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 12 }}>
                {storeOrder.pickupDate} 수령 {storeOrder.startTime.slice(0, 5)}~
                {storeOrder.endTime.slice(0, 5)} · 주문 마감 {storeOrder.orderDeadline.slice(0, 5)}
              </p>

              <table className="info-data-table">
                <thead>
                  <tr>
                    <th scope="col">상품명</th>
                    <th scope="col">수량</th>
                    <th scope="col">가격</th>
                    <th scope="col">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {storeOrder.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.productName}</td>
                      <td>{it.quantity}</td>
                      <td>{it.priceWon.toLocaleString()}원</td>
                      <td>
                        {it.cancelled ? (
                          <span className="badge-cancelled">
                            취소됨 ({it.cancellationReason || it.cancellationType || "취소"})
                          </span>
                        ) : (
                          "유효"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(BigInt(storeOrder.cancelledWon || "0") > 0n ||
                BigInt(storeOrder.refundedWon || "0") > 0n ||
                storeOrder.refunds.length > 0) && (
                <div className="store-refund-summary" style={{ marginTop: 12 }}>
                  {BigInt(storeOrder.cancelledWon || "0") > 0n && (
                    <p>취소 금액: {BigInt(storeOrder.cancelledWon).toLocaleString()}원</p>
                  )}
                  {BigInt(storeOrder.refundedWon || "0") > 0n && (
                    <p>환불 완료 금액: {BigInt(storeOrder.refundedWon).toLocaleString()}원</p>
                  )}
                  {storeOrder.refunds.length > 0 && (
                    <ul>
                      {storeOrder.refunds.map((ref) => (
                        <li key={ref.id}>
                          환불 #{ref.id} · {BigInt(ref.amountWon).toLocaleString()}원 ·{" "}
                          {formatRefundStatus(ref.status)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* 관리자 대신 취소 폼 */}
              {storeOrder.status !== "PICKED_UP" && storeOrder.status !== "CANCELLED" && (
                <div
                  className="admin-cancel-inline-box"
                  style={{
                    marginTop: 16,
                    paddingTop: 12,
                    borderTop: "1px dashed var(--color-border)",
                  }}
                >
                  <h5>관리자 대신 취소</h5>
                  <div className="field-group" style={{ marginTop: 8 }}>
                    <label htmlFor={`adminCancelReasonType-${storeOrder.id}`}>사유 분류</label>
                    <select
                      id={`adminCancelReasonType-${storeOrder.id}`}
                      className="input-box"
                      value={cancelReasonTypes[storeOrder.id] || "BUYER_REQUEST"}
                      disabled={busy}
                      onChange={(e) =>
                        setCancelReasonTypes((prev) => ({
                          ...prev,
                          [storeOrder.id]: e.target.value as AdminCancellationReasonType,
                        }))
                      }
                    >
                      <option value="BUYER_REQUEST">구매자 요청 (마감 전)</option>
                      <option value="STORE_FAULT">매장 귀책 (마감 후)</option>
                      <option value="SERVICE_ERROR">서비스 오류 (마감 후)</option>
                    </select>
                  </div>
                  <div className="field-group" style={{ marginTop: 8 }}>
                    <label htmlFor={`adminCancelReason-${storeOrder.id}`}>
                      구체적 확인 사유 (1~500자 필수)
                    </label>
                    <textarea
                      id={`adminCancelReason-${storeOrder.id}`}
                      className="input-box"
                      rows={2}
                      maxLength={500}
                      value={cancelReasons[storeOrder.id] || ""}
                      disabled={busy}
                      onChange={(e) =>
                        setCancelReasons((prev) => ({
                          ...prev,
                          [storeOrder.id]: e.target.value,
                        }))
                      }
                      placeholder="관리자 확인 사유를 구체적으로 작성해 주세요."
                    />
                  </div>
                  <button
                    type="button"
                    id={`btnAdminCancelOrder-${storeOrder.id}`}
                    className="btn-danger-outline"
                    disabled={busy || !(cancelReasons[storeOrder.id] || "").trim()}
                    onClick={async () => {
                      if (!row) return;
                      const reason = (cancelReasons[storeOrder.id] || "").trim();
                      if (!reason) {
                        setError("취소 사유를 입력해 주세요.");
                        return;
                      }
                      const orderId = row.id;
                      setBusy(true);
                      setError("");
                      try {
                        const reasonType = cancelReasonTypes[storeOrder.id] || "BUYER_REQUEST";
                        const signature = JSON.stringify([reasonType, reason]);
                        let intent = cancellationIntents.current[storeOrder.id];
                        if (intent?.signature !== signature) {
                          intent = { signature, key: crypto.randomUUID() };
                          cancellationIntents.current[storeOrder.id] = intent;
                        }
                        await cancelAdminStoreOrder(storeOrder.id, {
                          requestKey: intent.key,
                          reasonType,
                          reason,
                        });
                        if (!mountedRef.current) return;
                        const refreshed = await getAdminManagedStoreOrders(orderId);
                        if (mountedRef.current) {
                          setStoreOrders(refreshed);
                          delete cancellationIntents.current[storeOrder.id];
                          setCancelReasons((prev) => ({ ...prev, [storeOrder.id]: "" }));
                        }
                      } catch (err: unknown) {
                        if (!mountedRef.current) return;
                        if (err instanceof ApiError && err.status === 401) onSessionExpired();
                        else
                          setError(
                            err instanceof Error
                              ? err.message
                              : "관리자 대신 취소 처리에 실패했습니다.",
                          );
                      } finally {
                        if (mountedRef.current) setBusy(false);
                      }
                    }}
                  >
                    관리자 대신 취소
                  </button>
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setLoadVersion((v) => v + 1)}>
            다시 조회
          </button>
        </p>
      )}
    </section>
  );
}
