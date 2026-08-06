"use client";

import { useEffect, useMemo, useState } from "react";

import EditorShell from "@/components/admin/shared/editor/EditorShell";
import EditorHeader from "@/components/admin/shared/editor/EditorHeader";
import EditorSidebar from "@/components/admin/shared/editor/EditorSidebar";
import FloatingToast from "@/components/admin/shared/editor/FloatingToast";
import useEditorLayout from "@/components/admin/shared/editor/useEditorLayout";
import useFloatingToast from "@/components/admin/shared/editor/useFloatingToast";

import {
  fetchGameJobs,
  createGameJob,
  updateGameJob,
  deleteGameJob,
  updateGameJobEquipableTypes,
} from "@/lib/gameJobs";

import { fetchEquipmentTypes } from "@/lib/equipmentTypes";

const EMPTY_JOB = {
  id: null,
  key: "",
  name: "",
};

function getEquipableIdsByJobId(equipmentTypes, gameJobId) {
  if (!gameJobId) return [];

  return equipmentTypes
    .filter((type) => {
      if (!Array.isArray(type.equipableTypes)) return false;

      return type.equipableTypes.some(
        (item) => Number(item.gameJobId) === Number(gameJobId)
      );
    })
    .map((type) => Number(type.id))
    .filter((id) => id > 0);
}

