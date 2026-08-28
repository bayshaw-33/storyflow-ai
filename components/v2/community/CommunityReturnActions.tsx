import { ArrowUpRight, Check, LockKeyhole } from "lucide-react";
import type { PublicationSourceType } from "@/lib/contracts/v2/community";
import { getPublicationReturnActions } from "@/lib/client/v2/community/view-model";
import styles from "@/app/community/community.module.css";

export function CommunityReturnActions(props: {
  allowedActions: readonly string[];
  sourceType: PublicationSourceType;
  sourceHref: string | null;
}) {
  const actions = getPublicationReturnActions(props);
  return (
    <section className={styles.returnActions} aria-label="继续创作">
      <div className={styles.returnActionsHeading}>
        <div>
          <span className={styles.panelKicker}>RETURN TO CREATION</span>
          <h2>继续创作</h2>
        </div>
        <span className={styles.returnActionsHint}>真实入口</span>
      </div>
      <div className={styles.returnActionList}>
        {actions.map((action) => {
          const label = action.id === "apply_use" ? "进入来源并申请使用" : action.id === "remix" ? "改编" : "授权";
          if (action.enabled && action.href) {
            return (
              <a key={action.id} className={styles.returnActionEnabled} href={action.href} data-action-id={action.id}>
                <Check size={13} />{label}<ArrowUpRight size={13} />
              </a>
            );
          }
          return (
            <button key={action.id} type="button" className={styles.returnActionDisabled} disabled title={action.reason} data-action-id={action.id}>
              <LockKeyhole size={13} />{label}<span>暂不可用 · {action.reason}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default CommunityReturnActions;
