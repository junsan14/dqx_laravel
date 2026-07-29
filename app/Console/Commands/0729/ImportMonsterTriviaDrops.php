<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

class ImportMonsterTriviaDrops extends Command
{
    protected $signature = 'monster:import-trivia-drops
                            {csv=storage/app/imports/monster_trivia_drops_941_1851_trivia2_complete.csv : インポートするCSVファイルのパス}
                            {--dry-run : DBを変更せず、更新内容と不足データだけ確認する}';

    protected $description =
        'CSVのmonster IDを使って、まめちしき1・2と通常／レアドロップを更新する';

    /** @var array<int, array<string, mixed>> */
    private array $missingMonsters = [];

    /** @var array<int, array<string, mixed>> */
    private array $monsterNameMismatches = [];

    /** @var array<int, array<string, mixed>> */
    private array $missingItems = [];

    /** @var array<int, array<string, mixed>> */
    private array $duplicateItems = [];

    /** @var array<int, array<string, mixed>> */
    private array $emptyTrivia1 = [];

    /** @var array<int, array<string, mixed>> */
    private array $emptyTrivia2 = [];

    /** @var array<int, array<string, mixed>> */
    private array $errors = [];

    private int $updatedMonsterCount = 0;

    private int $syncedDropMonsterCount = 0;

    private int $insertedDropCount = 0;

