<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Throwable;

class RenameMonsterJpgImages extends Command
{
    protected $signature = 'monster:rename-jpg-images
                            {directory : JPG画像が入っているフォルダ}
                            {--start=961 : 開始番号}
                            {--dry-run : 実際には変更せず確認だけする}';

    protected $description = 'JPG形式のモンスター画像を961.jpgから連番に変更する';

    public function handle(): int
    {
        $directory = $this->resolveDirectory(
            (string) $this->argument('directory')
        );

        $start = (int) $this->option('start');
        $dryRun = (bool) $this->option('dry-run');

        if (! File::isDirectory($directory)) {
            $this->error("フォルダが見つかりません: {$directory}");

            return self::FAILURE;
        }

        $files = collect(File::files($directory))
            ->filter(function ($file) {
                return strtolower($file->getExtension()) === 'jpg';
            })
            ->sort(function ($a, $b) {
                return strnatcasecmp(
                    $a->getFilename(),
                    $b->getFilename()
                );
            })
            ->values();

        if ($files->isEmpty()) {
            $this->warn('JPGファイルが見つかりませんでした。');

            return self::SUCCESS;
        }

        $renameList = $files->map(function ($file, $index) use (
            $directory,
            $start
        ) {
            $newName = ($start + $index) . '.jpg';

            return [
                'old_path' => $file->getPathname(),
                'old_name' => $file->getFilename(),
                'new_path' => $directory . DIRECTORY_SEPARATOR . $newName,
                'new_name' => $newName,
                'temp_path' => null,
            ];
        })->all();

        $this->table(
            ['変更前', '変更後'],
            collect($renameList)
                ->map(fn ($row) => [
                    $row['old_name'],
                    $row['new_name'],
                ])
                ->all()
        );

        if ($dryRun) {
            $this->warn('dry-runのため変更していません。');

            return self::SUCCESS;
        }

        try {
            // ファイル名の衝突を避けるため、いったん一時名に変更
            foreach ($renameList as $index => $row) {
                $tempPath = $directory
                    . DIRECTORY_SEPARATOR
                    . '.monster_tmp_'
                    . Str::uuid()
                    . '.jpg';

                File::move($row['old_path'], $tempPath);

                $renameList[$index]['temp_path'] = $tempPath;
            }

            // 一時名から961.jpg以降へ変更
            foreach ($renameList as $row) {
                if (File::exists($row['new_path'])) {
                    throw new \RuntimeException(
                        "変更先がすでに存在します: {$row['new_name']}"
                    );
                }

                File::move($row['temp_path'], $row['new_path']);
            }
        } catch (Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info(
            count($renameList)
            . "件を{$start}.jpgから連番に変更しました。"
        );

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