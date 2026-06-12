export type TextDiffOperation = {
  type: "equal" | "insert" | "delete" | "replace";
  oldLine?: number;
  newLine?: number;
  oldText?: string;
  newText?: string;
};

export type JsonDiffOperation = {
  type: "add" | "remove" | "replace";
  path: string;
  oldValue?: unknown;
  newValue?: unknown;
};

export function compareTextVersions(oldText = "", newText = "") {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  const max = Math.max(oldLines.length, newLines.length);
  const changes: TextDiffOperation[] = [];

  for (let index = 0; index < max; index += 1) {
    const oldLine = oldLines[index];
    const newLine = newLines[index];
    if (oldLine === newLine) {
      if (oldLine !== undefined && oldLine !== "") changes.push({ type: "equal", oldLine: index + 1, newLine: index + 1, oldText: oldLine, newText: newLine });
      continue;
    }
    if (oldLine === undefined) {
      changes.push({ type: "insert", newLine: index + 1, newText: newLine });
    } else if (newLine === undefined) {
      changes.push({ type: "delete", oldLine: index + 1, oldText: oldLine });
    } else {
      changes.push({ type: "replace", oldLine: index + 1, newLine: index + 1, oldText: oldLine, newText: newLine });
    }
  }

  return {
    type: "text",
    oldLineCount: oldLines.filter(Boolean).length,
    newLineCount: newLines.filter(Boolean).length,
    changeCount: changes.filter((change) => change.type !== "equal").length,
    changes,
  };
}

export function compareJsonVersions(oldJson: unknown, newJson: unknown) {
  const changes: JsonDiffOperation[] = [];
  walkJsonDiff(oldJson, newJson, "", changes);
  return {
    type: "json",
    changeCount: changes.length,
    changes,
  };
}

function walkJsonDiff(oldValue: unknown, newValue: unknown, path: string, changes: JsonDiffOperation[]) {
  if (Object.is(oldValue, newValue)) return;

  if (isPlainObject(oldValue) && isPlainObject(newValue)) {
    const keys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
    for (const key of keys) {
      const nextPath = `${path}/${escapeJsonPointer(key)}`;
      if (!(key in oldValue)) {
        changes.push({ type: "add", path: nextPath, newValue: newValue[key] });
      } else if (!(key in newValue)) {
        changes.push({ type: "remove", path: nextPath, oldValue: oldValue[key] });
      } else {
        walkJsonDiff(oldValue[key], newValue[key], nextPath, changes);
      }
    }
    return;
  }

  if (Array.isArray(oldValue) && Array.isArray(newValue)) {
    const max = Math.max(oldValue.length, newValue.length);
    for (let index = 0; index < max; index += 1) {
      const nextPath = `${path}/${index}`;
      if (index >= oldValue.length) changes.push({ type: "add", path: nextPath, newValue: newValue[index] });
      else if (index >= newValue.length) changes.push({ type: "remove", path: nextPath, oldValue: oldValue[index] });
      else walkJsonDiff(oldValue[index], newValue[index], nextPath, changes);
    }
    return;
  }

  changes.push({ type: "replace", path: path || "/", oldValue, newValue });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function escapeJsonPointer(value: string) {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}
