"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import styles from "./ChatFocusFrame.module.css";

type ChatFocusFrameProps = {
  children: ReactNode;
  label: string;
  title: string;
  toggleLabel: string;
  exitLabel: string;
};

export function ChatFocusFrame({ children, label, title, toggleLabel, exitLabel }: ChatFocusFrameProps) {
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocused(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [focused]);

  return (
    <section className={focused ? `${styles.frame} ${styles.focused}` : styles.frame} aria-label={label}>
      <div className={styles.toolbar}>
        <span>{title}</span>
        <button
          className={styles.toggle}
          type="button"
          aria-pressed={focused}
          aria-label={focused ? exitLabel : toggleLabel}
          title={focused ? exitLabel : toggleLabel}
          onClick={() => setFocused((current) => !current)}
        >
          {focused ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          <span>{focused ? exitLabel : toggleLabel}</span>
        </button>
      </div>
      <div className={styles.content}>{children}</div>
    </section>
  );
}
