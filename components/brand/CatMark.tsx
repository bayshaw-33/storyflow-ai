type CatMarkProps = {
  className?: string;
  state?: "idle" | "thinking" | "generating" | "success" | "error";
};

export function CatMark({ className = "", state = "idle" }: CatMarkProps) {
  return (
    <span className={`kiikis-cat-mark ${className}`} data-state={state} aria-hidden="true">
      <span className="cat-head" />
      <span className="cat-ear left" />
      <span className="cat-ear right" />
      <span className="cat-tail" />
      <span className="cat-star" />
    </span>
  );
}
