"use client";

import { useEffect, useState } from "react";
import {
  createCraftType,
  createEmptyCraftType,
  deleteCraftType,
  fetchCraftType,
  fetchCraftTypes,
  updateCraftType,
} from "@/lib/craftTypes";

import CraftTypeList from "./CraftTypeList";
import CraftTypeForm from "./CraftTypeForm";

import EditorShell from "@/components/admin/shared/editor/EditorShell";
import EditorSidebar from "@/components/admin/shared/editor/EditorSidebar";
import EditorHeader from "@/components/admin/shared/editor/EditorHeader";
import useEditorLayout from "@/components/admin/shared/editor/useEditorLayout";
import FloatingToast from "@/components/admin/shared/editor/FloatingToast";
import useFloatingToast from "@/components/admin/shared/editor/useFloatingToast";

export default function CraftTypesClient() {
  const [craftTypes, setCraftTypes] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [selectedCraftType, setSelectedCraftType] = useState(() =>
    createEmptyCraftType()
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

  async function loadCraftTypes(q = "") {
    setLoading(true);

    try {
      const list = await fetchCraftTypes(q);
      const safeList = Array.isArray(list) ? list : [];

      setCraftTypes(safeList);
    } catch (error) {
      console.error(error);
      showToast(error.message || "職人種別一覧取得失敗", "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadCraftTypeDetail(id) {
    if (!id) {
      setSelectedCraftType(createEmptyCraftType());
      return;
    }

    setDetailLoading(true);

    try {
      const craftType = await fetchCraftType(id);
      setSelectedCraftType(craftType ?? createEmptyCraftType());
    } catch (error) {
      console.error(error);
      showToast(error.message || "職人種別詳細取得失敗", "error");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadCraftTypes("");
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHideSearchList(false);
      loadCraftTypes(keyword);
    }, 250);

    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedCraftType(createEmptyCraftType());
      return;
    }

    loadCraftTypeDetail(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!isMobile) {
      setHideSearchList(false);
    }
  }, [isMobile]);

  async function handleSaved(saved, options = {}) {
    const { isEdit = false } = options;

    await loadCraftTypes(keyword);

    if (saved?.id) {
      setSelectedId(saved.id);
      await loadCraftTypeDetail(saved.id);

      if (isMobile) {
        setHideSearchList(true);
        closeSidebar();
      }
    }

    const targetName = saved?.name || selectedCraftType?.name || "職人種別";

    showToast(
      isEdit
        ? `「${targetName}」を更新した`
        : `「${targetName}」を作成した`
    );
  }

  async function handleDeleted(deletedId, deletedName = "職人種別") {
    await loadCraftTypes(keyword);

    if (selectedId === deletedId) {
      setSelectedId(null);
      setSelectedCraftType(createEmptyCraftType());
    }

    if (isMobile) {
      setHideSearchList(false);
      openSidebar();
    }

    showToast(`「${deletedName}」を削除した`);
  }

  function handleClickNew() {
    setSelectedId(null);
    setSelectedCraftType(createEmptyCraftType());
    setHideSearchList(false);

    if (isMobile) {
      closeSidebar();
    }
  }

  function handleSelectCraftType(id) {
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

  function handleCraftTypeChange(nextCraftType) {
    setSelectedCraftType(nextCraftType);
  }

  async function handleSave() {
    try {
      const rawGreatSuccessRate = selectedCraftType?.greatSuccessRate;
      const hasGreatSuccessRate =
        rawGreatSuccessRate != null && rawGreatSuccessRate !== "";
      const greatSuccessRate = hasGreatSuccessRate
        ? Number(rawGreatSuccessRate)
        : null;

      if (
        hasGreatSuccessRate &&
        (!Number.isFinite(greatSuccessRate) ||
          greatSuccessRate < 0 ||
          greatSuccessRate > 100)
      ) {
        showToast("大成功率は0〜100で入力してください", "error");
        return;
      }

      setSaving(true);

      const payload = {
        ...selectedCraftType,
        greatSuccessRate,
      };

      const isEdit = Boolean(selectedId && selectedCraftType?.id);

      const saved = isEdit
        ? await updateCraftType(selectedCraftType.id, payload)
        : await createCraftType(payload);

      await handleSaved(saved, { isEdit });
    } catch (error) {
      console.error(error);
      showToast(error.message || "保存失敗", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId || !selectedCraftType?.id) return;

    const targetName = selectedCraftType?.name || "職人種別";

    const ok = window.confirm(`「${targetName}」を削除する？`);
    if (!ok) return;

    try {
      setDeleting(true);
      await deleteCraftType(selectedCraftType.id);
      await handleDeleted(selectedCraftType.id, targetName);
    } catch (error) {
      console.error(error);
      showToast(error.message || "削除失敗", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <EditorShell
        isMobile={isMobile}
        sidebar={
          <CraftTypesSidebarSection
            isMobile={isMobile}
            isOpen={sidebarOpen}
            onToggle={toggleSidebar}
            keyword={keyword}
            onKeywordChange={handleKeywordChange}
            onCreateNew={handleClickNew}
            loading={loading}
            craftTypes={craftTypes}
            selectedId={selectedId}
            onSelect={handleSelectCraftType}
            hideSearchList={hideSearchList}
            onReopenList={() => setHideSearchList(false)}
          />
        }
      >
        <CraftTypesWorkspaceSection
          isMobile={isMobile}
          selectedId={selectedId}
          selectedCraftType={selectedCraftType}
          detailLoading={detailLoading}
          saving={saving}
          deleting={deleting}
          onSave={handleSave}
          onDelete={handleDelete}
          onChange={handleCraftTypeChange}
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

function CraftTypesSidebarSection({
  isMobile,
  isOpen,
  onToggle,
  keyword,
  onKeywordChange,
  onCreateNew,
  loading,
  craftTypes,
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
      title="職人種別編集"
      searchPlaceholder="名前 / keyで検索"
    >
      {!hideSearchList ? (
        <CraftTypeList
          craftTypes={craftTypes}
          loading={loading}
          selectedId={selectedId}
          onSelect={onSelect}
          isMobile={isMobile}
        />
      ) : (
        <button type="button" onClick={onReopenList} style={styles.reopenButton}>
          候補を再表示
        </button>
      )}
    </EditorSidebar>
  );
}

function CraftTypesWorkspaceSection({
  isMobile,
  selectedId,
  selectedCraftType,
  detailLoading,
  saving,
  deleting,
  onSave,
  onDelete,
  onChange,
}) {
  return (
    <>
      <EditorHeader
        isMobile={isMobile}
        title={
          selectedId
            ? `${selectedCraftType?.name || "職人種別"}を編集中`
            : "新規職人種別作成"
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
          <CraftTypeForm
            craftType={selectedCraftType}
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