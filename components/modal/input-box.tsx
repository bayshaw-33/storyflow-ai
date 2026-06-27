"use client";

type InputBoxProps = {
  isZh: boolean;
};

export function InputBox({ isZh }: InputBoxProps) {
  return (
    <label className="workspace-modal-input-box">
      <span>{isZh ? "从一个想法开始" : "Start from an idea"}</span>
      <textarea
        placeholder={isZh ? "描述你的故事、场景或创意..." : "Describe your story, scene, or idea..."}
        aria-label={isZh ? "创意输入框" : "Creative prompt input"}
      />
    </label>
  );
}
