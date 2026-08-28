import { Compass, RefreshCw, Sparkles } from "lucide-react";
import styles from "@/app/community/community.module.css";

export function CommunityEmptyState(props: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  error?: boolean;
}) {
  return (
    <section className={`${styles.emptyState} ${props.error ? styles.emptyStateError : ""}`} role="status">
      <div className={styles.emptyIcon} aria-hidden="true">
        {props.error ? <RefreshCw size={19} /> : <Compass size={19} />}
      </div>
      <div>
        <h2>{props.title}</h2>
        <p>{props.body}</p>
      </div>
      {props.actionLabel && props.onAction ? (
        <button type="button" className={styles.retryButton} onClick={props.onAction}>
          <Sparkles size={14} />
          {props.actionLabel}
        </button>
      ) : null}
    </section>
  );
}
