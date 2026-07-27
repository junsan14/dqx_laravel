"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteAdminContentReport,
  fetchAdminContentReports,
  updateAdminContentReport,
} from "@/lib/contentReports";
import EditorShell from "@/components/admin/shared/editor/EditorShell";
import EditorSidebar from "@/components/admin/shared/editor/EditorSidebar";
import EditorHeader from "@/components/admin/shared/editor/EditorHeader";
import FloatingToast from "@/components/admin/shared/editor/FloatingToast";
import useEditorLayout from "@/components/admin/shared/editor/useEditorLayout";
import useFloatingToast from "@/components/admin/shared/editor/useFloatingToast";
import styles from "./ContentReportsAdminPanel.module.css";

const TYPE_OPTIONS = [
  { value: "", label: "すべてのページ" },
  { value: "equipment", label: "装備・職人" },
  { value: "monster", label: "モンスター" },
  { value: "accessory", label: "アクセサリ" },
  { value: "map_layer", label: "マップ階層" },
  { value: "monster_map_spawn", label: "モンスター出現情報" },
];

const STATUS_OPTIONS = [
  { value: "", label: "すべての状態" },
  { value: "pending", label: "未確認" },
  { value: "reviewing", label: "確認中" },
  { value: "resolved", label: "対応済み" },
  { value: "rejected", label: "却下" },
  { value: "spam", label: "スパム" },
];

const PUBLIC_OPTIONS = [
  { value: "", label: "公開・非公開すべて" },
  { value: "true", label: "公開中" },
  { value: "false", label: "非公開" },
];

const CATEGORY_LABELS = {
  incorrect_info: "情報が間違っている",
  missing_info: "情報が不足している",
  typo: "誤字・表記",
  other: "その他",
};

const TYPE_LABELS = Object.fromEntries(
  TYPE_OPTIONS.filter((item) => item.value).map((item) => [item.value, item.label])
);

const STATUS_LABELS = Object.fromEntries(
  STATUS_OPTIONS.filter((item) => item.value).map((item) => [item.value, item.label])
);

const EMPTY_META = {
  current_page: 1,
  last_page: 1,
  per_page: 20,
  total: 0,
};

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizeReportResult(result) {
  return result?.data && !Array.isArray(result.data) ? result.data : result;
}

function getTargetLabel(report) {
  if (!report) return "ユーザー報告";

  return (
    report.target_label ||
    report.context_json?.target_label ||
    `${TYPE_LABELS[report.reportable_type] || report.reportable_type} #${
      report.reportable_id
    }`
  );
}

function createDraft(report) {
  return {
    status: report?.status ?? "pending",
    isPublic: Boolean(report?.is_public),
    resolvedNote: report?.resolved_note ?? "",
  };
}

