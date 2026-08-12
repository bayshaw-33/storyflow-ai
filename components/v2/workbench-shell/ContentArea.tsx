"use client";

import { memo, type ReactNode } from "react";
import styles from "./workbench-shell.module.css";

export interface ContentAreaProps {
  children: ReactNode;
}

// 中间区容器：嵌入各工作台具体内容的 slot。
// 不施加业务样式，仅提供滚动容器与最小宽度保护。
function ContentAreaComponent({ children }: ContentAreaProps) {
  return (
    <main className={styles.contentArea}>
      {children}
    </main>
  );
}

export const ContentArea = memo(ContentAreaComponent);
