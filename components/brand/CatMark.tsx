type CatMarkProps = {
  className?: string;
  state?: "idle" | "thinking" | "generating" | "success" | "error";
};

export function CatMark({ className = "", state = "idle" }: CatMarkProps) {
  return (
    <span className={`kiikis-cat-mark ${className}`} data-state={state} aria-hidden="true">
      <img className="kiikis-mark-image" src="/brand/kiikis-cat-mark.png" alt="" />
    </span>
  );
}
