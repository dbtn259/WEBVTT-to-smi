import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { convertVttToSmi } from "./vtt-to-smi";
import "./App.css";

const SAVE_DIR_KEY = "defaultSaveDir";

type Status = "idle" | "loading" | "success" | "error";

function App() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [smiContent, setSmiContent] = useState("");
  const [cueCount, setCueCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveDir, setSaveDir] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(SAVE_DIR_KEY) ?? "";
    setSaveDir(stored);
  }, []);

  function suggestFilename(inputUrl: string): string {
    try {
      const u = new URL(inputUrl);
      const base = u.pathname.split("/").pop() ?? "subtitle";
      return base.replace(/\.(vtt|webvtt)$/i, "") + ".smi";
    } catch {
      return "subtitle.smi";
    }
  }

  function buildDefaultPath(inputUrl: string): string {
    const filename = suggestFilename(inputUrl);
    if (!saveDir) return filename;
    // Join dir + filename (handle trailing backslash/slash)
    const sep = saveDir.includes("\\") ? "\\" : "/";
    return saveDir.replace(/[/\\]$/, "") + sep + filename;
  }

  async function handlePickDir() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "기본 저장 폴더 선택",
      defaultPath: saveDir || undefined,
    });
    if (typeof selected === "string" && selected) {
      setSaveDir(selected);
      localStorage.setItem(SAVE_DIR_KEY, selected);
    }
  }

  function handleClearDir() {
    setSaveDir("");
    localStorage.removeItem(SAVE_DIR_KEY);
  }

  async function handleConvert() {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      inputRef.current?.focus();
      return;
    }

    setStatus("loading");
    setMessage("VTT 파일을 불러오는 중...");
    setSmiContent("");

    try {
      const vttText: string = await invoke("fetch_vtt_content", {
        url: trimmedUrl,
      });

      setMessage("변환 중...");
      const result = convertVttToSmi(vttText);

      if (result.cueCount === 0) {
        setStatus("error");
        setMessage("자막 항목을 찾을 수 없습니다. URL이 올바른 WEBVTT 파일인지 확인하세요.");
        return;
      }

      setSmiContent(result.smi);
      setCueCount(result.cueCount);
      setStatus("success");
      setMessage(`변환 완료 — ${result.cueCount}개 자막`);
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  }

  async function handleSave() {
    if (!smiContent) return;
    setSaving(true);

    try {
      const filePath = await save({
        defaultPath: buildDefaultPath(url),
        filters: [{ name: "SMI 자막", extensions: ["smi"] }],
      });

      if (filePath) {
        await invoke("save_file", { path: filePath, content: smiContent });
        setMessage(`저장 완료 — ${filePath}`);
      }
    } catch (err) {
      setMessage(`저장 실패: ${err}`);
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleConvert();
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">WEBVTT → SMI 변환기</h1>
        <p className="app-subtitle">WEBVTT URL을 입력하면 SMI 자막 파일로 변환합니다</p>
      </header>

      <main className="app-main">
        {/* URL 입력 */}
        <section className="input-section">
          <label className="input-label" htmlFor="url-input">
            WEBVTT URL
          </label>
          <div className="input-row">
            <input
              id="url-input"
              ref={inputRef}
              className="url-input"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://example.com/subtitle.vtt"
              disabled={status === "loading"}
              autoFocus
            />
            <button
              className="btn btn-primary"
              onClick={handleConvert}
              disabled={status === "loading" || !url.trim()}
            >
              {status === "loading" ? <span className="spinner" /> : "변환"}
            </button>
          </div>
        </section>

        {/* 저장 경로 설정 */}
        <section className="settings-section">
          <label className="input-label">기본 저장 폴더</label>
          <div className="input-row">
            <input
              className="url-input path-input"
              type="text"
              value={saveDir}
              readOnly
              placeholder="설정 안 함 — 저장 시마다 위치 선택"
            />
            <button className="btn btn-ghost" onClick={handlePickDir}>
              폴더 선택
            </button>
            {saveDir && (
              <button className="btn btn-ghost btn-clear" onClick={handleClearDir} title="경로 지우기">
                ✕
              </button>
            )}
          </div>
        </section>

        {message && (
          <div className={`status-bar status-${status}`}>
            <span className="status-icon">
              {status === "loading" && "⏳"}
              {status === "success" && "✓"}
              {status === "error" && "✕"}
            </span>
            {message}
          </div>
        )}

        {smiContent && (
          <section className="preview-section">
            <div className="preview-header">
              <span className="preview-title">변환 결과 미리보기</span>
              <span className="preview-meta">{cueCount}개 자막 항목</span>
            </div>
            <textarea
              className="preview-area"
              value={smiContent}
              readOnly
              spellCheck={false}
            />
            <div className="action-row">
              <button
                className="btn btn-save"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "저장 중..." : "SMI 파일로 저장"}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
