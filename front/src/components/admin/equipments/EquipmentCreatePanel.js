"use client";

import LabeledField from "./LabeledField";
import { buildEmptyGroupMembers } from "./equipmentFormHelpers";

const GROUP_KIND_OPTIONS_FOR_CREATE = [
  { value: "tailoring_set", label: "ローブ(裁縫系)" },
  { value: "armor_set", label: "鎧(防具鍛冶系)" },
  { value: "craft_tool_set", label: "職人道具" },
  { value: "other_set", label: "その他" },
];

const FALLBACK_NEW_ITEM = {
  itemName: "",
};

function buildCreateGroupMembers(groupKind) {
  return buildEmptyGroupMembers(groupKind).map((member) => ({
    ...member,
    itemName: "",
  }));
}

const FALLBACK_NEW_GROUP = {
  groupName: "",
  groupKind: "armor_set",
  members: buildCreateGroupMembers("armor_set"),
};

export default function EquipmentCreatePanel({
  newMode,
  setNewMode,
  newItem,
  setNewItem,
  newGroup,
  setNewGroup,
}) {
  const safeNewItem = newItem ?? FALLBACK_NEW_ITEM;
  const safeNewGroup = newGroup ?? FALLBACK_NEW_GROUP;
  const safeMembers = Array.isArray(safeNewGroup.members)
    ? safeNewGroup.members
    : [];
  const isOtherSet = safeNewGroup.groupKind === "other_set";

  function updateGroupKind(nextKind) {
    setNewGroup((previous) => ({
      ...(previous ?? FALLBACK_NEW_GROUP),
      groupKind: nextKind,
      members: buildCreateGroupMembers(nextKind),
    }));
  }

  function updateGroupMember(index, patch) {
    setNewGroup((previous) => {
      const base = previous ?? FALLBACK_NEW_GROUP;
      const members = Array.isArray(base.members) ? [...base.members] : [];

      members[index] = {
        ...members[index],
        ...patch,
      };

      return {
        ...base,
        members,
      };
    });
  }

  function addOtherGroupMember() {
    setNewGroup((previous) => {
      const base = previous ?? FALLBACK_NEW_GROUP;
      const members = Array.isArray(base.members) ? base.members : [];

      return {
        ...base,
        members: [
          ...members,
          {
            key: `other_${Date.now()}_${members.length}`,
            enabled: true,
            slotLabel: "",
            craftProductTypeKey: "",
            craftProductTypeId: "",
            itemName: "",
          },
        ],
      };
    });
  }

  function removeOtherGroupMember(index) {
    setNewGroup((previous) => {
      const base = previous ?? FALLBACK_NEW_GROUP;
      const members = Array.isArray(base.members) ? base.members : [];

      return {
        ...base,
        members: members.filter((_, memberIndex) => memberIndex !== index),
      };
    });
  }

  return (
    <section style={styles.card}>
      <div style={styles.sectionHead}>
        <div>
          <div style={styles.sectionTitle}>新規追加</div>
          <p style={styles.sectionLead}>
            最初は名前だけ登録し、詳細は作成後に編集できます
          </p>
        </div>
      </div>

      <div style={styles.segment}>
        <button
          type="button"
          onClick={() => setNewMode("single")}
          style={segmentButtonStyle(newMode === "single")}
        >
          単体
        </button>
        <button
          type="button"
          onClick={() => setNewMode("group")}
          style={segmentButtonStyle(newMode === "group")}
        >
          セット
        </button>
      </div>

      {newMode === "single" ? (
        <LabeledField label="装備名">
          <input
            style={styles.input}
            value={safeNewItem.itemName ?? ""}
            onChange={(event) =>
              setNewItem((previous) => ({
                ...(previous ?? FALLBACK_NEW_ITEM),
                itemName: event.target.value,
              }))
            }
            placeholder="例: セーラスソード"
          />
        </LabeledField>
      ) : (
        <>
          <div style={styles.grid2}>
            <LabeledField label="セット名">
              <input
                style={styles.input}
                value={safeNewGroup.groupName ?? ""}
                onChange={(event) =>
                  setNewGroup((previous) => ({
                    ...(previous ?? FALLBACK_NEW_GROUP),
                    groupName: event.target.value,
                  }))
                }
                placeholder="例: 皮セット"
              />
            </LabeledField>

            <LabeledField label="セット種類">
              <select
                style={styles.select}
                value={safeNewGroup.groupKind}
                onChange={(event) => updateGroupKind(event.target.value)}
              >
                {GROUP_KIND_OPTIONS_FOR_CREATE.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </LabeledField>
          </div>

          {isOtherSet ? (
            <div style={styles.memberActions}>
              <button
                type="button"
                style={smallButtonStyle(false)}
                onClick={addOtherGroupMember}
              >
                子どもを追加
              </button>
              {!safeMembers.length ? (
                <span style={styles.memberEmptyText}>
                  子どもを追加して名前を入力してください
                </span>
              ) : null}
            </div>
          ) : null}

          <div style={styles.membersWrap}>
            {safeMembers.map((member, index) => (
              <div key={member.key ?? index} style={styles.memberCard}>
                <div style={styles.memberCardHeader}>
                  {isOtherSet ? (
                    <strong style={styles.memberCardTitle}>
                      子ども {index + 1}
                    </strong>
                  ) : (
                    <label style={styles.checkRow}>
                      <input
                        type="checkbox"
                        checked={member.enabled !== false}
                        onChange={(event) =>
                          updateGroupMember(index, {
                            enabled: event.target.checked,
                          })
                        }
                      />
                      <span>{member.slotLabel || `子ども ${index + 1}`}</span>
                    </label>
                  )}

                  {isOtherSet ? (
                    <button
                      type="button"
                      style={removeMemberButtonStyle()}
                      onClick={() => removeOtherGroupMember(index)}
                    >
                      削除
                    </button>
                  ) : null}
                </div>

                <LabeledField label="名前">
                  <input
                    style={styles.input}
                    value={member.itemName ?? ""}
                    disabled={member.enabled === false}
                    onChange={(event) =>
                      updateGroupMember(index, {
                        itemName: event.target.value,
                      })
                    }
                    placeholder={
                      isOtherSet
                        ? "子どもの名前"
                        : `${member.slotLabel || "部位"}の装備名`
                    }
                  />
                </LabeledField>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={styles.note}>
        item_id は保存時に自動生成します。装備可能職・職人・作成タイプなどは、作成後の編集画面で設定できます。
      </div>
    </section>
  );
}

function segmentButtonStyle(active) {
  return {
    flex: 1,
    border: active
      ? "1px solid var(--selected-border)"
      : "1px solid var(--soft-border)",
    background: active ? "var(--primary-bg)" : "var(--soft-bg)",
    color: active ? "var(--primary-text)" : "var(--text-main)",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 800,
  };
}

function smallButtonStyle(disabled) {
  return {
    border: "1px solid var(--soft-border)",
    background: "var(--soft-bg)",
    color: "var(--text-main)",
    borderRadius: 8,
    padding: "8px 11px",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    fontWeight: 700,
  };
}

function removeMemberButtonStyle() {
  return {
    border: "1px solid rgba(239, 68, 68, 0.35)",
    background: "rgba(239, 68, 68, 0.08)",
    color: "#dc2626",
    borderRadius: 8,
    padding: "6px 9px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 12,
  };
}

const styles = {
  card: {
    display: "grid",
    gap: 16,
    padding: 16,
    border: "1px solid var(--card-border)",
    borderRadius: 14,
    background: "var(--card-bg)",
    minWidth: 0,
  },
  sectionHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  sectionTitle: {
    color: "var(--text-title)",
    fontSize: 18,
    fontWeight: 800,
  },
  sectionLead: {
    margin: "5px 0 0",
    color: "var(--text-muted)",
    fontSize: 13,
    lineHeight: 1.6,
  },
  segment: {
    display: "flex",
    gap: 8,
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid var(--input-border)",
    background: "var(--input-bg)",
    color: "var(--input-text)",
    borderRadius: 10,
    padding: "10px 12px",
  },
  select: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid var(--input-border)",
    background: "var(--input-bg)",
    color: "var(--input-text)",
    borderRadius: 10,
    padding: "10px 12px",
  },
  memberActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  memberEmptyText: {
    color: "var(--text-muted)",
    fontSize: 12,
  },
  membersWrap: {
    display: "grid",
    gap: 10,
  },
  memberCard: {
    display: "grid",
    gap: 10,
    padding: 12,
    border: "1px solid var(--soft-border)",
    borderRadius: 12,
    background: "var(--soft-bg)",
  },
  memberCardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  memberCardTitle: {
    color: "var(--text-main)",
    fontSize: 13,
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "var(--text-main)",
    fontWeight: 800,
    fontSize: 13,
  },
  note: {
    padding: "10px 12px",
    borderRadius: 10,
    background: "var(--soft-bg)",
    color: "var(--text-muted)",
    fontSize: 12,
    lineHeight: 1.7,
  },
};
