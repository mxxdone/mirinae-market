const MAX_INTEGER = 2147483647;
export function convertWeightInput(value: string, from: "g" | "kg", to: "g" | "kg"): string {
  if (from === to || value === "") return value;
  const grams = parseSaleUnit("WEIGHT", value, from);
  return to === "g" ? String(grams) : String(grams / 1000);
}
function integer(value: string, minimum: number): number {
  if (!/^\d+$/.test(value)) throw new Error("공백·소수·지수 표기 없이 정수를 입력해 주세요.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > MAX_INTEGER)
    throw new Error(`${minimum.toLocaleString()}~2,147,483,647 범위로 입력해 주세요.`);
  return parsed;
}
export function parseSaleUnit(
  type: "WEIGHT" | "COUNT",
  value: string,
  weightUnit: "g" | "kg",
): number {
  if (type === "COUNT") return integer(value, 1);
  let grams: number;
  if (weightUnit === "kg") {
    if (!/^\d+(\.\d{1,3})?$/.test(value))
      throw new Error("kg는 소수 셋째 자리까지 숫자로 입력해 주세요.");
    const [whole, fraction = ""] = value.split(".");
    grams = integer(`${whole}${fraction.padEnd(3, "0")}`, 1);
  } else grams = integer(value, 1);
  if (grams % 100 !== 0) throw new Error("한 포장 중량은 100g(0.1kg)의 양의 정수 배수여야 합니다.");
  return grams;
}
export function parseOfferInput(
  price: string,
  quantity: string,
): { priceWon: number; onlineQuantity: number } {
  return { priceWon: integer(price, 1), onlineQuantity: integer(quantity, 0) };
}
export function todayPickupDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  const date = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`);
  return date.toISOString().slice(0, 10);
}
