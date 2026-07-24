import Link from "next/link";
import styles from "./sales.module.css";

/**
 * /dashboard/sales 加载骨架屏：与销售面板顶部结构对齐。
 */
export default function SalesDashboardLoading() {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.backLink} href="/dashboard">
          ←
        </Link>
        <h1 className={styles.title}>…</h1>
      </header>
      <section className={styles.overviewWrap} aria-busy="true">
        <div className={styles.skeletonOverview} />
      </section>
      <section className={styles.tabsWrap} aria-busy="true">
        <div className={styles.skeletonRow} />
        <ul className={styles.grid}>
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index} className={styles.skeletonCard} />
          ))}
        </ul>
      </section>
    </main>
  );
}
