import { useEffect, useRef, useState } from "react";
import { getMarketRegions } from "../../api/location";
import {
  geocodeAddress,
  mountAdminPickerMap,
  reverseGeocodeCoords,
  type AdminMapController,
  type Coordinates,
} from "../../api/mapSdk";
import { ApiError, type MarketCandidateView, type RegionView } from "../../api/types";

import { MarketCandidatePicker } from "./MarketCandidatePicker";

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
  const onSessionExpiredRef = useRef(props.onSessionExpired);
  useEffect(() => {
    onSessionExpiredRef.current = props.onSessionExpired;
  }, [props.onSessionExpired]);
  // 지역 목록
  const [regions, setRegions] = useState<RegionView[]>([]);
  const [selectedProvince, setSelectedProvince] = useState("");

  const [manualMode, setManualMode] = useState(Boolean(props.isEdit));
  const [candidateSelected, setCandidateSelected] = useState(false);
  const [incompleteCandidate, setIncompleteCandidate] = useState(false);
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
      ++refReqId.current;
      geoAbort.current?.abort();
      refAbortController.current?.abort();
    },
    [],
  );

  // 지도 선택기를 연결합니다.
  const showDetails = Boolean(props.isEdit || candidateSelected || manualMode);
  const locationEnabled = !props.isEdit || props.editLocationEnabled;
  const shouldRenderMap = Boolean(showDetails && locationEnabled);
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
            : "지도를 불러오지 못했습니다. 위치 정보가 있는 시장을 목록에서 선택하면 등록할 수 있습니다.",
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

  function selectCandidate(candidate: MarketCandidateView) {
    cancelGeocode();
    clearReference();
    setCandidateSelected(true);
    const incomplete =
      !candidate.regionCode ||
      !candidate.address ||
      candidate.latitude == null ||
      candidate.longitude == null;
    setIncompleteCandidate(incomplete);
    if (incomplete) setManualMode(true);
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
          : "해당 주소의 위치를 찾지 못했습니다. 주소를 확인하거나 지도에서 위치를 선택해 주세요.",
      );
    } finally {
      if (current === geoReqId.current) setGeocoding(false);
    }
  }

  function resetCandidate() {
    cancelGeocode();
    clearReference();
    setCandidateSelected(false);
    setIncompleteCandidate(false);
    if (!props.isEdit) props.onNameChange("");
    props.onAddressChange("");
    props.onRegionCodeChange("");
    props.onLatitudeChange(null);
    props.onLongitudeChange(null);
    setSelectedProvince("");
  }

  return (
    <div className="admin-market-location-fields">
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

      {regionError && (
        <p role="alert">
          {regionError}{" "}
          <button type="button" onClick={() => setRegionAttempt((value) => value + 1)}>
            지역 목록 다시 불러오기
          </button>
        </p>
      )}
      {locationEnabled && (
        <>
          {!manualMode && (
            <MarketCandidatePicker
              regions={regions}
              onBrowseChange={resetCandidate}
              onSelect={selectCandidate}
              onSessionExpired={props.onSessionExpired}
            />
          )}
          <button
            type="button"
            id="btnToggleManualMarket"
            onClick={() => {
              cancelGeocode();
              clearReference();
              setManualMode(!manualMode);
              if (!props.isEdit) {
                setCandidateSelected(false);
                setIncompleteCandidate(false);
                props.onNameChange("");
                props.onAddressChange("");
                props.onRegionCodeChange("");
                props.onLatitudeChange(null);
                props.onLongitudeChange(null);
                setSelectedProvince("");
              }
            }}
          >
            {manualMode ? "지역별 시장 목록에서 선택" : "목록에 없는 시장 직접 등록"}
          </button>
          {candidateSelected && !manualMode && (
            <button type="button" id="btnEditMarketLocation" onClick={() => setManualMode(true)}>
              주소·위치 정보 보완
            </button>
          )}
          {manualMode && (
            <p>
              지역·시장 이름·대표 주소를 입력하고 주소로 위치를 찾거나 지도에서 위치를 지정해
              주세요.
            </p>
          )}
          {incompleteCandidate && (
            <p role="status">
              선택한 시장의 위치 정보가 부족합니다. 지역·주소·지도 위치를 확인해 보완해 주세요.
            </p>
          )}
        </>
      )}
      {showDetails && (
        <>
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
        </>
      )}
      {/* 위치 정보 입력 영역 (신규 등록이거나 수정 모드에서 체크 시 노출) */}
      {shouldRenderMap && (
        <>
          {manualMode ? (
            <>
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
            </>
          ) : (
            <p id="adminSelectedRegion">
              지역: {regions.find((r) => r.code === props.regionCode)?.provinceShortName}{" "}
              {regions.find((r) => r.code === props.regionCode)?.districtName}
            </p>
          )}
          {/* 대표 주소 및 주소 검색 */}
          <div className="address-input-group">
            <label>
              대표 주소
              <div className="input-with-button">
                <input
                  id="adminInputAddress"
                  required
                  readOnly={!manualMode}
                  maxLength={500}
                  value={props.address}
                  onChange={(e) => {
                    cancelGeocode();
                    clearReference();
                    props.onAddressChange(e.target.value);
                  }}
                  placeholder="예: 서울특별시 종로구 창경궁로 88"
                />
                {manualMode && (
                  <button
                    type="button"
                    id="btnGeocodeAddress"
                    disabled={geocoding || !props.address.trim()}
                    onClick={() => void handleGeocode()}
                  >
                    {geocoding ? "검색 중…" : "주소로 위치 찾기"}
                  </button>
                )}
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

          <p id="adminPositionStatus" role="status">
            {latitude != null && longitude != null
              ? "지도 위치가 지정되었습니다."
              : "주소로 위치를 찾거나 지도에서 표시점을 선택해 주세요."}
          </p>
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
                  지도에 연결할 수 없어도 위치 정보가 있는 시장을 목록에서 선택하셨다면 저장할 수
                  있습니다.
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
