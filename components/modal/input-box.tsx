"use client";

import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Paperclip, UploadCloud } from "lucide-react";
import { WORKFLOW_ENTRY_POINTS, type WorkflowEntryId } from "@/components/workflow/workflow-data";

type InputBoxProps = {
  isZh: boolean;
  onNavigate?: () => void;
};

const DRAFT_KEY = "kiikis_workspace_entry_draft";

function isReadableFile(file: File) {
  return (
    file.size <= 2_000_000 &&
    (file.type.startsWith("text/") || /\.(txt|md|json|csv)$/i.test(file.name))
  );
}

export function InputBox({ isZh, onNavigate }: InputBoxProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [prompt, setPrompt] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [workflowId, setWorkflowId] = useState<WorkflowEntryId>("script");
  const [file, setFile] = useState<File | null>(null);
  const selectedWorkflow = useMemo(
    () => WORKFLOW_ENTRY_POINTS.find((workflow) => workflow.id === workflowId) || WORKFLOW_ENTRY_POINTS[0],
    [workflowId],
  );

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] || null;
    setFile(nextFile);
  }

  async function startWorkflow() {
    let filePreview = "";
    if (file && isReadableFile(file)) {
      filePreview = (await file.text()).slice(0, 20000);
    }

    const draft = {
      workflowId,
      projectTitle: projectTitle.trim(),
      prompt: prompt.trim(),
      file: file
        ? {
            name: file.name,
            type: file.type,
            size: file.size,
            textPreview: filePreview,
          }
        : null,
      createdAt: new Date().toISOString(),
    };

    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      window.localStorage.setItem(`${DRAFT_KEY}:${workflowId}`, JSON.stringify(draft));
    } catch {
      // Local draft handoff is best-effort only.
    }

    onNavigate?.();
    router.push(selectedWorkflow.href);
  }

  return (
    <section className="workspace-modal-input-box" aria-label={isZh ? "创作入口" : "Creation entry"}>
      <div className="workspace-entry-head">
        <span>{isZh ? "从一个想法或文件开始" : "Start from an idea or file"}</span>
        <select
          value={workflowId}
          onChange={(event) => setWorkflowId(event.target.value as WorkflowEntryId)}
          aria-label={isZh ? "选择创作类型" : "Choose workflow"}
        >
          {WORKFLOW_ENTRY_POINTS.map((workflow) => (
            <option value={workflow.id} key={workflow.id}>
              {isZh ? workflow.titleZh : workflow.title}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={isZh ? "描述你的故事、场景或创意..." : "Describe your story, scene, or idea..."}
        aria-label={isZh ? "创意输入框" : "Creative prompt input"}
      />
      <div className="workspace-entry-toolbar">
        <input
          value={projectTitle}
          onChange={(event) => setProjectTitle(event.target.value)}
          placeholder={isZh ? "项目名（可选）" : "Project title (optional)"}
          aria-label={isZh ? "项目名" : "Project title"}
        />
        <input
          ref={fileInputRef}
          className="visually-hidden-input"
          type="file"
          onChange={selectFile}
          accept=".txt,.md,.json,.csv,.doc,.docx,.pdf,video/*,image/*"
        />
        <button className="workspace-entry-upload" type="button" onClick={() => fileInputRef.current?.click()}>
          {file ? <Paperclip size={16} /> : <UploadCloud size={16} />}
          <span>{file ? file.name : isZh ? "上传文件" : "Upload file"}</span>
        </button>
        <button className="workspace-entry-start" type="button" onClick={() => void startWorkflow()}>
          {isZh ? "进入" : "Open"}
          <ArrowRight size={16} />
        </button>
      </div>
      <small className="workspace-entry-hint">
        {isZh
          ? `将进入「${selectedWorkflow.titleZh}」，并在目标工作台读取当前草稿。`
          : `Opens ${selectedWorkflow.title} and carries this local draft forward.`}
      </small>
    </section>
  );
}
