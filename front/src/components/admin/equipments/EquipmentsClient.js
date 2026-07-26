"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchItems } from "@/lib/items";
import {
  createEmptyEquipmentRow,
  createEquipment,
  deleteEquipment,
  fetchEquipments,
  hydrateRowMaterialsWithItems,
  updateEquipment,
} from "@/lib/equipments";
import { fetchGameJobs } from "@/lib/gameJobs";
import { fetchEquipmentTypes } from "@/lib/equipmentTypes";
import RouteProgressDoneOnDataReady from "@/components/common/RouteProgressDoneOnDataReady";

import EditorSidebar from "@/components/admin/shared/editor/EditorSidebar";
import EditorShell from "@/components/admin/shared/editor/EditorShell";
import EditorHeader from "@/components/admin/shared/editor/EditorHeader";
import useEditorLayout from "@/components/admin/shared/editor/useEditorLayout";
import FloatingToast from "@/components/admin/shared/editor/FloatingToast";
import useFloatingToast from "@/components/admin/shared/editor/useFloatingToast";

import EquipmentCreatePanel from "./EquipmentCreatePanel";
import EquipmentEditorPanel from "./EquipmentEditorPanel";
import EquipmentDetailsPanel from "./EquipmentDetailsPanel";

import {
  GROUP_MEMBER_PRESETS,
  safeJsonParse,
  toJsonString,
  buildGroupedRows,
  str,
  buildEmptyGroupMembers,
  makeGroupId,
  getDefaultGroupItemName,
  getGridPreset,
  getAutoSlotGridType,
  findEquipmentTypeById,
  getGroupDisplayName,
} from "./equipmentFormHelpers";

const DEFAULT_GROUP_KIND = "armor_set";

function createInitialNewItem() {
  return {
    itemId: "",
    itemName: "",
    itemNameKana: "",
    equipmentTypeId: "",
    jobOverrideMode: "inherit",
    slot: "",
    slotGridType: "",
    groupName: "",
    equipLevel: "",
  };
}

function createInitialNewGroup(groupKind = DEFAULT_GROUP_KIND) {
  const safeGroupKind = groupKind || DEFAULT_GROUP_KIND;

  return {
    groupName: "",
    groupKind: safeGroupKind,
    equipmentTypeId: "",
    jobOverrideMode: "inherit",
    members: buildEmptyGroupMembers(safeGroupKind),
    equipLevel: "",
  };
}

function getPresetMemberLabel(row) {
  const groupKind = str(row?.groupKind).trim();
  const presets = GROUP_MEMBER_PRESETS[groupKind] ?? [];

  const slot = str(row?.slot).trim();
  const slotGridType = str(row?.slotGridType).trim();

  const matched =
    presets.find((preset) => str(preset.slot).trim() === slot) ??
    presets.find((preset) => str(preset.slotGridType).trim() === slotGridType) ??
    null;

  return str(matched?.label).trim();
}

function getDeleteTargetText(row) {
  const groupName = getGroupDisplayName(row);
  const memberLabel = getPresetMemberLabel(row);
  const itemName = str(row?.itemName).trim();

  if (!str(row?.groupId).trim()) {
    return itemName || "装備";
  }

  if (memberLabel) {
    return `「${groupName}」の「${memberLabel}」`;
  }

  return `「${groupName}」の「${itemName || "部位"}」`;
}
function normalizeSearchText(value) {
  return str(value)
    .trim()
    .toLowerCase()
    .replace(/[ァ-ン]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0x60)
    );
}

function buildEntrySearchText(entry) {
  if (!entry) return "";

  const parts = [
    entry.searchText,
    entry.label,
    entry.groupKind,
    entry.groupId,
    entry.groupName,
  ];

  if (entry.__kind === "group") {
    const rows = Array.isArray(entry.rows) ? entry.rows : [];

    rows.forEach((row) => {
      parts.push(...buildRowSearchParts(row));
    });
  } else {
    parts.push(...buildRowSearchParts(entry.row));
  }

  return parts.filter(Boolean).join(" ");
}

