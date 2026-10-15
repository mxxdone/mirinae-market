export function purchaseQuantity(input: string): number {
  if (!/^[1-9][0-9]*$/.test(input)) throw new Error("구매 수량은 양의 정수로 입력해 주세요.");
  const value = Number(input);
  if (!Number.isSafeInteger(value) || value > 2147483647)
    throw new Error("구매 수량은 2,147,483,647 이하로 입력해 주세요.");
  return value;
}
