export function ProgressBar({ value }: { value: number }) {
  return (
    <div aria-hidden className="h-2 rounded bg-border">
      <div className="h-2 rounded bg-accent" style={{ width: `${value}%` }} />
    </div>
  );
}
