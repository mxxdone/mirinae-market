import { useEffect, useState } from "react";
import { getAdminMarketCandidates } from "../../api/location";
import { ApiError, type MarketCandidateView, type RegionView } from "../../api/types";

interface Props {
  regions: RegionView[];
  onBrowseChange: () => void;
  onSelect: (candidate: MarketCandidateView) => void;
  onSessionExpired: () => void;
}

export function MarketCandidatePicker({
  regions,
  onSelect,
  onBrowseChange,
  onSessionExpired,
}: Props) {
  const [province, setProvince] = useState("");
  const [region, setRegion] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [items, setItems] = useState<MarketCandidateView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canSearch = Boolean(province || search.trim());

  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    setItems([]);
    setError("");
    if (!canSearch) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void getAdminMarketCandidates(search, page, abort.signal, {
      provinceCode: province || undefined,
      regionCode: region || undefined,
    })
      .then((data) => {
        if (active) setItems(data);
      })
      .catch((failure: unknown) => {
        if (!active) return;
        if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
        else
          setError(failure instanceof Error ? failure.message : "시장 목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      abort.abort();
    };
  }, [province, region, search, page, attempt, canSearch, onSessionExpired]);

  const provinces = Array.from(
    new Map(regions.map((r) => [r.provinceCode, r.provinceName])).entries(),
  );
  function searchName() {
    onBrowseChange();
    setSearch(query.trim());
    setPage(0);
    setAttempt((value) => value + 1);
  }

  return (
    <section className="admin-candidate-section" aria-label="지역별 시장 선택">
      <div className="location-row">
        <label>
          시도
          <select
            id="adminCandidateProvince"
            value={province}
            onChange={(event) => {
              onBrowseChange();
              setProvince(event.target.value);
              setRegion("");
              setPage(0);
            }}
          >
            <option value="">시도 선택</option>
            {provinces.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          시군구
          <select
            id="adminCandidateRegion"
            value={region}
            disabled={!province}
            onChange={(event) => {
              onBrowseChange();
              setRegion(event.target.value);
              setPage(0);
            }}
          >
            <option value="">전체 시군구</option>
            {regions
              .filter((r) => r.provinceCode === province)
              .map((r) => (
                <option key={r.code} value={r.code}>
                  {r.districtName}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="candidate-input-row">
        <label>
          시장명 검색 (선택)
          <input
            id="adminCandidateSearch"
            type="search"
            maxLength={100}
            placeholder="시장명 입력"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                searchName();
              }
            }}
          />
        </label>
        <button type="button" id="btnSearchCandidates" onClick={searchName}>
          시장명 검색
        </button>
      </div>
      {!canSearch && <p role="status">지역을 선택하거나 시장명을 검색해 주세요.</p>}
      {loading && <p role="status">시장 목록을 불러오는 중입니다.</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            목록 다시 불러오기
          </button>
        </p>
      )}
      {canSearch && !loading && !error && items.length === 0 && (
        <p role="status">
          해당하는 시장이 없습니다. 지역·검색어를 바꾸거나 아래의 직접 등록을 이용해 주세요.
        </p>
      )}
      {items.length > 0 && (
        <>
          <div className="candidate-results-table-wrap">
            <table className="info-data-table candidate-table">
              <caption>등록할 시장 선택</caption>
              <thead>
                <tr>
                  <th>시장명</th>
                  <th>지역</th>
                  <th>선택</th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 50).map((item) => {
                  const r = regions.find((value) => value.code === item.regionCode);
                  return (
                    <tr key={item.id} className="candidate-row">
                      <td>{item.name}</td>
                      <td>{r ? `${r.provinceShortName} ${r.districtName}` : "지역 확인 필요"}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-select-candidate"
                          onClick={() => onSelect(item)}
                        >
                          선택
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="candidate-pages">
            <button
              type="button"
              disabled={page === 0 || loading}
              onClick={() => setPage((value) => value - 1)}
            >
              이전
            </button>
            <span>{page + 1}페이지</span>
            <button
              type="button"
              disabled={items.length <= 50 || loading}
              onClick={() => setPage((value) => value + 1)}
            >
              다음
            </button>
          </div>
        </>
      )}
    </section>
  );
}
