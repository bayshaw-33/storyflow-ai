"use client";
export default function ProductionError({ reset }: { reset: () => void }) {
  return <main style={{ padding: 32 }} role="alert"><h1>制作工作台暂时无法显示</h1><p>请重试或返回项目库。已保存的项目仍可从项目库打开。</p><button onClick={reset}>重试</button> <a href="/dashboard">返回项目库</a></main>;
}