    public function handle(): int
    {
        try {
            $csvPath = $this->resolveCsvPath((string) $this->argument('csv'));
            $rows = $this->readCsv($csvPath);
        } catch (Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');

        $this->info('CSV: ' . $csvPath);
        $this->info('対象件数: ' . count($rows) . '件');

        if ($dryRun) {
            $this->warn('DRY RUN: データベースは変更しません。');
        }

        $bar = $this->output->createProgressBar(count($rows));
        $bar->start();

        foreach ($rows as $rowNumber => $row) {
            $this->processRow($row, $rowNumber + 2, $dryRun);
            $bar->advance();
        }

        $bar->finish();
        $this->newLine(2);

        $this->printSummary($dryRun);

        return empty($this->errors) ? self::SUCCESS : self::FAILURE;
    }

    /**
     * @param array<string, string> $row
     */
    private function processRow(array $row, int $csvRowNumber, bool $dryRun): void
    {
        $monsterId = (int) ($row['id'] ?? 0);
        $csvMonsterName = $this->cleanText($row['monster_name'] ?? '');

        if ($monsterId <= 0) {
            $this->errors[] = [
                'row' => $csvRowNumber,
                'message' => 'idが空、または不正です。',
            ];

            return;
        }

        $monster = DB::table('monsters')
            ->where('id', $monsterId)
            ->first(['id', 'name']);

        if ($monster === null) {
            $this->missingMonsters[] = [
                'row' => $csvRowNumber,
                'id' => $monsterId,
                'csv_name' => $csvMonsterName,
            ];

            return;
        }

        $dbMonsterName = $this->cleanText((string) $monster->name);

        // IDを最優先にするが、名前が違う場合は誤更新防止のため処理しない。
        if ($csvMonsterName !== '' && $dbMonsterName !== $csvMonsterName) {
            $this->monsterNameMismatches[] = [
                'row' => $csvRowNumber,
                'id' => $monsterId,
                'csv_name' => $csvMonsterName,
                'db_name' => $dbMonsterName,
            ];

            return;
        }

        $trivia1 = $this->nullableText($row['trivia_1'] ?? '');
        $trivia2 = $this->nullableText($row['trivia_2'] ?? '');

        if ($trivia1 === null) {
            $this->emptyTrivia1[] = [
                'row' => $csvRowNumber,
                'monster_id' => $monsterId,
                'monster_name' => $dbMonsterName,
            ];
        }

        if ($trivia2 === null) {
            $this->emptyTrivia2[] = [
                'row' => $csvRowNumber,
                'monster_id' => $monsterId,
                'monster_name' => $dbMonsterName,
            ];
        }

        $dropDefinitions = [
            [
                'drop_type' => 'normal',
                'label' => '通常ドロップ',
                'item_name' => $this->cleanText($row['normal_drop'] ?? ''),
                'sort_order' => 1,
            ],
            [
                'drop_type' => 'rare',
                'label' => 'レアドロップ',
                'item_name' => $this->cleanText($row['rare_drop'] ?? ''),
                'sort_order' => 2,
            ],
        ];

        $resolvedDrops = [];
        $canSyncDrops = true;

        foreach ($dropDefinitions as $drop) {
            if ($drop['item_name'] === '') {
                continue;
            }

            $itemMatches = DB::table('items')
                ->where('name', $drop['item_name'])
                ->orderBy('id')
                ->limit(2)
                ->get(['id', 'name']);

            if ($itemMatches->isEmpty()) {
                $this->missingItems[] = [
                    'row' => $csvRowNumber,
                    'monster_id' => $monsterId,
                    'monster_name' => $dbMonsterName,
                    'drop_type' => $drop['drop_type'],
                    'drop_label' => $drop['label'],
                    'item_name' => $drop['item_name'],
                ];
                $canSyncDrops = false;
                continue;
            }

            if ($itemMatches->count() >= 2) {
                $this->duplicateItems[] = [
                    'row' => $csvRowNumber,
                    'monster_id' => $monsterId,
                    'monster_name' => $dbMonsterName,
                    'drop_type' => $drop['drop_type'],
                    'item_name' => $drop['item_name'],
                    'item_ids' => $itemMatches->pluck('id')->implode(', '),
                ];
                $canSyncDrops = false;
                continue;
            }

            $item = $itemMatches->first();

            $resolvedDrops[] = [
                'monster_id' => $monsterId,
                'drop_target_type' => 'item',
                'drop_target_id' => (int) $item->id,
                'drop_type' => $drop['drop_type'],
                'sort_order' => $drop['sort_order'],
                'item_name' => (string) $item->name,
                'label' => $drop['label'],
            ];
        }

        try {
            if (!$dryRun) {
                DB::transaction(function () use (
                    $monsterId,
                    $trivia1,
                    $trivia2,
                    $resolvedDrops,
                    $canSyncDrops
                ): void {
                    DB::table('monsters')
                        ->where('id', $monsterId)
                        ->update([
                            'trivia_1' => $trivia1,
                            'trivia_2' => $trivia2,
                            'updated_at' => now(),
                        ]);

                    if (!$canSyncDrops) {
                        return;
                    }

                    // 通常／レアのitem行だけを置き換える。
                    // equipment・orb・accessoryなど、ほかのドロップは残す。
                    DB::table('monster_drops')
                        ->where('monster_id', $monsterId)
                        ->where('drop_target_type', 'item')
                        ->whereIn('drop_type', ['normal', 'rare'])
                        ->delete();

                    foreach ($resolvedDrops as $drop) {
                        DB::table('monster_drops')->insert([
                            'monster_id' => $drop['monster_id'],
                            'drop_target_type' => $drop['drop_target_type'],
                            'drop_target_id' => $drop['drop_target_id'],
                            'drop_type' => $drop['drop_type'],
                            'sort_order' => $drop['sort_order'],
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                    }
                });
            }

            $this->updatedMonsterCount++;

            if ($canSyncDrops) {
                $this->syncedDropMonsterCount++;
                $this->insertedDropCount += count($resolvedDrops);
            }

            $prefix = $dryRun ? '[DRY RUN] ' : '';

            $this->newLine();
            $this->line(sprintf(
                '%s[%d %s] monstersテーブルに trivia_1「%s」 trivia_2「%s」を%s。',
                $prefix,
                $monsterId,
                $dbMonsterName,
                $this->logText($trivia1),
                $this->logText($trivia2),
                $dryRun ? '入れる予定です' : '入れました'
            ));

            if (!$canSyncDrops) {
                $this->warn(sprintf(
                    '[%d %s] itemsテーブルで解決できないドロップがあるため、monster_dropsは変更していません。',
                    $monsterId,
                    $dbMonsterName
                ));

                return;
            }

            if ($resolvedDrops === []) {
                $this->line(sprintf(
                    '%s[%d %s] monster_dropsの通常／レアアイテムドロップを空に%s。',
                    $prefix,
                    $monsterId,
                    $dbMonsterName,
                    $dryRun ? 'する予定です' : 'しました'
                ));

                return;
            }

            $dropLog = collect($resolvedDrops)
                ->map(fn (array $drop): string => sprintf(
                    '%s「%s」(items.id=%d)',
                    $drop['label'],
                    $drop['item_name'],
                    $drop['drop_target_id']
                ))
                ->implode('、');

            $this->line(sprintf(
                '%s[%d %s] monster_dropsテーブルに %s を%s。',
                $prefix,
                $monsterId,
                $dbMonsterName,
                $dropLog,
                $dryRun ? '入れる予定です' : '入れました'
            ));
        } catch (Throwable $e) {
            $this->errors[] = [
                'row' => $csvRowNumber,
                'id' => $monsterId,
                'name' => $dbMonsterName,
                'message' => $e->getMessage(),
            ];
        }
    }

    private function printSummary(bool $dryRun): void
    {
        $this->info($dryRun ? '=== DRY RUN 結果 ===' : '=== インポート結果 ===');
        $this->line('trivia更新' . ($dryRun ? '予定' : '済み') . ': ' . $this->updatedMonsterCount . '件');
        $this->line('ドロップ同期' . ($dryRun ? '予定' : '済み') . ': ' . $this->syncedDropMonsterCount . 'モンスター');
        $this->line('ドロップ登録' . ($dryRun ? '予定' : '済み') . ': ' . $this->insertedDropCount . '件');

        $this->printIssueTable(
            'trivia_1が空欄のモンスター: ' . count($this->emptyTrivia1) . '件',
            ['CSV行', 'monster_id', 'モンスター名'],
            array_map(
                fn (array $row): array => [
                    $row['row'],
                    $row['monster_id'],
                    $row['monster_name'],
                ],
                $this->emptyTrivia1
            )
        );

        $this->printIssueTable(
            'trivia_2が空欄のモンスター: ' . count($this->emptyTrivia2) . '件',
            ['CSV行', 'monster_id', 'モンスター名'],
            array_map(
                fn (array $row): array => [
                    $row['row'],
                    $row['monster_id'],
                    $row['monster_name'],
                ],
                $this->emptyTrivia2
            )
        );

        $this->printIssueTable(
            'monstersテーブルに存在しないID: ' . count($this->missingMonsters) . '件',
            ['CSV行', 'monster_id', 'CSVの名前'],
            array_map(
                fn (array $row): array => [$row['row'], $row['id'], $row['csv_name']],
                $this->missingMonsters
            )
        );

        $this->printIssueTable(
            'IDは存在するがモンスター名が一致しない行: ' . count($this->monsterNameMismatches) . '件',
            ['CSV行', 'monster_id', 'CSVの名前', 'DBの名前'],
            array_map(
                fn (array $row): array => [
                    $row['row'],
                    $row['id'],
                    $row['csv_name'],
                    $row['db_name'],
                ],
                $this->monsterNameMismatches
            )
        );

        $this->printIssueTable(
            'itemsテーブルに存在しないアイテム: ' . count($this->missingItems) . '件',
            ['CSV行', 'monster_id', 'モンスター名', '種別', 'アイテム名'],
            array_map(
                fn (array $row): array => [
                    $row['row'],
                    $row['monster_id'],
                    $row['monster_name'],
                    $row['drop_label'],
                    $row['item_name'],
                ],
                $this->missingItems
            )
        );

        $this->printIssueTable(
            'items.nameが重複してIDを特定できないアイテム: ' . count($this->duplicateItems) . '件',
            ['CSV行', 'monster_id', 'モンスター名', '種別', 'アイテム名', '候補ID'],
            array_map(
                fn (array $row): array => [
                    $row['row'],
                    $row['monster_id'],
                    $row['monster_name'],
                    $row['drop_type'],
                    $row['item_name'],
                    $row['item_ids'],
                ],
                $this->duplicateItems
            )
        );

        $this->printIssueTable(
            '処理エラー: ' . count($this->errors) . '件',
            ['CSV行', 'monster_id', '名前', 'エラー'],
            array_map(
                fn (array $row): array => [
                    $row['row'] ?? '',
                    $row['id'] ?? '',
                    $row['name'] ?? '',
                    $row['message'] ?? '',
                ],
                $this->errors
            )
        );
    }

    /**
     * @param array<int, string> $headers
     * @param array<int, array<int, mixed>> $rows
     */
    private function printIssueTable(string $title, array $headers, array $rows): void
    {
        if ($rows === []) {
            $this->info($title);

            return;
        }

        $this->newLine();
        $this->warn($title);
        $this->table($headers, $rows);
    }

    /**
     * @return array<int, array<string, string>>
     */
    private function readCsv(string $path): array
    {
        $handle = fopen($path, 'rb');

        if ($handle === false) {
            throw new RuntimeException('CSVを開けません: ' . $path);
        }

        try {
            $header = fgetcsv($handle, 0, ',', '"', '\\');

            if ($header === false) {
                throw new RuntimeException('CSVのヘッダーを読み取れません。');
            }

            $header = array_map(function ($value): string {
                $value = (string) $value;
                $value = preg_replace('/^\xEF\xBB\xBF/', '', $value) ?? $value;

                return trim($value);
            }, $header);

            $requiredColumns = [
                'id',
                'monster_name',
                'normal_drop',
                'rare_drop',
                'trivia_1',
                'trivia_2',
            ];

            $missingColumns = array_values(array_diff($requiredColumns, $header));

            if ($missingColumns !== []) {
                throw new RuntimeException(
                    'CSVに必要な列がありません: ' . implode(', ', $missingColumns)
                );
            }

            $rows = [];

            while (($values = fgetcsv($handle, 0, ',', '"', '\\')) !== false) {
                if ($values === [null] || $values === []) {
                    continue;
                }

                $values = array_pad($values, count($header), '');
                $values = array_slice($values, 0, count($header));
                $row = array_combine($header, $values);

                if ($row === false) {
                    continue;
                }

                /** @var array<string, string> $row */
                $rows[] = $row;
            }

            return $rows;
        } finally {
            fclose($handle);
        }
    }

    private function resolveCsvPath(string $input): string
    {
        $input = trim($input);

        if ($input === '') {
            throw new RuntimeException('CSVパスが空です。');
        }

        $candidates = [];

        if ($this->isAbsolutePath($input)) {
            $candidates[] = $input;
        } else {
            $candidates[] = base_path($input);
            $candidates[] = storage_path('app/' . ltrim($input, '/'));
            $candidates[] = storage_path(ltrim($input, '/'));
        }

        foreach (array_unique($candidates) as $candidate) {
            if (is_file($candidate) && is_readable($candidate)) {
                $realPath = realpath($candidate);

                return $realPath !== false ? $realPath : $candidate;
            }
        }

        throw new RuntimeException(
            "CSVが見つかりません。指定値: {$input}\n確認したパス:\n- " .
            implode("\n- ", $candidates)
        );
    }

    private function isAbsolutePath(string $path): bool
    {
        return str_starts_with($path, '/')
            || preg_match('/^[A-Za-z]:[\\\\\/]/', $path) === 1;
    }

    private function cleanText(?string $value): string
    {
        $value = (string) $value;
        $value = preg_replace('/^\xEF\xBB\xBF/', '', $value) ?? $value;
        $value = str_replace(["\r\n", "\r", "\n"], ' ', $value);
        $value = preg_replace('/[\x{00A0}\x{3000}]+/u', ' ', $value) ?? $value;
        $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

        return trim($value);
    }

    private function nullableText(?string $value): ?string
    {
        $value = $this->cleanText($value);

        return $value === '' ? null : $value;
    }

    private function logText(?string $value): string
    {
        return $value === null || $value === '' ? '空欄' : $value;
    }
}
