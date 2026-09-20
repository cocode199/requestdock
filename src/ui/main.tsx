import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  Assertion,
  Collection,
  HttpMethod,
  RequestResult,
  RequestSpec,
  RunDiff,
  RunResult,
  SavedCollection,
} from "../shared/types";
import "./styles.css";

const METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const displayBody = (body: string) => {
  try {
    return pretty(JSON.parse(body));
  } catch {
    return body;
  }
};
const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const createRequest = (): RequestSpec => ({
  id: crypto.randomUUID(),
  name: "Untitled request",
  method: "GET",
  url: `${location.origin}/api/demo`,
  headers: {},
  assertions: [{ type: "status", expected: 200 }],
});
type IconName =
  | "plus"
  | "play"
  | "folder"
  | "upload"
  | "download"
  | "save"
  | "clock"
  | "trash"
  | "check"
  | "close"
  | "chevron"
  | "code"
  | "plug"
  | "arrow"
  | "copy";
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    play: <path d="m8 5 11 7-11 7Z" />,
    folder: <path d="M3 7V5h7l2 3h9v12H3V7Z" />,
    upload: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" />
      </>
    ),
    download: <path d="M12 3v13m-5-5 5 5 5-5M4 15v5h16v-5" />,
    save: (
      <>
        <path d="M5 3h12l4 4v14H3V3Z" />
        <path d="M7 3v6h9V3M7 21v-8h10v8" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    code: <path d="m7 7-5 5 5 5m10-10 5 5-5 5M14 4l-4 16" />,
    plug: <path d="M8 2v5m8-5v5M5 7h14v4a7 7 0 0 1-14 0V7Zm7 11v4" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M16 8V3H3v13h5" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function JsonEditor({
  label,
  value,
  onChange,
  onError,
  hint,
  kind = "object",
}: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  onError: (message: string | null) => void;
  hint: string;
  kind?: "object" | "array";
}) {
  const [text, setText] = useState(pretty(value));
  const [error, setError] = useState("");
  const update = (next: string) => {
    setText(next);
    try {
      const parsed: unknown = JSON.parse(next);
      if (
        kind === "array"
          ? !Array.isArray(parsed)
          : parsed === null ||
            typeof parsed !== "object" ||
            Array.isArray(parsed)
      )
        throw new Error(`Expected a JSON ${kind}.`);
      setError("");
      onError(null);
      onChange(parsed);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid JSON";
      setError(message);
      onError(`${label}: ${message}`);
    }
  };
  return (
    <div className="json-field">
      <div className="field-heading">
        <label>{label}</label>
        <span>JSON</span>
      </div>
      <textarea
        spellCheck={false}
        aria-label={label}
        aria-invalid={!!error}
        value={text}
        onChange={(e) => update(e.target.value)}
        className={error ? "code-input invalid" : "code-input"}
      />
      <p className={error ? "field-error" : "field-hint"}>{error || hint}</p>
    </div>
  );
}

