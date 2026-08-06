"use client";

import { useEffect, useMemo, useState } from "react";
import ContinentList from "./ContinentList";
import ContinentFormFields from "./ContinentFormFields";
import {
  createContinent,
  deleteContinent,
  fetchContinent,
  fetchContinents,
  updateContinent,
} from "@/lib/continents";

import EditorShell from "@/components/admin/shared/editor/EditorShell";
import EditorSidebar from "@/components/admin/shared/editor/EditorSidebar";
import EditorHeader from "@/components/admin/shared/editor/EditorHeader";
import useEditorLayout from "@/components/admin/shared/editor/useEditorLayout";
import FloatingToast from "@/components/admin/shared/editor/FloatingToast";
import useFloatingToast from "@/components/admin/shared/editor/useFloatingToast";

function createEmptyContinent() {
  return {
    id: null,
    display_order: "",
    name: "",
    name_kana: "",
    name_en: "",
    map_image_folder: "",
  };
}

function normalizeContinent(row) {
  return {
    id: row?.id ?? null,
    display_order:
      row?.display_order === 0 || row?.display_order
        ? String(row.display_order)
        : "",
    name: row?.name ?? "",
    name_kana: row?.name_kana ?? "",
    name_en: row?.name_en ?? "",
    map_image_folder: row?.map_image_folder ?? "",
  };
}

function buildContinentPayload(form) {
  return {
    display_order:
      form.display_order === "" ||
      form.display_order === null ||
      form.display_order === undefined
        ? null
        : Number(form.display_order),
    name: (form.name ?? "").trim(),
    name_kana: (form.name_kana ?? "").trim() || null,
    name_en: (form.name_en ?? "").trim() || null,
    map_image_folder: (form.map_image_folder ?? "").trim() || null,
  };
}

