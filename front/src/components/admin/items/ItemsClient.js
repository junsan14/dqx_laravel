"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildItemPayload,
  createEmptyItemForm,
  createItem,
  deleteItem,
  fetchItem,
  fetchItems,
  normalizeItemForm,
  updateItem,
  updateMaterialPrices,
} from "@/lib/items";
import ItemList from "./ItemList";
import ItemForm from "./ItemForm";

import EditorShell from "@/components/admin/shared/editor/EditorShell";
import EditorSidebar from "@/components/admin/shared/editor/EditorSidebar";
import EditorHeader from "@/components/admin/shared/editor/EditorHeader";
import useEditorLayout from "@/components/admin/shared/editor/useEditorLayout";
import FloatingToast from "@/components/admin/shared/editor/FloatingToast";
import useFloatingToast from "@/components/admin/shared/editor/useFloatingToast";

function getProgressLabel(progress) {
  if (progress >= 100) return "更新完了";
  if (progress >= 72) return "取得結果を反映中";
  if (progress >= 38) return "素材価格を確認中";
  return "相場ページを取得中";
}

function formatFinishedAt(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function ItemsClient() {
  const [items, setItems] = useState([]);
  const [initialItems, setInitialItems] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [selectedItem, setSelectedItem] = useState(() =>
    createEmptyItemForm()
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [hideSearchList, setHideSearchList] = useState(false);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [priceProgress, setPriceProgress] = useState(0);
  const [priceUpdateResult, setPriceUpdateResult] = useState(null);
  const progressTimerRef = useRef(null);

  const [formErrors, setFormErrors] = useState({});
  const [message, setMessage] = useState("");

  const { toast, showToast } = useFloatingToast();

  const {
    isMobile,
    sidebarOpen,
    closeSidebar,
    openSidebar,
    toggleSidebar,
  } = useEditorLayout(900);

  const categories = useMemo(() => {
    return [
      ...new Set(
        initialItems
          .map((item) => (item.category ?? "").trim())
          .filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b, "ja"));
  }, [initialItems]);

  function clearPriceProgressTimer() {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }

  function startPriceProgressTimer() {
    clearPriceProgressTimer();

    progressTimerRef.current = window.setInterval(() => {
      setPriceProgress((current) => {
        if (current >= 92) return current;

        if (current < 30) {
          return Math.min(92, current + 4);
        }

        if (current < 65) {
          return Math.min(92, current + 2);
        }

        return Math.min(92, current + 1);
      });
    }, 500);
  }

  async function loadItems(q = "") {
    setLoading(true);

    try {
      const list = await fetchItems(q);
      const normalized = Array.isArray(list) ? list : [];

      setItems(normalized);

      if (!q) {
        setInitialItems(normalized);
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || "アイテム一覧取得失敗", "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadItemDetail(id) {
    if (!id) {
      setSelectedItem(createEmptyItemForm());
      return;
    }

    setDetailLoading(true);

    try {
      const item = await fetchItem(id);
      setSelectedItem(normalizeItemForm(item));
    } catch (error) {
      console.error(error);
      showToast(error.message || "アイテム詳細取得失敗", "error");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadItems("");
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHideSearchList(false);
      loadItems(keyword);
    }, 250);

    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedItem(createEmptyItemForm());
      return;
    }

    loadItemDetail(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!isMobile) {
      setHideSearchList(false);
    }
  }, [isMobile]);

  useEffect(() => {
    return () => {
      clearPriceProgressTimer();
    };
  }, []);

  async function handleSaved(saved, options = {}) {
    const { isEdit = false } = options;

    await loadItems(keyword);
    await loadItems("");

    if (saved?.id) {
      setSelectedId(saved.id);
      await loadItemDetail(saved.id);

      if (isMobile) {
        setHideSearchList(true);
        closeSidebar();
      }
    }

    const targetName = saved?.name || selectedItem?.name || "アイテム";
    showToast(isEdit ? `「${targetName}」を更新した` : `「${targetName}」を作成した`);
  }

  async function handleDeleted(deletedId, deletedName = "アイテム") {
    await loadItems(keyword);
    await loadItems("");

    if (selectedId === deletedId) {
      setSelectedId(null);
      setSelectedItem(createEmptyItemForm());
    }

    if (isMobile) {
      setHideSearchList(false);
      openSidebar();
    }

    showToast(`「${deletedName}」を削除した`);
  }

  function handleClickNew() {
    setSelectedId(null);
    setSelectedItem(createEmptyItemForm());
    setFormErrors({});
    setMessage("");
    setHideSearchList(false);

    if (isMobile) {
      closeSidebar();
    }
  }

  function handleSelectItem(id) {
    setSelectedId(id);
    setFormErrors({});
    setMessage("");

    if (isMobile) {
      setHideSearchList(true);
      closeSidebar();
    }
  }

  function handleKeywordChange(value) {
    setKeyword(value);
    setHideSearchList(false);
  }

  function handleItemChange(nextItem) {
    setSelectedItem(nextItem);
    setFormErrors({});
    setMessage("");
  }

  async function handleSave() {
    setMessage("");
    setFormErrors({});

    const payload = buildItemPayload(selectedItem);

    const nextErrors = {};
    if (!payload.name) nextErrors.name = "名前は必須";

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      return;
    }

    try {
      setSaving(true);

      const isEdit = Boolean(selectedId && selectedItem?.id);

      const saved = isEdit
        ? await updateItem(selectedItem.id, payload)
        : await createItem(payload);

      setMessage(isEdit ? "更新した" : "新規追加した");
      await handleSaved(saved, { isEdit });
    } catch (error) {
      console.error(error);
      setMessage(error.message || "保存失敗");
      showToast(error.message || "保存失敗", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId || !selectedItem?.id) return;

    const targetName = selectedItem?.name || "アイテム";
    const ok = window.confirm(`「${targetName}」を削除する?`);
    if (!ok) return;

    try {
      setDeleting(true);
      setMessage("");

      await deleteItem(selectedItem.id);
      setMessage("削除した");

      await handleDeleted(selectedItem.id, targetName);
    } catch (error) {
      console.error(error);
      setMessage(error.message || "削除失敗");
      showToast(error.message || "削除失敗", "error");
    } finally {
      setDeleting(false);
    }
  }

  async function handleUpdateMaterialPrices() {
    const ok = window.confirm(
      "相場サイトの全ページから素材価格を取得して、buy_priceを更新します。実行しますか？"
    );

    if (!ok) return;

    try {
      setUpdatingPrices(true);
      setPriceProgress(4);
      setPriceUpdateResult(null);
      startPriceProgressTimer();

      const result = await updateMaterialPrices();

      clearPriceProgressTimer();
      setPriceProgress(100);
      setPriceUpdateResult(result);

      await loadItems(keyword);

      if (keyword) {
        await loadItems("");
      }

      if (selectedId) {
        await loadItemDetail(selectedId);
      }

      showToast(
        `${Number(result?.updated_count ?? 0)}件の素材価格を更新した`
      );
    } catch (error) {
      console.error(error);
      clearPriceProgressTimer();
      setPriceProgress(0);
      setPriceUpdateResult(null);
      showToast(
        error.message || "素材価格の更新に失敗した",
        "error"
      );
    } finally {
      clearPriceProgressTimer();
      setUpdatingPrices(false);
    }
  }

  return (
    <>
      <EditorShell
        isMobile={isMobile}
        sidebar={
          <ItemsSidebarSection
            isMobile={isMobile}
            isOpen={sidebarOpen}
            onToggle={toggleSidebar}
            keyword={keyword}
            onKeywordChange={handleKeywordChange}
            onCreateNew={handleClickNew}
            loading={loading}
            items={items}
            selectedId={selectedId}
            onSelect={handleSelectItem}
            hideSearchList={hideSearchList}
            onReopenList={() => setHideSearchList(false)}
          />
        }
      >
        <ItemsWorkspaceSection
          isMobile={isMobile}
          selectedId={selectedId}
          selectedItem={selectedItem}
          detailLoading={detailLoading}
          categories={categories}
          saving={saving}
          deleting={deleting}
          updatingPrices={updatingPrices}
          priceProgress={priceProgress}
          priceUpdateResult={priceUpdateResult}
          errors={formErrors}
          message={message}
          onSave={handleSave}
          onDelete={handleDelete}
          onUpdateMaterialPrices={handleUpdateMaterialPrices}
          onChange={handleItemChange}
        />
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

function ItemsSidebarSection({
  isMobile,
  isOpen,
  onToggle,
  keyword,
  onKeywordChange,
  onCreateNew,
  loading,
  items,
  selectedId,
  onSelect,
  hideSearchList,
  onReopenList,
}) {
  return (
    <EditorSidebar
      isMobile={isMobile}
      isOpen={isOpen}
      onToggle={onToggle}
      keyword={keyword}
      onKeywordChange={onKeywordChange}
      onCreateNew={onCreateNew}
      createLabel="新規追加"
      loading={loading}
      title="アイテム編集"
      searchPlaceholder="名前・カテゴリで検索"
    >
      {!hideSearchList ? (
        <ItemList
          items={items}
          loading={loading}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ) : (
        <button type="button" onClick={onReopenList} style={styles.reopenButton}>
          候補を再表示
        </button>
      )}
    </EditorSidebar>
  );
}

function ItemsWorkspaceSection({
  isMobile,
  selectedId,
  selectedItem,
  detailLoading,
  categories,
  saving,
  deleting,
  updatingPrices,
  priceProgress,
  priceUpdateResult,
  errors,
  message,
  onSave,
  onDelete,
  onUpdateMaterialPrices,
  onChange,
}) {
  const actionDisabled =
    detailLoading || saving || deleting || updatingPrices;

  return (
    <>
      <EditorHeader
        isMobile={isMobile}
        title={selectedId ? `${selectedItem.name}を編集中` : "新規アイテム作成"}
        onSave={onSave}
        onDelete={onDelete}
        saving={saving}
        saveDisabled={actionDisabled}
        deleteDisabled={actionDisabled || !selectedId}
      />

      <MaterialPriceUpdatePanel
        updating={updatingPrices}
        progress={priceProgress}
        result={priceUpdateResult}
        disabled={saving || deleting || detailLoading}
        onUpdate={onUpdateMaterialPrices}
      />

      {detailLoading ? (
        <div style={styles.loadingPanel}>読み込み中...</div>
      ) : (
        <div style={styles.panel}>
          <ItemForm
            item={selectedItem}
            categories={categories}
            errors={errors}
            message={message}
            onChange={onChange}
          />
        </div>
      )}
    </>
  );
}

function MaterialPriceUpdatePanel({
  updating,
  progress,
  result,
  disabled,
  onUpdate,
}) {
  const safeProgress = Math.max(
    0,
    Math.min(100, Number(progress) || 0)
  );

  const showProgress = updating || safeProgress > 0;

  return (
    <section style={styles.marketPanel}>
      <div style={styles.marketContent}>
        <div style={styles.marketTitle}>素材の相場価格</div>

        <div style={styles.marketDescription}>
          相場サイトの全ページから価格を取得し、名前が一致するアイテムの買値を更新します。
        </div>

        {showProgress ? (
          <div style={styles.progressArea}>
            <div style={styles.progressHeader}>
              <span>{getProgressLabel(safeProgress)}</span>
              <strong>{safeProgress}%</strong>
            </div>

            <div
              style={styles.progressTrack}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={safeProgress}
              aria-label="素材価格更新の進捗"
            >
              <div
                style={{
                  ...styles.progressBar,
                  width: `${safeProgress}%`,
                }}
              />
            </div>

            {updating ? (
              <div style={styles.progressNote}>
                現在の割合は処理時間から算出した目安です。正確な件数は完了後に表示します。
              </div>
            ) : null}
          </div>
        ) : null}

        {result ? (
          <div style={styles.resultGrid}>
            <span>取得：{Number(result.fetched_count ?? 0)}件</span>
            <span>更新：{Number(result.updated_count ?? 0)}件</span>
            <span>変更なし：{Number(result.unchanged_count ?? 0)}件</span>
            <span>DB未登録：{Number(result.not_found_count ?? 0)}件</span>
            <span>同名重複：{Number(result.duplicate_count ?? 0)}件</span>

            {result.fetched_at ? (
              <span>
                実行日時：{formatFinishedAt(result.fetched_at)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onUpdate}
        disabled={disabled || updating}
        style={{
          ...styles.marketButton,
          ...(disabled || updating
            ? styles.marketButtonDisabled
            : {}),
        }}
      >
        {updating ? "価格を更新中..." : "素材価格を更新"}
      </button>
    </section>
  );
}

const styles = {
  panel: {
    border: "1px solid var(--panel-border)",
    borderRadius: 12,
    background: "var(--panel-bg)",
    padding: 16,
    boxSizing: "border-box",
    color: "var(--page-text)",
    minWidth: 0,
  },

  loadingPanel: {
    border: "1px solid var(--panel-border)",
    borderRadius: 12,
    background: "var(--panel-bg)",
    padding: 16,
    boxSizing: "border-box",
    color: "var(--page-text)",
    minWidth: 0,
  },

  reopenButton: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--soft-border)",
    background: "var(--soft-bg)",
    color: "var(--text-sub)",
    cursor: "pointer",
    fontWeight: 700,
  },

  marketPanel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
    border: "1px solid var(--panel-border)",
    borderRadius: 12,
    background: "var(--panel-bg)",
    padding: 16,
    boxSizing: "border-box",
    color: "var(--page-text)",
    minWidth: 0,
  },

  marketContent: {
    display: "grid",
    gap: 8,
    flex: "1 1 380px",
    minWidth: 0,
  },

  marketTitle: {
    color: "var(--text-title, var(--page-text))",
    fontSize: 16,
    fontWeight: 800,
  },

  marketDescription: {
    color: "var(--text-muted)",
    fontSize: 13,
    lineHeight: 1.6,
  },

  progressArea: {
    display: "grid",
    gap: 7,
    marginTop: 4,
  },

  progressHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    color: "var(--text-main)",
    fontSize: 13,
  },

  progressTrack: {
    width: "100%",
    height: 10,
    overflow: "hidden",
    border: "1px solid var(--soft-border)",
    borderRadius: 999,
    background: "var(--soft-bg)",
    boxSizing: "border-box",
  },

  progressBar: {
    height: "100%",
    borderRadius: 999,
    background:
      "var(--primary-bg, var(--selected-bg, var(--text-main)))",
    transition: "width 0.35s ease",
  },

  progressNote: {
    color: "var(--text-muted)",
    fontSize: 11,
    lineHeight: 1.5,
  },

  resultGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px 14px",
    color: "var(--text-sub)",
    fontSize: 13,
    fontWeight: 700,
  },

  marketButton: {
    flex: "0 0 auto",
    minWidth: 150,
    padding: "11px 16px",
    border: "1px solid var(--primary-border, var(--selected-border))",
    borderRadius: 10,
    background: "var(--primary-bg, var(--selected-bg))",
    color: "var(--primary-text, var(--text-main))",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },

  marketButtonDisabled: {
    cursor: "not-allowed",
    opacity: 0.55,
  },
};
