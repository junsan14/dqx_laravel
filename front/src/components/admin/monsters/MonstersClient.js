"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MonsterForm from "./MonsterForm";
import MonsterDropsEditor from "./MonsterDropsEditor";
import MonsterSpawnsEditor from "./MonsterSpawnsEditor";
import MonsterTriviaEditor from "./MonsterTriviaEditor";
import {
  emptyMonster,
  normalizeMonster,
  buildMonsterPayload,
} from "./monsterEditorHelpers";
import {
  searchMonsters,
  fetchMonsterDetail,
  createMonster,
  updateMonster,
  deleteMonster,
  fetchMonstersAroundDisplayOrder,
} from "@/lib/monsters";
import { fetchMaps } from "@/lib/maps";
import {
  fetchMonsterMapSpawns,
  saveMonsterMapSpawns,
  normalizeMapRow,
} from "@/lib/monsterMapSpawns";
import { useAuth } from "@/hooks/auth";

import EditorShell from "@/components/admin/shared/editor/EditorShell";
import EditorSidebar from "@/components/admin/shared/editor/EditorSidebar";
import EditorHeader from "@/components/admin/shared/editor/EditorHeader";
import useEditorLayout from "@/components/admin/shared/editor/useEditorLayout";
import FloatingToast from "@/components/admin/shared/editor/FloatingToast";
import useFloatingToast from "@/components/admin/shared/editor/useFloatingToast";

