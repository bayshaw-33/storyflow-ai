import Link from "next/link";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import styles from "@/components/actors/actors.module.css";

/**
 * /actors/purchased 加载骨架屏：与列表页顶部结构对齐，避免闪烁。
 */
export default function PurchasedActorsLoading() {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.topbarBrand} href="/">
          <KiikisLogo compact />
        </Link>
        <div className={styles.topbarTitles}>
          <p className={styles.kicker}>KIikis Talent</p>
          <h1 className={styles.title}>…</h1>
          <p className={styles.subtitle}>…</p>
        </div>
        <span className={styles.topbarSpacer} />
      </header>
      <section className={styles.gridWrap} aria-busy="true">
        <ul className={styles.grid}>
          {Array.from({ length: 12 }, (_, index) => (
            <li key={index}>
              <div className={styles.skeletonCard} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
