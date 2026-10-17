import { useEffect, useRef, useState } from "react";
import { getAdminMarketCandidates, getMarketRegions } from "../../api/location";
import {
  geocodeAddress,
  mountAdminPickerMap,
  reverseGeocodeCoords,
  type AdminMapController,
  type Coordinates,
} from "../../api/mapSdk";
import { ApiError, type MarketCandidateView, type RegionView } from "../../api/types";

interface Props {
  onSessionExpired: () => void;
  name: string;
  onNameChange: (name: string) => void;
  regionCode: string;
  onRegionCodeChange: (code: string) => void;
  address: string;
  onAddressChange: (address: string) => void;
  latitude: number | null;
  onLatitudeChange: (lat: number | null) => void;
  longitude: number | null;
  onLongitudeChange: (lng: number | null) => void;
  isEdit?: boolean;
  editLocationEnabled?: boolean;
  onToggleEditLocation?: (enabled: boolean) => void;
  currentRegionLabel?: string | null;
  currentAddress?: string | null;
  currentLatitude?: number | null;
  currentLongitude?: number | null;
}

export function AdminMarketLocationForm(props: Props) {
  const [regionError, setRegionError] = useState("");
  const [regionAttempt, setRegionAttempt] = useState(0);
  const geoReqId = useRef(0);
  const geoAbort = useRef<AbortController | null>(null);
  const candidateReqId = useRef(0);
  const candidateAbort = useRef<AbortController | null>(null);
  const onSessionExpiredRef = useRef(props.onSessionExpired);
  useEffect(() => {
    onSessionExpiredRef.current = props.onSessionExpired;
  }, [props.onSessionExpired]);
  // 지역 목록
  const [regions, setRegions] = useState<RegionView[]>([]);
  const [selectedProvince, setSelectedProvince] = useState("");

  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidatePage, setCandidatePage] = useState(0);
  const [candidates, setCandidates] = useState<MarketCandidateView[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState("");
  const [showCandidateSection, setShowCandidateSection] = useState(!props.isEdit);

  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState("");

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapControllerRef = useRef<AdminMapController | null>(null);
  const [mapError, setMapError] = useState("");

  const [refAddress, setRefAddress] = useState("");
  const [refAddressLoading, setRefAddressLoading] = useState(false);
  const [refAddressError, setRefAddressError] = useState("");
  const lastCoordsRef = useRef<Coordinates | null>(null);
  const refReqId = useRef(0);
  const refAbortController = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setRegionError("");
    void getMarketRegions(abort.signal)
      .then((data) => {
        if (active) setRegions(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) onSessionExpiredRef.current();
        else setRegionError("지역 목록을 불러오지 못했습니다.");
      });
    return () => {
      active = false;
      abort.abort();
    };
  }, [regionAttempt]);

  useEffect(() => {
    if (props.regionCode && regions.length > 0) {
      const match = regions.find((r) => r.code === props.regionCode);
      if (match) {
        setSelectedProvince(match.provinceCode);
      }
    }
  }, [props.regionCode, regions]);

  const provinces = Array.from(
    new Map(
      regions.map((r) => [r.provinceCode, { code: r.provinceCode, name: r.provinceName }]),
    ).values(),
  ).sort((a, b) => a.code.localeCompare(b.code));

  const districts = regions.filter((r) => r.provinceCode === selectedProvince);

  const { onLatitudeChange, onLongitudeChange, latitude, longitude } = props;
  const onLatitudeChangeRef = useRef(onLatitudeChange);
  const onLongitudeChangeRef = useRef(onLongitudeChange);
  useEffect(() => {
    onLatitudeChangeRef.current = onLatitudeChange;
    onLongitudeChangeRef.current = onLongitudeChange;
  }, [onLatitudeChange, onLongitudeChange]);

  const latestCoordsRef = useRef<Coordinates | null>(
    latitude != null && longitude != null ? { latitude, longitude } : null,
  );

  useEffect(() => {
    latestCoordsRef.current =
      latitude != null && longitude != null ? { latitude, longitude } : null;
    if (latestCoordsRef.current) mapControllerRef.current?.setPosition(latestCoordsRef.current);
  }, [latitude, longitude]);

  useEffect(
    () => () => {
      ++geoReqId.current;
      ++candidateReqId.current;
      ++refReqId.current;
      geoAbort.current?.abort();
      candidateAbort.current?.abort();
      refAbortController.current?.abort();
    },
    [],
  );

  // 지도 선택기를 연결합니다.
  const shouldRenderMap = !props.isEdit || props.editLocationEnabled;
  useEffect(() => {
    if (!shouldRenderMap) {
      mapControllerRef.current?.destroy();
      mapControllerRef.current = null;
      return;
    }

    let active = true;
    const mapAbort = new AbortController();
    const container = mapContainerRef.current;
    if (!container) return;

    setMapError("");
    const initialCoords = latestCoordsRef.current;

    void mountAdminPickerMap(
      container,
      {
        initialCoords,
        onCoordsChange(coords) {
          if (!active) return;
          cancelGeocode();
          onLatitudeChangeRef.current(coords.latitude);
          onLongitudeChangeRef.current(coords.longitude);
          lastCoordsRef.current = coords;

          lookupRefAddress(coords);
        },
      },
      mapAbort.signal,
    )
      .then((controller) => {
        if (!active) {
          controller.destroy();
          return;
        }
        mapControllerRef.current = controller;
        if (latestCoordsRef.current) controller.setPosition(latestCoordsRef.current);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setMapError(
          err instanceof Error
            ? err.message
            : "지도를 불러오지 못했습니다. 주소와 좌표를 직접 입력해 등록할 수 있습니다.",
        );
      });

    return () => {
      active = false;
      mapAbort.abort();
      mapControllerRef.current?.destroy();
      mapControllerRef.current = null;
      refAbortController.current?.abort();
    };
  }, [shouldRenderMap]);

  function lookupRefAddress(coords: Coordinates) {
    const currentReq = ++refReqId.current;
    refAbortController.current?.abort();
    refAbortController.current = new AbortController();

    setRefAddress("");
    setRefAddressError("");
    setRefAddressLoading(true);

    void reverseGeocodeCoords(coords, refAbortController.current.signal)
      .then((res) => {
        if (currentReq !== refReqId.current) return;
        setRefAddress(res.address);
        setRefAddressError("");
      })
      .catch((err: unknown) => {
        if (currentReq !== refReqId.current) return;
        setRefAddress("");
        setRefAddressError(err instanceof Error ? err.message : "참고 주소를 조회하지 못했습니다.");
      })
      .finally(() => {
        if (currentReq === refReqId.current) {
          setRefAddressLoading(false);
        }
      });
  }

  async function searchCandidates(page = 0) {
    const current = ++candidateReqId.current;
    candidateAbort.current?.abort();
    candidateAbort.current = new AbortController();
    setCandidateLoading(true);
    setCandidateError("");
    try {
      const data = await getAdminMarketCandidates(
        candidateQuery,
        page,
        candidateAbort.current.signal,
      );
      if (current !== candidateReqId.current) return;
      setCandidates(data);
      setCandidatePage(page);
    } catch (err) {
      if (current !== candidateReqId.current) return;
      if (err instanceof ApiError && err.status === 401) onSessionExpiredRef.current();
      setCandidateError(err instanceof Error ? err.message : "후보 목록을 불러오지 못했습니다.");
    } finally {
      if (current === candidateReqId.current) setCandidateLoading(false);
    }
  }

  function selectCandidate(candidate: MarketCandidateView) {
    cancelGeocode();
    clearReference();
    setSelectedProvince("");
    props.onNameChange(candidate.name);
    props.onAddressChange(candidate.address ?? "");
    props.onRegionCodeChange(candidate.regionCode ?? "");
    props.onLatitudeChange(candidate.latitude);
    props.onLongitudeChange(candidate.longitude);
    if (candidate.latitude != null && candidate.longitude != null) {
      props.onLatitudeChange(candidate.latitude);
      props.onLongitudeChange(candidate.longitude);
      mapControllerRef.current?.setPosition({
        latitude: candidate.latitude,
        longitude: candidate.longitude,
      });
      lastCoordsRef.current = { latitude: candidate.latitude, longitude: candidate.longitude };
      lookupRefAddress({ latitude: candidate.latitude, longitude: candidate.longitude });
    }
  }

  function cancelGeocode() {
    ++geoReqId.current;
    geoAbort.current?.abort();
    setGeocoding(false);
    setGeocodeError("");
  }

  function clearReference() {
    ++refReqId.current;
    refAbortController.current?.abort();
    lastCoordsRef.current = null;
    setRefAddress("");
    setRefAddressError("");
    setRefAddressLoading(false);
  }

  // 입력이 바뀌면 이전 주소 검색 결과를 폐기합니다.
  async function handleGeocode() {
    if (!props.address || props.address.trim().length === 0) {
      setGeocodeError("검색할 대표 주소를 입력해 주세요.");
      return;
    }
    cancelGeocode();
    const current = ++geoReqId.current;
    geoAbort.current = new AbortController();
    setGeocoding(true);
    setGeocodeError("");
    try {
      const res = await geocodeAddress(props.address.trim(), geoAbort.current.signal);
      if (current !== geoReqId.current) return;
      props.onLatitudeChange(res.latitude);
      props.onLongitudeChange(res.longitude);
      mapControllerRef.current?.setPosition({
        latitude: res.latitude,
        longitude: res.longitude,
      });
      lastCoordsRef.current = { latitude: res.latitude, longitude: res.longitude };
      lookupRefAddress({ latitude: res.latitude, longitude: res.longitude });
    } catch (err) {
      if (current !== geoReqId.current) return;
      setGeocodeError(
        err instanceof Error
          ? err.message
          : "해당 주소의 위치를 찾지 못했습니다. 지도를 직접 클릭하거나 좌표를 입력할 수 있습니다.",
      );
    } finally {
      if (current === geoReqId.current) setGeocoding(false);
    }
  }

  return (
    <div className="admin-market-location-fields">
      {/* 시장 이름 입력 */}
      <label>
        시장 이름
        <input
          id="adminInputName"
          required
          maxLength={100}
          value={props.name}
          onChange={(e) => props.onNameChange(e.target.value)}
          placeholder="시장 이름을 입력하세요"
        />
      </label>

      {/* 수정 모드일 때 위치 정보 수정 여부 토글 */}
      {props.isEdit && (
        <div className="location-edit-toggle">
          <label className="checkbox-label">
            <input
              type="checkbox"
              id="adminToggleEditLocation"
              checked={props.editLocationEnabled}
              onChange={(e) => props.onToggleEditLocation?.(e.target.checked)}
            />
            시장 위치 정보 수정 (미선택 시 기존 위치 보존)
          </label>
          {!props.editLocationEnabled && (
            <p className="field-help-text">
              현재 위치: {props.currentRegionLabel ?? "위치 미등록"} ·{" "}
              {props.currentAddress ?? "주소 미등록"}
            </p>
          )}
        </div>
      )}

      {/* 위치 정보 입력 영역 (신규 등록이거나 수정 모드에서 체크 시 노출) */}
      {shouldRenderMap && (
        <>
          {/* 공공데이터 시장 후보 검색 및 선택 보조 */}
          <div className="admin-candidate-section">
            <div className="candidate-section-header">
              <h4>공공시장 등록 후보 검색 (선택 보조)</h4>
              <button
                type="button"
                className="btn-secondary-sm"
                onClick={() => setShowCandidateSection(!showCandidateSection)}
              >
                {showCandidateSection ? "후보 검색 접기" : "후보 검색 열기"}
              </button>
            </div>
            {showCandidateSection && (
              <div className="candidate-search-box">
                <div className="candidate-input-row">
                  <input
                    type="search"
                    id="adminCandidateSearch"
                    placeholder="시장명 또는 주소 검색 (예: 성정시장)"
                    value={candidateQuery}
                    onChange={(e) => setCandidateQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void searchCandidates(0);
                      }
                    }}
                  />
                  <button
                    type="button"
                    id="btnSearchCandidates"
                    disabled={candidateLoading}
                    onClick={() => void searchCandidates(0)}
                  >
                    {candidateLoading ? "검색 중…" : "후보 검색"}
                  </button>
                </div>
                {candidateError && (
                  <p role="alert" className="error-text">
                    {candidateError}
                  </p>
                )}
                {candidates.length > 0 && (
                  <div className="candidate-results-table-wrap">
                    <table className="info-data-table candidate-table">
                      <thead>
                        <tr>
                          <th>시장명</th>
                          <th>주소</th>
                          <th>지역</th>
                          <th>기준일</th>
                          <th>선택</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidates.slice(0, 50).map((cand) => (
                          <tr key={cand.id} className="candidate-row">
                            <td>{cand.name}</td>
                            <td>{cand.address ?? "주소 미확인"}</td>
                            <td>
                              {regions.find((r) => r.code === cand.regionCode)?.districtName ??
                                "지역 확인 필요"}
                            </td>
                            <td>{cand.sourceDate}</td>
                            <td>
                              <button
                                type="button"
                                className="btn-select-candidate"
                                onClick={() => selectCandidate(cand)}
                              >
                                선택
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="candidate-pages">
                      <button
                        type="button"
                        disabled={candidatePage === 0 || candidateLoading}
                        onClick={() => void searchCandidates(candidatePage - 1)}
                      >
                        이전
                      </button>
                      <span>{candidatePage + 1}페이지</span>
                      <button
                        type="button"
                        disabled={candidates.length <= 50 || candidateLoading}
                        onClick={() => void searchCandidates(candidatePage + 1)}
                      >
                        다음
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {regionError && (
            <p role="alert">
              {regionError}{" "}
              <button type="button" onClick={() => setRegionAttempt((value) => value + 1)}>
                지역 목록 다시 불러오기
              </button>
            </p>
          )}
          {/* 지역 선택: 시도 & 시군구 */}
          <div className="location-row">
            <label>
              시도
              <select
                id="adminSelectProvince"
                value={selectedProvince}
                onChange={(e) => {
                  setSelectedProvince(e.target.value);
                  props.onRegionCodeChange("");
                }}
              >
                <option value="">시도를 선택하세요</option>
                {provinces.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              시군구
              <select
                id="adminSelectRegion"
                required
                value={props.regionCode}
                onChange={(e) => props.onRegionCodeChange(e.target.value)}
                disabled={!selectedProvince || districts.length === 0}
              >
                <option value="">시군구를 선택하세요</option>
                {districts.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.districtName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* 대표 주소 및 주소 검색 */}
          <div className="address-input-group">
            <label>
              대표 주소
              <div className="input-with-button">
                <input
                  id="adminInputAddress"
                  required
                  maxLength={500}
                  value={props.address}
                  onChange={(e) => {
                    cancelGeocode();
                    clearReference();
                    props.onAddressChange(e.target.value);
                  }}
                  placeholder="예: 서울특별시 종로구 창경궁로 88"
                />
                <button
                  type="button"
                  id="btnGeocodeAddress"
                  disabled={geocoding || !props.address.trim()}
                  onClick={() => void handleGeocode()}
                >
                  {geocoding ? "검색 중…" : "주소로 위치 찾기"}
                </button>
              </div>
            </label>
            {geocodeError && (
              <p role="alert" className="error-text" id="adminGeocodeError">
                {geocodeError}
              </p>
            )}
            <p className="field-help-text">
              대표 주소는 시장의 공식 주소입니다. 지도 표시 위치를 변경하더라도 대표 주소는 자동으로
              바뀌지 않습니다.
            </p>
          </div>

          {/* 대표 위치 좌표 */}
          <div className="location-row">
            <label>
              위도 (Latitude)
              <input
                type="number"
                id="adminInputLatitude"
                required
                step="any"
                value={props.latitude ?? ""}
                onChange={(e) => {
                  cancelGeocode();
                  clearReference();
                  props.onLatitudeChange(e.target.value ? parseFloat(e.target.value) : null);
                }}
                placeholder="예: 37.5700"
              />
            </label>
            <label>
              경도 (Longitude)
              <input
                type="number"
                id="adminInputLongitude"
                required
                step="any"
                value={props.longitude ?? ""}
                onChange={(e) => {
                  cancelGeocode();
                  clearReference();
                  props.onLongitudeChange(e.target.value ? parseFloat(e.target.value) : null);
                }}
                placeholder="예: 126.9990"
              />
            </label>
          </div>

          {/* 지도 및 표시점 위치 조정 */}
          <div className="admin-map-section">
            <div className="map-section-header">
              <h4>지도 표시 위치 조정</h4>
              <span className="field-help-text">
                마커를 드래그하거나 지도를 클릭하여 위치를 조정할 수 있습니다.
              </span>
            </div>

            {mapError && (
              <div className="map-error-notice" role="alert">
                <p>{mapError}</p>
                <p className="field-help-text">
                  지도 SDK에 연결할 수 없어도 주소와 좌표가 입력되어 있거나 DB 후보를 선택하셨다면
                  정상 저장할 수 있습니다.
                </p>
              </div>
            )}

            <div
              id="adminMapPicker"
              ref={mapContainerRef}
              className="admin-map-canvas"
              style={{ minHeight: "260px", width: "100%", background: "#f0ede6" }}
            />

            {/* 참고 주소 안내 영역 */}
            <div className="reference-address-box">
              {refAddressLoading && (
                <p className="ref-loading" role="status">
                  참고 주소 조회 중…
                </p>
              )}
              {refAddress && (
                <p className="ref-success" id="adminReferenceAddress">
                  <strong>지점 참고 주소:</strong> {refAddress}
                </p>
              )}
              {refAddressError && (
                <div className="ref-error" id="adminRefAddressError" role="alert">
                  <span>{refAddressError}</span>
                  {lastCoordsRef.current && (
                    <button
                      type="button"
                      className="btn-retry-sm"
                      onClick={() => lookupRefAddress(lastCoordsRef.current!)}
                    >
                      다시 조회
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
