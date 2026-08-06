"use client";

import { useEffect, useState } from "react";
import { fetchCraftTypes } from "@/lib/craftTypes";
import {
  createCraftProductType,
  createEmptyCraftProductType,
  deleteCraftProductType,
  fetchCraftProductType,
  fetchCraftProductTypes,
  normalizeGridJson,
  updateCraftProductType,
} from "@/lib/craftProductTypes";

import CraftProductTypeList from "./CraftProductTypeList";
import CraftProductTypeForm from "./CraftProductTypeForm";

import EditorShell from "@/components/admin/shared/editor/EditorShell";
import EditorSidebar from "@/components/admin/shared/editor/EditorSidebar";
import EditorHeader from "@/components/admin/shared/editor/EditorHeader";
import useEditorLayout from "@/components/admin/shared/editor/useEditorLayout";
import FloatingToast from "@/components/admin/shared/editor/FloatingToast";
import useFloatingToast from "@/components/admin/shared/editor/useFloatingToast";

export default function CraftProductTypesClient() {
  const [craftProductTypes, setCraftProductTypes] = useState([]);
  const [craftTypes, setCraftTypes] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [selectedCraftProductType, setSelectedCraftProductType] = useState(() =>
    createEmptyCraftProductType()
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [hideSearchList, setHideSearchList] = useState(false);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { toast, showToast } = useFloatingToast();

  const {
    isMobile,
    sidebarOpen,
    closeSidebar,
    openSidebar,
    toggleSidebar,
  } = useEditorLayout(900);

  async function loadCraftProductTypes(q = "") {
    setLoading(true);

    try {
      const list = await fetchCraftProductTypes(q);
      setCraftProductTypes(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error(error);
      showToast(
        error.message || "職人作成タイプ一覧取得に失敗しました",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadCraftTypes() {
    try {
      const list = await fetchCraftTypes("");
      setCraftTypes(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error(error);
      showToast(error.message || "職人一覧取得に失敗しました", "error");
    }
  }

  async function loadCraftProductTypeDetail(id) {
    if (!id) {
      setSelectedCraftProductType(createEmptyCraftProductType());
      return;
    }

    setDetailLoading(true);

    try {
      const row = await fetchCraftProductType(id);
      setSelectedCraftProductType(row ?? createEmptyCraftProductType());
    } catch (error) {
      console.error(error);
      showToast(
        error.message || "職人作成タイプ詳細取得に失敗しました",
        "error"
      );
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadCraftTypes();
    loadCraftProductTypes("");
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHideSearchList(false);
      loadCraftProductTypes(keyword);
    }, 250);

    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedCraftProductType(createEmptyCraftProductType());
      return;
    }

    loadCraftProductTypeDetail(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!isMobile) {
      setHideSearchList(false);
    }
  }, [isMobile]);

  async function handleSaved(saved, options = {}) {
    const { isEdit = false } = options;

    await loadCraftProductTypes(keyword);

    if (saved?.id) {
      setSelectedId(saved.id);
      await loadCraftProductTypeDetail(saved.id);

      if (isMobile) {
        setHideSearchList(true);
        closeSidebar();
      }
    }

    const targetName =
      saved?.displayName ||
      saved?.name ||
      selectedCraftProductType?.displayName ||
      selectedCraftProductType?.name ||
      "職人作成タイプ";

    showToast(
      isEdit ? `「${targetName}」を更新した` : `「${targetName}」を作成した`
    );
  }

  async function handleDeleted(deletedId, deletedName) {
    await loadCraftProductTypes(keyword);

    if (Number(selectedId) === Number(deletedId)) {
      setSelectedId(null);
      setSelectedCraftProductType(createEmptyCraftProductType());
    }

    if (isMobile) {
      setHideSearchList(false);
      openSidebar();
    }

    showToast(`「${deletedName}」を削除した`);
  }

  function handleClickNew() {
    setSelectedId(null);
    setSelectedCraftProductType(createEmptyCraftProductType());
    setHideSearchList(false);

    if (isMobile) {
      closeSidebar();
    }
  }

  function handleSelect(id) {
    setSelectedId(id);

    if (isMobile) {
      setHideSearchList(true);
      closeSidebar();
    }
  }

  function handleKeywordChange(value) {
    setKeyword(value);
    setHideSearchList(false);
  }

  async function handleSave() {
    const key = String(selectedCraftProductType?.key ?? "").trim();
    const name = String(selectedCraftProductType?.name ?? "").trim();
    const craftTypeId = String(
      selectedCraftProductType?.craftTypeId ?? ""
    ).trim();

    if (!key) {
      showToast("keyを入力してください", "error");
      return;
    }

    if (!name) {
      showToast("管理名を入力してください", "error");
      return;
    }

    if (!craftTypeId) {
      showToast("作成する職人を選択してください", "error");
      return;
    }

    const normalizedGrid = normalizeGridJson(
      selectedCraftProductType?.gridJson
    );

    if (selectedCraftProductType?.gridJson && !normalizedGrid) {
      showToast("グリッド設定を確認してください", "error");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        ...selectedCraftProductType,
        key,
        name,
        displayName: String(
          selectedCraftProductType?.displayName ?? ""
        ).trim(),
        kind: String(selectedCraftProductType?.kind ?? "").trim(),
        craftTypeId,
        gridJson: normalizedGrid,
      };

      const isEdit = Boolean(selectedId && selectedCraftProductType?.id);

      const saved = isEdit
        ? await updateCraftProductType(selectedCraftProductType.id, payload)
        : await createCraftProductType(payload);

      await handleSaved(saved, { isEdit });
    } catch (error) {
      console.error(error);
      showToast(error.message || "保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId || !selectedCraftProductType?.id) return;

    const targetName =
      selectedCraftProductType.displayName ||
      selectedCraftProductType.name ||
      "職人作成タイプ";

    if (!window.confirm(`「${targetName}」を削除しますか？`)) return;

    try {
      setDeleting(true);
      await deleteCraftProductType(selectedCraftProductType.id);
      await handleDeleted(selectedCraftProductType.id, targetName);
    } catch (error) {
      console.error(error);
      showToast(error.message || "削除に失敗しました", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <EditorShell
        isMobile={isMobile}
        sidebar={
          <CraftProductTypesSidebar
            isMobile={isMobile}
            isOpen={sidebarOpen}
            onToggle={toggleSidebar}
            keyword={keyword}
            onKeywordChange={handleKeywordChange}
            onCreateNew={handleClickNew}
            loading={loading}
            craftProductTypes={craftProductTypes}
            selectedId={selectedId}
            onSelect={handleSelect}
            hideSearchList={hideSearchList}
            onReopenList={() => setHideSearchList(false)}
          />
        }
      >
        <CraftProductTypesWorkspace
          isMobile={isMobile}
          selectedId={selectedId}
          selectedCraftProductType={selectedCraftProductType}
          craftTypes={craftTypes}
          detailLoading={detailLoading}
          saving={saving}
          deleting={deleting}
          onSave={handleSave}
          onDelete={handleDelete}
          onChange={setSelectedCraftProductType}
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

function CraftProductTypesSidebar({
  isMobile,
  isOpen,
  onToggle,
  keyword,
  onKeywordChange,
  onCreateNew,
  loading,
  craftProductTypes,
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
      title="職人作成タイプ編集"
      searchPlaceholder="管理名 / 表示名 / key / kindで検索"
    >
      {!hideSearchList ? (
        <CraftProductTypeList
          craftProductTypes={craftProductTypes}
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

function CraftProductTypesWorkspace({
  isMobile,
  selectedId,
  selectedCraftProductType,
  craftTypes,
  detailLoading,
  saving,
  deleting,
  onSave,
  onDelete,
  onChange,
}) {
  const displayTitle =
    selectedCraftProductType?.displayName ||
    selectedCraftProductType?.name ||
    "職人作成タイプ";

  return (
    <>
      <EditorHeader
        isMobile={isMobile}
        title={
          selectedId ? `${displayTitle}を編集中` : "新規職人作成タイプ作成"
        }
        onSave={onSave}
        onDelete={onDelete}
        saving={saving}
        saveDisabled={detailLoading || saving || deleting}
        deleteDisabled={detailLoading || saving || deleting || !selectedId}
      />

      {detailLoading ? (
        <div style={styles.loadingPanel}>読み込み中...</div>
      ) : (
        <div style={styles.panel}>
          <CraftProductTypeForm
            craftProductType={selectedCraftProductType}
            craftTypes={craftTypes}
            onChange={onChange}
            isMobile={isMobile}
          />
        </div>
      )}
    </>
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
};