export default function ContinentsClient() {
  const [continents, setContinents] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [loadingList, setLoadingList] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [selectedContinent, setSelectedContinent] = useState(createEmptyContinent());
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [hideSearchList, setHideSearchList] = useState(false);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({});

  const { toast, showToast } = useFloatingToast();

  const {
    isMobile,
    sidebarOpen,
    closeSidebar,
    openSidebar,
    toggleSidebar,
  } = useEditorLayout(900);

  const sortedContinents = useMemo(() => {
    return [...continents].sort((a, b) => {
      const aOrder =
        typeof a?.display_order === "number"
          ? a.display_order
          : Number(a?.display_order ?? Number.MAX_SAFE_INTEGER);

      const bOrder =
        typeof b?.display_order === "number"
          ? b.display_order
          : Number(b?.display_order ?? Number.MAX_SAFE_INTEGER);

      if (aOrder !== bOrder) return aOrder - bOrder;

      return (a?.name || "").localeCompare(b?.name || "", "ja");
    });
  }, [continents]);

  async function loadContinents(q = "") {
    setLoadingList(true);
    setMessage("");

    try {
      const list = await fetchContinents(q);
      setContinents(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error(error);
      setMessage(error.message || "一覧取得失敗");
      showToast(error.message || "一覧取得失敗", "error");
    } finally {
      setLoadingList(false);
    }
  }

  async function loadContinentDetail(id) {
    if (!id) {
      setSelectedContinent(createEmptyContinent());
      return;
    }

    setLoadingDetail(true);
    setMessage("");

    try {
      const continent = await fetchContinent(id);
      setSelectedContinent(normalizeContinent(continent));
    } catch (error) {
      console.error(error);
      setMessage(error.message || "大陸取得失敗");
      showToast(error.message || "大陸取得失敗", "error");
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    loadContinents("");
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHideSearchList(false);
      loadContinents(keyword);
    }, 250);

    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedContinent(createEmptyContinent());
      return;
    }

    loadContinentDetail(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!isMobile) {
      setHideSearchList(false);
    }
  }, [isMobile]);

  function handleNew() {
    setSelectedId(null);
    setSelectedContinent(createEmptyContinent());
    setErrors({});
    setMessage("");
    setHideSearchList(false);

    if (isMobile) {
      closeSidebar();
    }
  }

  function handleSelectContinent(id) {
    setSelectedId(id);
    setErrors({});
    setMessage("");

    if (isMobile) {
      setHideSearchList(true);
      closeSidebar();
    }
  }

  function handleContinentChange(updater) {
    setSelectedContinent((prev) =>
      typeof updater === "function" ? updater(prev) : updater
    );
    setErrors({});
    setMessage("");
  }

  async function reloadAfterSave(saved, options = {}) {
    const { isEdit = false } = options;

    await loadContinents(keyword);

    if (saved?.id) {
      setSelectedId(saved.id);
      await loadContinentDetail(saved.id);

      if (isMobile) {
        setHideSearchList(true);
        closeSidebar();
      }
    }

    const targetName = saved?.name || selectedContinent?.name || "大陸";
    showToast(
      isEdit ? `「${targetName}」を更新した` : `「${targetName}」を作成した`
    );
  }

  async function reloadAfterDelete(deletedId, deletedName = "大陸") {
    await loadContinents(keyword);

    if (selectedId === deletedId) {
      setSelectedId(null);
      setSelectedContinent(createEmptyContinent());
    }

    if (isMobile) {
      setHideSearchList(false);
      openSidebar();
    }

    showToast(`「${deletedName}」を削除した`);
  }

  async function handleSave() {
    setErrors({});
    setMessage("");

    const payload = buildContinentPayload(selectedContinent);

    const nextErrors = {};

    if (payload.display_order === null || Number.isNaN(payload.display_order)) {
      nextErrors.display_order = "表示順は必須";
    }

    if (!payload.name) {
      nextErrors.name = "名前は必須";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    try {
      setSaving(true);

      const isEdit = Boolean(selectedId && selectedContinent?.id);
      const saved = isEdit
        ? await updateContinent(selectedContinent.id, payload)
        : await createContinent(payload);

      setMessage(isEdit ? "更新した" : "新規追加した");
      await reloadAfterSave(saved, { isEdit });
    } catch (error) {
      console.error(error);
      setMessage(error.message || "保存失敗");
      showToast(error.message || "保存失敗", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId || !selectedContinent?.id) return;

    const targetName = selectedContinent?.name || "大陸";
    const ok = window.confirm(`「${targetName}」を削除する?`);
    if (!ok) return;

    try {
      setDeleting(true);
      setMessage("");

      await deleteContinent(selectedContinent.id);
      setMessage("削除した");

      await reloadAfterDelete(selectedContinent.id, targetName);
    } catch (error) {
      console.error(error);
      setMessage(error.message || "削除失敗");
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
          <EditorSidebar
            isMobile={isMobile}
            isOpen={sidebarOpen}
            onToggle={toggleSidebar}
            keyword={keyword}
            onKeywordChange={(value) => {
              setKeyword(value);
              setHideSearchList(false);
            }}
            onCreateNew={handleNew}
            createLabel="新規追加"
            loading={loadingList}
            title="大陸編集"
            searchPlaceholder="名前・かな・英語・フォルダ名で検索"
          >
            {!hideSearchList ? (
              <div style={styles.listWrap}>
                <ContinentList
                  continents={sortedContinents}
                  selectedId={selectedId}
                  onSelect={handleSelectContinent}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setHideSearchList(false)}
                style={styles.reopenButton}
              >
                候補を再表示
              </button>
            )}
          </EditorSidebar>
        }
      >
        <EditorHeader
          isMobile={isMobile}
          title={
            selectedId
              ? `${selectedContinent.name}を編集中`
              : "新規大陸作成"
          }
          notice={message}
          onSave={handleSave}
          onDelete={handleDelete}
          saving={saving}
          saveDisabled={loadingDetail || saving || deleting}
          deleteDisabled={loadingDetail || saving || deleting || !selectedId}
        />

        {loadingDetail ? (
          <div style={styles.loadingPanel}>読み込み中...</div>
        ) : (
          <div style={styles.contentPanel}>
            <div style={styles.formWrap}>
              <div style={styles.formHeader}>
                <div style={{ minWidth: 0 }}>
                  <h2 style={styles.formTitle}>
                    {selectedId ? "大陸編集" : "大陸新規追加"}
                  </h2>
                  {selectedContinent?.id ? (
                    <div style={styles.idText}>ID: {selectedContinent.id}</div>
                  ) : null}
                </div>
              </div>

              <ContinentFormFields
                form={selectedContinent}
                setForm={handleContinentChange}
                errors={errors}
              />
            </div>
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

const styles = {
  listWrap: {
    minWidth: 0,
    maxHeight: "min(60vh, 560px)",
    overflowY: "auto",
  },

  contentPanel: {
    border: "1px solid var(--panel-border)",
    borderRadius: 12,
    background: "var(--panel-bg)",
    padding: 16,
    boxSizing: "border-box",
    color: "var(--page-text)",
    minWidth: 0,
  },

  formWrap: {
    minWidth: 0,
  },

  formHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },

  formTitle: {
    margin: 0,
    fontSize: 18,
    color: "var(--text-title)",
  },

  idText: {
    marginTop: 4,
    fontSize: 12,
    color: "var(--text-muted)",
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