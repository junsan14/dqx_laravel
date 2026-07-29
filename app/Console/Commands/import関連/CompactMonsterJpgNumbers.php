<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class CompactMonsterJpgNumbers extends Command
{
    protected $signature = 'monster:compact-jpg-numbers
                            {directory : 番号付きJPG画像が入っているフォルダ}
                            {--start= : 開始番号。未指定なら現在の最小番号を維持}
                            {--dry-run : 実際には変更せず、変更予定だけ表示する}';

    protected $description = '手動削除後に空いたJPG画像の番号を前へ詰める';

    public function handle(): int
    {
        $directory = $this->resolveDirectory((string) $this->argument('directory'));
        $dryRun = (bool) $this->option('dry-run');

        if (! File::isDirectory($directory)) {
            $this->error("フォルダが見つかりません: {$directory}");

            return self::FAILURE;
        }

        $files = collect(File::files($directory))
            ->filter(function ($file) {
                return strtolower($file->getExtension()) === 'jpg'
                    && ctype_digit($file->getFilenameWithoutExtension());
            })
            ->sortBy(fn ($file) => (int) $file->getFilenameWithoutExtension())
            ->values();

        if ($files->isEmpty()) {
            $this->warn('番号形式のJPG画像が見つかりませんでした。');
            $this->line('例: 949.jpg, 950.jpg, 951.jpg');

            return self::SUCCESS;
        }

        $startOption = $this->option('start');
        $start = $startOption === null || $startOption === ''
            ? (int) $files->first()->getFilenameWithoutExtension()
            : (int) $startOption;

        if ($start < 0) {
            $this->error('--startには0以上の番号を指定してください。');

            return self::FAILURE;
        }

        $changes = [];

        foreach ($files as $index => $file) {
            $currentNumber = (int) $file->getFilenameWithoutExtension();
            $newNumber = $start + $index;

            if ($currentNumber === $newNumber) {
                continue;
            }

            $changes[] = [
                'old_path' => $file->getPathname(),
                'old_name' => $file->getFilename(),
                'new_path' => $directory . DIRECTORY_SEPARATOR . $newNumber . '.jpg',
                'new_name' => $newNumber . '.jpg',
                'current_number' => $currentNumber,
                'new_number' => $newNumber,
            ];
        }

        if ($changes === []) {
            $this->info('番号に空きはありません。変更不要です。');

            return self::SUCCESS;
        }

        $this->info('番号を詰める予定');
        $this->table(
            ['変更前', '変更後'],
            collect($changes)
                ->map(fn (array $row) => [$row['old_name'], $row['new_name']])
                ->all()
        );

        if ($dryRun) {
            $this->warn('dry-runのため、ファイル名は変更していません。');

            return self::SUCCESS;
        }

        try {
            /*
             * 小さい番号から順に前へ詰めます。
             * 例: 951.jpg -> 950.jpg の後に 952.jpg -> 951.jpg。
             * 前方向への移動なので、対象フォルダ内に一時ファイルは作りません。
             */
            foreach ($changes as $change) {
                if (! File::exists($change['old_path'])) {
                    throw new RuntimeException(
                        "変更元ファイルが見つかりません: {$change['old_name']}"
                    );
                }

                if (File::exists($change['new_path'])) {
                    throw new RuntimeException(
                        "変更先がすでに存在します: {$change['new_name']}"
                    );
                }

                File::move($change['old_path'], $change['new_path']);
                $this->line("{$change['old_name']} → {$change['new_name']}");
            }
        } catch (Throwable $e) {
            $this->error('番号を詰める途中でエラーが発生しました。');
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->newLine();
        $this->info(count($changes) . '件のファイル名を変更しました。');

        return self::SUCCESS;
    }

    private function resolveDirectory(string $directory): string
    {
        $directory = trim($directory);

        if (
            Str::startsWith($directory, DIRECTORY_SEPARATOR)
            || preg_match('/^[A-Za-z]:[\\\\\/]/', $directory)
        ) {
            return rtrim($directory, '/\\');
        }

        return base_path(trim($directory, '/\\'));
    }
}
