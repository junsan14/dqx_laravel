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
import { fetchCraftProductTypes } from "@/lib/craftProductTypes";


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
  safeJsonParse,
  toJsonString,
  buildGroupedRows,
  str,
  buildEmptyGroupMembers,
  makeGroupId,
  findCraftProductTypeById,
  findCraftProductTypeByKey,
  getCraftProductTypeName,
  getGroupDisplayName,
} from "./equipmentFormHelpers";

const DEFAULT_GROUP_KIND = "armor_set";

function buildCreateGroupMembers(groupKind) {
  return buildEmptyGroupMembers(groupKind).map((member) => ({
    ...member,
    itemName: "",
  }));
}

function createInitialNewItem() {
  return {
    itemName: "",
  };
}

function createInitialNewGroup(groupKind = DEFAULT_GROUP_KIND) {
  const safeGroupKind = groupKind || DEFAULT_GROUP_KIND;

  return {
    groupName: "",
    groupKind: safeGroupKind,
    members: buildCreateGroupMembers(safeGroupKind),
  };
}

function makeAutomaticItemId(usedItemIds, prefix = "equipment") {
  const normalizedPrefix =
    str(prefix)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "equipment";
  const timestamp = Date.now().toString(36);

  let index = 0;
  let candidate = `${normalizedPrefix}_${timestamp}`;

  while (usedItemIds.has(candidate)) {
    index += 1;
    candidate = `${normalizedPrefix}_${timestamp}_${index}`;
  }

  usedItemIds.add(candidate);
  return candidate;
}

function hydrateCraftProductType(row, craftProductTypes = []) {
  if (!row) return row;

  const current = row.craftProductType ?? row.craft_product_type ?? null;
  const resolved =
    findCraftProductTypeById(craftProductTypes, row.craftProductTypeId) ??
    current ??
    null;

  return {
    ...row,
    craftProductTypeId:
      row.craftProductTypeId || (resolved?.id != null ? String(resolved.id) : ""),
    craftProductType: resolved,
  };
}

