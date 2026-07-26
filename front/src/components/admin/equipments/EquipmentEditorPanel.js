"use client";

import { useMemo, useState } from "react";
import LabeledField from "./LabeledField";
import SlotGridEditor from "./SlotGridEditor";
import {
  JOB_OVERRIDE_MODE_OPTIONS,
  str,
  GRID_TYPE_OPTIONS,
} from "./equipmentFormHelpers";
import { EQUIPMENT_BASE_EFFECT_FIELDS } from "@/lib/equipments";

const JOB_OVERRIDE_MODE_LABELS = {
  inherit: "継承",
  add: "追加",
  replace: "置き換え",
};

const GROUP_KIND_OPTIONS = [
  { value: "armor_set", label: "鎧(防具鍛冶系)" },
  { value: "tailoring_set", label: "ローブ(裁縫系)" },
  { value: "craft_tool_set", label: "その他" },
];

const FABRIC_TYPE_OPTIONS = ["通常布", "再生布", "虹布","ピンク布"];

export default function EquipmentEditorPanel({
  row,
  equipmentTypes = [],
  allJobs = [],
  syncGroup,
  setSyncGroup,
  isSelectedGrouped,
  isMobile = false,
  onPatch,
  onGroupPatch,
  availableGroups = [],
  onJoinGroup,
  onLeaveGroup,
  onCreateGroupFromSingle,
  recipeBookOptions = [],
  recipePlaceOptions = [],
}) {
  const safeRow = row ?? {};

  const [groupSearch, setGroupSearch] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupKind, setNewGroupKind] = useState("armor_set");
  const [singleToGroupOpen, setSingleToGroupOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);

  const isCraftToolSet = str(safeRow.groupKind).trim() === "craft_tool_set";
  const hasRealGroup = !!str(safeRow.groupKind).trim();
  const canShowJoinGroup = !hasRealGroup;

  const recipeBookListId = `recipe-book-list-${
    safeRow.__key ?? safeRow.id ?? "row"
  }`;

  const recipePlaceListId = `recipe-place-list-${
    safeRow.__key ?? safeRow.id ?? "row"
  }`;


  const selectedEquipmentType = useMemo(() => {
    if (!row) return null;

    return (
      equipmentTypes.find(
        (type) => String(type.id) === String(safeRow.equipmentTypeId)
      ) ||
      safeRow.equipmentType ||
      null
    );
  }, [equipmentTypes, safeRow.equipmentTypeId, safeRow.equipmentType, row]);

  const selectedCraftTypeName = str(
    selectedEquipmentType?.craftType?.name ??
      selectedEquipmentType?.craft_type?.name ??
      selectedEquipmentType?.craftTypeName ??
      selectedEquipmentType?.craft_type_name
  ).trim();

  const isTailoringEquipment =
    str(safeRow.groupKind).trim() === "tailoring_set" ||
    /裁縫|さいほう|tailor/i.test(selectedCraftTypeName);

  const selectableJobs = useMemo(() => {
    return (Array.isArray(allJobs) ? allJobs : []).map((job) => ({
      id: job.id,
      key: String(job.key ?? job.id ?? job.name),
      name: job.name ?? String(job.key ?? job.id ?? ""),
    }));
  }, [allJobs]);

  const inheritedJobs = useMemo(() => {
    const raw =
      selectedEquipmentType?.equipableTypes ??
      selectedEquipmentType?.equipable_types ??
      [];

    if (!Array.isArray(raw)) return [];

    const mapped = raw
      .map((item) => item?.gameJob ?? item?.game_job ?? item)
      .filter(Boolean)
      .map((job) => ({
        id: job.id ?? null,
        key: String(job.key ?? job.id ?? job.name),
        name: job.name ?? String(job.key ?? job.id ?? ""),
      }));

    const uniq = new Map();

    mapped.forEach((job) => {
      uniq.set(String(job.key), job);
    });

    return Array.from(uniq.values());
  }, [selectedEquipmentType]);

  const overrideJobs = useMemo(() => {
    if (!Array.isArray(safeRow.jobOverrides)) return [];

    const mapped = safeRow.jobOverrides
      .map((job) => {
        if (!job) return null;

        const gameJobId = Number(job.game_job_id ?? job.gameJobId ?? job.id);
        const key = String(job.key ?? gameJobId ?? job.name);
        const name = job.name ?? String(job.key ?? gameJobId ?? "");

        if (!gameJobId) return null;

        return {
          id: job.id ?? null,
          game_job_id: gameJobId,
          key,
          name,
          mode: job.mode ?? "allow",
        };
      })
      .filter(Boolean);

    const uniq = new Map();

    mapped.forEach((job) => {
      uniq.set(String(job.key), job);
    });

    return Array.from(uniq.values());
  }, [safeRow.jobOverrides]);

  const overrideJobKeySet = useMemo(() => {
    return new Set(overrideJobs.map((job) => String(job.key)));
  }, [overrideJobs]);

  const displayJobs = useMemo(() => {
    if (safeRow.jobOverrideMode === "replace") {
      return overrideJobs.map((job) => ({
        ...job,
        source: "override",
      }));
    }

    if (safeRow.jobOverrideMode === "add") {
      const merged = new Map();

      inheritedJobs.forEach((job) => {
        merged.set(String(job.key), {
          key: String(job.key),
          name: job.name,
          source: "inherit",
        });
      });

      overrideJobs.forEach((job) => {
        merged.set(String(job.key), {
          key: String(job.key),
          name: job.name,
          source: "override",
        });
      });

      return Array.from(merged.values());
    }

    return inheritedJobs.map((job) => ({
      ...job,
      source: "inherit",
    }));
  }, [safeRow.jobOverrideMode, inheritedJobs, overrideJobs]);

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();

    if (!q) return availableGroups;

    return availableGroups.filter((group) => {
      const groupName = str(group.groupName ?? group.group_name).toLowerCase();
      const groupId = str(group.groupId ?? group.group_id).toLowerCase();

      return groupName.includes(q) || groupId.includes(q);
    });
  }, [availableGroups, groupSearch]);

  function patch(key, value) {
    if (!row) return;
    onPatch?.({ [key]: value });
  }

  function patchGroupAware(key, value) {
    if (!row) return;

    if (syncGroup && isSelectedGrouped) {
      onGroupPatch?.({ [key]: value });
      return;
    }

    onPatch?.({ [key]: value });
  }

  function handleEquipmentTypeChange(value) {
    if (!row) return;

    const selectedType =
      equipmentTypes.find((type) => String(type.id) === String(value)) ?? null;

    const nextSlotGridType =
      selectedType?.slotGridType ??
      selectedType?.slot_grid_type ??
      selectedType?.gridType ??
      selectedType?.grid_type ??
      "";

    const payload = {
      equipmentTypeId: value,
      slotGridType: nextSlotGridType,
    };

    if (syncGroup && isSelectedGrouped) {
      onGroupPatch?.(payload);
      return;
    }

    onPatch?.(payload);
  }

  function setOverrideJobs(jobs) {
    patchGroupAware("jobOverrides", jobs);
  }

  function addOverrideJob(job) {
    const gameJobId = Number(job.id ?? job.game_job_id ?? job.gameJobId);
    const key = String(job.key ?? gameJobId ?? job.name);
    const name = job.name ?? String(job.key ?? gameJobId ?? "");

    if (!gameJobId) return;
    if (overrideJobKeySet.has(key)) return;

    setOverrideJobs([
      ...overrideJobs,
      {
        game_job_id: gameJobId,
        key,
        name,
        mode: "allow",
      },
    ]);
  }

  function removeOverrideJob(jobKey) {
    const next = overrideJobs.filter(
      (job) => String(job.key) !== String(jobKey)
    );

    setOverrideJobs(next);
  }

  function toggleOverrideJob(job) {
    const key = String(job.key ?? job.id ?? job.name);

    if (overrideJobKeySet.has(key)) {
      removeOverrideJob(key);
      return;
    }

    addOverrideJob(job);
  }

  function clearOverrideJobs() {
    setOverrideJobs([]);
  }

  function joinToGroup(group) {
    if (!group) return;

    const payload = {
      groupKind: group.groupKind ?? group.group_kind ?? "",
      groupId: group.groupId ?? group.group_id ?? "",
      groupName: group.groupName ?? group.group_name ?? "",
    };

    if (typeof onJoinGroup === "function") {
      onJoinGroup(payload);
      return;
    }

    onPatch?.(payload);
  }

  function createGroupFromSingle() {
    const groupName = newGroupName.trim();

    if (!groupName) return;
    if (typeof onCreateGroupFromSingle !== "function") return;

    onCreateGroupFromSingle({
      groupName,
      groupKind: newGroupKind,
    });

    setNewGroupName("");
    setNewGroupKind("armor_set");
    setCreateGroupOpen(false);
    setSingleToGroupOpen(false);
  }

  if (!row) {
    return <section style={styles.emptyCard}>装備を選択してくれ</section>;
  }

  return (
    <section style={styles.wrap}>
      <div style={styles.topBar}>
        <div style={styles.badgeRow}>
          <div style={styles.idBadge}>ID: {row.id ?? "未保存"}</div>
          <div style={styles.idBadge}>Item ID: {row.itemId || "-"}</div>
        </div>

        {isSelectedGrouped ? (
          <label style={styles.checkRow}>
            <input
              type="checkbox"
              checked={syncGroup}
              onChange={(e) => setSyncGroup(e.target.checked)}
            />
            <span>グループ同期</span>
          </label>
        ) : null}
      </div>

      <div style={styles.columns}>
        <section style={styles.panel}>
          <div style={styles.panelHead}>
            <div>
              <h2 style={styles.panelTitle}>基本情報</h2>
              <p style={styles.panelLead}>
                装備の名前・分類・価格・グループ情報
              </p>
            </div>
          </div>

          {canShowJoinGroup ? (
            <div style={styles.joinGroupBox}>
              <button
                type="button"
                style={styles.accordionButton}
                onClick={() => setSingleToGroupOpen((prev) => !prev)}
              >
                <span>セット装備に変更</span>
                <span style={styles.accordionIcon}>
                  {singleToGroupOpen ? "−" : "+"}
                </span>
              </button>

              {singleToGroupOpen ? (
                <div style={styles.accordionBody}>
                  <div style={styles.helpText}>
                    既存グループに合流させる場合は、対象グループを検索して選択
                  </div>

                  <div style={styles.joinGroupSearchBox}>
                    <input
                      type="search"
                      style={styles.input}
                      value={groupSearch}
                      placeholder="合流先グループを検索"
                      onChange={(e) => setGroupSearch(e.target.value)}
                    />

                    <div style={styles.joinGroupCandidateList}>
                      {filteredGroups.length ? (
                        filteredGroups.slice(0, 12).map((group) => {
                          const groupId = group.groupId ?? group.group_id;
                          const groupName = group.groupName ?? group.group_name;

                          return (
                            <button
                              key={`${groupId}-${groupName}`}
                              type="button"
                              style={styles.joinGroupCandidateButton}
                              onClick={() => {
                                const ok = window.confirm(
                                  `${groupName || "名称なし"} に合流させる？`
                                );

                                if (!ok) return;

                                joinToGroup(group);
                                setGroupSearch("");
                                setSingleToGroupOpen(false);
                              }}
                            >
                              {groupName || "名称なし"}
                            </button>
                          );
                        })
                      ) : (
                        <div style={styles.noGroupText}>候補が見つからない</div>
                      )}
                    </div>
                  </div>

                  <div style={styles.createGroupBox}>
                    <button
                      type="button"
                      style={styles.accordionButtonSub}
                      onClick={() => setCreateGroupOpen((prev) => !prev)}
                    >
                      <span>この装備から新規セット作成</span>
                      <span style={styles.accordionIcon}>
                        {createGroupOpen ? "−" : "+"}
                      </span>
                    </button>

                    {createGroupOpen ? (
                      <div style={styles.accordionBody}>
                        <div style={styles.helpText}>
                          この装備を最初の1部位として、新しいセットグループを作成
                        </div>

                        <div style={styles.createGroupGrid}>
                          <LabeledField label="新しいセット名">
                            <input
                              style={styles.input}
                              value={newGroupName}
                              placeholder="例: セーラスセット"
                              onChange={(e) => setNewGroupName(e.target.value)}
                            />
                          </LabeledField>

                          <LabeledField label="セット種類">
                            <select
                              style={styles.input}
                              value={newGroupKind}
                              onChange={(e) => setNewGroupKind(e.target.value)}
                            >
                              {GROUP_KIND_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </LabeledField>
                        </div>

                        <button
                          type="button"
                          style={primarySoftButtonStyle(!newGroupName.trim())}
                          disabled={!newGroupName.trim()}
                          onClick={createGroupFromSingle}
                        >
                          この装備からセット作成
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div style={styles.fieldStack}>
            <LabeledField label="装備名（日本語）">
              <input
                style={styles.input}
                value={row.itemName ?? ""}
                onChange={(e) => patch("itemName", e.target.value)}
              />
            </LabeledField>

            <LabeledField label="装備名（ふりがな）">
              <input
                style={styles.input}
                value={row.itemNameKana ?? ""}
                placeholder="ひらがな・カタカナどちらでもOK"
                onChange={(e) => patch("itemNameKana", e.target.value)}
              />
            </LabeledField>

            <LabeledField label="装備名（英語）">
              <input
                style={styles.input}
                value={row.itemNameEn ?? ""}
                onChange={(e) => patch("itemNameEn", e.target.value)}
              />
            </LabeledField>

            {!isCraftToolSet ? (
              <LabeledField label="装備可能レベル">
                <input
                  type="number"
                  style={styles.input}
                  value={row.equipLevel ?? ""}
                  onChange={(e) =>
                    patchGroupAware("equipLevel", e.target.value)
                  }
                />
              </LabeledField>
            ) : null}

            <LabeledField label="装備タイプ（作成可能な職人）">
              <select
                style={styles.input}
                value={row.equipmentTypeId ?? ""}
                onChange={(e) => handleEquipmentTypeChange(e.target.value)}
              >
                <option value="">未選択</option>
                {equipmentTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name ?? type.label ?? `#${type.id}`}
                  </option>
                ))}
              </select>
            </LabeledField>

            <LabeledField label="装備設定">
              <select
                style={styles.input}
                value={row.jobOverrideMode ?? "inherit"}
                onChange={(e) =>
                  patchGroupAware("jobOverrideMode", e.target.value)
                }
              >
                {JOB_OVERRIDE_MODE_OPTIONS.map((mode) => (
                  <option key={mode} value={mode}>
                    {JOB_OVERRIDE_MODE_LABELS[mode] ?? mode}
                  </option>
                ))}
              </select>
            </LabeledField>

            <div style={styles.jobSection}>
              <div style={styles.label}>現在の装備可能職業</div>

              <div style={styles.tagList}>
                {displayJobs.length ? (
                  displayJobs.map((job) => (
                    <span
                      key={job.key}
                      style={jobTagStyle(job.source === "override")}
                      title={
                        job.source === "override"
                          ? "追加・置き換え職業"
                          : "装備タイプ由来"
                      }
                    >
                      {job.name}
                    </span>
                  ))
                ) : (
                  <span style={styles.mutedText}>職業データなし</span>
                )}
              </div>
            </div>

            {row.jobOverrideMode !== "inherit" ? (
              <div style={styles.jobSection}>
                <div style={styles.inlineBetween}>
                  <div style={styles.label}>
                    {row.jobOverrideMode === "add"
                      ? "追加する職業"
                      : "置き換え後の職業"}
                  </div>

                  <button
                    type="button"
                    style={secondaryButtonStyle()}
                    onClick={clearOverrideJobs}
                  >
                    クリア
                  </button>
                </div>

                <div style={styles.tagList}>
                  {selectableJobs.map((job) => {
                    const selected = overrideJobKeySet.has(String(job.key));

                    return (
                      <button
                        key={job.id ?? job.key}
                        type="button"
                        style={jobToggleStyle(selected)}
                        onClick={() => toggleOverrideJob(job)}
                        title={selected ? "クリックで削除" : "クリックで追加"}
                      >
                        {job.name}
                        {selected ? " ×" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <LabeledField label="基準価格">
              <input
                type="number"
                style={styles.input}
                value={row.defaultPrice ?? ""}
                onChange={(e) =>
                  patchGroupAware("defaultPrice", e.target.value)
                }
              />
            </LabeledField>

            {hasRealGroup ? (
              <div style={styles.groupFields}>
                <LabeledField label="セット種類">
                  <input
                    style={styles.input}
                    value={row.groupKind ?? ""}
                    onChange={(e) =>
                      patchGroupAware("groupKind", e.target.value)
                    }
                  />
                </LabeledField>

                <LabeledField label="セットID">
                  <input
                    style={styles.input}
                    value={row.groupId ?? ""}
                    onChange={(e) => patchGroupAware("groupId", e.target.value)}
                  />
                </LabeledField>

                <LabeledField label="セット名">
                  <input
                    style={styles.input}
                    value={row.groupName ?? ""}
                    onChange={(e) =>
                      patchGroupAware("groupName", e.target.value)
                    }
                  />
                </LabeledField>

                <div style={styles.leaveGroupBox}>
                  <div>
                    <div style={styles.leaveGroupTitle}>
                      この装備だけグループから外す
                    </div>
                    <div style={styles.leaveGroupText}>
                      装備データは削除せず、この装備だけ単体装備に戻す
                    </div>
                  </div>

                  <button
                    type="button"
                    style={dangerSoftButtonStyle()}
                    onClick={() => {
                      if (typeof onLeaveGroup === "function") {
                        onLeaveGroup();
                      }
                    }}
                  >
                    この装備だけ外す
                  </button>
                </div>
              </div>
            ) : null}

            <LabeledField label="説明文">
              <textarea
                style={styles.textarea}
                value={row.description ?? ""}
                onChange={(e) => patch("description", e.target.value)}
                rows={2}
              />
            </LabeledField>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelHead}>
            <div>
              <h2 style={styles.panelTitle}>職人情報</h2>
              <p style={styles.panelLead}>
                作成レベル・コマタイプ・大成功数値・レシピ情報
              </p>
            </div>
          </div>

          <div style={styles.fieldStack}>
            <div style={craftGridLayoutStyle(isMobile)}>
              <div style={styles.craftLeftColumn}>
                <LabeledField label="作成レベル">
                  <input
                    type="number"
                    style={styles.input}
                    value={row.craftLevel ?? ""}
                    onChange={(e) =>
                      patchGroupAware("craftLevel", e.target.value)
                    }
                  />
                </LabeledField>

                {isTailoringEquipment ? (
                  <LabeledField label="布タイプ">
                    <select
                      style={styles.input}
                      value={row.fabricType ?? ""}
                      onChange={(e) => patch("fabricType", e.target.value)}
                    >
                      <option value="">未選択</option>

                      {FABRIC_TYPE_OPTIONS.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </LabeledField>
                ) : null}

                <LabeledField label="作成コマタイプ">
                  <select
                    style={styles.input}
                    value={row.slotGridType || ""}
                    onChange={(e) => patch("slotGridType", e.target.value)}
                  >
                    <option value="">未選択</option>
                    {GRID_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </LabeledField>
              </div>

              <div style={styles.craftRightColumn}>
                <SlotGridEditor row={row} onPatch={onPatch} />
              </div>
            </div>

            <LabeledField label="レシピ本">
              <input
                list={recipeBookListId}
                style={styles.input}
                value={row.recipeBook ?? ""}
                placeholder="既存候補から選択、または新規入力"
                onChange={(e) => patch("recipeBook", e.target.value)}
              />

              <datalist id={recipeBookListId}>
                {recipeBookOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </LabeledField>

            <LabeledField label="レシピ入手場所">
              <input
                list={recipePlaceListId}
                style={styles.input}
                value={row.recipePlace ?? ""}
                placeholder="既存候補から選択、または新規入力"
                onChange={(e) => patch("recipePlace", e.target.value)}
              />

              <datalist id={recipePlaceListId}>
                {recipePlaceOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </LabeledField>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelHead}>
            <div>
              <h2 style={styles.panelTitle}>基礎効果</h2>
              <p style={styles.panelLead}>ステータス補正</p>
            </div>
          </div>

          <div style={styles.effectTwoColumns}>
            <div style={styles.effectColumn}>
              {[
                "attack",
                "defense",
                "maxHp",
                "maxMp",
                "charm",
              ].map((key) => {
                const field = EQUIPMENT_BASE_EFFECT_FIELDS.find(
                  (item) => item.key === key
                );

                if (!field) return null;

                return (
                  <LabeledField key={field.key} label={field.label}>
                    <input
                      type="number"
                      style={styles.input}
                      value={row[field.key] ?? ""}
                      onChange={(e) => patchGroupAware(field.key, e.target.value)}
                    />
                  </LabeledField>
                );
              })}
            </div>

            <div style={styles.effectColumn}>
              {[
                "agility",
                "dexterity",
                "magicAttack",
                "healingPower",
                "weight",
              ].map((key) => {
                const field = EQUIPMENT_BASE_EFFECT_FIELDS.find(
                  (item) => item.key === key
                );

                if (!field) return null;

                return (
                  <LabeledField key={field.key} label={field.label}>
                    <input
                      type="number"
                      style={styles.input}
                      value={row[field.key] ?? ""}
                      onChange={(e) => patchGroupAware(field.key, e.target.value)}
                    />
                  </LabeledField>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

const craftGridLayoutStyle = (isMobile) => ({
  display: "grid",
  gridTemplateColumns: isMobile
    ? "1fr"
    : "minmax(200px, 0.45fr) minmax(360px, 1fr)",
  gap: 14,
  alignItems: "start",
});

const styles = {
  wrap: {
    background: "var(--card-bg)",
    border: "1px solid var(--card-border)",
    borderRadius: 14,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    minWidth: 0,
  },

  emptyCard: {
    background: "var(--card-bg)",
    border: "1px solid var(--card-border)",
    borderRadius: 14,
    padding: 16,
    color: "var(--text-muted)",
  },

  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },

  badgeRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  idBadge: {
    display: "inline-flex",
    alignItems: "center",
    border: "1px solid var(--soft-border)",
    background: "var(--soft-bg)",
    color: "var(--text-muted)",
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 800,
  },

  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "var(--text-main)",
    fontWeight: 800,
    fontSize: 13,
  },

  columns: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },

  panel: {
    border: "1px solid var(--card-border)",
    background: "var(--card-bg)",
    borderRadius: 14,
    padding: 14,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },

  panelHead: {
    borderBottom: "1px solid var(--soft-border)",
    paddingBottom: 10,
  },

  panelTitle: {
    margin: 0,
    color: "var(--text-main)",
    fontSize: 16,
    fontWeight: 900,
  },

  panelLead: {
    margin: "4px 0 0",
    color: "var(--text-muted)",
    fontSize: 12,
    lineHeight: 1.5,
  },

  fieldStack: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minWidth: 0,
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid var(--input-border)",
    background: "var(--input-bg)",
    color: "var(--input-text)",
    borderRadius: 10,
    padding: "10px 12px",
    minWidth: 0,
  },

  textarea: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid var(--input-border)",
    background: "var(--input-bg)",
    color: "var(--input-text)",
    borderRadius: 10,
    padding: "10px 12px",
    resize: "vertical",
  },

  joinGroupBox: {
    border: "1px solid var(--selected-border)",
    background: "var(--selected-bg)",
    borderRadius: 12,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  accordionButton: {
    width: "100%",
    border: "1px solid var(--soft-border)",
    background: "var(--soft-bg)",
    color: "var(--text-main)",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    fontWeight: 900,
    textAlign: "left",
  },

  accordionButtonSub: {
    width: "100%",
    border: "1px solid var(--soft-border)",
    background: "var(--card-bg)",
    color: "var(--text-main)",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    fontWeight: 900,
    textAlign: "left",
  },

  accordionIcon: {
    width: 24,
    height: 24,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--card-bg)",
    border: "1px solid var(--soft-border)",
    flex: "0 0 auto",
  },

  accordionBody: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  helpText: {
    color: "var(--text-muted)",
    fontSize: 12,
    lineHeight: 1.5,
  },

  joinGroupSearchBox: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  },

  joinGroupCandidateList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    maxHeight: 190,
    overflowY: "auto",
  },

  joinGroupCandidateButton: {
    width: "100%",
    textAlign: "left",
    border: "1px solid var(--soft-border)",
    background: "var(--soft-bg)",
    color: "var(--text-main)",
    borderRadius: 10,
    padding: "9px 10px",
    cursor: "pointer",
    fontWeight: 800,
  },

  noGroupText: {
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 700,
  },

  createGroupBox: {
    borderTop: "1px solid var(--soft-border)",
    paddingTop: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  createGroupGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  },

  groupFields: {
    border: "1px dashed var(--soft-border)",
    borderRadius: 12,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  leaveGroupBox: {
    border: "1px solid var(--danger-border)",
    background: "var(--danger-bg)",
    borderRadius: 12,
    padding: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },

  leaveGroupTitle: {
    color: "var(--danger-text)",
    fontWeight: 900,
    fontSize: 13,
  },

  leaveGroupText: {
    color: "var(--danger-text)",
    opacity: 0.85,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 1.5,
  },

  craftLeftColumn: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
    minWidth: 0,
  },

  craftRightColumn: {
    minWidth: 0,
  },

effectTwoColumns: {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
},

effectColumn: {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  minWidth: 0,
},

  jobSection: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },

  label: {
    color: "var(--text-main)",
    fontWeight: 800,
    fontSize: 13,
  },

  tagList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },

  mutedText: {
    color: "var(--text-muted)",
    fontSize: 13,
  },

  inlineBetween: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
};

const secondaryButtonStyle = () => ({
  border: "1px solid var(--soft-border)",
  background: "var(--soft-bg)",
  color: "var(--text-main)",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 800,
});

const primarySoftButtonStyle = (disabled = false) => ({
  border: "1px solid var(--selected-border)",
  background: disabled ? "var(--input-disabled-bg)" : "var(--selected-bg)",
  color: disabled ? "var(--text-muted)" : "var(--text-main)",
  borderRadius: 10,
  padding: "9px 12px",
  cursor: disabled ? "not-allowed" : "pointer",
  fontWeight: 800,
});

const dangerSoftButtonStyle = () => ({
  border: "1px solid var(--danger-border)",
  background: "var(--card-bg)",
  color: "var(--danger-text)",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 800,
});

const jobTagStyle = (override) => ({
  border: `1px solid ${
    override ? "var(--selected-border)" : "var(--soft-border)"
  }`,
  background: override ? "var(--selected-bg)" : "var(--soft-bg)",
  color: "var(--text-main)",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 800,
});

const jobToggleStyle = (selected) => ({
  border: `1px solid ${
    selected ? "var(--selected-border)" : "var(--soft-border)"
  }`,
  background: selected ? "var(--selected-bg)" : "var(--soft-bg)",
  color: "var(--text-main)",
  borderRadius: 999,
  padding: "6px 10px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
});
