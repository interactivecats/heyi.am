export function SkeletonLine({ width = "100%" }: { width?: string }) {
  return <div className="skeleton skeleton--line" style={{ width }} />;
}

export function SkeletonCard() {
  return (
    <div className="skeleton--card">
      <SkeletonLine width="80%" />
      <SkeletonLine width="50%" />
    </div>
  );
}
