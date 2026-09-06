"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Camera,
  Download,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ScanLine,
  Square,
} from "lucide-react";
import {
  createDefaultPrevisScene,
  interpolateTransform,
  parsePrevisScene,
  serializePrevisScene,
  type PrevisCamera,
  type PrevisObject,
  type PrevisScene,
  type PrevisTransform,
  type PrevisVector3,
} from "@/lib/director/previs";
import {
  buildPrevisSceneForShot,
  previsHandoffStorageKey,
  type PrevisAsset,
  type PrevisShotOption,
} from "@/lib/director/previs-integration";
import type { PrevisVersionRecord } from "@/lib/director/previs-version";
import type { StoryboardClient } from "@/lib/storyboard/client";
import styles from "./WhiteModelPrevis.module.css";
import { downloadBlob } from "@/lib/client/download";

export interface WhiteModelPrevisProps {
  projectId: string;
  workId: string;
  unitId: string | null;
  shotOptions?: PrevisShotOption[];
  assets?: { characters: PrevisAsset[]; locations: PrevisAsset[]; props: PrevisAsset[] };
  storyboardClient: StoryboardClient;
  storyboardRevision: number;
  onPrevisAdopted: (version: PrevisVersionRecord) => void;
}

const EMPTY_TRANSFORM: PrevisTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

function transformAt(object: PrevisObject, timeSeconds: number): PrevisTransform {
  const frames = object.keyframes;
  if (frames.length === 0) return object.transform;
  const before = [...frames].reverse().find((frame) => frame.timeSeconds <= timeSeconds);
  const after = frames.find((frame) => frame.timeSeconds >= timeSeconds);
  if (!before) return frames[0].transform;
  if (!after || after.timeSeconds === before.timeSeconds) return before.transform;
  return interpolateTransform(
    before.transform,
    after.transform,
    (timeSeconds - before.timeSeconds) / (after.timeSeconds - before.timeSeconds),
  );
}

function cameraAt(camera: PrevisCamera, timeSeconds: number): PrevisCamera {
  const frames = camera.keyframes;
  if (frames.length < 2) return camera;
  const before = [...frames].reverse().find((frame) => frame.timeSeconds <= timeSeconds);
  const after = frames.find((frame) => frame.timeSeconds >= timeSeconds);
  if (!before || !after || before.timeSeconds === after.timeSeconds) return camera;
  return { ...camera, ...interpolateTransform(before.transform, after.transform, (timeSeconds - before.timeSeconds) / (after.timeSeconds - before.timeSeconds)) };
}

function updateVector(vector: PrevisVector3, index: number, value: number): PrevisVector3 {
  const next = [...vector] as PrevisVector3;
  next[index] = value;
  return next;
}

function downloadText(filename: string, content: string, type: string) {
  downloadBlob(new Blob([content], { type }), filename);
}

function downloadDataUrl(filename: string, dataUrl: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}

