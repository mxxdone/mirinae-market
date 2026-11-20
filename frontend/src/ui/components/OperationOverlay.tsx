export function OperationOverlay({ label }: { label: string }) {
  return (
    <div className="operation-overlay" role="status">
      <span className="spinner-icon spinner-on-light" aria-hidden="true" />
      {label}
    </div>
  );
}
