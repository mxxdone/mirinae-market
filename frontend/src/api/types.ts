/**
 * 미리내 마켓 Phase 2 API 계약 공용 타입 정의
 */

export interface HealthResponse {
  status: string;
}

export interface CsrfToken {
  token: string;
  headerName: string;
}

export interface SignupRequest {
  loginId: string;
  password: string;
  displayName: string;
  email: string;
}

export interface AccountView {
  id: number;
  loginId: string;
  displayName: string;
  email: string;
  role: string;
}

export interface LoginResponse {
  authenticated: boolean;
}

export type UserRole = "BUYER" | "SELLER" | "ADMIN";

export interface UserMe {
  id: number;
  loginId: string;
  displayName: string;
  role: UserRole;
  requiresPasswordChange: boolean;
}

export interface StoreView {
  id: number;
  marketId: number;
  name: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  issues?: SaleIssue[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: SaleIssue[];

  constructor(status: number, code: string, message: string, issues: SaleIssue[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

export type UnitType = "WEIGHT" | "COUNT";
export interface MarketView {
  id: number;
  name: string;
}

export interface RegionView {
  code: string;
  provinceCode: string;
  provinceName: string;
  provinceShortName: string;
  districtName: string;
}

export interface LocatedMarketView {
  id: number;
  name: string;
  regionCode: string | null;
  provinceCode: string | null;
  regionLabel: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
}

export interface MarketCandidateView {
  id: string;
  name: string;
  regionCode: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceDate: string;
}

export interface MarketLocationInput {
  regionCode: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface MarketCreateInput extends MarketLocationInput {
  name: string;
}

export interface MarketUpdateInput {
  name: string;
  location?: MarketLocationInput | null;
}

export interface MarketFilterParams {
  provinceCode?: string;
  regionCode?: string;
  query?: string;
  latitude?: number;
  longitude?: number;
}
export interface ProductInput {
  name: string;
  description: string;
  unitType: UnitType;
  unitAmount: number;
}
export interface ProductView extends ProductInput {
  id: number;
  storeId: number;
  hasSales: boolean;
}
export interface OfferInput {
  inventoryVersion?: number | null;
  priceWon: number;
  onlineQuantity: number;
}
export interface PickupWindowInput {
  startTime: string;
  endTime: string;
  orderDeadline: string;
}
export interface OfferView extends OfferInput, PickupWindowInput {
  id: number;
  productId: number;
  marketId: number;
  storeId: number;
  storeName: string;
  productName: string;
  description: string;
  unitType: UnitType;
  unitAmount: number;
  pickupDate: string;
  comparisonUnit: string;
  comparisonPriceWon: number;
}
export interface ResultPage<T> {
  items: T[];
  page: number;
  size: number;
  hasNext: boolean;
}

export interface ProductPage extends ResultPage<ProductView> {
  totalItems: number;
}

export interface OfferPage extends ResultPage<OfferView> {
  totalItems: number;
}

export interface SaleIssue {
  productId: number | null;
  message: string;
}
export interface SaleChange {
  inventoryVersion?: number | null;
  productId: number;
  selling: boolean;
  priceWon: number | null;
  onlineQuantity: number | null;
}
export interface SaleProductView {
  inventoryVersion: number | null;
  product: ProductView;
  selling: boolean;
  priceWon: number | null;
  onlineQuantity: number | null;
}
export interface SaleProductPage extends ResultPage<SaleProductView> {
  totalItems: number;
}
export interface SaleBatchInput extends PickupWindowInput {
  products: SaleChange[];
}