function App() {
  const [collections, setCollections] = useState<SavedCollection[]>([]);
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState<Collection | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [dirty, setDirty] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [editorTab, setEditorTab] = useState<
    "headers" | "body" | "assertions" | "variables"
  >("headers");
  const [responseTab, setResponseTab] = useState<
    "body" | "checks" | "headers" | "diff"
  >("body");
  const [history, setHistory] = useState<RunResult[]>([]);
  const [run, setRun] = useState<RunResult | null>(null);
  const [resultIndex, setResultIndex] = useState(0);
  const [baselineId, setBaselineId] = useState("");
  const [diff, setDiff] = useState<RunDiff | null>(null);
  const [ignorePaths, setIgnorePaths] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [token, setToken] = useState(
    () => sessionStorage.getItem("requestdock-token") || "",
  );
  const [showAccess, setShowAccess] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showRuntime, setShowRuntime] = useState(false);
  const [runtimeVariables, setRuntimeVariables] = useState("{}");
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<{
    version: string;
    plugins: { name: string; version: string }[];
  } | null>(null);
  const [filter, setFilter] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const request = draft?.requests.find((item) => item.id === selectedId);
  const result: RequestResult | undefined = run?.results[resultIndex];
  const baseline = history.find((item) => item.id === baselineId);

  async function api<T>(
    path: string,
    body?: unknown,
    method?: string,
  ): Promise<T> {
    const response = await fetch(path, {
      method: method || (body === undefined ? "GET" : "POST"),
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      if (response.status === 401) {
        setAuthNeeded(true);
        setShowAccess(true);
      }
      throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
  }
  function selectCollection(item: SavedCollection) {
    setActiveId(item.id);
    setDraft(structuredClone(item.collection));
    setSelectedId(item.collection.requests[0]?.id || "");
    setDirty(false);
    setJsonErrors({});
    setEditorEpoch((value) => value + 1);
    setError("");
  }
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [items, runs, details] = await Promise.all([
        api<SavedCollection[]>("/api/collections"),
        api<RunResult[]>("/api/history"),
        api<{ version: string; plugins: { name: string; version: string }[] }>(
          "/api/info",
        ),
      ]);
      setCollections(items);
      setHistory(runs);
      setInfo(details);
      setAuthNeeded(false);
      if (items.length) selectCollection(items[0]);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(id);
  }, [notice]);
  const report = (e: unknown) =>
    setError(e instanceof Error ? e.message : String(e));
  function validateEditor() {
    const messages = Object.values(jsonErrors);
    if (messages.length) throw new Error(messages[0]);
  }
  function changeRequest(patch: Partial<RequestSpec>) {
    setDraft(
      (current) =>
        current && {
          ...current,
          requests: current.requests.map((item) =>
            item.id === selectedId ? { ...item, ...patch } : item,
          ),
        },
    );
    setDirty(true);
  }
  function jsonError(key: string, message: string | null) {
    setJsonErrors((current) => {
      const next = { ...current };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }
  async function save() {
    if (!draft) return;
    setBusy("save");
    setError("");
    try {
      validateEditor();
      const savingSnapshot = JSON.stringify(draft);
      const saved = await api<SavedCollection>(
        `/api/collections/${activeId}`,
        draft,
        "PUT",
      );
      setCollections((items) =>
        items.map((item) => (item.id === activeId ? saved : item)),
      );
      const changedWhileSaving =
        JSON.stringify(draftRef.current) !== savingSnapshot;
      setDirty(changedWhileSaving);
      setNotice(
        changedWhileSaving
          ? "Collection saved. Newer edits are still unsaved."
          : "Collection saved. Your requests are stored locally.",
      );
    } catch (e) {
      report(e);
    } finally {
      setBusy("");
    }
  }
  async function newCollection() {
    if (
      dirty &&
      !window.confirm("Discard unsaved changes and create a collection?")
    )
      return;
    setBusy("create");
    setError("");
    try {
      const saved = await api<SavedCollection>("/api/collections", {
        version: 1,
        name: "Untitled collection",
        variables: {},
        requests: [createRequest()],
      });
      setCollections((items) => [...items, saved]);
      selectCollection(saved);
      setNotice("Collection created. Give it a name and add a request.");
    } catch (e) {
      report(e);
    } finally {
      setBusy("");
    }
  }
  async function deleteCollection() {
    if (
      !draft ||
      !window.confirm(
        `Delete “${draft.name}”? This removes the saved collection.`,
      )
    )
      return;
    setBusy("delete");
    setError("");
    try {
      await api(`/api/collections/${activeId}`, undefined, "DELETE");
      const remaining = collections.filter((item) => item.id !== activeId);
      setCollections(remaining);
      if (remaining[0]) selectCollection(remaining[0]);
      else {
        setDraft(null);
        setActiveId("");
        setSelectedId("");
        setDirty(false);
      }
      setNotice("Collection deleted.");
    } catch (e) {
      report(e);
    } finally {
      setBusy("");
    }
  }
  function chooseRequest(id: string) {
    try {
      validateEditor();
      setSelectedId(id);
      setEditorEpoch((value) => value + 1);
      setError("");
    } catch (e) {
      report(e);
    }
  }
  function addRequest() {
    if (!draft) return;
    try {
      validateEditor();
      const added = createRequest();
      setDraft({ ...draft, requests: [...draft.requests, added] });
      setSelectedId(added.id);
      setDirty(true);
      setEditorEpoch((value) => value + 1);
    } catch (e) {
      report(e);
    }
  }
  function deleteRequest() {
    if (!draft || !request) return;
    if (draft.requests.length === 1) {
      setNotice(
        "A collection needs at least one request. Add another request before deleting this one.",
      );
      return;
    }
    const remaining = draft.requests.filter((item) => item.id !== selectedId);
    setDraft({ ...draft, requests: remaining });
    setSelectedId(remaining[0]?.id || "");
    setDirty(true);
    setJsonErrors({});
    setEditorEpoch((value) => value + 1);
  }
  async function execute(all: boolean) {
    if (!draft) return;
    setBusy(all ? "run-all" : "run");
    setError("");
    setDiff(null);
    try {
      validateEditor();
      const variables: unknown = JSON.parse(runtimeVariables);
      if (
        !variables ||
        typeof variables !== "object" ||
        Array.isArray(variables) ||
        Object.values(variables).some((value) => typeof value !== "string")
      )
        throw new Error(
          "Runtime variables must be a JSON object with string values.",
        );
      const completed = await api<RunResult>("/api/run", {
        collection: draft,
        variables,
        ...(!all ? { requestId: selectedId } : {}),
      });
      setRun(completed);
      setResultIndex(0);
      setResponseTab(completed.passed ? "body" : "checks");
      setHistory(await api<RunResult[]>("/api/history"));
      setNotice(
        completed.passed
          ? "Run completed. All checks passed."
          : "Run completed with failures. Review the checks below.",
      );
    } catch (e) {
      report(e);
    } finally {
      setBusy("");
    }
  }
  async function compare() {
    if (!baseline || !run) return;
    setBusy("compare");
    setError("");
    try {
      const compared = await api<RunDiff>("/api/compare", {
        baseline,
        current: run,
        ignorePaths: ignorePaths
          .split(/[,\n]/)
          .map((value) => value.trim())
          .filter(Boolean),
      });
      setDiff(compared);
      setResponseTab("diff");
    } catch (e) {
      report(e);
    } finally {
      setBusy("");
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    if (
      dirty &&
      !window.confirm("Discard unsaved changes and import a collection?")
    )
      return;
    setBusy("import");
    setError("");
    try {
      const document: unknown = JSON.parse(await file.text());
      const imported = await api<{
        collection: Collection;
        warnings: string[];
      }>("/api/import", document);
      const saved = await api<SavedCollection>(
        "/api/collections",
        imported.collection,
      );
      setCollections((items) => [...items, saved]);
      selectCollection(saved);
      setNotice(
        imported.warnings.length
          ? `Imported with notes: ${imported.warnings.join(" · ")}`
          : "Collection imported and saved.",
      );
    } catch (e) {
      report(e);
    } finally {
      setBusy("");
      if (importRef.current) importRef.current.value = "";
    }
  }
  function exportCollection() {
    if (!draft) return;
    try {
      validateEditor();
      const blob = new Blob([pretty(draft)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${draft.name.replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "") || "collection"}.requestdock.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Collection exported in RequestDock format.");
    } catch (e) {
      report(e);
    }
  }
  const passedChecks =
    result?.checks.filter((check) => check.passed).length || 0;
  const visibleCollections = collections.filter((item) =>
    item.collection.name.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="RequestDock home">
          <span className="brand-symbol">
            <span />
            <span />
            <span />
          </span>
          <span>
            Request<span className="brand-light">Dock</span>
            <small>THE LOCAL API WORKBENCH</small>
          </span>
        </a>
        <div className="workspace-pill">
          <span className="status-dot" />
          <span>Local workspace</span>
          <span className="pill-label">OSS</span>
        </div>
        <div className="sidebar-heading">
          <span>COLLECTIONS</span>
          <button
            className="icon-button"
            onClick={() => void newCollection()}
            disabled={!!busy}
            aria-label="Create collection"
            title="Create collection"
          >
            <Icon name="plus" />
          </button>
        </div>
        <div className="search-wrap">
          <input
            aria-label="Filter collections"
            placeholder="Find a collection…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <span>⌕</span>
        </div>
        <nav className="collection-list" aria-label="Collections">
          {visibleCollections.map((item) => (
            <div
              key={item.id}
              className={`collection-group ${item.id === activeId ? "active" : ""}`}
            >
              <button
                className="collection-button"
                disabled={!!busy}
                onClick={() => {
                  if (
                    item.id !== activeId &&
                    (!dirty || window.confirm("Discard unsaved changes?"))
                  )
                    selectCollection(item);
                }}
              >
                <Icon name="folder" />
                <span>
                  {item.id === activeId && draft
                    ? draft.name
                    : item.collection.name}
                </span>
                <span className="collection-count">
                  {item.id === activeId && draft
                    ? draft.requests.length
                    : item.collection.requests.length}
                </span>
              </button>
              {item.id === activeId && draft && (
                <div className="request-list">
                  {draft.requests.map((item) => (
                    <button
                      key={item.id}
                      className={`request-button ${item.id === selectedId ? "selected" : ""}`}
                      onClick={() => chooseRequest(item.id)}
                    >
                      <span
                        className={`method method-${item.method.toLowerCase()}`}
                      >
                        {item.method}
                      </span>
                      <span>{item.name}</span>
                      {item.id === selectedId && (
                        <span className="selected-dot" />
                      )}
                    </button>
                  ))}
                  <button
                    className="add-request"
                    onClick={addRequest}
                    disabled={!!busy}
                  >
                    <Icon name="plus" size={14} /> Add request
                  </button>
                </div>
              )}
            </div>
          ))}
          {!loading && !visibleCollections.length && (
            <p className="sidebar-empty">
              {filter
                ? "No matching collections."
                : "Your next API starts here."}
            </p>
          )}
        </nav>
        <input
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          ref={importRef}
          aria-label="Import collection file"
          onChange={(e) => void importFile(e.target.files?.[0])}
        />
        <button
          className="sidebar-import"
          onClick={() => importRef.current?.click()}
          disabled={!!busy}
        >
          <Icon name="upload" /> Import collection<span>JSON</span>
        </button>
        <div className="sidebar-bottom">
          <div className="plugins-title">
            <Icon name="plug" size={15} /> PLUGINS{" "}
            <span>{info?.plugins.length || 0}</span>
          </div>
          {info?.plugins.length ? (
            info.plugins.map((plugin) => (
              <div className="plugin-row" key={plugin.name}>
                <span className="status-dot" />
                {plugin.name}
                <small>v{plugin.version}</small>
              </div>
            ))
          ) : (
            <p className="plugin-note">
              Extend your checks with local plugins.
            </p>
          )}
          <button
            className="access-toggle"
            onClick={() => setShowAccess((value) => !value)}
          >
            Server access <span>{token ? "Token set" : "Local"}</span>
          </button>
          {showAccess && (
            <form
              className="access-form"
              onSubmit={(e) => {
                e.preventDefault();
                sessionStorage.setItem("requestdock-token", token);
                void load();
              }}
            >
              <label htmlFor="access-token">Bearer token</label>
              <input
                type="password"
                id="access-token"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Server access token"
              />
              <button type="submit">Connect</button>
              <small>Kept in this browser tab only.</small>
            </form>
          )}
          <div className="sidebar-version">
            <span>OPEN SOURCE · LOCAL FIRST</span>
            <span>v{info?.version || "0.1.0"}</span>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <Icon name="chevron" size={13} />
            <strong>{draft?.name || "Collections"}</strong>
          </div>
          <button
            className={`history-toggle ${showHistory ? "on" : ""}`}
            onClick={() => setShowHistory((value) => !value)}
          >
            <Icon name="clock" size={16} /> Run history{" "}
            <span>{history.length}</span>
          </button>
        </header>
        <div className="workspace-body">
          <div className="workbench">
            {error && (
              <div className="message error" role="alert">
                <Icon name="close" size={16} />
                <span>
                  {authNeeded
                    ? "Authentication required. Enter your server token under Server access. "
                    : ""}
                  {error}
                </span>
                <button aria-label="Dismiss error" onClick={() => setError("")}>
                  <Icon name="close" size={15} />
                </button>
              </div>
            )}
            {notice && (
              <div className="message notice" role="status">
                <Icon name="check" size={16} />
                <span>{notice}</span>
                <button
                  aria-label="Dismiss notification"
                  onClick={() => setNotice("")}
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
            )}
            {loading ? (
              <div className="empty-workspace">
                <span className="spinner" />
                <h2>Opening your workspace</h2>
                <p>Loading collections from your local server.</p>
              </div>
            ) : !draft ? (
              <div className="empty-workspace">
                <div className="empty-symbol">
                  <Icon name="folder" size={32} />
                </div>
                <h1>A home for your APIs.</h1>
                <p>
                  Create a collection, send a request, and make your
                  expectations executable.
                </p>
                <button
                  className="primary"
                  onClick={() => void newCollection()}
                >
                  <Icon name="plus" /> Create your first collection
                </button>
              </div>
            ) : (
              <>
                <section className="collection-heading">
                  <div>
                    <div className="eyebrow">
                      API WORKSPACE <span>/</span> COLLECTION
                    </div>
                    <input
                      className="collection-name"
                      aria-label="Collection name"
                      value={draft.name}
                      onChange={(e) => {
                        setDraft({ ...draft, name: e.target.value });
                        setDirty(true);
                      }}
                    />
                    <p>
                      {draft.requests.length} request
                      {draft.requests.length !== 1 ? "s" : ""}
                      <span>·</span>
                      <span className={dirty ? "unsaved" : ""}>
                        {dirty ? "Unsaved changes" : "Saved locally"}
                      </span>
                      <span>·</span> Your data, your machine.
                    </p>
                  </div>
                  <div className="collection-actions">
                    <button
                      className="icon-button light"
                      aria-label="Export collection"
                      title="Export collection"
                      onClick={exportCollection}
                    >
                      <Icon name="download" />
                    </button>
                    <button
                      className="icon-button light danger-hover"
                      aria-label="Delete collection"
                      title="Delete collection"
                      onClick={() => void deleteCollection()}
                      disabled={!!busy}
                    >
                      <Icon name="trash" />
                    </button>
                    <button
                      className="secondary"
                      onClick={() => void save()}
                      disabled={!!busy}
                    >
                      <Icon name="save" size={16} />
                      {busy === "save" ? "Saving…" : "Save collection"}
                      {dirty && <span className="dirty-dot" />}
                    </button>
                  </div>
                </section>
                <section className="request-card">
                  <div className="card-top">
                    <div className="request-title">
                      <span className="section-index">01</span>
                      {request ? (
                        <input
                          aria-label="Request name"
                          value={request.name}
                          onChange={(e) =>
                            changeRequest({ name: e.target.value })
                          }
                        />
                      ) : (
                        <strong>Request builder</strong>
                      )}
                    </div>
                    <div className="card-top-actions">
                      <button
                        className={
                          showRuntime
                            ? "text-button active-text"
                            : "text-button"
                        }
                        onClick={() => setShowRuntime((value) => !value)}
                      >
                        Runtime variables
                      </button>
                      {request && (
                        <button
                          className="icon-button light danger-hover"
                          aria-label="Delete request"
                          title="Delete request"
                          onClick={deleteRequest}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                  {request ? (
                    <>
                      <form
                        className="request-bar"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void execute(false);
                        }}
                      >
                        <div className="url-group">
                          <select
                            aria-label="Request method"
                            className={`method-select method-${request.method.toLowerCase()}`}
                            value={request.method}
                            onChange={(e) =>
                              changeRequest({
                                method: e.target.value as HttpMethod,
                              })
                            }
                          >
                            {METHODS.map((method) => (
                              <option key={method}>{method}</option>
                            ))}
                          </select>
                          <input
                            aria-label="Request URL"
                            value={request.url}
                            onChange={(e) =>
                              changeRequest({ url: e.target.value })
                            }
                            placeholder="https://api.example.com/resource"
                            spellCheck={false}
                            required
                          />
                        </div>
                        <button
                          className="primary send-button"
                          type="submit"
                          disabled={!!busy}
                        >
                          <Icon name="play" size={16} />
                          {busy === "run" ? "Sending…" : "Send request"}
                        </button>
                      </form>
                      {showRuntime && (
                        <div className="runtime-panel">
                          <label htmlFor="runtime-vars">
                            Runtime variables <span>EPHEMERAL</span>
                          </label>
                          <textarea
                            id="runtime-vars"
                            className="code-input"
                            spellCheck={false}
                            value={runtimeVariables}
                            onChange={(e) =>
                              setRuntimeVariables(e.target.value)
                            }
                          />
                          <p>
                            Overrides collection variables for this run. Never
                            saved in the collection. Use string values; avoid
                            sharing secrets in URLs or request bodies.
                          </p>
                        </div>
                      )}
                      <div
                        className="tabs"
                        role="tablist"
                        aria-label="Request settings"
                      >
                        {(
                          [
                            "headers",
                            "body",
                            "assertions",
                            "variables",
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab}
                            role="tab"
                            aria-selected={editorTab === tab}
                            onClick={() => setEditorTab(tab)}
                          >
                            {tab === "variables"
                              ? "Collection variables"
                              : tab[0].toUpperCase() + tab.slice(1)}
                            {tab === "headers" && (
                              <span>{Object.keys(request.headers).length}</span>
                            )}
                            {tab === "assertions" && (
                              <span>{request.assertions.length}</span>
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="editor-content">
                        <div hidden={editorTab !== "headers"}>
                          <JsonEditor
                            key={`headers-${selectedId}-${editorEpoch}`}
                            label="Request headers"
                            value={request.headers}
                            onChange={(value) =>
                              changeRequest({
                                headers: value as Record<string, string>,
                              })
                            }
                            onError={(message) => jsonError("headers", message)}
                            hint={
                              'String key/value pairs. Variables use {{name}} — for example {"Authorization": "Bearer {{token}}"}.'
                            }
                          />
                        </div>
                        <div hidden={editorTab !== "body"}>
                          <div className="field-heading">
                            <label htmlFor="request-body">Request body</label>
                            <span>RAW TEXT</span>
                          </div>
                          <textarea
                            id="request-body"
                            aria-label="Request body"
                            className="code-input"
                            spellCheck={false}
                            value={request.body || ""}
                            onChange={(e) =>
                              changeRequest({ body: e.target.value })
                            }
                            placeholder={'{\n  "message": "Hello, API"\n}'}
                          />
                          <p className="field-hint">
                            Sent as raw text. Set Content-Type in Headers when
                            sending JSON. GET and HEAD do not send a body.
                          </p>
                        </div>
                        <div hidden={editorTab !== "assertions"}>
                          <JsonEditor
                            key={`assertions-${selectedId}-${editorEpoch}`}
                            label="Assertions"
                            value={request.assertions}
                            kind="array"
                            onChange={(value) =>
                              changeRequest({
                                assertions: value as Assertion[],
                              })
                            }
                            onError={(message) =>
                              jsonError("assertions", message)
                            }
                            hint={
                              'Checks: status {expected: 200}, json {path: "ok", expected: true}, header {name, expected}, time {maxMs}, plugin {plugin, options}.'
                            }
                          />
                        </div>
                        <div hidden={editorTab !== "variables"}>
                          <JsonEditor
                            key={`variables-${activeId}-${editorEpoch}`}
                            label="Collection variables"
                            value={draft.variables}
                            onChange={(value) => {
                              setDraft({
                                ...draft,
                                variables: value as Record<string, string>,
                              });
                              setDirty(true);
                            }}
                            onError={(message) =>
                              jsonError("variables", message)
                            }
                            hint="Saved with the collection and included in exports. Use runtime variables for secrets. String values only."
                          />
                        </div>
                      </div>
                      <div className="request-footer">
                        <span>
                          <Icon name="code" size={14} /> Declarative checks. No
                          embedded scripts.
                        </span>
                        <label>
                          Timeout{" "}
                          <input
                            type="number"
                            aria-label="Request timeout milliseconds"
                            min="1"
                            max="60000"
                            value={request.timeoutMs ?? 10000}
                            onChange={(e) =>
                              changeRequest({
                                timeoutMs: Number(e.target.value),
                              })
                            }
                          />{" "}
                          ms
                        </label>
                      </div>
                    </>
                  ) : (
                    <div className="empty-request">
                      <p>This collection is ready for its first request.</p>
                      <button className="secondary" onClick={addRequest}>
                        <Icon name="plus" size={16} /> Add request
                      </button>
                    </div>
                  )}
                </section>
                <div className="run-strip">
                  <div>
                    <span className="tiny-grid">▦</span>
                    <span>
                      Test the whole collection
                      <strong>
                        Run all {draft.requests.length} requests and check every
                        expectation.
                      </strong>
                    </span>
                  </div>
                  <button
                    className="run-all"
                    onClick={() => void execute(true)}
                    disabled={!!busy || !draft.requests.length}
                  >
                    <Icon name="play" size={14} />
                    {busy === "run-all"
                      ? "Running collection…"
                      : "Run collection"}
                    <Icon name="arrow" size={16} />
                  </button>
                </div>
                <section className="response-card">
                  <div className="card-top">
                    <div className="request-title">
                      <span className="section-index">02</span>
                      <strong>Response</strong>
                      {run && (
                        <span
                          className={`run-badge ${run.passed ? "pass" : "fail"}`}
                        >
                          {run.passed ? "RUN PASSED" : "RUN FAILED"}
                        </span>
                      )}
                    </div>
                    {run && (
                      <span className="run-timestamp">
                        {date(run.timestamp)}
                      </span>
                    )}
                  </div>
                  {!run || !result ? (
                    <div className="response-empty">
                      <div className="response-empty-icon">
                        <Icon name="arrow" size={26} />
                      </div>
                      <h3>Ready when you are.</h3>
                      <p>
                        Send a request to inspect its response and run your
                        checks.
                      </p>
                      <span>BUILD → SEND → VERIFY</span>
                    </div>
                  ) : (
                    <>
                      {run.results.length > 1 && (
                        <div className="result-selector">
                          <label htmlFor="result-selector">
                            Request result
                          </label>
                          <select
                            id="result-selector"
                            value={resultIndex}
                            onChange={(e) =>
                              setResultIndex(Number(e.target.value))
                            }
                          >
                            {run.results.map((item, i) => (
                              <option key={`${item.requestId}-${i}`} value={i}>
                                {item.passed ? "✓" : "✕"} {item.method}{" "}
                                {item.name}
                              </option>
                            ))}
                          </select>
                          <span>
                            {run.results.filter((item) => item.passed).length} /{" "}
                            {run.results.length} passed
                          </span>
                        </div>
                      )}
                      <div className="response-metrics">
                        <div>
                          <span className="metric-label">STATUS</span>
                          <strong
                            className={
                              result.passed ? "text-green" : "text-red"
                            }
                          >
                            <span
                              className={`status-dot ${result.passed ? "" : "failed"}`}
                            />
                            {result.status || "Error"}{" "}
                            <small>{result.statusText}</small>
                          </strong>
                        </div>
                        <div>
                          <span className="metric-label">TIME</span>
                          <strong>
                            {Math.round(result.durationMs)} <small>ms</small>
                          </strong>
                        </div>
                        <div>
                          <span className="metric-label">SIZE</span>
                          <strong>
                            {result.bytes < 1024
                              ? result.bytes
                              : (result.bytes / 1024).toFixed(1)}{" "}
                            <small>{result.bytes < 1024 ? "B" : "KB"}</small>
                          </strong>
                        </div>
                        <div>
                          <span className="metric-label">CHECKS</span>
                          <strong
                            className={
                              passedChecks === result.checks.length
                                ? "text-green"
                                : "text-red"
                            }
                          >
                            {passedChecks}
                            <small> / {result.checks.length} passed</small>
                          </strong>
                        </div>
                      </div>
                      {result.error && (
                        <div className="response-error" role="alert">
                          {result.error}
                        </div>
                      )}
                      <div
                        className="tabs response-tabs"
                        role="tablist"
                        aria-label="Response views"
                      >
                        {(["body", "checks", "headers", "diff"] as const).map(
                          (tab) => (
                            <button
                              key={tab}
                              role="tab"
                              aria-selected={responseTab === tab}
                              onClick={() => setResponseTab(tab)}
                            >
                              {tab === "diff"
                                ? "Compare"
                                : tab[0].toUpperCase() + tab.slice(1)}
                              {tab === "checks" && (
                                <span>{result.checks.length}</span>
                              )}
                            </button>
                          ),
                        )}
                        {responseTab === "body" && (
                          <button
                            className="copy-response"
                            onClick={() => {
                              navigator.clipboard.writeText(result.body).then(
                                () => setNotice("Response copied."),
                                () =>
                                  setError(
                                    "Clipboard access is unavailable. Select and copy the response text.",
                                  ),
                              );
                            }}
                            aria-label="Copy response body"
                          >
                            <Icon name="copy" size={14} /> Copy
                          </button>
                        )}
                      </div>
                      <div className="response-content">
                        {responseTab === "body" && (
                          <pre
                            className="response-code"
                            aria-label="Response body"
                          >
                            {displayBody(result.body) ||
                              "(empty response body)"}
                          </pre>
                        )}
                        {responseTab === "headers" && (
                          <dl className="response-headers">
                            {Object.entries(result.headers).map(
                              ([name, value]) => (
                                <div key={name}>
                                  <dt>{name}</dt>
                                  <dd>{value}</dd>
                                </div>
                              ),
                            )}
                          </dl>
                        )}
                        {responseTab === "checks" && (
                          <div className="checks-list">
                            {result.checks.length ? (
                              result.checks.map((check, i) => (
                                <div
                                  className={`check-row ${check.passed ? "pass" : "fail"}`}
                                  key={i}
                                >
                                  <span className="check-icon">
                                    <Icon
                                      name={check.passed ? "check" : "close"}
                                      size={15}
                                    />
                                  </span>
                                  <div>
                                    <strong>{check.name}</strong>
                                    <p>{check.message}</p>
                                  </div>
                                  <span>{check.passed ? "PASS" : "FAIL"}</span>
                                </div>
                              ))
                            ) : (
                              <p className="muted">
                                No assertions configured. Add checks in the
                                request builder.
                              </p>
                            )}
                          </div>
                        )}
                        {responseTab === "diff" && (
                          <div className="compare-panel">
                            <div className="compare-heading">
                              <div>
                                <h3>Catch what changed.</h3>
                                <p>
                                  Compare the displayed run with a saved
                                  baseline.
                                </p>
                              </div>
                              <span className="subtle-tag">
                                STRUCTURAL DIFF
                              </span>
                            </div>
                            <label htmlFor="baseline-select">
                              Baseline run
                            </label>
                            <select
                              id="baseline-select"
                              aria-label="Baseline run"
                              value={baselineId}
                              onChange={(e) => {
                                setBaselineId(e.target.value);
                                setDiff(null);
                              }}
                            >
                              <option value="">Select a previous run…</option>
                              {history.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.collectionName} · {date(item.timestamp)}{" "}
                                  · {item.id.slice(0, 8)}
                                </option>
                              ))}
                            </select>
                            <label htmlFor="ignore-paths">
                              Ignore JSON paths
                            </label>
                            <input
                              id="ignore-paths"
                              value={ignorePaths}
                              onChange={(e) => {
                                setIgnorePaths(e.target.value);
                                setDiff(null);
                              }}
                              placeholder="timestamp, data.updatedAt"
                            />
                            <p className="field-hint">
                              Comma-separated body paths, for example timestamp
                              or data.updatedAt. Applied to JSON response
                              bodies.
                            </p>
                            <button
                              className="secondary"
                              onClick={() => void compare()}
                              disabled={!!busy || !baseline}
                            >
                              <Icon name="code" size={16} />
                              {busy === "compare"
                                ? "Comparing…"
                                : "Compare runs"}
                            </button>
                            {diff && (
                              <div className="diff-result" role="status">
                                <div
                                  className={`diff-summary ${diff.equal ? "pass" : "fail"}`}
                                >
                                  <Icon
                                    name={diff.equal ? "check" : "code"}
                                    size={17}
                                  />
                                  <strong>
                                    {diff.equal
                                      ? "No differences found"
                                      : `${diff.entries.length} difference${diff.entries.length === 1 ? "" : "s"} found`}
                                  </strong>
                                </div>
                                {diff.entries.map((entry, i) => (
                                  <div className="diff-entry" key={i}>
                                    <div>
                                      <code>{entry.path}</code>
                                      <span>{entry.kind}</span>
                                    </div>
                                    <pre className="before">
                                      − {pretty(entry.before) ?? "(absent)"}
                                    </pre>
                                    <pre className="after">
                                      + {pretty(entry.after) ?? "(absent)"}
                                    </pre>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </section>
                <footer className="workbench-footer">
                  <span>
                    <span className="status-dot" /> Your work stays on this
                    server.
                  </span>
                  <span>Made for curious developers.</span>
                </footer>
              </>
            )}
          </div>
          {showHistory && (
            <aside className="history-panel">
              <div className="history-heading">
                <div>
                  <span className="eyebrow">WORKSPACE ACTIVITY</span>
                  <h2>Run history</h2>
                </div>
                <button
                  className="icon-button light"
                  aria-label="Close history"
                  onClick={() => setShowHistory(false)}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
              <p className="history-description">
                Locally stored runs. Pick one to inspect or use as a baseline.
              </p>
              {history.length ? (
                history.map((item) => (
                  <article
                    className={`history-item ${run?.id === item.id ? "viewing" : ""}`}
                    key={item.id}
                  >
                    <div className="history-item-top">
                      <span
                        className={`history-status ${item.passed ? "pass" : "fail"}`}
                      >
                        <span
                          className={`status-dot ${item.passed ? "" : "failed"}`}
                        />
                        {item.passed ? "Passed" : "Failed"}
                      </span>
                      <time>{date(item.timestamp)}</time>
                    </div>
                    <h3>{item.collectionName}</h3>
                    <p>
                      {item.results.length} request
                      {item.results.length !== 1 ? "s" : ""}
                      <span>·</span>
                      {item.id.slice(0, 8)}
                    </p>
                    <div className="history-item-actions">
                      <button
                        onClick={() => {
                          setRun(item);
                          setResultIndex(0);
                          setDiff(null);
                          setResponseTab("body");
                        }}
                      >
                        View response
                      </button>
                      <button
                        className={baselineId === item.id ? "is-baseline" : ""}
                        onClick={() => {
                          setBaselineId(item.id);
                          setDiff(null);
                          setNotice(
                            "Baseline selected. Open Compare in a response to review changes.",
                          );
                        }}
                      >
                        {baselineId === item.id ? "✓ Baseline" : "Set baseline"}
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="history-empty">
                  <Icon name="clock" size={28} />
                  <h3>No runs yet.</h3>
                  <p>Run a request and its results will appear here.</p>
                </div>
              )}
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