function getPresetMemberLabel(row) {
  return getCraftProductTypeName(row);
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
    row.craftProductType?.name,
    row.craft_product_type?.name,
    row.craftProductType?.key,
    row.craft_product_type?.key,
    row.craftProductType?.craftType?.name,
    row.craft_product_type?.craft_type?.name,
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
  const [craftProductTypes, setCraftProductTypes] = useState([]);
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

    const [
      equipments,
      fetchedEquipmentTypes,
      fetchedCraftProductTypes,
      jobs,
      materialItems,
    ] = await Promise.all([
      fetchEquipments(),
      fetchEquipmentTypes(),
      fetchCraftProductTypes(),
      fetchGameJobs(),

      // category が material のアイテムだけ取得
      fetchItems("", "material"),
    ]);

    const safeMaterialItems = Array.isArray(materialItems)
      ? materialItems
      : [];

    const hydratedEquipments = equipments.map((row) =>
      hydrateCraftProductType(
        hydrateRowMaterialsWithItems(row),
        fetchedCraftProductTypes
      )
    );

    setRows(hydratedEquipments);
    setEquipmentTypes(fetchedEquipmentTypes);
    setCraftProductTypes(fetchedCraftProductTypes);
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

    const withoutEquipmentType = ["craft_tool_set", "other_set"].includes(
      str(payload?.groupKind).trim()
    );

    setSelectedRowPatch({
      ...payload,
      ...(withoutEquipmentType
        ? {
            equipmentTypeId: "",
            equipmentType: null,
            jobOverrideMode: "inherit",
            jobOverrides: [],
          }
        : {}),
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

    const withoutEquipmentType = ["craft_tool_set", "other_set"].includes(
      groupKind
    );

    setSelectedRowPatch({
      groupKind,
      groupId,
      groupName,
      ...(withoutEquipmentType
        ? {
            equipmentTypeId: "",
            equipmentType: null,
            jobOverrideMode: "inherit",
            jobOverrides: [],
          }
        : {}),
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
      showToast("装備名を入力してください", "error");
      return;
    }

    const usedItemIds = new Set(
      rows.map((row) => str(row.itemId ?? row.item_id).trim()).filter(Boolean)
    );

    const row = {
      ...createEmptyEquipmentRow(),
      itemId: makeAutomaticItemId(usedItemIds, "equipment"),
      itemName: name,
      equipmentTypeId: "",
      equipmentType: null,
      craftProductTypeId: "",
      craftProductType: null,
      jobOverrideMode: "inherit",
      groupName: "",
      groupKind: "",
      equipLevel: "",
    };

    try {
      setSaving(true);

      const created = await createEquipment(row);
      const saved = hydrateCraftProductType(
        hydrateRowMaterialsWithItems(created, allItems),
        craftProductTypes
      );

      setRows((previous) => [saved, ...previous]);
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
      showToast("セット名を入力してください", "error");
      return;
    }

    const enabledMembers = Array.isArray(safeNewGroup.members)
      ? safeNewGroup.members.filter((member) => member.enabled !== false)
      : [];

    if (!enabledMembers.length) {
      showToast("子どもを1件以上追加してください", "error");
      return;
    }

    const unnamedMember = enabledMembers.find(
      (member) => !str(member.itemName).trim()
    );

    if (unnamedMember) {
      showToast("すべての子どもの名前を入力してください", "error");
      return;
    }

    const groupKind = str(safeNewGroup.groupKind).trim() || DEFAULT_GROUP_KIND;
    const groupId = makeUniqueGroupId(makeGroupId(groupName), rows);

    try {
      setSaving(true);

      const created = [];
      const usedItemIds = new Set(
        rows.map((row) => str(row.itemId ?? row.item_id).trim()).filter(Boolean)
      );

      for (const member of enabledMembers) {
        const craftProductType = member.craftProductTypeKey
          ? findCraftProductTypeByKey(
              craftProductTypes,
              member.craftProductTypeKey
            )
          : null;

        const itemIdPrefix =
          craftProductType?.key || groupKind.replace(/_set$/, "") || "equipment";

        const row = {
          ...createEmptyEquipmentRow(),
          itemId: makeAutomaticItemId(usedItemIds, itemIdPrefix),
          itemName: str(member.itemName).trim(),
          equipmentTypeId: "",
          equipmentType: null,
          craftProductTypeId:
            craftProductType?.id == null ? "" : String(craftProductType.id),
          craftProductType,
          jobOverrideMode: "inherit",
          groupKind,
          groupId,
          groupName,
          equipLevel: "",
        };

        const savedRow = await createEquipment(row);
        created.push(
          hydrateCraftProductType(
            hydrateRowMaterialsWithItems(savedRow, allItems),
            craftProductTypes
          )
        );
      }

      setRows((previous) => [...created, ...previous]);

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
          const saved = hydrateCraftProductType(
            hydrateRowMaterialsWithItems(savedRow, allItems),
            craftProductTypes
          );

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
    const key = str(
      row?.craftProductType?.key ?? row?.craft_product_type?.key
    ).trim();

    const order = {
      armor_head: 1,
      tailoring_head: 1,
      armor_upper: 2,
      tailoring_upper: 2,
      armor_lower: 3,
      tailoring_lower: 3,
      armor_arms: 4,
      tailoring_arms: 4,
      armor_feet: 5,
      tailoring_feet: 5,
    };

    return order[key] ?? 999;
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
                                {getPresetMemberLabel(row) || "-"}
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
                      {getCraftProductTypeName(entry.row) || "-"} /{" "}
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
            craftProductTypes={craftProductTypes}
            existingEquipments={rows}
          />
        ) : (
          <div style={styles.editStack}>
            <EquipmentEditorPanel
              row={selectedRow}
              equipmentTypes={equipmentTypes}
              craftProductTypes={craftProductTypes}
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
