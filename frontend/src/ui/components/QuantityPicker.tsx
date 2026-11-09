export function QuantityPicker({
  id,
  label,
  value,
  maximum,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  maximum: number;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const number = Number(value);
  return (
    <div className="quantity-picker">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <button
        type="button"
        aria-label={`${label} 줄이기`}
        disabled={disabled || number <= 1 || !Number.isInteger(number)}
        onClick={() => onChange(String(Math.max(1, number - 1)))}
      >
        −
      </button>
      <input
        id={id}
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        aria-label={`${label} 늘리기`}
        disabled={disabled || number >= maximum || !Number.isInteger(number)}
        onClick={() => onChange(String(Math.min(maximum, Math.max(1, number + 1))))}
      >
        +
      </button>
    </div>
  );
}
