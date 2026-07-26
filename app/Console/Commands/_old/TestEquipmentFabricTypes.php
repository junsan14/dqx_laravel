<?php

namespace App\Console\Commands;

use App\Services\EquipmentFabricTypeScraper;
use Illuminate\Console\Command;
use Throwable;

class TestEquipmentFabricTypes extends Command
{
    protected $signature = 'equipment:fabric-type:test
        {--item= : item_name完全一致で一覧サイトから1件だけ探す}
        {--set= : セット名を指定してセット内の全部位を対象にする}
        {--from-set= : 全件巡回を指定セットから開始する}
        {--url= : 部位詳細ページURLを直接1件確認する}
        {--limit= : 一覧巡回時に確認する部位数}
        {--delay=300 : リクエスト間隔（ミリ秒）}
        {--log= : storage/logs配下へ出力するファイル名}';

    protected $description =
        '極限攻略の裁縫装備一覧から布タイプを判定する（DBは更新しない）';

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

        $this->displayResults($results);

        $logPath = $scraper->writeReport(
            results: $results,
            prefix: 'equipment-fabric-type-test',
            requestedFileName: $this->option('log')
        );

        $this->newLine();
        $this->info('DBは更新していません。');
        $this->line('ログ: ' . $logPath);
        $this->displaySummary($results);

        return self::SUCCESS;
    }

    /**
     * @param array<int, array<string, mixed>> $results
     */
    private function displayResults(array $results): void
    {
        $rows = array_map(
            static fn (array $result): array => [
                $result['equipment_id'] ?? '-',
                $result['item_name'] ?: '-',
                $result['current_fabric_type'] ?: '-',
                $result['detected_fabric_type'] ?: '-',
                $result['characteristic'] ?: '-',
                $result['status'],
                $result['detail_url'] ?: '-',
                $result['error'] ?: '-',
            ],
            $results
        );

        $this->table(
            [
                'ID',
                '装備名',
                '現在',
                '判定',
                '抽出した特性',
                '状態',
                '取得URL',
                'エラー',
            ],
            $rows
        );
    }

    /**
     * @param array<int, array<string, mixed>> $results
     */
    private function displaySummary(array $results): void
    {
        $counts = array_count_values(array_map(
            static fn (array $result): string => (string) $result['status'],
            $results
        ));

        $summary = collect($counts)
            ->map(
                static fn (int $count, string $status): string =>
                    "{$status}: {$count}"
            )
            ->implode(' / ');

        $this->line('集計: ' . ($summary !== '' ? $summary : '0件'));
    }
}
