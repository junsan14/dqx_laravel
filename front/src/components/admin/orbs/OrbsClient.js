"use client";

import { useEffect, useMemo, useState } from "react";
import OrbList from "./OrbList";
import OrbFormFields from "./OrbFormFields";
import {
  buildOrbPayload,
  createOrb,
  createEmptyOrbForm,
  deleteOrb,
  fetchOrb,
  fetchOrbs,
  normalizeOrbForm,
  updateOrb,
} from "@/lib/orbs";

import EditorShell from "@/components/admin/shared/editor/EditorShell";
import EditorSidebar from "@/components/admin/shared/editor/EditorSidebar";
import EditorHeader from "@/components/admin/shared/editor/EditorHeader";
import useEditorLayout from "@/components/admin/shared/editor/useEditorLayout";
import FloatingToast from "@/components/admin/shared/editor/FloatingToast";
import useFloatingToast from "@/components/admin/shared/editor/useFloatingToast";

export default function OrbsClient() {
  const [orbs, setOrbs] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [loadingList, setLoadingList] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [selectedOrb, setSelectedOrb] = useState(createEmptyOrbForm());
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

  const sortedOrbs = useMemo(() => {
    return [...orbs].sort((a, b) => {
      if ((a.color || "") !== (b.color || "")) {
        return (a.color || "").localeCompare(b.color || "", "ja");
      }
      return (a.name || "").localeCompare(b.name || "", "ja");
    });
  }, [orbs]);

  async function loadOrbs(q = "") {
    setLoadingList(true);
    setMessage("");

    try {
      const list = await fetchOrbs(q);
      setOrbs(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error(error);
      setMessage(error.message || "一覧取得失敗");
      showToast(error.message || "一覧取得失敗", "error");
    } finally {
      setLoadingList(false);
    }
  }

  async function loadOrbDetail(id) {
    if (!id) {
      setSelectedOrb(createEmptyOrbForm());
      return;
    }

    setLoadingDetail(true);
    setMessage("");

    try {
      const orb = await fetchOrb(id);
      setSelectedOrb(normalizeOrbForm(orb));
    } catch (error) {
      console.error(error);
      setMessage(error.message || "宝珠取得失敗");
      showToast(error.message || "宝珠取得失敗", "error");
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    loadOrbs("");
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHideSearchList(false);
      loadOrbs(keyword);
    }, 250);

    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedOrb(createEmptyOrbForm());
      return;
    }

    loadOrbDetail(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!isMobile) {
      setHideSearchList(false);
    }
  }, [isMobile]);

  function handleNew() {
    setSelectedId(null);
    setSelectedOrb(createEmptyOrbForm());
    setErrors({});
    setMessage("");
    setHideSearchList(false);

    if (isMobile) {
      closeSidebar();
    }
  }

  function handleSelectOrb(id) {
    setSelectedId(id);
    setErrors({});
    setMessage("");

    if (isMobile) {
      setHideSearchList(true);
      closeSidebar();
    }
  }

  function handleOrbChange(updater) {
    setSelectedOrb((prev) =>
      typeof updater === "function" ? updater(prev) : updater
    );
    setErrors({});
    setMessage("");
  }

  async function reloadAfterSave(saved, options = {}) {
    const { isEdit = false } = options;

    await loadOrbs(keyword);

    if (saved?.id) {
      setSelectedId(saved.id);
      await loadOrbDetail(saved.id);

      if (isMobile) {
        setHideSearchList(true);
        closeSidebar();
      }
    }

    const targetName = saved?.name || selectedOrb?.name || "宝珠";
    showToast(isEdit ? `「${targetName}」を更新した` : `「${targetName}」を作成した`);
  }

  async function reloadAfterDelete(deletedId, deletedName = "宝珠") {
    await loadOrbs(keyword);

    if (selectedId === deletedId) {
      setSelectedId(null);
      setSelectedOrb(createEmptyOrbForm());
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

    const payload = buildOrbPayload(selectedOrb);

    const nextErrors = {};
    if (!payload.name) nextErrors.name = "名前は必須";
    if (!payload.color) nextErrors.color = "色は必須";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    try {
      setSaving(true);

      const isEdit = Boolean(selectedId && selectedOrb?.id);
      const saved = isEdit
        ? await updateOrb(selectedOrb.id, payload)
        : await createOrb(payload);

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
    if (!selectedId || !selectedOrb?.id) return;

    const targetName = selectedOrb?.name || "宝珠";
    const ok = window.confirm(`「${targetName}」を削除する?`);
    if (!ok) return;

    try {
      setDeleting(true);
      setMessage("");

      await deleteOrb(selectedOrb.id);
      setMessage("削除した");

      await reloadAfterDelete(selectedOrb.id, targetName);
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
            title="宝珠編集"
            searchPlaceholder="名前・読み・英語名・色で検索"
          >
            {!hideSearchList ? (
              <div style={styles.listWrap}>
                <OrbList
                  orbs={sortedOrbs}
                  selectedId={selectedId}
                  onSelect={handleSelectOrb}
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
          title={selectedId ? `${selectedOrb.name}を編集中` : "新規宝珠作成"}
       
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
                    {selectedId ? "オーブ編集" : "オーブ新規追加"}
                  </h2>
                  {selectedOrb?.id ? (
                    <div style={styles.idText}>ID: {selectedOrb.id}</div>
                  ) : null}
                </div>
              </div>

              <OrbFormFields
                form={selectedOrb}
                setForm={handleOrbChange}
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
