<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ImportDbCommand extends Command
{
    protected $signature = 'import:db
        {target : Table name or CSV filename. Example: accessories or accessories_20260505_093754.csv}
        {--file= : CSV path under storage/app. Example: exports/accessories_20260505_093754.csv}
        {--key= : Upsert key column. Example: item_id, boss_id, name}
        {--csv-excludes-id : Use this when CSV does not contain id column}
        {--keep-id : Insert/update id from CSV. Usually not recommended}
        {--fresh : Delete all rows from the target table before importing}
        {--yes : Skip confirmation prompts}
        {--dry-run : Check only, do not write}';

    protected $description = 'Import latest table CSV into database. Example: php artisan import:db accessories';

    public function handle(): int
    {
        $target = $this->argument('target');
        $dryRun = (bool) $this->option('dry-run');
        $keepId = (bool) $this->option('keep-id');
        $csvExcludesId = (bool) $this->option('csv-excludes-id');
        $fresh = (bool) $this->option('fresh');
        $yes = (bool) $this->option('yes');

        $file = $this->option('file');
        $table = null;

        if ($file) {
            $file = trim($file, '/');
            $table = $this->guessTableFromFile(basename($file));
        } elseif (str_ends_with($target, '.csv')) {
            $file = "exports/{$target}";
            $table = $this->guessTableFromFile($target);
        } else {
            $table = $target;
            $file = $this->findLatestCsvForTable($table);
        }

        if (! $table) {
            $this->error('Could not guess table name.');
            return self::FAILURE;
        }

        if (! Schema::hasTable($table)) {
            $this->error("Table not found: {$table}");
            return self::FAILURE;
        }

        if (! $file) {
            $this->error("CSV file not found for table: {$table}");
            $this->line("Expected pattern: storage/app/exports/{$table}_*.csv");
            return self::FAILURE;
        }

        $path = storage_path("app/{$file}");

        if (! file_exists($path)) {
            $this->error("CSV file not found: {$path}");
            return self::FAILURE;
        }

        $tableColumns = Schema::getColumnListing($table);

        if (empty($tableColumns)) {
            $this->error("No columns found in table: {$table}");
            return self::FAILURE;
        }

        $key = $this->option('key') ?: $this->guessKeyColumn($tableColumns);

        if (! $key) {
            $this->error('Could not guess upsert key.');
            $this->line('Please use --key=item_id or --key=name etc.');
            return self::FAILURE;
        }

        if (! in_array($key, $tableColumns, true)) {
            $this->error("Key column '{$key}' does not exist in {$table}.");
            return self::FAILURE;
        }

        $handle = fopen($path, 'r');

        if (! $handle) {
            $this->error("Could not open file: {$path}");
            return self::FAILURE;
        }

        $firstLine = fgetcsv($handle);

        if ($firstLine === false) {
            fclose($handle);
            $this->error('CSV is empty.');
            return self::FAILURE;
        }

        $hasHeader = $this->looksLikeHeader($firstLine, $tableColumns);

        if ($hasHeader) {
            $csvColumns = $firstLine;
            $this->info('Header row detected.');
        } else {
            $csvColumns = $tableColumns;

            if ($csvExcludesId) {
                $csvColumns = array_values(array_filter($csvColumns, function ($column) {
                    return $column !== 'id';
                }));
            }

            rewind($handle);
        }

        $missingColumns = array_values(array_diff($csvColumns, $tableColumns));

        if (! empty($missingColumns)) {
            fclose($handle);
            $this->error('CSV has columns that do not exist in table:');
            $this->line(implode(', ', $missingColumns));
            return self::FAILURE;
        }

        if (! in_array($key, $csvColumns, true)) {
            fclose($handle);
            $this->error("Key column '{$key}' is not included in CSV columns.");
            return self::FAILURE;
        }

        $totalCsvRows = $this->countCsvRows($path, $hasHeader);

        $this->info("Table: {$table}");
        $this->info("File: storage/app/{$file}");
        $this->info("Key: {$key}");
        $this->info('CSV columns: ' . implode(', ', $csvColumns));
        $this->info("CSV rows: {$totalCsvRows}");

        if (! $keepId && in_array('id', $csvColumns, true)) {
            $this->warn('id column exists in CSV, but it will be ignored.');
            $this->warn('Use --keep-id only if you really want to import id.');
        }

        if ($fresh) {
            $currentCount = DB::table($table)->count();

            $this->warn("Fresh import mode is enabled.");
            $this->warn("Target table will be initialized before import: {$table}");
            $this->warn("Current rows in {$table}: {$currentCount}");

            if ($dryRun) {
                $this->warn('Dry run mode. Table will NOT be initialized.');
            } elseif (! $yes) {
                $confirmed = $this->confirm(
                    "該当テーブル「{$table}」を初期化してインポートしますか？",
                    false
                );

                if (! $confirmed) {
                    fclose($handle);
                    $this->warn('Cancelled.');
                    return self::SUCCESS;
                }
            }
        }

        if ($dryRun) {
            $this->warn('Dry run mode. No data will be written.');
        }

        $created = 0;
        $updated = 0;
        $skipped = 0;
        $lineNumber = $hasHeader ? 1 : 0;

        DB::beginTransaction();

        try {
            if ($fresh && ! $dryRun) {
                $this->initializeTable($table);
            }

            while (($values = fgetcsv($handle)) !== false) {
                $lineNumber++;

                if ($this->isEmptyCsvRow($values)) {
                    $skipped++;
                    continue;
                }

                if (count($values) !== count($csvColumns)) {
                    throw new \RuntimeException(
                        "Invalid column count on line {$lineNumber}. Expected "
                        . count($csvColumns)
                        . ', actual '
                        . count($values)
                        . '. Values: '
                        . json_encode($values, JSON_UNESCAPED_UNICODE)
                    );
                }

                $row = array_combine($csvColumns, $values);

                if (empty($row[$key])) {
                    $skipped++;
                    continue;
                }

                $data = $this->normalizeRowForDb($row, $tableColumns);

                if (! $keepId) {
                    unset($data['id']);
                }

                if (in_array('updated_at', $tableColumns, true)) {
                    $data['updated_at'] = now();
                }

                if (
                    in_array('created_at', $tableColumns, true)
                    && empty($data['created_at'])
                ) {
                    $data['created_at'] = now();
                }

                if ($fresh) {
                    $created++;

                    if (! $dryRun) {
                        DB::table($table)->insert($data);
                    }

                    continue;
                }

                $exists = DB::table($table)
                    ->where($key, $row[$key])
                    ->exists();

                if ($exists) {
                    $updated++;

                    if (! $dryRun) {
                        DB::table($table)
                            ->where($key, $row[$key])
                            ->update($data);
                    }
                } else {
                    $created++;

                    if (! $dryRun) {
                        DB::table($table)->insert($data);
                    }
                }
            }

            fclose($handle);

            if ($dryRun) {
                DB::rollBack();
            } else {
                DB::commit();
            }

            $this->info("Created: {$created}");
            $this->info("Updated: {$updated}");
            $this->info("Skipped: {$skipped}");

            if ($fresh && ! $dryRun) {
                $this->info("Table initialized and imported: {$table}");
            }

            return self::SUCCESS;
        } catch (\Throwable $e) {
            DB::rollBack();

            if (is_resource($handle)) {
                fclose($handle);
            }

            $this->error($e->getMessage());

            return self::FAILURE;
        }
    }

private function initializeTable(string $table): void
{
    DB::statement('SET FOREIGN_KEY_CHECKS=0');

    try {
        DB::table($table)->delete();

        // 注意:
        // ALTER TABLE ... AUTO_INCREMENT = 1 は MySQL で暗黙的に transaction を終了する。
        // そのため fresh import の transaction 中では実行しない。
    } finally {
        DB::statement('SET FOREIGN_KEY_CHECKS=1');
    }
}

    private function isMysql(): bool
    {
        return DB::connection()->getDriverName() === 'mysql';
    }

    private function countCsvRows(string $path, bool $hasHeader): int
    {
        $handle = fopen($path, 'r');

        if (! $handle) {
            return 0;
        }

        $count = 0;
        $line = 0;

        while (($values = fgetcsv($handle)) !== false) {
            $line++;

            if ($hasHeader && $line === 1) {
                continue;
            }

            if ($this->isEmptyCsvRow($values)) {
                continue;
            }

            $count++;
        }

        fclose($handle);

        return $count;
    }

    private function findLatestCsvForTable(string $table): ?string
    {
        $dir = storage_path('app/exports');

        $files = glob("{$dir}/{$table}_*.csv") ?: [];

        if (empty($files)) {
            return null;
        }

        usort($files, function ($a, $b) {
            return filemtime($b) <=> filemtime($a);
        });

        return 'exports/' . basename($files[0]);
    }

    private function guessTableFromFile(string $file): ?string
    {
        $baseName = pathinfo($file, PATHINFO_FILENAME);

        // accessories_20260505_093754
        $baseName = preg_replace('/_\d{8}_\d{6}$/', '', $baseName);

        // optional names from older exports
        $baseName = preg_replace('/_no_header_no_id$/', '', $baseName);
        $baseName = preg_replace('/_no_header$/', '', $baseName);
        $baseName = preg_replace('/_no_id$/', '', $baseName);

        return $baseName ?: null;
    }

    private function guessKeyColumn(array $columns): ?string
    {
        $candidates = [
            'item_id',
            'equipment_id',
            'game_job_id',
            'boss_id',
            'monster_id',
            'map_id',
            'slug',
            'key',
            'name',
            'id',
        ];

        foreach ($candidates as $candidate) {
            if (in_array($candidate, $columns, true)) {
                return $candidate;
            }
        }

        return null;
    }

    private function looksLikeHeader(array $firstLine, array $tableColumns): bool
    {
        if (empty($firstLine)) {
            return false;
        }

        $matched = 0;

        foreach ($firstLine as $value) {
            if (in_array($value, $tableColumns, true)) {
                $matched++;
            }
        }

        return $matched >= max(1, floor(count($firstLine) * 0.6));
    }

    private function isEmptyCsvRow(array $values): bool
    {
        foreach ($values as $value) {
            if ($value !== null && $value !== '') {
                return false;
            }
        }

        return true;
    }

    private function normalizeRowForDb(array $row, array $tableColumns): array
    {
        $data = [];

        foreach ($row as $column => $value) {
            if (! in_array($column, $tableColumns, true)) {
                continue;
            }

            if ($value === '') {
                $data[$column] = null;
                continue;
            }

            $data[$column] = $value;
        }

        return $data;
    }
}