function uniqueNumbers(values = []) {
  return Array.from(
    new Set(
      values
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );
}

export default function GameJobEditorClient() {
  const {
    isMobile,
    sidebarOpen,
    toggleSidebar,
    closeSidebar,
  } = useEditorLayout();

  const { toast, showToast } = useFloatingToast();

  const [jobs, setJobs] = useState([]);
  const [equipmentTypes, setEquipmentTypes] = useState([]);

  const [keyword, setKeyword] = useState("");
  const [selectedJobId, setSelectedJobId] = useState(null);

  const [form, setForm] = useState(EMPTY_JOB);
  const [selectedEquipmentTypeIds, setSelectedEquipmentTypeIds] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedJob = useMemo(() => {
    if (!selectedJobId) return null;

    return (
      jobs.find((job) => Number(job.id) === Number(selectedJobId)) ?? null
    );
  }, [jobs, selectedJobId]);

  const filteredJobs = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    if (!q) return jobs;

    return jobs.filter((job) => {
      return (
        String(job.name ?? "").toLowerCase().includes(q) ||
        String(job.key ?? "").toLowerCase().includes(q)
      );
    });
  }, [jobs, keyword]);

  const weaponTypes = useMemo(() => {
    return equipmentTypes.filter((type) => type.kind === "weapon");
  }, [equipmentTypes]);

  const armorTypes = useMemo(() => {
    return equipmentTypes.filter((type) => type.kind === "armor");
  }, [equipmentTypes]);

  const selectedCount = selectedEquipmentTypeIds.length;

  const saveDisabled = saving || !form.key.trim() || !form.name.trim();
  const deleteDisabled = saving || !form.id;

  async function loadData(keepSelectedJobId = null) {
    setLoading(true);

    try {
      const [jobList, typeList] = await Promise.all([
        fetchGameJobs(),
        fetchEquipmentTypes(),
      ]);

      setJobs(jobList);
      setEquipmentTypes(typeList);

      const nextSelectedJob =
        jobList.find((job) => Number(job.id) === Number(keepSelectedJobId)) ??
        jobList[0] ??
        null;

      if (nextSelectedJob) {
        setSelectedJobId(nextSelectedJob.id);
        setForm({
          id: nextSelectedJob.id,
          key: nextSelectedJob.key ?? "",
          name: nextSelectedJob.name ?? "",
        });

        setSelectedEquipmentTypeIds(
          getEquipableIdsByJobId(typeList, nextSelectedJob.id)
        );
      } else {
        setSelectedJobId(null);
        setForm(EMPTY_JOB);
        setSelectedEquipmentTypeIds([]);
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || "データ取得に失敗しました", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
   
  }, []);

  function handleSelectJob(job) {
    setSelectedJobId(job.id);
    setForm({
      id: job.id,
      key: job.key ?? "",
      name: job.name ?? "",
    });

    setSelectedEquipmentTypeIds(
      getEquipableIdsByJobId(equipmentTypes, job.id)
    );

    if (isMobile) {
      closeSidebar();
    }
  }

  function handleCreateNew() {
    setSelectedJobId(null);
    setForm(EMPTY_JOB);
    setSelectedEquipmentTypeIds([]);

    if (isMobile) {
      closeSidebar();
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function toggleEquipmentType(typeId) {
    const id = Number(typeId);

    setSelectedEquipmentTypeIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => Number(item) !== id);
      }

      return [...prev, id];
    });
  }

  function selectAllByKind(kind) {
    const ids = equipmentTypes
      .filter((type) => type.kind === kind)
      .map((type) => Number(type.id));

    setSelectedEquipmentTypeIds((prev) => uniqueNumbers([...prev, ...ids]));
  }

  function clearByKind(kind) {
    const targetIds = new Set(
      equipmentTypes
        .filter((type) => type.kind === kind)
        .map((type) => Number(type.id))
    );

    setSelectedEquipmentTypeIds((prev) =>
      prev.filter((id) => !targetIds.has(Number(id)))
    );
  }

  async function handleSave() {
    if (saveDisabled) return;

    setSaving(true);

    try {
      const payload = {
        key: form.key.trim(),
        name: form.name.trim(),
      };

      let savedJob;

      if (form.id) {
        savedJob = await updateGameJob(form.id, payload);
      } else {
        savedJob = await createGameJob(payload);
      }

      await updateGameJobEquipableTypes(
        savedJob.id,
        uniqueNumbers(selectedEquipmentTypeIds)
      );

      await loadData(savedJob.id);

      showToast("保存しました", "success");
    } catch (error) {
      console.error(error);
      showToast(error.message || "保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!form.id || saving) return;

    const ok = window.confirm(`「${form.name}」を削除しますか？`);
    if (!ok) return;

    setSaving(true);

    try {
      await deleteGameJob(form.id);
      await loadData();

      showToast("削除しました", "success");
    } catch (error) {
      console.error(error);
      showToast(error.message || "削除に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  const sidebar = (
    <EditorSidebar
      isMobile={isMobile}
      isOpen={sidebarOpen}
      onToggle={toggleSidebar}
      keyword={keyword}
      onKeywordChange={setKeyword}
      onCreateNew={handleCreateNew}
      createDisabled={saving}
      createLabel="職業追加"
      loading={loading}
      title="職業一覧"
      searchPlaceholder="職業名・keyで検索"
    >
      {filteredJobs.map((job) => {
        const active = Number(job.id) === Number(selectedJobId);


        return (
          <button
            key={job.id}
            type="button"
            onClick={() => handleSelectJob(job)}
            style={jobItemStyle(active)}
          >
            <span style={styles.jobItemTop}>
              <span style={styles.jobName}>{job.name}</span>
            </span>

          </button>
        );
      })}

      {!loading && filteredJobs.length === 0 ? (
        <div style={styles.emptyText}>職業が見つかりません。</div>
      ) : null}
    </EditorSidebar>
  );

  return (
    <>
      <EditorShell isMobile={isMobile} sidebar={sidebar}>
        <EditorHeader
          isMobile={isMobile}
          title="職業編集"
          description="職業の追加・編集と、その職業が装備できる武器・防具タイプを管理します。"
          notice={
            selectedJob
              ? `編集中: ${selectedJob.name} / ${selectedJob.key}`
              : "新しい職業を作成中"
          }
          onSave={handleSave}
          onDelete={handleDelete}
          saving={saving}
          saveDisabled={saveDisabled}
          deleteDisabled={deleteDisabled}
          deleteTitle={form.id ? "この職業を削除" : "保存済みの職業のみ削除できます"}
        />

        <div style={styles.contentStack}>
          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>
                  {form.id ? "職業情報" : "新しい職業"}
                </h2>
                <p style={styles.cardDescription}>
                  game_jobs テーブルに保存する基本情報です。
                </p>
              </div>

              {isMobile ? (
                <button
                  type="button"
                  onClick={toggleSidebar}
                  style={styles.secondaryButton}
                >
                  職業一覧
                </button>
              ) : null}
            </div>

            <div style={styles.formGrid}>
              <label style={styles.field}>
                <span style={styles.label}>職業キー</span>
                <input
                  name="key"
                  value={form.key}
                  onChange={handleChange}
                  placeholder="warrior"
                  autoComplete="off"
                  style={styles.input}
                />
              </label>

              <label style={styles.field}>
                <span style={styles.label}>職業名</span>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="戦士"
                  autoComplete="off"
                  style={styles.input}
                />
              </label>
            </div>
          </section>

          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>装備可能タイプ</h2>
                <p style={styles.cardDescription}>
                  equipable_types に保存する内容です。現在 {selectedCount} 件選択中。
                </p>
              </div>
            </div>

            <EquipmentTypeSection
              title="武器"
              kind="weapon"
              types={weaponTypes}
              selectedIds={selectedEquipmentTypeIds}
              onToggle={toggleEquipmentType}
              onSelectAll={selectAllByKind}
              onClear={clearByKind}
            />

            <EquipmentTypeSection
              title="防具"
              kind="armor"
              types={armorTypes}
              selectedIds={selectedEquipmentTypeIds}
              onToggle={toggleEquipmentType}
              onSelectAll={selectAllByKind}
              onClear={clearByKind}
            />
          </section>
        </div>
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

function EquipmentTypeSection({
  title,
  kind,
  types,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
}) {
  return (
    <section style={styles.typeSection}>
      <div style={styles.typeHeader}>
        <h3 style={styles.typeTitle}>{title}</h3>

        <div style={styles.typeActions}>
          <button
            type="button"
            onClick={() => onSelectAll(kind)}
            style={styles.miniButton}
          >
            全選択
          </button>

          <button
            type="button"
            onClick={() => onClear(kind)}
            style={styles.miniButton}
          >
            解除
          </button>
        </div>
      </div>

      <div style={styles.typeGrid}>
        {types.map((type) => {
          const checked = selectedIds.includes(Number(type.id));

          return (
            <label
              key={type.id}
              style={{
                ...styles.typeCheck,
                ...(checked ? styles.typeCheckActive : null),
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(type.id)}
                style={styles.checkbox}
              />

              <span style={styles.typeText}>
                <span style={styles.typeName}>{type.name}</span>
                <span style={styles.typeKey}>{type.key}</span>
              </span>
            </label>
          );
        })}

        {types.length === 0 ? (
          <div style={styles.emptyText}>装備タイプがありません。</div>
        ) : null}
      </div>
    </section>
  );
}

const styles = {
  contentStack: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    minWidth: 0,
  },

  card: {
    background: "var(--card-bg)",
    border: "1px solid var(--card-border)",
    borderRadius: 14,
    padding: 16,
    minWidth: 0,
    boxSizing: "border-box",
  },

  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },

  cardTitle: {
    margin: 0,
    fontSize: 20,
    lineHeight: 1.3,
    color: "var(--text-title)",
  },

  cardDescription: {
    margin: "6px 0 0",
    color: "var(--text-muted)",
    fontSize: 14,
    lineHeight: 1.6,
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },

  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  },

  label: {
    color: "var(--text-sub)",
    fontSize: 13,
    fontWeight: 700,
  },

  input: {
    width: "100%",
    minWidth: 0,
    border: "1px solid var(--input-border)",
    background: "var(--input-bg)",
    color: "var(--input-text)",
    borderRadius: 10,
    padding: "11px 12px",
    outline: "none",
    boxSizing: "border-box",
  },

  secondaryButton: {
    border: "1px solid var(--secondary-border)",
    background: "var(--secondary-bg)",
    color: "var(--secondary-text)",
    borderRadius: 10,
    padding: "9px 12px",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  typeSection: {
    borderTop: "1px solid var(--soft-border)",
    paddingTop: 16,
    marginTop: 16,
  },

  typeHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },

  typeTitle: {
    margin: 0,
    fontSize: 17,
    color: "var(--text-title)",
  },

  typeActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },

  miniButton: {
    border: "1px solid var(--soft-border)",
    background: "var(--soft-bg)",
    color: "var(--text-sub)",
    borderRadius: 10,
    padding: "7px 10px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },

  typeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
    gap: 10,
  },

  typeCheck: {
    display: "flex",
    alignItems: "flex-start",
    gap: 9,
    border: "1px solid var(--tag-border)",
    background: "var(--tag-bg)",
    color: "var(--tag-text)",
    borderRadius: 12,
    padding: 11,
    cursor: "pointer",
    minWidth: 0,
  },

  typeCheckActive: {
    background: "var(--selected-bg)",
    borderColor: "var(--selected-border)",
  },

  checkbox: {
    marginTop: 2,
    flexShrink: 0,
  },

  typeText: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    minWidth: 0,
  },

  typeName: {
    color: "var(--text-main)",
    fontWeight: 800,
    lineHeight: 1.3,
  },

  typeKey: {
    color: "var(--text-muted)",
    fontSize: 12,
    lineHeight: 1.3,
    wordBreak: "break-word",
  },

  jobItemTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  jobName: {
    color: "var(--text-main)",
    fontWeight: 800,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  jobKey: {
    color: "var(--text-muted)",
    fontSize: 12,
    lineHeight: 1.4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  jobBadge: {
    flexShrink: 0,
    minWidth: 24,
    height: 24,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--badge-bg)",
    color: "var(--badge-text)",
    fontSize: 12,
    fontWeight: 800,
  },

  emptyText: {
    color: "var(--text-muted)",
    fontSize: 14,
    lineHeight: 1.6,
    padding: 8,
  },
};

function jobItemStyle(active = false) {
  return {
    width: "100%",
    border: `1px solid ${
      active ? "var(--selected-border)" : "var(--card-border)"
    }`,
    background: active ? "var(--selected-bg)" : "var(--panel-bg)",
    color: "var(--text-main)",
    borderRadius: 12,
    padding: 12,
    textAlign: "left",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  };
}