export function SkeletonText({
  width = "w-20",
  height = "h-4",
}: {
  width?: string;
  height?: string;
}) {
  return (
    <span
      className={`inline-block animate-pulse rounded bg-cream-dark ${width} ${height}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="flex-none animate-pulse rounded-lg border border-border p-4" style={{ minWidth: "140px" }}>
      <div className="h-3 w-12 rounded bg-cream-dark" />
      <div className="mt-3 h-7 w-16 rounded bg-cream-dark" />
      <div className="mt-2 h-3 w-10 rounded bg-cream-dark" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="animate-pulse rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-cream-dark" />
          <div className="h-5 w-16 rounded bg-cream-dark" />
        </div>
        <div className="h-5 w-12 rounded bg-cream-dark" />
      </div>
    </div>
  );
}
