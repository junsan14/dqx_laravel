<?php

namespace App\Console\Commands;

use App\Models\Equipment;
use App\Services\EquipmentFabricTypeScraper;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

class UpdateEquipmentFabricTypes extends Command
{
    protected $signature = 'equipment:fabric-type:update
        {--item= : item_name完全一致で一覧サイトから1件だけ探す}
        {--set= : セット名を指定してセット内の全部位を対象にする}
        {--from-set= : 全件巡回を指定セットから開始する}
        {--url= : 部位詳細ページURLを直接1件確認する}
        {--limit= : 一覧巡回時に確認する部位数}
        {--delay=300 : リクエスト間隔（ミリ秒）}
        {--only-empty : fabric_typeが空の装備だけ更新する}
        {--force : 確認を省略して更新する}
        {--log= : storage/logs配下へ出力するファイル名}';

    protected $description =
        '極限攻略の裁縫装備一覧からequipments.fabric_typeを更新する';

    public function handle(EquipmentFabricTypeScraper $scraper): int
    {
        $itemName = trim((string) $this->option('item'));
        $setName = trim((string) $this->option('set'));
        $fromSetName = trim((string) $this->option('from-set'));
        $directUrl = trim((string) $this->option('url'));

        $specifiedTargets = array_filter([
            'item' => $itemName,
            'set' => $setName,
            'url' => $directUrl,
        ], static fn (string $value): bool => $value !== '');

        if (count($specifiedTargets) > 1) {
            $this->error('--item、--set、--url は同時に指定できません。');

            return self::FAILURE;
        }

        if ($fromSetName !== '' && $specifiedTargets !== []) {
            $this->error('--from-set は --item、--set、--url と同時に指定できません。');

            return self::FAILURE;
        }

        $delayMs = max(0, (int) $this->option('delay'));
        $limit = filled($this->option('limit'))
            ? max(1, (int) $this->option('limit'))
            : null;

        try {
            if ($itemName !== '') {
                $results = [
                    $scraper->inspectItemFromSewingList(
                        itemName: $itemName,
                        delayMs: $delayMs,
                        progress: fn (string $message) => $this->line($message)
                    ),
                ];
            } elseif ($setName !== '') {
                $results = $scraper->inspectSetFromSewingList(
                    requestedSetName: $setName,
                    delayMs: $delayMs,
                    progress: fn (string $message) => $this->line($message)
                );
            } elseif ($directUrl !== '') {
                $results = [
                    $scraper->inspectDetailUrl($directUrl),
                ];
            } else {
                $results = $scraper->scanFromSewingList(
                    delayMs: $delayMs,
                    limit: $limit,
                    fromSetName: $fromSetName !== '' ? $fromSetName : null,
                    progress: fn (string $message) => $this->line($message)
                );
            }
        } catch (Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        if ((bool) $this->option('only-empty')) {
            foreach ($results as &$result) {
                if (
                    $result['status'] === 'change'
                    && filled($result['current_fabric_type'])
                ) {
                    $result['status'] = 'skipped_existing';
                }
            }
            unset($result);
        }

        $changes = array_values(array_filter(
            $results,
            static fn (array $result): bool =>
                $result['status'] === 'change'
                && filled($result['equipment_id'])
                && filled($result['detected_fabric_type'])
        ));

        $this->displayChanges($changes);

        if ($changes === []) {
            $this->warn('更新対象はありません。');

            $logPath = $scraper->writeReport(
                results: $results,
                prefix: 'equipment-fabric-type-update',
                requestedFileName: $this->option('log')
            );

            $this->line('ログ: ' . $logPath);

            return self::SUCCESS;
        }

        if (
            !(bool) $this->option('force')
            && !$this->confirm(
                sprintf('%d件のfabric_typeを更新しますか？', count($changes))
            )
        ) {
            $this->warn('更新を中止しました。DBは変更していません。');

            foreach ($results as &$result) {
                if ($result['status'] === 'change') {
                    $result['status'] = 'cancelled';
                }
            }
            unset($result);

            $logPath = $scraper->writeReport(
                results: $results,
                prefix: 'equipment-fabric-type-update-cancelled',
                requestedFileName: $this->option('log')
            );

            $this->line('ログ: ' . $logPath);

            return self::SUCCESS;
        }

        try {
            $updatedIds = [];

            DB::transaction(function () use ($changes, &$updatedIds): void {
                foreach ($changes as $change) {
                    Equipment::query()
                        ->whereKey($change['equipment_id'])
                        ->update([
                            'fabric_type' => $change['detected_fabric_type'],
                        ]);

                    $updatedIds[(int) $change['equipment_id']] = true;
                }
            });

            foreach ($results as &$result) {
                $equipmentId = (int) ($result['equipment_id'] ?? 0);

                if (isset($updatedIds[$equipmentId])) {
                    $result['status'] = 'updated';
                    $result['current_fabric_type'] =
                        $result['detected_fabric_type'];
                }
            }
            unset($result);
        } catch (Throwable $e) {
            $this->error('DB更新に失敗しました: ' . $e->getMessage());

            foreach ($results as &$result) {
                if ($result['status'] === 'change') {
                    $result['status'] = 'update_failed';
                    $result['error'] = $e->getMessage();
                }
            }
            unset($result);

            $logPath = $scraper->writeReport(
                results: $results,
                prefix: 'equipment-fabric-type-update-failed',
                requestedFileName: $this->option('log')
            );

            $this->line('ログ: ' . $logPath);

            return self::FAILURE;
        }

        $logPath = $scraper->writeReport(
            results: $results,
            prefix: 'equipment-fabric-type-update',
            requestedFileName: $this->option('log')
        );

        $this->newLine();
        $this->info(sprintf('%d件更新しました。', count($changes)));
        $this->line('ログ: ' . $logPath);

        return self::SUCCESS;
    }

    /**
     * @param array<int, array<string, mixed>> $changes
     */
    private function displayChanges(array $changes): void
    {
        $rows = array_map(
            static fn (array $change): array => [
                $change['equipment_id'],
                $change['item_name'],
                $change['current_fabric_type'] ?: '-',
                $change['detected_fabric_type'],
                $change['characteristic'],
                $change['detail_url'],
            ],
            $changes
        );

        $this->table(
            ['ID', '装備名', '更新前', '更新後', '抽出した特性', '取得URL'],
            $rows
        );
    }
}
