<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Throwable;

class RenameMonsterImages extends Command
{
    protected $signature = 'monster:rename-images
                            {directory : 画像フォルダのパス}
                            {--start=941 : 開始番号}
                            {--dry-run : ファイル名を変更せず確認だけ行う}';

    protected $description = 'WebP形式のモンスター画像を指定番号から連番へ変更する';

    public function handle(): int
    {
        $inputDirectory = trim((string) $this->argument('directory'));
        $startNumber = (int) $this->option('start');
        $dryRun = (bool) $this->option('dry-run');

        if ($startNumber < 1) {
            $this->error('--startには1以上の番号を指定してください。');

            return self::FAILURE;
        }

        $directory = $this->resolveDirectory($inputDirectory);

        if (! File::isDirectory($directory)) {
            $this->error("フォルダが見つかりません: {$directory}");

            return self::FAILURE;
        }

        /*
         * 現在のファイル名を自然順に並べます。
         *
         * 例:
         * monster1.webp
         * monster2.webp
         * monster10.webp
         */
        $files = collect(File::files($directory))
            ->filter(
                fn ($file) => strtolower($file->getExtension()) === 'webp'
            )
            ->sort(
                fn ($a, $b) => strnatcasecmp(
                    $a->getFilename(),
                    $b->getFilename()
                )
            )
            ->values();

        if ($files->isEmpty()) {
            $this->warn('WebPファイルが見つかりませんでした。');

            return self::SUCCESS;
        }

        $renameList = $files->map(function ($file, $index) use (
            $directory,
            $startNumber
        ) {
            $number = $startNumber + $index;
            $newName = "{$number}.webp";

            return [
                'old_path' => $file->getPathname(),
                'old_name' => $file->getFilename(),
                'new_path' => $directory . DIRECTORY_SEPARATOR . $newName,
                'new_name' => $newName,
                'temp_path' => null,
            ];
        })->all();

        $this->newLine();
        $this->info('変更予定のファイル名');

        $this->table(
            ['No.', '変更前', '変更後'],
            collect($renameList)
                ->map(fn ($row, $index) => [
                    $index + 1,
                    $row['old_name'],
                    $row['new_name'],
                ])
                ->all()
        );

        if ($dryRun) {
            $this->warn('dry-runのため、ファイル名は変更していません。');

            return self::SUCCESS;
        }

        /*
         * 941.webpなどが既に存在する場合の衝突を防ぐため、
         * 一度すべて一時ファイル名へ変更してから連番へ変更します。
         */
        try {
            foreach ($renameList as $index => $row) {
                $tempPath = $directory
                    . DIRECTORY_SEPARATOR
                    . '.monster_tmp_'
                    . Str::uuid()
                    . '.webp';

                File::move($row['old_path'], $tempPath);

                $renameList[$index]['temp_path'] = $tempPath;
            }

            foreach ($renameList as $row) {
                if (File::exists($row['new_path'])) {
                    throw new \RuntimeException(
                        "変更先ファイルが既に存在します: {$row['new_name']}"
                    );
                }

                File::move($row['temp_path'], $row['new_path']);
            }
        } catch (Throwable $e) {
            $this->error('ファイル名の変更中にエラーが発生しました。');
            $this->error($e->getMessage());

            $this->restoreFiles($renameList);

            return self::FAILURE;
        }

        $this->newLine();
        $this->info(
            count($renameList)
            . "件の画像を{$startNumber}.webpから連番に変更しました。"
        );

        return self::SUCCESS;
    }

    private function resolveDirectory(string $directory): string
    {
        if (
            Str::startsWith($directory, DIRECTORY_SEPARATOR)
            || preg_match('/^[A-Za-z]:[\\\\\/]/', $directory)
        ) {
            return rtrim($directory, DIRECTORY_SEPARATOR);
        }

        return base_path(
            trim($directory, '/\\')
        );
    }

    private function restoreFiles(array $renameList): void
    {
        foreach ($renameList as $row) {
            $tempPath = $row['temp_path'] ?? null;

            if (
                $tempPath
                && File::exists($tempPath)
                && ! File::exists($row['old_path'])
            ) {
                File::move($tempPath, $row['old_path']);
                continue;
            }

            if (
                File::exists($row['new_path'])
                && ! File::exists($row['old_path'])
            ) {
                File::move($row['new_path'], $row['old_path']);
            }
        }
    }
}