export default function ContentReportsAdminPanel() {
  const [filters, setFilters] = useState({
    q: "",
    reportable_type: "",
    status: "pending",
    is_public: "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [page, setPage] = useState(1);
  const [reports, setReports] = useState([]);
  const [meta, setMeta] = useState(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(() => createDraft(null));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hideSearchList, setHideSearchList] = useState(false);

  const { toast, showToast } = useFloatingToast();
  const {
    isMobile,
    sidebarOpen,
    closeSidebar,
    openSidebar,
    toggleSidebar,
  } = useEditorLayout(900);

  const selectedReport = useMemo(
    () =>
      reports.find((report) => Number(report.id) === Number(selectedId)) ?? null,
    [reports, selectedId]
  );

  const hasChanges = useMemo(() => {
    if (!selectedReport) return false;

    return (
      String(draft.status) !== String(selectedReport.status) ||
      Boolean(draft.isPublic) !== Boolean(selectedReport.is_public) ||
      String(draft.resolvedNote ?? "") !==
        String(selectedReport.resolved_note ?? "")
    );
  }, [draft, selectedReport]);

  useEffect(() => {
    setDraft(createDraft(selectedReport));
  }, [selectedReport]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setAppliedFilters(filters);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    if (!isMobile) {
      setHideSearchList(false);
    }
  }, [isMobile]);

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result = await fetchAdminContentReports({
        ...appliedFilters,
        is_public:
          appliedFilters.is_public === ""
            ? undefined
            : appliedFilters.is_public === "true",
        page,
        per_page: 20,
      });

      const nextReports = Array.isArray(result?.data) ? result.data : [];
      const nextMeta = result?.meta ?? EMPTY_META;

      setReports(nextReports);
      setMeta(nextMeta);
      setSelectedId((currentId) => {
        const currentStillExists = nextReports.some(
          (report) => Number(report.id) === Number(currentId)
        );

        if (currentStillExists) return currentId;
        return nextReports[0]?.id ?? null;
      });

      return true;
    } catch (loadError) {
      console.error(loadError);
      setReports([]);
      setMeta(EMPTY_META);
      setSelectedId(null);
      setError(loadError?.message || "コメント一覧の取得に失敗しました。");
      return false;
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  function updateFilter(key, value) {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetFilters() {
    setFilters({
      q: "",
      reportable_type: "",
      status: "",
      is_public: "",
    });
    setHideSearchList(false);
    openSidebar();
  }

  function handleSelectReport(id) {
    setSelectedId(id);

    if (isMobile) {
      setHideSearchList(true);
      closeSidebar();
    }
  }

  async function handleReload() {
    const success = await loadReports();
    showToast(
      success ? "報告一覧を再読み込みしました。" : "再読み込みに失敗しました。",
      success ? "success" : "error"
    );
  }

  async function handleSave() {
    if (!selectedReport || !hasChanges || saving || deleting) return;

    try {
      setSaving(true);

      const response = await updateAdminContentReport(selectedReport.id, {
        status: draft.status,
        is_public: draft.isPublic,
        resolved_note: draft.resolvedNote,
      });
      const updated = normalizeReportResult(response);

      if (!updated?.id) {
        throw new Error("更新後のレポート情報を取得できませんでした。");
      }

      setReports((current) =>
        current.map((report) =>
          Number(report.id) === Number(updated.id) ? updated : report
        )
      );
      setSelectedId(updated.id);
      showToast(`「${getTargetLabel(updated)}」の変更を保存しました。`);
    } catch (saveError) {
      console.error(saveError);
      showToast(saveError?.message || "変更の保存に失敗しました。", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedReport || saving || deleting) return;

    const targetLabel = getTargetLabel(selectedReport);
    const ok = window.confirm(`「${targetLabel}」の報告を完全に削除しますか？`);
    if (!ok) return;

    try {
      setDeleting(true);
      await deleteAdminContentReport(selectedReport.id);

      const currentIndex = reports.findIndex(
        (report) => Number(report.id) === Number(selectedReport.id)
      );
      const nextReports = reports.filter(
        (report) => Number(report.id) !== Number(selectedReport.id)
      );
      const nextIndex = Math.min(
        Math.max(currentIndex, 0),
        Math.max(nextReports.length - 1, 0)
      );

      setReports(nextReports);
      setSelectedId(nextReports[nextIndex]?.id ?? null);
      setMeta((current) => ({
        ...current,
        total: Math.max(0, Number(current.total || 0) - 1),
      }));
      showToast(`「${targetLabel}」の報告を削除しました。`);
    } catch (deleteError) {
      console.error(deleteError);
      showToast(deleteError?.message || "報告の削除に失敗しました。", "error");
    } finally {
      setDeleting(false);
    }
  }

  const headerDescription = selectedReport
    ? [
        TYPE_LABELS[selectedReport.reportable_type] ||
          selectedReport.reportable_type,
        CATEGORY_LABELS[selectedReport.category] || selectedReport.category,
        formatDate(selectedReport.created_at),
      ]
        .filter(Boolean)
        .join(" ・ ")
    : "左の一覧から確認する報告を選択してください。";

  const headerNotice = selectedReport
    ? hasChanges
      ? "未保存の変更があります。"
      : "保存済みです。状態・公開設定・返信内容を変更できます。"
    : "絞り込み条件を変更すると一覧が自動更新されます。";

  return (
    <>
      <EditorShell
        isMobile={isMobile}
        sidebar={
          <ReportsSidebar
            isMobile={isMobile}
            isOpen={sidebarOpen}
            onToggle={toggleSidebar}
            filters={filters}
            onFilterChange={updateFilter}
            onResetFilters={resetFilters}
            onReload={handleReload}
            loading={loading}
            reports={reports}
            selectedId={selectedId}
            onSelect={handleSelectReport}
            hideSearchList={hideSearchList}
            onReopenList={() => {
              setHideSearchList(false);
              openSidebar();
            }}
            meta={meta}
            page={page}
            onPageChange={setPage}
            error={error}
          />
        }
      >
        <EditorHeader
          isMobile={isMobile}
          title={
            selectedReport
              ? `${getTargetLabel(selectedReport)}を確認中`
              : "ユーザーから寄せられた情報"
          }
          description={headerDescription}
          notice={headerNotice}
          onSave={handleSave}
          onDelete={handleDelete}
          saving={saving}
          deleting={deleting}
          saveDisabled={
            !selectedReport || loading || saving || deleting || !hasChanges
          }
          deleteDisabled={!selectedReport || loading || saving || deleting}
          deleteTitle={!selectedReport ? "報告を選択してください" : ""}
        />

        {loading && !selectedReport ? (
          <div className={styles.loadingPanel}>
            <span className={styles.spinner} aria-hidden="true" />
            <span>報告内容を読み込んでいます…</span>
          </div>
        ) : selectedReport ? (
          <ReportEditor
            report={selectedReport}
            draft={draft}
            onDraftChange={setDraft}
            disabled={saving || deleting}
          />
        ) : (
          <div className={styles.emptyPanel}>
            <strong>編集する報告が選択されていません。</strong>
            <p>左の一覧から報告を選択してください。</p>
          </div>
        )}
      </EditorShell>

      <FloatingToast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        isMobile={isMobile}
      />
    </>
  );
}

function ReportsSidebar({
  isMobile,
  isOpen,
  onToggle,
  filters,
  onFilterChange,
  onResetFilters,
  onReload,
  loading,
  reports,
  selectedId,
  onSelect,
  hideSearchList,
  onReopenList,
  meta,
  page,
  onPageChange,
  error,
}) {
  return (
    <EditorSidebar
      isMobile={isMobile}
      isOpen={isOpen}
      onToggle={onToggle}
      keyword={filters.q}
      onKeywordChange={(value) => onFilterChange("q", value)}
      onCreateNew={onReload}
      createDisabled={loading}
      createLabel="再読み込み"
      loading={loading}
      title="情報報告一覧"
      searchPlaceholder="対象名・コメント・修正候補で検索"
    >
      <div className={styles.sidebarFilters}>
        <label className={styles.sidebarField}>
          <span>ページ種類</span>
          <select
            value={filters.reportable_type}
            onChange={(event) =>
              onFilterChange("reportable_type", event.target.value)
            }
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.sidebarFilterGrid}>
          <label className={styles.sidebarField}>
            <span>状態</span>
            <select
              value={filters.status}
              onChange={(event) => onFilterChange("status", event.target.value)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.sidebarField}>
            <span>公開状態</span>
            <select
              value={filters.is_public}
              onChange={(event) =>
                onFilterChange("is_public", event.target.value)
              }
            >
              {PUBLIC_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          className={styles.resetButton}
          onClick={onResetFilters}
        >
          絞り込みをリセット
        </button>
      </div>

      <div className={styles.resultSummary}>
        <span>{meta.total}件</span>
        <span>
          {meta.current_page} / {meta.last_page}ページ
        </span>
      </div>

      {error ? <p className={styles.sidebarError}>{error}</p> : null}

      {hideSearchList ? (
        <button
          type="button"
          className={styles.reopenButton}
          onClick={onReopenList}
        >
          候補を再表示
        </button>
      ) : (
        <ReportList
          reports={reports}
          selectedId={selectedId}
          onSelect={onSelect}
          loading={loading}
        />
      )}

      {meta.last_page > 1 ? (
        <div className={styles.pagination}>
          <button
            type="button"
            onClick={() => onPageChange((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || loading}
          >
            前へ
          </button>
          <span>
            {page} / {meta.last_page}
          </span>
          <button
            type="button"
            onClick={() =>
              onPageChange((current) =>
                Math.min(Number(meta.last_page || 1), current + 1)
              )
            }
            disabled={page >= meta.last_page || loading}
          >
            次へ
          </button>
        </div>
      ) : null}
    </EditorSidebar>
  );
}

function ReportList({ reports, selectedId, onSelect, loading }) {
  if (!loading && reports.length === 0) {
    return <div className={styles.listEmpty}>条件に合う報告はありません。</div>;
  }

  return (
    <div className={styles.reportList}>
      {reports.map((report) => {
        const active = Number(selectedId) === Number(report.id);
        const statusLabel = STATUS_LABELS[report.status] || report.status;
        const visibilityLabel = report.is_public ? "公開" : "非公開";

        return (
          <button
            key={report.id}
            type="button"
            onClick={() => onSelect(report.id)}
            className={`${styles.reportItem} ${
              active ? styles.reportItemActive : ""
            }`}
          >
            <strong className={styles.reportItemTitle}>
              {getTargetLabel(report)}
            </strong>
            <span className={styles.reportItemMessage}>{report.message}</span>
            <span className={styles.reportItemMeta}>
              {statusLabel} ・ {visibilityLabel} ・ {formatDate(report.created_at)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ReportEditor({ report, draft, onDraftChange, disabled }) {
  const contextRows = useMemo(() => {
    const context = report.context_json ?? {};

    return Object.entries(context).filter(
      ([key, value]) =>
        !["target_label", "page_url"].includes(key) &&
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
    );
  }, [report.context_json]);

  function updateDraft(key, value) {
    onDraftChange((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
    <div className={styles.editorPanel} aria-busy={disabled}>
      <Section title="ユーザーからの報告">
        <div className={styles.metaLine}>
          <span>
            {TYPE_LABELS[report.reportable_type] || report.reportable_type}
          </span>
          <span>{CATEGORY_LABELS[report.category] || report.category}</span>
          {report.field_key ? <span>{report.field_key}</span> : null}
          <span>ID: {report.reportable_id}</span>
        </div>

        <p className={styles.userMessage}>{report.message}</p>
      </Section>

      {report.suggested_value ? (
        <Section title="正しいと思われる情報">
          <p className={styles.suggestedMessage}>{report.suggested_value}</p>
        </Section>
      ) : null}

      <Section title="対応内容">
        <div className={styles.editorGrid}>
          <label className={styles.field}>
            <span>状態</span>
            <select
              value={draft.status}
              onChange={(event) => updateDraft("status", event.target.value)}
              disabled={disabled}
            >
              {STATUS_OPTIONS.filter((item) => item.value).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.publicToggle}>
            <input
              type="checkbox"
              checked={draft.isPublic}
              onChange={(event) => updateDraft("isPublic", event.target.checked)}
              disabled={disabled}
            />
            <span>ユーザー画面に公開する</span>
          </label>
        </div>

        <label className={styles.field}>
          <span>管理者からの返信・対応メモ</span>
          <textarea
            value={draft.resolvedNote}
            onChange={(event) =>
              updateDraft("resolvedNote", event.target.value)
            }
            rows={6}
            maxLength={2000}
            placeholder="修正内容や、ユーザー画面へ表示する返信を入力"
            disabled={disabled}
          />
          <small>{draft.resolvedNote.length} / 2000</small>
        </label>
      </Section>

      <Section title="投稿元・補助情報">
        {report.context_json?.page_url ? (
          <a
            className={styles.pageLink}
            href={report.context_json.page_url}
            target="_blank"
            rel="noreferrer"
          >
            投稿元ページを開く
          </a>
        ) : (
          <p className={styles.mutedText}>投稿元URLはありません。</p>
        )}

        {contextRows.length > 0 ? (
          <details className={styles.contextDetails}>
            <summary>補助情報を表示</summary>
            <dl>
              {contextRows.map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>
                    {typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className={styles.section}>
      <h2>{title}</h2>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}