export function WhiteModelPrevis({ projectId, workId, unitId, shotOptions = [], assets = { characters: [], locations: [], props: [] }, storyboardClient, storyboardRevision, onPrevisAdopted }: WhiteModelPrevisProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneGroupRef = useRef<THREE.Group | null>(null);
  const [scene, setScene] = useState<PrevisScene>(() => createDefaultPrevisScene());
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);
  const [storageError, setStorageError] = useState("");
  const [selectedId, setSelectedId] = useState("actor-1");
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState("");
  const [rendererError, setRendererError] = useState("");
  const [savingHandoff, setSavingHandoff] = useState(false);
  const [selectedShotId, setSelectedShotId] = useState(shotOptions[0]?.shotId ?? "");
  const playbackRef = useRef({ playing: false, currentTime: 0, durationSeconds: 5 });

  const storageKey = `kiikis:previs:v1:${projectId}:${workId}:${unitId ?? "none"}`;
  const selectedObject = scene.objects.find((object) => object.id === selectedId) ?? null;
  const selectedShot = shotOptions.find((shot) => shot.shotId === selectedShotId) ?? shotOptions[0] ?? null;
  const hasShotOptions = shotOptions.length > 0;

  useEffect(() => {
    if (!shotOptions.some((shot) => shot.shotId === selectedShotId)) {
      setSelectedShotId(shotOptions[0]?.shotId ?? "");
    }
  }, [selectedShotId, shotOptions]);

  useEffect(() => {
    setHydratedStorageKey(null);
    setStorageError("");
    setSelectedId("actor-1");
    setCurrentTime(0);
    setPlaying(false);
    try {
      const saved = window.localStorage.getItem(storageKey);
      setScene(saved ? parsePrevisScene(saved) : createDefaultPrevisScene());
      setHydratedStorageKey(storageKey);
    } catch {
      setScene(createDefaultPrevisScene());
      setStorageError("本地预演草稿无法读取，原草稿已保留，自动保存已暂停。新编辑请导出场景 JSON 保存。");
    }
  }, [storageKey]);

  useEffect(() => {
    if (hydratedStorageKey !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, serializePrevisScene(scene));
      setStorageError("");
    } catch {
      setStorageError("本地空间不足或不可用，修改未保存。请导出场景 JSON，避免刷新后丢失。");
    }
  }, [hydratedStorageKey, scene, storageKey]);

  useEffect(() => {
    playbackRef.current = { playing, currentTime, durationSeconds: scene.durationSeconds };
  }, [currentTime, playing, scene.durationSeconds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasShotOptions) return;
    const threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color("#091112");
    const camera = new THREE.PerspectiveCamera(35, 9 / 16, 0.1, 100);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    } catch {
      setRendererError("当前浏览器无法启动白模视窗，请检查 WebGL 设置。");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    cameraRef.current = camera;
    rendererRef.current = renderer;

    let controls: OrbitControls;
    try {
      controls = new OrbitControls(camera, canvas);
    } catch {
      renderer.dispose();
      setRendererError("白模视窗初始化失败，请刷新后重试。");
      return;
    }
    setRendererError("");
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);
    camera.position.set(...scene.camera.position);
    controls.update();

    threeScene.add(new THREE.HemisphereLight("#ffffff", "#1b4a4a", 2));
    const keyLight = new THREE.DirectionalLight("#bdf8ee", 2.5);
    keyLight.position.set(4, 8, 5);
    threeScene.add(keyLight);
    threeScene.add(new THREE.GridHelper(14, 14, "#315c5c", "#193536"));
    const group = new THREE.Group();
    threeScene.add(group);
    sceneGroupRef.current = group;

    const resize = () => {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      camera.aspect = 9 / 16;
      camera.updateProjectionMatrix();
    };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    resize();

    let frame = 0;
    let last = performance.now();
    let lastUiUpdate = 0;
    const render = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (playbackRef.current.playing) {
        const nextTime = playbackRef.current.currentTime + delta;
        if (nextTime >= playbackRef.current.durationSeconds) {
          playbackRef.current = { ...playbackRef.current, playing: false, currentTime: 0 };
          setCurrentTime(0);
          setPlaying(false);
        } else if (now - lastUiUpdate > 40) {
          playbackRef.current = { ...playbackRef.current, currentTime: nextTime };
          setCurrentTime(nextTime);
          lastUiUpdate = now;
        }
      }
      controls.update();
      renderer.render(threeScene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      controls.dispose();
      renderer.dispose();
      rendererRef.current = null;
      cameraRef.current = null;
      sceneGroupRef.current = null;
    };
  }, [hasShotOptions]);

  useEffect(() => {
    const group = sceneGroupRef.current;
    if (!group) return;
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.LineSegments)) return;
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
    });
    group.clear();
    for (const object of scene.objects) {
      const transform = transformAt(object, currentTime);
      let mesh: THREE.Object3D;
      if (object.kind === "room") {
        mesh = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(8, 3, 8)),
          new THREE.LineBasicMaterial({ color: "#9ad9d2", transparent: true, opacity: 0.65 }),
        );
        mesh.position.y = 1.5;
      } else if (object.kind === "actor_proxy") {
        mesh = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.42, 1.25, 4, 8),
          new THREE.MeshStandardMaterial({ color: "#d8e6e4", roughness: 0.8 }),
        );
        mesh.position.y = 1;
      } else {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 0.8, 0.8),
          new THREE.MeshStandardMaterial({ color: "#b6cfcc", roughness: 0.85 }),
        );
        mesh.position.y = 0.4;
      }
      mesh.name = object.name;
      mesh.position.add(new THREE.Vector3(...transform.position));
      mesh.rotation.set(...transform.rotation);
      mesh.scale.set(...transform.scale);
      if (object.id === selectedId) {
        const outline = new THREE.BoxHelper(mesh, "#5ee7d8");
        group.add(outline);
      }
      group.add(mesh);
    }
    const camera = cameraAt(scene.camera, currentTime);
    if (cameraRef.current) {
      cameraRef.current.position.set(...camera.position);
      cameraRef.current.fov = camera.focalLength === 50 ? 27 : camera.focalLength === 85 ? 16 : 35;
      cameraRef.current.updateProjectionMatrix();
    }
  }, [currentTime, scene, selectedId, hasShotOptions]);

  const updateSelected = (nextTransform: PrevisTransform) => {
    if (!selectedObject) return;
    setScene((previous) => ({
      ...previous,
      objects: previous.objects.map((object) => object.id === selectedId ? { ...object, transform: nextTransform } : object),
    }));
  };

  const addObject = (kind: "actor_proxy" | "prop") => {
    const id = `${kind === "actor_proxy" ? "actor" : "prop"}-${Date.now()}`;
    const object: PrevisObject = { id, kind, name: kind === "actor_proxy" ? "人物替身" : "道具", transform: transformForNewObject(kind), keyframes: [] };
    setScene((previous) => ({ ...previous, objects: [...previous.objects, object] }));
    setSelectedId(id);
  };

  const saveKeyframe = (timeSeconds: number) => {
    if (!selectedObject) return;
    setScene((previous) => ({
      ...previous,
      objects: previous.objects.map((object) => object.id === selectedId ? {
        ...object,
        keyframes: [...object.keyframes.filter((frame) => frame.timeSeconds !== timeSeconds), { timeSeconds, transform: object.transform }].sort((a, b) => a.timeSeconds - b.timeSeconds),
      } : object),
    }));
    setNotice(`已记录 ${timeSeconds}s 关键帧`);
  };

  const saveCameraKeyframe = (timeSeconds: number) => {
    const camera = cameraRef.current;
    const transform: PrevisTransform = camera
      ? { position: [camera.position.x, camera.position.y, camera.position.z], rotation: [camera.rotation.x, camera.rotation.y, camera.rotation.z], scale: [1, 1, 1] }
      : { ...EMPTY_TRANSFORM, position: scene.camera.position, rotation: scene.camera.rotation };
    setScene((previous) => ({
      ...previous,
      camera: { ...previous.camera, keyframes: [...previous.camera.keyframes.filter((frame) => frame.timeSeconds !== timeSeconds), { timeSeconds, transform }].sort((a, b) => a.timeSeconds - b.timeSeconds) },
    }));
    setNotice(`已记录摄影机 ${timeSeconds}s 关键帧`);
  };

  const reset = () => {
    setScene(createDefaultPrevisScene());
    setSelectedId("actor-1");
    setCurrentTime(0);
    setNotice("已恢复基础白模场景");
  };

  const loadSelectedShot = () => {
    if (!selectedShot) {
      setNotice("当前项目还没有可载入的分镜镜头。");
      return;
    }
    const next = buildPrevisSceneForShot(selectedShot, assets);
    setScene(next);
    setSelectedId(next.objects.find((object) => object.kind === "actor_proxy")?.id ?? next.objects[0]?.id ?? "camera");
    setCurrentTime(0);
    setPlaying(false);
    setNotice(`${selectedShot.sceneLabel} · ${selectedShot.shotLabel} 已载入白模。`);
  };

  const exportVideoHandoff = async () => {
    if (!selectedShot) {
      setNotice("请先选择一个分镜镜头。");
      return;
    }
    if (!unitId) {
      setNotice("当前工作单元尚未归档，无法保存白模版本。");
      return;
    }
    setSavingHandoff(true);
    try {
      const saved = await storyboardClient.savePrevisVersion(selectedShot.shotId, {
        projectId,
        workId,
        sourceUnitId: unitId,
        storyboardRevision,
        scene,
        promptInputHash: selectedShot.promptInputHash,
        referenceVersionIds: selectedShot.referenceVersionIds,
      });
      try {
        window.localStorage.setItem(previsHandoffStorageKey(projectId, workId, unitId, selectedShot.shotId), JSON.stringify(saved.snapshot));
      } catch {
        setStorageError("白模版本已保存到云端，本地缓存不可用，不影响送往视频阶段。");
      }
      downloadText(`${projectId}-${selectedShot.shotId}-video-handoff.json`, JSON.stringify(saved.snapshot, null, 2), "application/json");
      setNotice("白模版本已保存，正在送往视频阶段确认。");
      onPrevisAdopted(saved);
    } catch (error) {
      setNotice(`白模版本保存失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setSavingHandoff(false);
    }
  };

  const copyVideoPrompt = () => {
    if (!selectedShot) return;
    const value = selectedShot.videoPrompt || selectedShot.visualDescription;
    if (value) void navigator.clipboard?.writeText(value);
    setNotice("视频提示词已复制，可在视频阶段人工确认后使用。");
  };

  const capture = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    downloadDataUrl(`${projectId}-previs-${currentTime.toFixed(2)}s.png`, canvas.toDataURL("image/png"));
  };

  return (
    <section className={styles.shell} data-testid="white-model-previs" aria-label="白模预演">
      <div className={styles.toolbar}>
        <div>
          <strong>白模预演</strong>
          <span>空间、站位与摄影机运动</span>
        </div>
        <div className={styles.toolbarActions}>
          <button type="button" onClick={reset} title="恢复基础场景" aria-label="恢复基础场景"><RotateCcw size={15} /></button>
          <button type="button" onClick={capture}><ScanLine size={15} />截图</button>
          <button type="button" onClick={() => downloadText(`${projectId}-previs.json`, serializePrevisScene(scene), "application/json")}><Download size={15} />导出场景 JSON</button>
          <button type="button" onClick={() => void exportVideoHandoff()} disabled={!selectedShot || savingHandoff}><Download size={15} />{savingHandoff ? "保存中…" : "保存并送视频"}</button>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <strong style={{ fontSize: 12 }}>当前镜头</strong>
        <select aria-label="当前镜头" value={selectedShotId} onChange={(event) => setSelectedShotId(event.target.value)} disabled={shotOptions.length === 0} style={{ minWidth: 240, padding: "7px 10px", borderRadius: 8, background: "rgba(255,255,255,.06)", color: "inherit", border: "1px solid rgba(255,255,255,.14)" }}>
          {shotOptions.length === 0 ? <option value="">尚无分镜镜头</option> : shotOptions.map((shot) => <option key={shot.shotId} value={shot.shotId}>{shot.sceneLabel} · {shot.shotLabel}</option>)}
        </select>
        <button type="button" onClick={loadSelectedShot} disabled={!selectedShot}>载入当前镜头</button>
        <button type="button" onClick={copyVideoPrompt} disabled={!selectedShot}>复制视频提示词</button>
        {selectedShot?.storyboardImageUrl ? <span style={{ color: "#75dbc6", fontSize: 12 }}>已关联首帧</span> : <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>暂无已确认首帧</span>}
      </div>
      <div className={styles.editor}>
        <div className={styles.viewportWrap}>
          <div className={styles.viewportLabel}><Camera size={14} />9:16 · {scene.durationSeconds}s</div>
          {rendererError ? (
            <div className={styles.emptyPreview} role="status">{rendererError}</div>
          ) : hasShotOptions ? (
            <canvas ref={canvasRef} className={styles.viewport} aria-label="白模三维视窗" />
          ) : (
            <div className={styles.emptyPreview} role="status">
              <strong>尚无分镜镜头</strong>
              <span>先在分镜阶段创建镜头，再进入白模预演。</span>
            </div>
          )}
          <div className={styles.timeline}>
            <div className={styles.timelineControls}>
              <button type="button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "暂停" : "播放"}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
              <button type="button" onClick={() => { setCurrentTime(0); setPlaying(false); }} aria-label="停止"><Square size={13} /></button>
              <span>{currentTime.toFixed(2)}s / {scene.durationSeconds}s</span>
            </div>
            <input type="range" min={0} max={scene.durationSeconds} step={0.01} value={currentTime} onChange={(event) => { setPlaying(false); setCurrentTime(Number(event.target.value)); }} aria-label="预演时间轴" />
            <div className={styles.keyframeActions}>
              <button type="button" onClick={() => saveKeyframe(0)} disabled={!selectedObject}>记录起幅</button>
              <button type="button" onClick={() => saveKeyframe(scene.durationSeconds)} disabled={!selectedObject}>记录落幅</button>
              <button type="button" className={scene.durationSeconds === 5 ? styles.active : ""} onClick={() => setScene((value) => ({ ...value, durationSeconds: 5 }))}>5s</button>
              <button type="button" className={scene.durationSeconds === 10 ? styles.active : ""} onClick={() => setScene((value) => ({ ...value, durationSeconds: 10 }))}>10s</button>
            </div>
          </div>
        </div>
        <aside className={styles.inspector} aria-label="白模对象与摄影机属性">
          <div className={styles.inspectorHeader}><strong>场景对象</strong><div><button type="button" onClick={() => addObject("actor_proxy")} title="添加人物替身"><Plus size={14} />人</button><button type="button" onClick={() => addObject("prop")} title="添加道具"><Plus size={14} />道具</button></div></div>
          <div className={styles.objectList}>
            <button type="button" className={selectedId === "camera" ? styles.objectSelected : ""} onClick={() => setSelectedId("camera")}>摄影机<small>镜头</small></button>
            {scene.objects.map((object) => <button key={object.id} type="button" className={object.id === selectedId ? styles.objectSelected : ""} onClick={() => setSelectedId(object.id)}>{object.name}<small>{object.kind === "room" ? "空间" : object.kind === "actor_proxy" ? "人物替身" : "道具"}</small></button>)}
          </div>
          {selectedId === "camera" ? <CameraEditor camera={scene.camera} onChange={(camera) => setScene((value) => ({ ...value, camera }))} /> : selectedObject && selectedObject.kind !== "room" ? <TransformEditor object={selectedObject} onChange={updateSelected} /> : <p className={styles.muted}>选择人物或道具调整站位。</p>}
          <div className={styles.cameraCard}>
            <strong>摄影机</strong>
            <button type="button" onClick={() => saveCameraKeyframe(currentTime)}>记录摄影机关键帧（当前时刻）</button>
            <button type="button" onClick={() => setScene((value) => ({ ...value, camera: { ...value.camera, position: [0, 2.2, 8] } }))}>恢复摄影机位置</button>
          </div>
          {notice ? <div className={styles.notice} role="status">{notice}</div> : null}
          {storageError ? <div className={styles.notice} role="alert">{storageError}</div> : null}
        </aside>
      </div>
    </section>
  );
}

function transformForNewObject(kind: "actor_proxy" | "prop"): PrevisTransform {
  return { ...EMPTY_TRANSFORM, position: kind === "actor_proxy" ? [1.4, 0, 0] : [-1.4, 0, 0] };
}

function TransformEditor({ object, onChange }: { object: PrevisObject; onChange: (transform: PrevisTransform) => void }) {
  return <div className={styles.transformEditor}>
    <strong>{object.name}</strong>
    {(["X", "Y", "Z"] as const).map((axis, index) => <label key={axis}>{axis}<input type="number" step="0.1" value={object.transform.position[index]} onChange={(event) => onChange({ ...object.transform, position: updateVector(object.transform.position, index, Number(event.target.value)) })} /></label>)}
  </div>;
}

function CameraEditor({ camera, onChange }: { camera: PrevisCamera; onChange: (camera: PrevisCamera) => void }) {
  return <div className={styles.transformEditor}>
    <strong>摄影机位置</strong>
    {(["X", "Y", "Z"] as const).map((axis, index) => <label key={axis}>{axis}<input type="number" step="0.1" value={camera.position[index]} onChange={(event) => onChange({ ...camera, position: updateVector(camera.position, index, Number(event.target.value)) })} /></label>)}
    <label className={styles.focalLength}>焦段<input type="number" min={24} max={85} value={camera.focalLength} onChange={(event) => onChange({ ...camera, focalLength: Number(event.target.value) })} /> mm</label>
  </div>;
}