function buildRowSearchParts(row) {
  if (!row) return [];

  return [
    row.id,
    row.itemId,
    row.item_id,
    row.itemName,
    row.item_name,
    row.itemNameKana,
    row.item_name_kana,
    row.itemNameEn,
    row.item_name_en,
    row.equipmentTypeName,
    row.equipment_type_name,
    row.equipmentType?.name,
    row.equipment_type?.name,
    row.equipmentType?.key,
    row.equipment_type?.key,
    row.equipLevel,
    row.equip_level,
    row.craftLevel,
    row.craft_level,
    row.groupName,
    row.group_name,
    row.groupId,
    row.group_id,
    row.groupKind,
    row.group_kind,
    row.slot,
    row.slotGridType,
    row.slot_grid_type,
    row.recipeBook,
    row.recipe_book,
    row.recipePlace,
    row.recipe_place,
  ].map((value) => str(value));
}

function getRowEquipLevel(row) {
  return str(row?.equipLevel ?? row?.equip_level).trim();
}

function getEntryRows(entry) {
  if (!entry) return [];

  if (entry.__kind === "group") {
    return Array.isArray(entry.rows) ? entry.rows : [];
  }

  return entry.row ? [entry.row] : [];
}

function parseSearchQuery(rawQuery) {
  const normalized = normalizeSearchText(rawQuery);
  const tokens = normalized.split(/\s+/).filter(Boolean);

  const levelTokens = tokens.filter((token) => /^\d+$/.test(token));
  const textTokens = tokens.filter((token) => !/^\d+$/.test(token));

  return {
    normalized,
    tokens,
    levelTokens,
    textTokens,
    isOnlyLevelSearch: tokens.length > 0 && tokens.every((token) => /^\d+$/.test(token)),
  };
}

function entryMatchesSearch(entry, rawQuery) {
  const parsed = parseSearchQuery(rawQuery);

  if (!parsed.tokens.length) return true;

  const rows = getEntryRows(entry);

  // 数字だけの検索は「装備レベルの完全一致」だけにする
  // これで 132 検索時に、IDやgroup_idに132を含む別レベル装備が出なくなる
  if (parsed.isOnlyLevelSearch) {
    return rows.some((row) => parsed.levelTokens.includes(getRowEquipLevel(row)));
  }

  // 数字 + 文字の場合
  // 例: "132 セット", "132 退魔"
  // 数字部分は装備レベル完全一致、文字部分は従来どおり部分一致
  const levelMatched =
    parsed.levelTokens.length === 0 ||
    rows.some((row) => parsed.levelTokens.includes(getRowEquipLevel(row)));

  if (!levelMatched) return false;

  const searchText = normalizeSearchText(buildEntrySearchText(entry));

  return parsed.textTokens.every((token) => searchText.includes(token));
}

