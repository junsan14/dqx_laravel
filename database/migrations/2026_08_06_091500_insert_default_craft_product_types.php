<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $craftTypeIds = [
            'weapon' => $this->resolveCraftTypeId(
                ['武器鍛冶', '武器鍛冶職人'],
                ['weapon_smith', 'weapon_smithing', 'weapon']
            ),
            'armor' => $this->resolveCraftTypeId(
                ['防具鍛冶', '防具鍛冶職人'],
                ['armor_smith', 'armor_smithing', 'armor']
            ),
            'woodwork' => $this->resolveCraftTypeId(
                ['木工', '木工職人'],
                ['woodworking', 'woodworker', 'woodwork', 'wood']
            ),
            'tailoring' => $this->resolveCraftTypeId(
                ['裁縫', 'さいほう', '裁縫職人', 'さいほう職人'],
                ['tailoring', 'tailor', 'sewing']
            ),
            'craft_tool' => $this->resolveCraftTypeId(
                ['道具鍛冶', '道具鍛冶職人'],
                ['tool_smith', 'tool_smithing', 'craft_tool', 'tool']
            ),
        ];

        $now = now();

        $rows = [
            // 武器鍛冶
            $this->row('sword_1h', '片手剣', 'weapon', $craftTypeIds['weapon'], 1, $now),
            $this->row('sword_2h', '両手剣', 'weapon', $craftTypeIds['weapon'], 2, $now),
            $this->row('dagger', '短剣', 'weapon', $craftTypeIds['weapon'], 1, $now),
            $this->row('spear', 'ヤリ', 'weapon', $craftTypeIds['weapon'], 1, $now),
            $this->row('axe', 'オノ', 'weapon', $craftTypeIds['weapon'], 2, $now),
            $this->row('hammer', 'ハンマー', 'weapon', $craftTypeIds['weapon'], 2, $now),
            $this->row('claw', 'ツメ', 'weapon', $craftTypeIds['weapon'], 2, $now),
            $this->row('whip', 'ムチ', 'weapon', $craftTypeIds['weapon'], 2, $now),
            $this->row('boomerang', 'ブーメラン', 'weapon', $craftTypeIds['woodwork'], 2, $now),
            $this->row('stick', 'スティック', 'weapon', $craftTypeIds['woodwork'], 1, $now),
            $this->row('staff_2h', '両手杖', 'weapon', $craftTypeIds['woodwork'], 1, $now),
            $this->row('kon', '棍', 'weapon', $craftTypeIds['woodwork'], 2, $now),
            $this->row('fan', '扇', 'weapon', $craftTypeIds['woodwork'], 2, $now),
            $this->row('bow', '弓', 'weapon', $craftTypeIds['woodwork'], 2, $now),
            $this->row('scythe', '鎌', 'weapon', $craftTypeIds['weapon'], 2, $now),

            // 防具鍛冶
            $this->row('shield_small', '小盾', 'shield', $craftTypeIds['armor'], 2, $now),
            $this->row('shield_large', '大盾', 'shield', $craftTypeIds['armor'], 2, $now),
            $this->row('armor_head', '鎧頭', 'armor', $craftTypeIds['armor'], 2, $now),
            $this->row('armor_upper', '鎧上', 'armor', $craftTypeIds['armor'], 2, $now),
            $this->row('armor_lower', '鎧下', 'armor', $craftTypeIds['armor'], 2, $now),
            $this->row('armor_arms', '鎧腕', 'armor', $craftTypeIds['armor'], 1, $now),
            $this->row('armor_feet', '鎧足', 'armor', $craftTypeIds['armor'], 2, $now),

            // 裁縫
            $this->row('tailoring_head', '裁縫頭', 'armor', $craftTypeIds['tailoring'], 3, $now),
            $this->row('tailoring_upper', '裁縫上', 'armor', $craftTypeIds['tailoring'], 3, $now),
            $this->row('tailoring_lower', '裁縫下', 'armor', $craftTypeIds['tailoring'], 2, $now),
            $this->row('tailoring_arms', '裁縫腕', 'armor', $craftTypeIds['tailoring'], 3, $now),
            $this->row('tailoring_feet', '裁縫足', 'armor', $craftTypeIds['tailoring'], 2, $now),

            // 道具鍛冶
            $this->row('tool_hammer', '鍛冶ハンマー', 'craft_tool', $craftTypeIds['craft_tool'], 2, $now),
            $this->row('tool_woodworking_knife', '木工刀', 'craft_tool', $craftTypeIds['craft_tool'], 1, $now),
            $this->row('tool_alchemy_pot', '錬金ツボ', 'craft_tool', $craftTypeIds['craft_tool'], 2, $now),
            $this->row('tool_alchemy_lamp', '錬金ランプ', 'craft_tool', $craftTypeIds['craft_tool'], 2, $now),
            $this->row('tool_sewing_needle', 'さいほう針', 'craft_tool', $craftTypeIds['craft_tool'], 1, $now),
            $this->row('tool_frying_pan', 'フライパン', 'craft_tool', $craftTypeIds['craft_tool'], 2, $now),

            // 木工（グリッド列数は現在のプリセットに未定義）
            $this->row('fishing_rod', '釣り竿', 'fishing', $craftTypeIds['woodwork'], null, $now),
            $this->row('furniture_table', '家具・机', 'furniture', $craftTypeIds['woodwork'], null, $now),
            $this->row('furniture_chair', '家具・イス', 'furniture', $craftTypeIds['woodwork'], null, $now),
        ];

        DB::table('craft_product_types')->upsert(
            $rows,
            ['key'],
            ['name', 'kind', 'craft_type_id', 'grid_columns', 'updated_at']
        );
    }

    public function down(): void
    {
        DB::table('craft_product_types')
            ->whereIn('key', $this->insertedKeys())
            ->delete();
    }

    private function resolveCraftTypeId(array $names, array $keys): int
    {
        $id = DB::table('craft_types')
            ->where(function ($query) use ($names, $keys) {
                $query->whereIn('name', $names)
                    ->orWhereIn('key', $keys);
            })
            ->value('id');

        if (!$id) {
            throw new \RuntimeException(
                'craft_types に対象の職人が見つかりません: ' . implode(' / ', $names)
            );
        }

        return (int) $id;
    }

    private function row(
        string $key,
        string $name,
        string $kind,
        int $craftTypeId,
        ?int $gridColumns,
        $now
    ): array {
        return [
            'key' => $key,
            'name' => $name,
            'kind' => $kind,
            'craft_type_id' => $craftTypeId,
            'grid_columns' => $gridColumns,
            'created_at' => $now,
            'updated_at' => $now,
        ];
    }

    private function insertedKeys(): array
    {
        return [
            'sword_1h',
            'sword_2h',
            'dagger',
            'spear',
            'axe',
            'hammer',
            'claw',
            'whip',
            'boomerang',
            'stick',
            'staff_2h',
            'kon',
            'fan',
            'bow',
            'scythe',
            'shield_small',
            'shield_large',
            'armor_head',
            'armor_upper',
            'armor_lower',
            'armor_arms',
            'armor_feet',
            'tailoring_head',
            'tailoring_upper',
            'tailoring_lower',
            'tailoring_arms',
            'tailoring_feet',
            'tool_hammer',
            'tool_woodworking_knife',
            'tool_alchemy_pot',
            'tool_alchemy_lamp',
            'tool_sewing_needle',
            'tool_frying_pan',
            'fishing_rod',
            'furniture_table',
            'furniture_chair',
        ];
    }
};
