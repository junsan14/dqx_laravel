<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Throwable;

class InsertMonsterJpgImages extends Command
{
    protected $signature = 'monster:insert-jpg-images
                            {target : 元のモンスター画像フォルダ}
                            {insert : 追加画像を入れたフォルダ}
                            {--dry-run : 実際には変更せず確認だけする}
                            {--move : 追加画像をコピーではなく移動する}
                            {--no-compact : 差し込み後に空いた番号を詰めない}';

    protected $description =
        '追加フォルダ内の番号付きJPG画像を差し込み、既存画像を後ろへずらして空き番号を詰める';

    public function handle(): int
    {
        $targetDirectory = $this->resolveDirectory(
            (string) $this->argument('target')
        );

        $insertDirectory = $this->resolveDirectory(
            (string) $this->argument('insert')
        );

        $dryRun = (bool) $this->option('dry-run');
        $move = (bool) $this->option('move');
        $compact = ! (bool) $this->option('no-compact');

        if (! File::isDirectory($targetDirectory)) {
            $this->error(
                "元画像フォルダが見つかりません: {$targetDirectory}"
            );

            return self::FAILURE;
        }

        if (! File::isDirectory($insertDirectory)) {
            $this->error(
                "追加画像フォルダが見つかりません: {$insertDirectory}"
            );

            return self::FAILURE;
        }

        $insertFiles = collect(File::files($insertDirectory))
            ->map(function ($file) {
                $extension = strtolower($file->getExtension());
                $filename = $file->getFilenameWithoutExtension();

                if (
                    ! in_array($extension, ['jpg', 'jpeg'], true)
                    || ! ctype_digit($filename)
                ) {
                    return null;
                }

                return [
                    'path' => $file->getPathname(),
                    'name' => $file->getFilename(),
                    'number' => (int) $filename,
                ];
            })
            ->filter()
            ->sortBy('number')
            ->values();

        if ($insertFiles->isEmpty()) {
            $this->warn(
                '追加フォルダに番号形式のJPG画像がありません。'
            );

            $this->line('例: 950.jpg');

            return self::SUCCESS;
        }

        $this->info('追加予定の画像');

        $this->table(
            ['追加位置', 'ファイル名'],
            $insertFiles
                ->map(fn (array $row) => [
                    $row['number'],
                    $row['name'],
                ])
                ->all()
        );

        if ($dryRun) {
            foreach ($insertFiles as $insertFile) {
                $shiftCount = $this->getShiftTargetFiles(
                    $targetDirectory,
                    $insertFile['number']
                )->count();

                $this->line(
                    "{$insertFile['number']}.jpg を差し込み:"
                    . " {$insertFile['number']}番以降の"
                    . "{$shiftCount}件を1つ後ろへ移動"
                );
            }

            if ($compact) {
                $this->line(
                    '差し込み後、手動削除などで空いた番号を前へ詰めます。'
                );
            } else {
                $this->line(
                    '--no-compact指定のため、空き番号は詰めません。'
                );
            }

            $this->warn(
                'dry-runのため、ファイルは変更していません。'
            );

            return self::SUCCESS;
        }

        try {
            foreach ($insertFiles as $insertFile) {
                $this->insertImage(
                    targetDirectory: $targetDirectory,
                    sourcePath: $insertFile['path'],
                    insertNumber: $insertFile['number'],
                    move: $move,
                );
            }

            $compactedCount = 0;

            if ($compact) {
                $compactedCount = $this->compactNumbers(
                    $targetDirectory
                );
            }
        } catch (Throwable $e) {
            $this->error(
                '画像の差し込み中にエラーが発生しました。'
            );

            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->newLine();

        $this->info(
            $insertFiles->count()
            . '件の画像を差し込みました。'
        );

        if ($compact) {
            if ($compactedCount > 0) {
                $this->info(
                    "空き番号を詰め、{$compactedCount}件のファイル名を変更しました。"
                );
            } else {
                $this->line('空き番号はありませんでした。');
            }
        }

        if (! $move) {
            $this->line(
                '追加フォルダの元画像は残しています。'
            );
        }

        return self::SUCCESS;
    }

    private function insertImage(
        string $targetDirectory,
        string $sourcePath,
        int $insertNumber,
        bool $move
    ): void {
        /*
         * 大きい番号から順番に変更します。
         *
         * 例:
         * 952.jpg → 953.jpg
         * 951.jpg → 952.jpg
         * 950.jpg → 951.jpg
         *
         * この順番にすることでファイル名の衝突を防ぎます。
         */
        $shiftFiles = $this->getShiftTargetFiles(
            $targetDirectory,
            $insertNumber
        );

        foreach ($shiftFiles as $file) {
            $currentNumber = (int) $file->getFilenameWithoutExtension();
            $newNumber = $currentNumber + 1;

            $newPath = $targetDirectory
                . DIRECTORY_SEPARATOR
                . $newNumber
                . '.jpg';

            if (File::exists($newPath)) {
                throw new \RuntimeException(
                    "変更先がすでに存在します: {$newPath}"
                );
            }

            File::move(
                $file->getPathname(),
                $newPath
            );

            $this->line(
                "{$currentNumber}.jpg → {$newNumber}.jpg"
            );
        }

        $destinationPath = $targetDirectory
            . DIRECTORY_SEPARATOR
            . $insertNumber
            . '.jpg';

        if (File::exists($destinationPath)) {
            throw new \RuntimeException(
                "差し込み先がすでに存在します: {$destinationPath}"
            );
        }

        if ($move) {
            File::move($sourcePath, $destinationPath);
        } else {
            File::copy($sourcePath, $destinationPath);
        }

        $this->info(
            basename($sourcePath)
            . " → {$insertNumber}.jpg を差し込み"
        );
    }

    /**
     * 手動削除などで空いた番号を前へ詰めます。
     *
     * 例:
     * 949.jpg
     * 950.jpg
     * 952.jpg → 951.jpg
     * 953.jpg → 952.jpg
     */
    private function compactNumbers(string $directory): int
    {
        $files = $this->getNumberedJpgFiles($directory);

        if ($files->isEmpty()) {
            return 0;
        }

        $nextNumber = (int) $files->first()->getFilenameWithoutExtension();
        $changedCount = 0;

        foreach ($files as $file) {
            $currentNumber = (int) $file->getFilenameWithoutExtension();

            if ($currentNumber === $nextNumber) {
                $nextNumber++;
                continue;
            }

            $newPath = $directory
                . DIRECTORY_SEPARATOR
                . $nextNumber
                . '.jpg';

            if (File::exists($newPath)) {
                throw new \RuntimeException(
                    "番号詰めの変更先がすでに存在します: {$newPath}"
                );
            }

            File::move($file->getPathname(), $newPath);

            $this->line(
                "空き詰め: {$currentNumber}.jpg → {$nextNumber}.jpg"
            );

            $changedCount++;
            $nextNumber++;
        }

        return $changedCount;
    }

    private function getShiftTargetFiles(
        string $directory,
        int $insertNumber
    ) {
        return $this->getNumberedJpgFiles($directory)
            ->filter(function ($file) use ($insertNumber) {
                return (int) $file->getFilenameWithoutExtension()
                    >= $insertNumber;
            })
            ->sortByDesc(
                fn ($file) => (int) $file->getFilenameWithoutExtension()
            )
            ->values();
    }

    private function getNumberedJpgFiles(string $directory)
    {
        return collect(File::files($directory))
            ->filter(function ($file) {
                $extension = strtolower($file->getExtension());
                $filename = $file->getFilenameWithoutExtension();

                return in_array($extension, ['jpg', 'jpeg'], true)
                    && ctype_digit($filename);
            })
            ->sortBy(
                fn ($file) => (int) $file->getFilenameWithoutExtension()
            )
            ->values();
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

        return base_path(
            trim($directory, '/\\')
        );
    }
}