export default function EquipmentsClient() {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [syncGroup, setSyncGroup] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [equipmentTypes, setEquipmentTypes] = useState([]);
  const [allJobs, setAllJobs] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [activeTab, setActiveTab] = useState("edit");

  const [newMode, setNewMode] = useState("single");
  const [newItem, setNewItem] = useState(createInitialNewItem());
  const [newGroup, setNewGroup] = useState(() => createInitialNewGroup());

  const [deleteChoiceOpen, setDeleteChoiceOpen] = useState(false);

  const { toast, showToast } = useFloatingToast();

  const { isMobile, sidebarOpen, closeSidebar, openSidebar, toggleSidebar } =
    useEditorLayout(900);

  const selectedRow = useMemo(() => {
    return rows.find((r) => r.__key === selectedKey) ?? null;
  }, [rows, selectedKey]);

  const displayEntries = useMemo(() => {
    const grouped = buildGroupedRows(rows);

    if (!normalizeSearchText(query)) return grouped;

    return grouped.filter((entry) => entryMatchesSearch(entry, query));
  }, [rows, query]);

  const materials = useMemo(() => {
    if (!selectedRow) return [];
    const arr = safeJsonParse(selectedRow.materialsJson, []);
    return Array.isArray(arr) ? arr : [];
  }, [selectedRow]);

  const effects = useMemo(() => {
    if (!selectedRow) return [];
    const arr = safeJsonParse(selectedRow.effectsJson, []);
    return Array.isArray(arr) ? arr : [];
  }, [selectedRow]);

  const isSelectedGrouped = useMemo(() => {
    if (!selectedRow) return false;
    const gid = str(selectedRow.groupId).trim();
    if (!gid) return false;
    return rows.filter((r) => str(r.groupId).trim() === gid).length > 1;
  }, [rows, selectedRow]);

  const availableGroups = useMemo(() => {
    const map = new Map();

    rows.forEach((row) => {
      const groupKind = str(row.groupKind).trim();
      const groupId = str(row.groupId).trim();
      const groupName = str(row.groupName).trim();

      if (!groupKind || !groupId) return;

      const key = `${groupKind}_${groupId}`;

      if (!map.has(key)) {
        map.set(key, {
          groupKind,
          groupId,
          groupName: groupName || getGroupDisplayName(row),
        });
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      str(a.groupName).localeCompare(str(b.groupName), "ja")
    );
  }, [rows]);

  const recipeBookOptions = useMemo(() => {
    const set = new Set();

    rows.forEach((row) => {
      const value = str(row.recipeBook).trim();
      if (value) set.add(value);
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [rows]);

  const recipePlaceOptions = useMemo(() => {
    const set = new Set();

    rows.forEach((row) => {
      const value = str(row.recipePlace).trim();
      if (value) set.add(value);
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [rows]);

  const selectedGroupName = useMemo(() => {
    return selectedRow ? getGroupDisplayName(selectedRow) : "";
  }, [selectedRow]);

  const selectedMemberLabel = useMemo(() => {
    return selectedRow ? getPresetMemberLabel(selectedRow) : "";
  }, [selectedRow]);

  useEffect(() => {
    fetchInitial();
  }, []);

  useEffect(() => {
    if (!rows.length) {
      setSelectedKey("");
      return;
    }

    if (!rows.some((r) => r.__key === selectedKey)) {
      setSelectedKey(rows[0].__key);
    }
  }, [rows, selectedKey]);

 async function fetchInitial(preferredId = null, preferredKey = null) {
  try {
    setLoading(true);

    const [equipments, fetchedEquipmentTypes, jobs, materialItems] =
      await Promise.all([
        fetchEquipments(),
        fetchEquipmentTypes(),
        fetchGameJobs(),

        // category が material のアイテムだけ取得
        fetchItems("", "material"),
      ]);

    const safeMaterialItems = Array.isArray(materialItems)
      ? materialItems
      : [];

    const hydratedEquipments = equipments.map((row) =>
      hydrateRowMaterialsWithItems(row)
    );

    setRows(hydratedEquipments);
    setEquipmentTypes(fetchedEquipmentTypes);
    setAllJobs(jobs);
    setAllItems(safeMaterialItems);

    const preferredRow =
      hydratedEquipments.find((row) => {
        if (preferredId == null) return false;

        return String(row.id) === String(preferredId);
      }) ??
      hydratedEquipments.find((row) => {
        if (!preferredKey) return false;

        return String(row.__key) === String(preferredKey);
      }) ??
      null;

    if (preferredRow?.__key) {
      setSelectedKey(preferredRow.__key);
    } else if (hydratedEquipments[0]?.__key) {
      setSelectedKey(hydratedEquipments[0].__key);
    } else {
      setSelectedKey("");
    }
  } catch (error) {
    console.error(error);
    showToast("初期データ読み込みに失敗した", "error");
  } finally {
    setLoading(false);
  }
}

  function setSelectedRowPatch(patch) {
    if (!selectedKey) return;

    setRows((prev) =>
      prev.map((r) => {
        if (r.__key !== selectedKey) return r;
        return { ...r, ...patch };
      })
    );
  }

  function setGroupPatch(patch) {
    if (!selectedRow) return;

    const gid = str(selectedRow.groupId).trim();

    if (!gid) {
      setSelectedRowPatch(patch);
      return;
    }

    setRows((prev) =>
      prev.map((r) => {
        if (str(r.groupId).trim() !== gid) return r;
        return { ...r, ...patch };
      })
    );
  }

  function handleJoinGroup(payload) {
    if (!selectedRow) return;

    setSelectedRowPatch({
      ...payload,
      __saveSingleOnly: true,
    });

    const groupName = str(payload.groupName).trim() || "グループ";
    showToast(`「${selectedRow.itemName || "装備"}」を「${groupName}」に合流させた`);
  }

  function handleCreateGroupFromSingle(payload) {
    if (!selectedRow) return;

    const groupName = str(payload?.groupName).trim();
    const groupKind = str(payload?.groupKind).trim() || "armor_set";

    if (!groupName) {
      showToast("セット名を入力してくれ", "error");
      return;
    }

    const baseGroupId = makeGroupId(groupName);
    const groupId = makeUniqueGroupId(baseGroupId, rows);

    const itemName = str(selectedRow.itemName).trim() || "この装備";

    setSyncGroup(false);

    setSelectedRowPatch({
      groupKind,
      groupId,
      groupName,
      __saveSingleOnly: true,
    });

    showToast(`「${itemName}」から「${groupName}」を作成した。保存して反映してね`);
  }

  function handleLeaveGroup() {
    if (!selectedRow) return;

    const itemName = str(selectedRow.itemName).trim() || "この装備";
    const groupName = getGroupDisplayName(selectedRow) || "グループ";

    const ok = window.confirm(
      `「${itemName}」だけを「${groupName}」から外しますか？\n装備データ自体は削除されません。`
    );

    if (!ok) return;

    setSyncGroup(false);

    setSelectedRowPatch({
      groupKind: "",
      groupId: "",
      groupName: "",
      __saveSingleOnly: true,
    });

    showToast(`「${itemName}」をグループから外した。保存して反映してね`);
  }

  async function handleCreateItem() {
    const safeNewItem = newItem ?? createInitialNewItem();
    const name = str(safeNewItem.itemName).trim();

    if (!name) {
      showToast("itemName は必須", "error");
      return;
    }

    const selectedType = findEquipmentTypeById(
      equipmentTypes,
      safeNewItem.equipmentTypeId
    );

    const autoSlotGridType = getAutoSlotGridType(
      safeNewItem.slot,
      selectedType
    );
    const preset = getGridPreset(autoSlotGridType);

    const usedItemIds = new Set(
      rows.map((row) => str(row.itemId ?? row.item_id).trim()).filter(Boolean)
    );

    const manualItemId = str(safeNewItem.itemId).trim();

    const armorSetNo = isNormalArmorType(selectedType)
      ? findNextBouguSetNo({
          equipLevel: safeNewItem.equipLevel,
          rows,
          usedItemIds,
        })
      : null;

    const generatedItemId = makeCreateItemId({
      equipmentType: selectedType,
      equipLevel: safeNewItem.equipLevel,
      slot: safeNewItem.slot,
      usedItemIds,
      armorSetNo,
    });

    const row = {
      ...createEmptyEquipmentRow(),
      itemId: manualItemId || generatedItemId,
      itemName: name,
      itemNameKana: str(safeNewItem.itemNameKana),
      equipmentTypeId: str(safeNewItem.equipmentTypeId),
      equipmentType: selectedType,
      jobOverrideMode: "inherit",
      slot: str(safeNewItem.slot),
      slotGridType: autoSlotGridType,
      slotGridCols: preset?.cols ? String(preset.cols) : "",
      groupName: str(safeNewItem.groupName),
      groupKind: "",
      equipLevel: str(safeNewItem.equipLevel),
    };

    try {
      setSaving(true);

      const created = await createEquipment(row);
      const saved = hydrateRowMaterialsWithItems(created, allItems);

      setRows((prev) => [saved, ...prev]);
      setSelectedKey(saved.__key);
      setActiveTab("edit");

      setNewItem(createInitialNewItem());
      showToast(`「${saved.itemName || name}」を作成した`);

      if (isMobile) closeSidebar();
    } catch (error) {
      console.error(error);
      showToast(error.message || "追加に失敗した", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateGroup() {
    const safeNewGroup = newGroup ?? createInitialNewGroup();
    const groupName = str(safeNewGroup.groupName).trim();

    if (!groupName) {
      showToast("groupName は必須", "error");
      return;
    }

    const enabledMembers = Array.isArray(safeNewGroup.members)
      ? safeNewGroup.members.filter((m) => m.enabled)
      : [];

    if (!enabledMembers.length) {
      showToast("少なくとも1つの部位をONにしてくれ", "error");
      return;
    }

    const groupId = makeGroupId(groupName);
    const selectedType = findEquipmentTypeById(
      equipmentTypes,
      safeNewGroup.equipmentTypeId
    );
    const isCraftToolSet = str(safeNewGroup.groupKind) === "craft_tool_set";

    try {
      setSaving(true);

      const created = [];

      const usedItemIds = new Set(
        rows.map((row) => str(row.itemId ?? row.item_id).trim()).filter(Boolean)
      );

      const armorSetNo =
        !isCraftToolSet && isNormalArmorType(selectedType)
          ? findNextBouguSetNo({
              equipLevel: safeNewGroup.equipLevel,
              rows,
              usedItemIds,
            })
          : null;

      for (const member of enabledMembers) {
        const name =
          str(member.itemName).trim() ||
          (isCraftToolSet
            ? str(member.slotLabel).trim()
            : getDefaultGroupItemName(groupName, member.slotLabel));

        const autoSlotGridType = getAutoSlotGridType(
          member.slot,
          selectedType,
          safeNewGroup.groupKind,
          member
        );

        const preset = getGridPreset(autoSlotGridType);

        const itemId = isCraftToolSet
          ? ""
          : makeCreateItemId({
              equipmentType: selectedType,
              equipLevel: safeNewGroup.equipLevel,
              slot: member.slot,
              usedItemIds,
              armorSetNo,
            });

        const row = {
          ...createEmptyEquipmentRow(),
          itemId,
          itemName: name,
          equipmentTypeId: isCraftToolSet
            ? ""
            : str(safeNewGroup.equipmentTypeId),
          equipmentType: isCraftToolSet ? null : selectedType,
          jobOverrideMode: "inherit",
          slot: member.slot,
          slotGridType: autoSlotGridType,
          slotGridCols: preset?.cols ? String(preset.cols) : "",
          groupKind: str(safeNewGroup.groupKind),
          groupId,
          groupName,
          equipLevel: isCraftToolSet ? "" : str(safeNewGroup.equipLevel),
        };

        if (row.itemId) {
          usedItemIds.add(row.itemId);
        }

        const savedRow = await createEquipment(row);
        created.push(hydrateRowMaterialsWithItems(savedRow, allItems));
      }

      setRows((prev) => [...created, ...prev]);

      if (created[0]) {
        setSelectedKey(created[0].__key);
      }

      setActiveTab("edit");
      setNewGroup(createInitialNewGroup());
      showToast(`「${groupName}」を作成した`);

      if (isMobile) closeSidebar();
    } catch (error) {
      console.error(error);
      showToast(error.message || "セット追加に失敗した", "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveSelected() {
    if (!selectedRow) return;

    try {
      setSaving(true);

      const gid = str(selectedRow.groupId).trim();
      const saveSingleOnly = !!selectedRow.__saveSingleOnly;

      const targetRows =
        !saveSingleOnly && syncGroup && gid
          ? rows.filter((r) => str(r.groupId).trim() === gid)
          : [selectedRow];

      for (const row of targetRows) {
        const cleanRow = {
          ...row,
          __saveSingleOnly: undefined,
        };

        if (row.id) {
          await updateEquipment(row.id, cleanRow);
        } else {
          const savedRow = await createEquipment(cleanRow);
          const saved = hydrateRowMaterialsWithItems(savedRow, allItems);

          setRows((prev) =>
            prev.map((r) => (r.__key === row.__key ? saved : r))
          );
        }
      }

      setRows((prev) =>
        prev.map((r) =>
          r.__key === selectedRow.__key
            ? { ...r, __saveSingleOnly: undefined }
            : r
        )
      );

      await fetchInitial(selectedRow.id, selectedRow.__key);

      const targetName =
        getGroupDisplayName(selectedRow) || selectedRow.itemName || "装備";
      showToast(`「${targetName}」を保存した`);
    } catch (error) {
      console.error(error);
      showToast(error.message || "保存に失敗した", "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCurrentItem() {
    if (!selectedRow) return;

    const targetText = getDeleteTargetText(selectedRow);

    if (!window.confirm(`${targetText}を削除しますか？`)) return;

    try {
      setSaving(true);

      if (selectedRow.id) {
        await deleteEquipment(selectedRow.id);
      }

      setRows((prev) => prev.filter((r) => r.__key !== selectedRow.__key));
      setSelectedKey("");
      setDeleteChoiceOpen(false);
      showToast(`${targetText}を削除した`);

      if (isMobile) openSidebar();
    } catch (error) {
      console.error(error);
      showToast(error.message || "削除に失敗した", "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCurrentGroup() {
    if (!selectedRow) return;

    const gid = str(selectedRow.groupId).trim();

    if (!gid) {
      await deleteCurrentItem();
      return;
    }

    const targetName = getGroupDisplayName(selectedRow) || "装備セット";

    if (!window.confirm(`「${targetName}」を削除しますか？`)) {
      return;
    }

    try {
      setSaving(true);

      const targets = rows.filter((r) => str(r.groupId).trim() === gid);

      for (const row of targets) {
        if (row.id) {
          await deleteEquipment(row.id);
        }
      }

      setRows((prev) => prev.filter((r) => str(r.groupId).trim() !== gid));
      setSelectedKey("");
      setDeleteChoiceOpen(false);
      showToast(`「${targetName}」を削除した`);

      if (isMobile) openSidebar();
    } catch (error) {
      console.error(error);
      showToast(error.message || "セット削除に失敗した", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleHeaderDelete() {
    if (!selectedRow) return;

    const gid = str(selectedRow.groupId).trim();

    if (!gid) {
      await deleteCurrentItem();
      return;
    }

    setDeleteChoiceOpen(true);
  }

  function addMaterial(newMaterial = null) {
    const material = newMaterial ?? { item_id: null, count: 1 };
    const next = [...materials, material];
    setSelectedRowPatch({ materialsJson: toJsonString(next, "[]") });
  }

  function updateMaterial(index, key, value) {
    const next = materials.map((m, i) =>
      i === index
        ? {
            ...m,
            [key]: key === "count" ? Number(value) || 0 : value,
          }
        : m
    );

    setSelectedRowPatch({ materialsJson: toJsonString(next, "[]") });
  }

  function deleteMaterial(index) {
    const next = materials.filter((_, i) => i !== index);
    setSelectedRowPatch({ materialsJson: toJsonString(next, "[]") });
  }

  function addEffect() {
    const next = [...effects, ""];
    setSelectedRowPatch({ effectsJson: toJsonString(next, "[]") });
  }

  function updateEffect(index, value) {
    const next = effects.map((e, i) => (i === index ? value : e));
    setSelectedRowPatch({ effectsJson: toJsonString(next, "[]") });
  }

  function deleteEffect(index) {
    const next = effects.filter((_, i) => i !== index);
    setSelectedRowPatch({ effectsJson: toJsonString(next, "[]") });
  }
  function getSidebarSlotOrder(row) {
    const slot = str(row?.slot).trim();

    const order = {
      頭: 1,
      あたま: 1,

      体上: 2,
      からだ上: 2,
      身体上: 2,

      体下: 3,
      からだ下: 3,
      身体下: 3,

      腕: 4,
      うで: 4,

      足: 5,
      あし: 5,
    };

    return order[slot] ?? 999;
  }
  const isCreateTab = activeTab === "create";
  const createAction =
    newMode === "single" ? handleCreateItem : handleCreateGroup;

  const headerNotice = isCreateTab
    ? newMode === "single"
      ? "新規追加: 単体装備を作成中"
      : "新規追加: セット装備を作成中"
    : selectedRow
    ? `${selectedRow.itemName || getGroupDisplayName(selectedRow) || "名称なし"}を編集中`
    : loading
    ? "読み込み中..."
    : "";

  return (
    <>
    <RouteProgressDoneOnDataReady ready={!loading} />
      <EditorShell
        isMobile={isMobile}
        sidebar={
          <EditorSidebar
            isMobile={isMobile}
            isOpen={sidebarOpen}
            onToggle={toggleSidebar}
            keyword={query}
            onKeywordChange={setQuery}
            onCreateNew={() => {
              setActiveTab("create");
              setDeleteChoiceOpen(false);

              if (isMobile) {
                closeSidebar();
              }
            }}
            createDisabled={saving || loading}
            createLabel="新規追加"
            loading={loading}
            title="装備一覧"
            searchPlaceholder="検索（名前 / 装備レベル / 部位 / レシピ本 / グループ名）"
          >
            <div style={styles.list}>
              {displayEntries.map((entry) => {
                if (entry.__kind === "group") {
                  const groupActive =
                    str(selectedRow?.groupId).trim() ===
                    str(entry.groupId).trim();

                  return (
                    <div key={entry.__key} style={styles.groupBox}>
                      <button
                        type="button"
                        style={groupButtonStyle(groupActive)}
                        onClick={() => {
                          if (entry.rows?.[0]?.__key) {
                            setSelectedKey(entry.rows[0].__key);
                            setActiveTab("edit");
                            if (isMobile) closeSidebar();
                          }
                        }}
                      >
                        <div style={styles.itemTitle}>
                          {entry.label || "名称なし"}
                        </div>
                        <div style={styles.itemMeta}>
                          {entry.groupKind || "-"} / {entry.rows?.length ?? 0}件
                        </div>
                      </button>

                      <div style={styles.childList}>
                        {[...entry.rows]
                          .sort((a, b) => getSidebarSlotOrder(a) - getSidebarSlotOrder(b))
                          .map((row) => {
                          const active = row.__key === selectedKey;

                          return (
                            <button
                              key={row.__key}
                              type="button"
                              style={childButtonStyle(active)}
                              onClick={() => {
                                setSelectedKey(row.__key);
                                setActiveTab("edit");
                                if (isMobile) closeSidebar();
                              }}
                            >
                              <span>
                                {getPresetMemberLabel(row) || row.slot || "-"}
                              </span>
                              <strong>{row.itemName || "名称なし"}</strong>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                const active = entry.row?.__key === selectedKey;

                return (
                  <button
                    key={entry.__key}
                    type="button"
                    style={singleButtonStyle(active)}
                    onClick={() => {
                      setSelectedKey(entry.row.__key);
                      setActiveTab("edit");
                      if (isMobile) closeSidebar();
                    }}
                  >
                    <div style={styles.itemTitle}>
                      {entry.label || entry.row?.itemName || "名称なし"}
                    </div>
                    <div style={styles.itemMeta}>
                      {entry.row?.slot || "-"} /{" "}
                      {entry.row?.equipmentTypeName || "-"}
                    </div>
                  </button>
                );
              })}

              {!loading && displayEntries.length === 0 ? (
                <div style={styles.empty}>装備が見つからない</div>
              ) : null}
            </div>
          </EditorSidebar>
        }
      >
        <EditorHeader
          isMobile={isMobile}
          title={headerNotice}
          onSave={isCreateTab ? createAction : saveSelected}
          onDelete={isCreateTab ? undefined : handleHeaderDelete}
          saving={saving}
          saveDisabled={saving || loading || (!isCreateTab && !selectedRow)}
          deleteDisabled={saving || loading || isCreateTab || !selectedRow}
        />

        

        {deleteChoiceOpen ? (
          <div style={styles.deleteChoice}>
            <div style={styles.deleteTitle}>
              {selectedGroupName || "このセット"}をどう削除する？
            </div>
            <div style={styles.deleteMeta}>
              選択中: {selectedMemberLabel || selectedRow?.itemName || "部位"}
            </div>

            <div style={styles.deleteActions}>
              <button
                type="button"
                style={dangerButtonStyle()}
                onClick={deleteCurrentItem}
              >
                この部位だけ削除
              </button>

              <button
                type="button"
                style={dangerButtonStyle()}
                onClick={deleteCurrentGroup}
              >
                セット全部削除
              </button>

              <button
                type="button"
                style={secondaryButtonStyle()}
                onClick={() => setDeleteChoiceOpen(false)}
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : null}

        {isCreateTab ? (
          <EquipmentCreatePanel
            newMode={newMode}
            setNewMode={setNewMode}
            newItem={newItem}
            setNewItem={setNewItem}
            newGroup={newGroup}
            setNewGroup={setNewGroup}
            equipmentTypes={equipmentTypes}
            existingEquipments={rows}
          />
        ) : (
          <div style={styles.editStack}>
            <EquipmentEditorPanel
              row={selectedRow}
              equipmentTypes={equipmentTypes}
              allJobs={allJobs}
              syncGroup={syncGroup}
              setSyncGroup={setSyncGroup}
              isMobile={isMobile}
              isSelectedGrouped={isSelectedGrouped}
              onPatch={setSelectedRowPatch}
              onGroupPatch={setGroupPatch}
              availableGroups={availableGroups}
              onJoinGroup={handleJoinGroup}
              onLeaveGroup={handleLeaveGroup}
              onCreateGroupFromSingle={handleCreateGroupFromSingle}
              recipeBookOptions={recipeBookOptions}
              recipePlaceOptions={recipePlaceOptions}
            />

            <EquipmentDetailsPanel
              row={selectedRow}
              allItems={allItems}
              materials={materials}
              effects={effects}
              onPatch={setSelectedRowPatch}
              onAddMaterial={addMaterial}
              onUpdateMaterial={updateMaterial}
              onDeleteMaterial={deleteMaterial}
              onAddEffect={addEffect}
              onUpdateEffect={updateEffect}
              onDeleteEffect={deleteEffect}
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

function isNormalArmorType(equipmentType) {
  const kind = str(equipmentType?.kind).trim();
  const key = str(equipmentType?.key).trim();

  return kind === "armor" && key !== "shield_small" && key !== "shield_large";
}

function normalizeSlotKey(slot) {
  const value = str(slot).trim();

  if (["head", "あたま", "頭"].includes(value)) return "head";
  if (["body_top", "からだ上", "身体上", "体上"].includes(value)) {
    return "body_top";
  }
  if (["body_bottom", "からだ下", "身体下", "体下", "体した"].includes(value)) {
    return "body_bottom";
  }
  if (["arm", "arms", "うで", "腕"].includes(value)) return "arm";
  if (["foot", "feet", "足", "あし"].includes(value)) return "foot";

  return value || "unknown";
}

function makeCreateItemId({
  equipmentType,
  equipLevel,
  slot = "",
  usedItemIds,
  armorSetNo = null,
}) {
  const level = str(equipLevel).trim();
  const typeKey = str(equipmentType?.key).trim();

  if (!level || !typeKey) return "";

  if (isNormalArmorType(equipmentType)) {
    const slotKey = normalizeSlotKey(slot);
    const setNo = armorSetNo || 1;
    const base = `bougu_${level}_${setNo}_${slotKey}`;

    return makeUniqueItemId(base, usedItemIds);
  }

  const base = `${typeKey}_${level}`;

  return makeUniqueItemId(base, usedItemIds);
}

function findNextBouguSetNo({ equipLevel, rows, usedItemIds }) {
  const level = str(equipLevel).trim();

  if (!level) return 1;

  for (let setNo = 1; setNo <= 999; setNo++) {
    const prefix = `bougu_${level}_${setNo}_`;

    const existsInRows = rows.some((row) =>
      str(row.itemId ?? row.item_id).startsWith(prefix)
    );

    const existsInUsed = Array.from(usedItemIds).some((itemId) =>
      str(itemId).startsWith(prefix)
    );

    if (!existsInRows && !existsInUsed) {
      return setNo;
    }
  }

  return Date.now();
}

function makeUniqueItemId(baseItemId, usedSet) {
  const base = str(baseItemId).trim();

  if (!base) {
    return "";
  }

  if (!usedSet.has(base)) {
    return base;
  }

  let count = 2;
  let candidate = `${base}_${count}`;

  while (usedSet.has(candidate)) {
    count++;
    candidate = `${base}_${count}`;
  }

  return candidate;
}

function makeUniqueGroupId(baseGroupId, rows) {
  const base = str(baseGroupId).trim();

  if (!base) {
    return `group_${Date.now()}`;
  }

  const usedGroupIds = new Set(
    rows
      .map((row) => str(row.groupId ?? row.group_id).trim())
      .filter(Boolean)
  );

  if (!usedGroupIds.has(base)) {
    return base;
  }

  let count = 2;
  let candidate = `${base}_${count}`;

  while (usedGroupIds.has(candidate)) {
    count++;
    candidate = `${base}_${count}`;
  }

  return candidate;
}

const styles = {
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  groupBox: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },

  childList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingLeft: 10,
  },

  itemTitle: {
    fontWeight: 800,
    color: "var(--text-main)",
    lineHeight: 1.4,
  },

  itemMeta: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: 4,
  },

  empty: {
    color: "var(--text-muted)",
    padding: 12,
    fontSize: 13,
  },

  tabs: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 12,
  },

  deleteChoice: {
    border: "1px solid var(--danger-border)",
    background: "var(--danger-bg)",
    color: "var(--danger-text)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  deleteTitle: {
    fontWeight: 800,
  },
  editStack: {
  display: "flex",
  flexDirection: "column",
  gap: 14,
},
  deleteMeta: {
    fontSize: 13,
  },

  deleteActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
};

const baseListButtonStyle = {
  width: "100%",
  textAlign: "left",
  borderRadius: 10,
  padding: 10,
  cursor: "pointer",
  background: "var(--card-bg)",
  color: "var(--text-main)",
  border: "1px solid var(--card-border)",
};

const singleButtonStyle = (active) => ({
  ...baseListButtonStyle,
  border: active
    ? "2px solid var(--selected-border)"
    : baseListButtonStyle.border,
  background: active ? "var(--selected-bg)" : baseListButtonStyle.background,
});

const groupButtonStyle = (active) => ({
  ...baseListButtonStyle,
  border: active
    ? "2px solid var(--selected-border)"
    : baseListButtonStyle.border,
  background: active ? "var(--selected-bg)" : baseListButtonStyle.background,
});

const childButtonStyle = (active) => ({
  border: active
    ? "1px solid var(--selected-border)"
    : "1px solid var(--soft-border)",
  background: active ? "var(--selected-bg)" : "var(--soft-bg)",
  color: "var(--text-main)",
  borderRadius: 8,
  padding: "7px 9px",
  cursor: "pointer",
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  fontSize: 12,
});



const secondaryButtonStyle = () => ({
  border: "1px solid var(--soft-border)",
  background: "var(--soft-bg)",
  color: "var(--text-main)",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
});

const dangerButtonStyle = () => ({
  border: "1px solid var(--danger-border)",
  background: "var(--danger-bg)",
  color: "var(--danger-text)",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
});
