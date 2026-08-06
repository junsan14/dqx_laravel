<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class AssignCraftProductTypesToEquipments extends Command
{
    protected $signature = 'equipment:assign-craft-product-types
                            {--dry-run : DBを更新せず、判定結果だけ確認する}
                            {--overwrite : craft_product_type_id が設定済みの装備も再判定する}
                            {--chunk=500 : 一度に処理する件数}
                            {--show-unmatched=50 : 画面に表示する未判定データの最大件数}';

    protected $description =
        '既存のitem_id・equipment_type_id・旧slot情報からequipments.craft_product_type_idを設定する';

    /** @var array<string, int> */
    private array $craftProductTypeIds = [];

    /** @var array<string, int> */
    private array $craftProductTypeIdsByName = [];

    /** @var array<int, object> */
    private array $equipmentTypes = [];

    /** @var array<int, string> */
    private array $itemIdMatchKeys = [];

    public function handle(): int
    {
        if (!$this->validateDatabaseStructure()) {
            return self::FAILURE;
        }

        $this->loadReferenceData();

        if ($this->craftProductTypeIds === []) {
            $this->error('craft_product_types にデータがありません。');
            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');
        $overwrite = (bool) $this->option('overwrite');
        $chunkSize = max(1, (int) $this->option('chunk'));
        $showUnmatched = max(0, (int) $this->option('show-unmatched'));

        $selectColumns = $this->equipmentSelectColumns();

        $query = DB::table('equipments')
            ->select($selectColumns)
            ->orderBy('id');

        if (!$overwrite) {
            $query->whereNull('craft_product_type_id');
        }

        $targetCount = (clone $query)->count();

        if ($targetCount === 0) {
            $this->info('対象の装備はありません。');
            return self::SUCCESS;
        }

        $this->newLine();
        $this->info($dryRun ? 'ドライランを開始します。' : 'craft_product_type_id の更新を開始します。');
        $this->line("対象件数: {$targetCount}");
        $this->line('既存値上書き: ' . ($overwrite ? 'する' : 'しない'));
        $this->newLine();

        $processed = 0;
        $resolved = 0;
        $unresolved = 0;
        $unchanged = 0;
        $unmatchedRows = [];
        $resolvedCounts = [];

        $bar = $this->output->createProgressBar($targetCount);
        $bar->start();

        $query->chunkById($chunkSize, function ($rows) use (
            $dryRun,
            $showUnmatched,
            &$processed,
            &$resolved,
            &$unresolved,
            &$unchanged,
            &$unmatchedRows,
            &$resolvedCounts,
            $bar
        ): void {
            /** @var array<int, array<int, int>> $idsByCraftProductType */
            $idsByCraftProductType = [];

            foreach ($rows as $row) {
                $processed++;

                $key = $this->resolveCraftProductTypeKey($row);

                if ($key === null || !isset($this->craftProductTypeIds[$key])) {
                    $unresolved++;

                    if (count($unmatchedRows) < $showUnmatched) {
                        $equipmentType = $this->equipmentTypeFor($row);

                        $unmatchedRows[] = [
                            'id' => (int) $row->id,
                            'item_id' => (string) ($row->item_id ?? ''),
                            'item_name' => (string) ($row->item_name ?? ''),
                            'equipment_type' => (string) ($equipmentType->name ?? ''),
                            'slot' => (string) ($row->slot ?? ''),
                            'slot_grid_type' => (string) ($row->slot_grid_type ?? ''),
                            'group_kind' => (string) ($row->group_kind ?? ''),
                        ];
                    }

                    $bar->advance();
                    continue;
                }

                $craftProductTypeId = $this->craftProductTypeIds[$key];
                $currentId = $row->craft_product_type_id === null
                    ? null
                    : (int) $row->craft_product_type_id;

                if ($currentId === $craftProductTypeId) {
                    $unchanged++;
                    $bar->advance();
                    continue;
                }

                $resolved++;
                $resolvedCounts[$key] = ($resolvedCounts[$key] ?? 0) + 1;
                $idsByCraftProductType[$craftProductTypeId][] = (int) $row->id;

                $bar->advance();
            }

            if ($dryRun || $idsByCraftProductType === []) {
                return;
            }

            DB::transaction(function () use ($idsByCraftProductType): void {
                foreach ($idsByCraftProductType as $craftProductTypeId => $equipmentIds) {
                    DB::table('equipments')
                        ->whereIn('id', $equipmentIds)
                        ->update([
                            'craft_product_type_id' => $craftProductTypeId,
                        ]);
                }
            });
        });

        $bar->finish();
        $this->newLine(2);

        $this->table(
            ['結果', '件数'],
            [
                ['処理対象', $processed],
                [$dryRun ? '設定可能' : '更新', $resolved],
                ['すでに同じ値', $unchanged],
                ['未判定（NULLのまま）', $unresolved],
            ]
        );

        if ($resolvedCounts !== []) {
            arsort($resolvedCounts);

            $this->newLine();
            $this->info('作成タイプ別の件数');
            $this->table(
                ['key', 'name', '件数'],
                collect($resolvedCounts)
                    ->map(function (int $count, string $key): array {
                        return [
                            $key,
                            $this->craftProductTypeName($key),
                            $count,
                        ];
                    })
                    ->values()
                    ->all()
            );
        }

        if ($unmatchedRows !== []) {
            $this->newLine();
            $this->warn('次の装備は判定できなかったため、craft_product_type_id をNULLのまま残します。');
            $this->table(
                ['id', 'item_id', 'item_name', 'equipment_type', 'slot', 'slot_grid_type', 'group_kind'],
                $unmatchedRows
            );

            Log::warning('craft_product_type_id を判定できない装備があります。', [
                'count' => $unresolved,
                'sample' => $unmatchedRows,
            ]);
        }

        $this->newLine();

        if ($dryRun) {
            $this->comment('ドライランのためDBは更新していません。');
            $this->line('問題なければ次を実行してください。');
            $this->line('php artisan equipment:assign-craft-product-types');
        } else {
            $this->info('更新が完了しました。');
        }

        return self::SUCCESS;
    }

    private function validateDatabaseStructure(): bool
    {
        if (!Schema::hasTable('equipments')) {
            $this->error('equipments テーブルがありません。');
            return false;
        }

        if (!Schema::hasTable('craft_product_types')) {
            $this->error('craft_product_types テーブルがありません。');
            return false;
        }

        if (!Schema::hasColumn('equipments', 'craft_product_type_id')) {
            $this->error('equipments.craft_product_type_id がありません。');
            return false;
        }

        return true;
    }

    private function loadReferenceData(): void
    {
        $craftProductTypes = DB::table('craft_product_types')
            ->select(['id', 'key', 'name'])
            ->orderBy('id')
            ->get();

        foreach ($craftProductTypes as $type) {
            $key = trim((string) $type->key);
            $name = $this->normalizeLabel((string) $type->name);

            if ($key !== '') {
                $this->craftProductTypeIds[$key] = (int) $type->id;
            }

            if ($name !== '') {
                $this->craftProductTypeIdsByName[$name] = (int) $type->id;
            }
        }

        // item_id は長いkeyから照合する。
        // 例: sword_1h を sword より先に確認する。
        $this->itemIdMatchKeys = array_keys($this->craftProductTypeIds);
        usort(
            $this->itemIdMatchKeys,
            static fn (string $a, string $b): int => strlen($b) <=> strlen($a)
        );

        if (Schema::hasTable('equipment_types')) {
            $this->equipmentTypes = DB::table('equipment_types')
                ->select(['id', 'key', 'name'])
                ->get()
                ->keyBy('id')
                ->all();
        }
    }

    /**
     * 削除予定の旧カラムがすでに存在しない場合でも、
     * item_id と equipment_type_id だけで可能な範囲を処理できるようにする。
     *
     * @return array<int, string>
     */
    private function equipmentSelectColumns(): array
    {
        $columns = [
            'id',
            'item_id',
            'item_name',
            'equipment_type_id',
            'craft_product_type_id',
            'group_name',
            'group_kind',
        ];

        foreach (['slot', 'slot_grid_type', 'slot_grid_json'] as $column) {
            if (Schema::hasColumn('equipments', $column)) {
                $columns[] = $column;
            }
        }

        return $columns;
    }

    private function resolveCraftProductTypeKey(object $row): ?string
    {
        $itemId = trim((string) ($row->item_id ?? ''));
        $itemName = trim((string) ($row->item_name ?? ''));
        $groupName = trim((string) ($row->group_name ?? ''));
        $groupKind = trim((string) ($row->group_kind ?? ''));
        $slot = trim((string) ($row->slot ?? ''));
        $slotGridType = trim((string) ($row->slot_grid_type ?? ''));

        // 旧データで equipment_type_id が誤っていることがある装備を名称で補正。
        $legacyWeaponNameMap = [
            'せいどうの大剣' => ['sword_2h'],
            '聖なるナイフ' => ['dagger'],
            'せいどうのやり' => ['spear'],
            'せいどうのオノ' => ['axe'],
            'せいどうのかなづち' => ['hammer'],
            'せいどうのツメ' => ['claw'],
            'バトルリボン' => ['whip'],
            'ブロンズブーメラン' => ['boomerang'],
            'クリナップロッド' => ['kon'],
        ];

        if (isset($legacyWeaponNameMap[$itemName])) {
            return $this->firstExistingKey($legacyWeaponNameMap[$itemName]);
        }

        // item_id が craft_product_types.key から始まる場合は最優先で使用。
        // 例: sword_1h_132 -> sword_1h
        $itemIdKey = $this->resolveFromItemId($itemId);
        if ($itemIdKey !== null) {
            return $itemIdKey;
        }

        // equipment_types.key/name と craft_product_types.key/name が一致する場合。
        $equipmentType = $this->equipmentTypeFor($row);

        if ($equipmentType) {
            $equipmentTypeKey = trim((string) ($equipmentType->key ?? ''));
            if ($equipmentTypeKey !== '' && isset($this->craftProductTypeIds[$equipmentTypeKey])) {
                return $equipmentTypeKey;
            }

            $byEquipmentTypeName = $this->resolveExactName((string) ($equipmentType->name ?? ''));
            if ($byEquipmentTypeName !== null) {
                return $byEquipmentTypeName;
            }
        }

        // 旧カラムの値が作成タイプ名と一致する場合。
        foreach ([$slotGridType, $slot] as $label) {
            $direct = $this->resolveExactName($label);
            if ($direct !== null) {
                return $direct;
            }
        }

        // 名称の揺れをkeyへ変換。
        $explicitLabelMap = [
            '片手剣' => ['sword_1h'],
            '両手剣' => ['sword_2h'],
            '短剣' => ['dagger'],
            'ヤリ' => ['spear'],
            'オノ' => ['axe'],
            'ハンマー' => ['hammer'],
            'ツメ' => ['claw'],
            'ムチ' => ['whip'],
            'ブーメラン' => ['boomerang'],
            'スティック' => ['stick'],
            '両手杖' => ['staff_2h'],
            '棍' => ['kon'],
            '扇' => ['fan'],
            '弓' => ['bow'],
            '鎌' => ['scythe'],
            '小盾' => ['shield_small'],
            '大盾' => ['shield_large'],
            '鎧頭' => ['armor_head'],
            '鎧上' => ['armor_upper'],
            '鎧下' => ['armor_lower'],
            '鎧腕' => ['armor_arms'],
            '鎧足' => ['armor_feet'],
            '裁縫頭' => ['tailoring_head', 'sewing_head'],
            '裁縫上' => ['tailoring_upper', 'sewing_upper'],
            '裁縫下' => ['tailoring_lower', 'sewing_lower'],
            '裁縫腕' => ['tailoring_arms', 'sewing_arms'],
            '裁縫足' => ['tailoring_feet', 'sewing_feet'],
            '道具ハンマー' => ['tool_hammer'],
            '鍛冶ハンマー' => ['tool_hammer'],
            '道具木工刀' => ['tool_woodworking_knife'],
            '木工刀' => ['tool_woodworking_knife'],
            '道具錬金ツボ' => ['tool_alchemy_pot'],
            '錬金ツボ' => ['tool_alchemy_pot'],
            '道具錬金ランプ' => ['tool_alchemy_lamp'],
            '錬金ランプ' => ['tool_alchemy_lamp'],
            '道具さいほう針' => ['tool_sewing_needle'],
            'さいほう針' => ['tool_sewing_needle'],
            '道具フライパン' => ['tool_frying_pan'],
            'フライパン' => ['tool_frying_pan'],
        ];

        foreach ([$slotGridType, $slot] as $label) {
            $normalizedLabel = $this->normalizeLabel($label);

            if (isset($explicitLabelMap[$normalizedLabel])) {
                $key = $this->firstExistingKey($explicitLabelMap[$normalizedLabel]);
                if ($key !== null) {
                    return $key;
                }
            }
        }

        // 防具・裁縫セットは group_kind と部位から判定。
        $armorSuffix = $this->resolveArmorSuffix($slot)
            ?? $this->resolveArmorSuffix($slotGridType);

        if ($armorSuffix !== null) {
            if (
                str_starts_with($itemId, 'tailor_')
                || in_array($groupKind, ['tailoring_set', 'sewing_set'], true)
            ) {
                return $this->firstExistingKey([
                    'tailoring_' . $armorSuffix,
                    'sewing_' . $armorSuffix,
                ]);
            }

            if (
                str_starts_with($itemId, 'armor_')
                || $groupKind === 'armor_set'
            ) {
                return $this->firstExistingKey([
                    'armor_' . $armorSuffix,
                ]);
            }
        }

        // 職人道具・釣り・家具など。対象タイプがテーブルにある場合だけ設定する。
        $special = $this->resolveSpecialProductKey(
            $itemName,
            $groupName,
            $groupKind,
            $slot,
            $row->slot_grid_json ?? null
        );

        if ($special !== null) {
            return $special;
        }

        return null;
    }

    private function resolveFromItemId(string $itemId): ?string
    {
        if ($itemId === '') {
            return null;
        }

        foreach ($this->itemIdMatchKeys as $key) {
            if ($itemId === $key || str_starts_with($itemId, $key . '_')) {
                return $key;
            }
        }

        return null;
    }

    private function resolveSpecialProductKey(
        string $itemName,
        string $groupName,
        string $groupKind,
        string $slot,
        mixed $slotGridJson
    ): ?string {
        $haystack = $itemName . ' ' . $groupName;

        $containsMap = [
            'さいほう針' => ['tool_sewing_needle'],
            '木工刀' => ['tool_woodworking_knife'],
            '錬金ランプ' => ['tool_alchemy_lamp'],
            '錬金ツボ' => ['tool_alchemy_pot'],
            'フライパン' => ['tool_frying_pan'],
            '鍛冶ハンマー' => ['tool_hammer'],
            '釣りざお' => ['fishing_rod'],
            '釣り竿' => ['fishing_rod'],
        ];

        foreach ($containsMap as $needle => $keys) {
            if (str_contains($haystack, $needle)) {
                $key = $this->firstExistingKey($keys);
                if ($key !== null) {
                    return $key;
                }
            }
        }

        if ($groupName === 'ラグ') {
            return $this->firstExistingKey(['tailoring_rug', 'rug']);
        }

        if ($groupName === 'ぬいぐるみ') {
            return $this->firstExistingKey(['tailoring_doll', 'doll']);
        }

        if ($groupName === 'ルアー' || str_contains($itemName, 'ルアー')) {
            return $this->firstExistingKey(['tool_lure', 'lure']);
        }

        if (in_array($itemName, [
            '虹色のオーブ',
            '超ようせいのひだね',
            '超かがやきの樹液',
            '超あまつゆのいと',
        ], true)) {
            return $this->firstExistingKey(['tool_material', 'craft_material']);
        }

        $isFurniture = $slot === '家具'
            || str_contains($groupKind, 'furniture')
            || str_contains($itemName, '家具');

        if ($isFurniture) {
            if (preg_match('/机|テーブル/u', $itemName)) {
                return $this->firstExistingKey(['furniture_table']);
            }

            if (preg_match('/イス|椅子|チェア/u', $itemName)) {
                return $this->firstExistingKey(['furniture_chair']);
            }

            [$rows, $cols] = $this->gridDimensions($slotGridJson);

            if ($rows >= 6 && $cols === 3) {
                $partition = $this->firstExistingKey(['furniture_partition']);
                if ($partition !== null) {
                    return $partition;
                }
            }

            return $this->firstExistingKey(['furniture_standard', 'furniture']);
        }

        if (in_array($groupKind, ['craft_tool_set', 'crafttool_set'], true)) {
            return null;
        }

        return null;
    }

    private function resolveArmorSuffix(string $value): ?string
    {
        return match ($this->normalizeLabel($value)) {
            '頭', 'あたま', 'アタマ' => 'head',
            '体上', 'からだ上', '身体上' => 'upper',
            '体下', 'からだ下', '身体下' => 'lower',
            '腕', 'うで', 'ウデ' => 'arms',
            '足', 'あし' => 'feet',
            default => null,
        };
    }

    private function resolveExactName(string $value): ?string
    {
        $normalized = $this->normalizeLabel($value);

        if ($normalized === '' || !isset($this->craftProductTypeIdsByName[$normalized])) {
            return null;
        }

        $id = $this->craftProductTypeIdsByName[$normalized];

        return array_search($id, $this->craftProductTypeIds, true) ?: null;
    }

    /** @param array<int, string> $keys */
    private function firstExistingKey(array $keys): ?string
    {
        foreach ($keys as $key) {
            if (isset($this->craftProductTypeIds[$key])) {
                return $key;
            }
        }

        return null;
    }

    private function equipmentTypeFor(object $row): ?object
    {
        $id = $row->equipment_type_id === null
            ? null
            : (int) $row->equipment_type_id;

        if ($id === null) {
            return null;
        }

        return $this->equipmentTypes[$id] ?? null;
    }

    private function normalizeLabel(string $value): string
    {
        return trim(mb_convert_kana($value, 'asKV', 'UTF-8'));
    }

    private function craftProductTypeName(string $key): string
    {
        $id = $this->craftProductTypeIds[$key] ?? null;

        if ($id === null) {
            return '';
        }

        $name = array_search($id, $this->craftProductTypeIdsByName, true);

        return is_string($name) ? $name : '';
    }

    /** @return array{0:int, 1:int} */
    private function gridDimensions(mixed $value): array
    {
        if (is_array($value)) {
            $decoded = $value;
        } elseif (is_string($value) && trim($value) !== '') {
            $decoded = json_decode($value, true);
        } else {
            return [0, 0];
        }

        if (!is_array($decoded) || $decoded === []) {
            return [0, 0];
        }

        // {rows, cols, disabledCells} 形式にも対応。
        if (isset($decoded['rows'], $decoded['cols'])) {
            return [(int) $decoded['rows'], (int) $decoded['cols']];
        }

        if (!is_array($decoded[0] ?? null)) {
            return [1, count($decoded)];
        }

        $rows = count($decoded);
        $cols = 0;

        foreach ($decoded as $row) {
            if (is_array($row)) {
                $cols = max($cols, count($row));
            }
        }

        return [$rows, $cols];
    }
}