export default function MonstersClient() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.is_admin);

  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingAround, setLoadingAround] = useState(false);

  const [keyword, setKeyword] = useState("");
  const [monsters, setMonsters] = useState([]);
  const [selectedMonster, setSelectedMonster] = useState(emptyMonster());
  const [initialSpawns, setInitialSpawns] = useState([]);
  const [aroundMonsters, setAroundMonsters] = useState([]);

  const [maps, setMaps] = useState([]);

  const [parentCandidates, setParentCandidates] = useState([]);
  const selectAllObserverRef = useRef(null);

  const { toast, showToast } = useFloatingToast();

  const {
    isMobile,
    sidebarOpen,
    closeSidebar,
    openSidebar,
    toggleSidebar,
  } = useEditorLayout(960);

  const mapOptions = useMemo(
    () => (Array.isArray(maps) ? maps.map(normalizeMapRow) : []),
    [maps]
  );

  const orderPreviewRows = useMemo(() => {
    const currentOrder = Number(selectedMonster?.display_order ?? 0);

    if (!currentOrder) {
      return { above: [], below: [], current: null };
    }

    const sorted = [...(Array.isArray(aroundMonsters) ? aroundMonsters : [])].sort(
      (a, b) => {
        const orderDiff =
          Number(a?.display_order ?? 0) - Number(b?.display_order ?? 0);

        if (orderDiff !== 0) return orderDiff;

        return String(a?.name ?? "").localeCompare(String(b?.name ?? ""), "ja");
      }
    );

    const above = sorted
      .filter((monster) => Number(monster?.display_order ?? 0) < currentOrder)
      .slice(-2)
      .map((monster) => ({
        id: monster?.id ?? null,
        name: monster?.name ?? "",
        display_order: Number(monster?.display_order ?? 0),
      }));

    const below = sorted
      .filter((monster) => Number(monster?.display_order ?? 0) > currentOrder)
      .slice(0, 2)
      .map((monster) => ({
        id: monster?.id ?? null,
        name: monster?.name ?? "",
        display_order: Number(monster?.display_order ?? 0),
      }));

    const sameOrderRows = sorted
      .filter((monster) => Number(monster?.display_order ?? 0) === currentOrder)
      .map((monster) => ({
        id: monster?.id ?? null,
        name: monster?.name ?? "",
        display_order: Number(monster?.display_order ?? 0),
      }));

    const current = {
      id: selectedMonster?.id ?? null,
      name: selectedMonster?.name?.trim() || "新しいモンスター",
      display_order: currentOrder,
      conflicts: sameOrderRows,
    };

    return { above, below, current };
  }, [aroundMonsters, selectedMonster]);

  async function loadMonsters(nextKeyword = "") {
    try {
      setLoadingList(true);
      const rows = await searchMonsters(nextKeyword, "monster", "ja", {
        lightweight: true,
      });
      setMonsters(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error(error);
      showToast(error.message || "モンスター一覧取得失敗", "error");
    } finally {
      setLoadingList(false);
    }
  }

  async function loadMaps() {
    try {
      const mapRows = await fetchMaps("");
      setMaps(Array.isArray(mapRows) ? mapRows : []);
    } catch (error) {
      console.error(error);
      showToast("マップ取得失敗", "error");
    }
  }

  async function searchReincarnationParents(nextKeyword = "") {
    const next = String(nextKeyword ?? "").trim();

    if (!next) {
      setParentCandidates([]);
      return;
    }

    try {
      const rows = await searchMonsters(next, "monster", "ja", {
        lightweight: true,
      });
      const normalized = Array.isArray(rows) ? rows : [];
      const currentId = Number(selectedMonster?.id ?? 0);

      setParentCandidates(
        normalized
          .filter((row) => Number(row?.id ?? 0) > 0)
          .filter((row) => Number(row?.id ?? 0) !== currentId)
          .slice(0, 20)
      );
    } catch (error) {
      console.error(error);
      setParentCandidates([]);
    }
  }

  useEffect(() => {
    loadMaps();
  }, []);

  useEffect(() => {
    function selectAll(event) {
      const input = event.currentTarget;

      window.requestAnimationFrame(() => {
        input.select();
      });
    }

    function attachSelectAllHandlers() {
      const targets = document.querySelectorAll(
        [
          'input[placeholder="モンスター名 / IDで検索"]',
          '[data-monster-editor-inputs] input:not([type="file"]):not([type="checkbox"]):not([type="radio"])',
        ].join(",")
      );

      targets.forEach((input) => {
        if (!(input instanceof HTMLInputElement)) return;
        if (input.dataset.selectAllBound === "1") return;

        input.dataset.selectAllBound = "1";
        input.addEventListener("focus", selectAll);
        input.addEventListener("click", selectAll);
      });
    }

    attachSelectAllHandlers();

    const observer = new MutationObserver(() => {
      attachSelectAllHandlers();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    selectAllObserverRef.current = observer;

    return () => {
      observer.disconnect();
      selectAllObserverRef.current = null;

      document
        .querySelectorAll('[data-select-all-bound="1"]')
        .forEach((input) => {
          input.removeEventListener("focus", selectAll);
          input.removeEventListener("click", selectAll);
          delete input.dataset.selectAllBound;
        });
    };
  }, []);

  useEffect(() => {
    const delay = keyword.trim() ? 250 : 0;
    const timer = setTimeout(() => {
      loadMonsters(keyword);
    }, delay);

    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    async function loadAroundMonsters() {
      const displayOrder = Number(selectedMonster?.display_order ?? 0);

      if (!displayOrder) {
        setAroundMonsters([]);
        return;
      }

      try {
        setLoadingAround(true);

        const rows = await fetchMonstersAroundDisplayOrder(displayOrder, {
          range: 5,
          excludeId: selectedMonster?.id ?? null,
        });

        setAroundMonsters(Array.isArray(rows) ? rows : []);
      } catch (error) {
        console.error(error);
        setAroundMonsters([]);
      } finally {
        setLoadingAround(false);
      }
    }

    loadAroundMonsters();
  }, [selectedMonster?.display_order, selectedMonster?.id]);

  async function handleSelect(monster) {
    if (!monster?.id) return;

    try {
      setLoadingDetail(true);

      const [row, spawnRows] = await Promise.all([
        fetchMonsterDetail(monster.id),
        fetchMonsterMapSpawns(monster.id),
      ]);

      const normalized = normalizeMonster({
        ...(row ?? {}),
        spawns: spawnRows,
      });

      setSelectedMonster(normalized);
      setInitialSpawns(Array.isArray(spawnRows) ? spawnRows : []);
      setParentCandidates([]);

      if (isMobile) {
        closeSidebar();
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || "詳細取得失敗", "error");
    } finally {
      setLoadingDetail(false);
    }
  }

  function handleCreateNew() {
    if (!isAdmin) return;

    setSelectedMonster(emptyMonster());
    setInitialSpawns([]);
    setAroundMonsters([]);
    setParentCandidates([]);

    if (isMobile) {
      closeSidebar();
    }
  }

  async function handleSave() {
    try {
      const payload = buildMonsterPayload(selectedMonster);

      if (!selectedMonster?.id && !isAdmin) {
        showToast("新規追加は管理者のみ", "error");
        return;
      }

      if (!payload.name) {
        showToast("名前は必須", "error");
        return;
      }

      setSaving(true);

      const isEdit = Boolean(selectedMonster?.id);
      const targetName =
        selectedMonster?.name?.trim() || payload.name || "モンスター";

      let monsterId = selectedMonster?.id ?? null;
      let savedMonster = null;

      if (monsterId) {
        savedMonster = await updateMonster(monsterId, payload);

        await saveMonsterMapSpawns(
          monsterId,
          Array.isArray(selectedMonster?.spawns) ? selectedMonster.spawns : [],
          initialSpawns
        );
      } else {
        savedMonster = await createMonster(payload);
        monsterId = savedMonster?.id ?? null;

        if (!monsterId) {
          throw new Error("モンスター保存後のID取得に失敗");
        }

        await saveMonsterMapSpawns(
          monsterId,
          Array.isArray(selectedMonster?.spawns) ? selectedMonster.spawns : [],
          initialSpawns
        );
      }

      const [freshMonster, freshSpawns] = await Promise.all([
        fetchMonsterDetail(monsterId),
        fetchMonsterMapSpawns(monsterId),
      ]);

      const normalizedMonster = normalizeMonster({
        ...(freshMonster ?? savedMonster ?? {}),
        spawns: freshSpawns,
      });

      setSelectedMonster({
        ...normalizedMonster,
        image_preview_url: "",
        image_file: null,
        remove_image: false,
        image_version: Date.now(),
      });

      setInitialSpawns(Array.isArray(freshSpawns) ? freshSpawns : []);
      setParentCandidates([]);

      await loadMonsters(keyword);
      showToast(isEdit ? `「${targetName}」を更新した` : `「${targetName}」を作成した`);
    } catch (error) {
      console.error(error);
      showToast(error.message || "保存失敗", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!isAdmin) return;

    if (!selectedMonster?.id) {
      setSelectedMonster(emptyMonster());
      setInitialSpawns([]);
      setAroundMonsters([]);
      setParentCandidates([]);
      return;
    }

    const targetName = selectedMonster.name || "モンスター";
    const ok = window.confirm(`「${targetName}」を削除する?`);
    if (!ok) return;

    try {
      await deleteMonster(selectedMonster.id);
      setSelectedMonster(emptyMonster());
      setInitialSpawns([]);
      setAroundMonsters([]);
      setParentCandidates([]);
      await loadMonsters(keyword);
      showToast(`「${targetName}」を削除した`);

      if (isMobile) {
        openSidebar();
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || "削除失敗", "error");
    }
  }

  const saveDisabled = saving;
  const deleteDisabled = saving || !isAdmin || !selectedMonster?.id;
  const createDisabled = !isAdmin;

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
            onKeywordChange={setKeyword}
            onCreateNew={handleCreateNew}
            createDisabled={createDisabled}
            createLabel={!isAdmin ? "新規追加（管理者のみ）" : "新規追加"}
            loading={loadingList}
            title="モンスター検索"
            searchPlaceholder="モンスター名 / IDで検索"
          >
            <MonsterList
              monsters={monsters}
              selectedId={selectedMonster?.id ?? null}
              onSelect={handleSelect}
            />
          </EditorSidebar>
        }
      >
        <EditorHeader
          isMobile={isMobile}
          title={
            selectedMonster?.id
              ? `${selectedMonster.name || "モンスター"}を編集中`
              : "新規モンスター作成"
          }
          notice={
            !isAdmin &&
            "基本情報の編集・削除・新規追加は管理者のみ。出現情報の保存は可能です"
          }
          onSave={handleSave}
          onDelete={handleDelete}
          saving={saving}
          saveDisabled={saveDisabled}
          deleteDisabled={deleteDisabled}
          deleteTitle={!isAdmin ? "管理者のみ削除できます" : ""}
        />

        {loadingDetail ? (
          <div style={loadingStyle()}>読み込み中...</div>
        ) : (
          <div style={styles.content} data-monster-editor-inputs>
            <MonsterForm
              monster={selectedMonster}
              onChange={setSelectedMonster}
              parentCandidates={parentCandidates}
              onSearchParents={searchReincarnationParents}
              disabled={!isAdmin}
       
            >
              <OrderPreviewCard
                loading={loadingAround}
                rows={orderPreviewRows}
              />
            </MonsterForm>

            <MonsterTriviaEditor
              trivia1={selectedMonster?.trivia_1 ?? ""}
              trivia2={selectedMonster?.trivia_2 ?? ""}
              onChange={setSelectedMonster}
             
            />

            <MonsterDropsEditor
              drops={selectedMonster?.drops ?? []}
              onChange={(nextDrops) =>
                setSelectedMonster((prev) => ({
                  ...prev,
                  drops: nextDrops,
                }))
              }
            />

            <MonsterSpawnsEditor
              spawns={selectedMonster?.spawns ?? []}
              maps={mapOptions}
              is_reincarnated={selectedMonster.is_reincarnated}
              onChange={(nextSpawns) =>
                setSelectedMonster((prev) => ({
                  ...prev,
                  spawns: nextSpawns,
                }))
              }
            />
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

function MonsterList({ monsters, selectedId, onSelect }) {
  if (!Array.isArray(monsters) || monsters.length === 0) {
    return <div style={styles.emptyText}>モンスターが見つからない</div>;
  }

  return (
    <div style={styles.list}>
      {monsters.map((monster) => {
        const active = Number(monster?.id ?? 0) === Number(selectedId ?? 0);

        return (
          <button
            key={monster.id}
            type="button"
            onClick={() => onSelect(monster)}
            style={listButtonStyle(active)}
          >
            <div style={styles.listName}>{monster?.name ?? "名前なし"}</div>
            <div style={styles.listMeta}>
              ID: {monster?.id ?? "-"}
              {monster?.display_order ? ` / No.${monster.display_order}` : ""}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function OrderPreviewCard({ loading, rows }) {
  const previewRows = [
    ...(rows?.above ?? []).map((row) => ({
      ...row,
      positionLabel: "前",
      isCurrent: false,
      conflicts: [],
    })),
    ...(rows?.current
      ? [
          {
            ...rows.current,
            positionLabel: "現在",
            isCurrent: true,
            conflicts: rows.current.conflicts ?? [],
          },
        ]
      : []),
    ...(rows?.below ?? []).map((row) => ({
      ...row,
      positionLabel: "後",
      isCurrent: false,
      conflicts: [],
    })),
  ];

  return (
    <section style={cardStyle()}>
      <div style={styles.orderPreviewHeader}>
        <h2 style={sectionTitleStyle()}>表示順プレビュー</h2>
        <p style={sectionDescStyle()}>前後の表示順を確認できる</p>
      </div>

      {loading ? (
        <div style={mutedPanelStyle()}>読み込み中...</div>
      ) : previewRows.length > 0 ? (
        <div style={styles.orderPreviewGrid}>
          {previewRows.map((row, index) => (
            <div
              key={`${row.positionLabel}-${row.id ?? row.display_order ?? index}`}
              style={row.isCurrent ? currentRowCardStyle() : rowCardStyle()}
            >
              <div style={styles.orderPreviewCardHeader}>
                <span style={columnTitleStyle()}>{row.positionLabel}</span>
                <span style={rowMetaStyle()}>
                  No.{row.display_order ?? "-"}
                </span>
              </div>

              <div style={rowNameStyle()}>{row.name ?? "未設定"}</div>

              {(row.conflicts ?? []).length > 0 && (
                <div style={styles.orderPreviewConflictList}>
                  <div style={conflictTitleStyle()}>同じ表示順</div>
                  {row.conflicts.map((conflict) => (
                    <div
                      key={`conflict-${conflict.id ?? conflict.name}`}
                      style={conflictItemStyle()}
                    >
                      {conflict.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={mutedPanelStyle()}>表示順を入力してください</div>
      )}
    </section>
  );
}

const styles = {
  content: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minWidth: 0,
  },

  list: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
    maxHeight: "min(60vh, 560px)",
    overflowY: "auto",
  },

  listName: {
    fontWeight: 700,
    color: "var(--text-main)",
    wordBreak: "break-word",
  },

  listMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "var(--text-muted)",
    wordBreak: "break-word",
  },

  emptyText: {
    color: "var(--text-muted)",
    fontSize: 13,
    padding: "8px 0",
  },

  orderPreviewHeader: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },

  orderPreviewCardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    minWidth: 0,
  },

  orderPreviewConflictList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginTop: 8,
  },

  orderPreviewGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
    minWidth: 0,
  },
};

const listButtonStyle = (active = false) => ({
  width: "100%",
  textAlign: "left",
  border: `1px solid ${
    active ? "var(--selected-border)" : "var(--card-border)"
  }`,
  background: active ? "var(--selected-bg)" : "var(--card-bg)",
  borderRadius: 10,
  padding: "12px 14px",
  cursor: "pointer",
  minWidth: 0,
});

const loadingStyle = () => ({
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
  borderRadius: 14,
  padding: 20,
  color: "var(--page-text)",
});

const cardStyle = () => ({
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
  borderRadius: 12,
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  minWidth: 0,
});

const sectionTitleStyle = () => ({
  margin: 0,
  fontSize: 15,
  color: "var(--text-title)",
});

const sectionDescStyle = () => ({
  margin: 0,
  color: "var(--text-muted)",
  fontSize: 11,
});

const mutedPanelStyle = () => ({
  border: "1px solid var(--soft-border)",
  background: "var(--soft-bg)",
  color: "var(--text-muted)",
  borderRadius: 8,
  padding: "8px 9px",
  fontSize: 11,
});

const columnTitleStyle = () => ({
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-muted)",
});

const rowCardStyle = () => ({
  border: "1px solid var(--soft-border)",
  background: "var(--soft-bg)",
  borderRadius: 8,
  padding: "7px 8px",
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
});

const currentRowCardStyle = () => ({
  border: "1px solid var(--selected-border)",
  background: "var(--selected-bg)",
  borderRadius: 8,
  padding: "8px 10px",
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
});

const rowNameStyle = () => ({
  color: "var(--text-main)",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.35,
  wordBreak: "break-word",
});

const rowMetaStyle = () => ({
  color: "var(--text-muted)",
  fontSize: 10,
});

const conflictTitleStyle = () => ({
  color: "var(--text-muted)",
  fontSize: 12,
  fontWeight: 700,
});

const conflictItemStyle = () => ({
  color: "var(--text-main)",
  fontSize: 13,
  wordBreak: "break-word",
});