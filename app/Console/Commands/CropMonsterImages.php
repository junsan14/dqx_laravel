<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use RuntimeException;
use Throwable;

class CropMonsterImages extends Command
{
    protected $signature = 'monster:crop-images
                        {directory=monsters : storage/app/public 配下の入力フォルダ}
                        {--file= : 処理するWebPファイル名}
                        {--output=cropped : 入力フォルダ内に作る出力フォルダ名}
                        {--quality=90 : WebPの保存品質（0〜100）}
                        {--overwrite : 出力済み画像を上書きする}
                        {--dry-run : 実際には保存せず処理内容だけ確認する}';

    protected $description =
        'フロントと同じ位置・範囲でモンスターWebP画像を正方形に切り抜く';

    /**
     * フロントの DEFAULT_AUTO_CROP と同じ値
     */
    private const CENTER_X_RATIO = 0.35;

    private const CENTER_Y_RATIO = 0.438;

    private const SIZE_RATIO = 1.0;

    private const ZOOM = 1.8;

    public function handle(): int
    {
        if (
            ! function_exists('imagecreatefromwebp')
            || ! function_exists('imagewebp')
        ) {
            $this->error(
                'GDのWebPサポートが有効ではありません。php-gdを確認してください。'
            );

            return self::FAILURE;
        }

        $directory = trim((string) $this->argument('directory'), '/');
        $outputName = trim((string) $this->option('output'), '/');
        $quality = max(0, min(100, (int) $this->option('quality')));
        $overwrite = (bool) $this->option('overwrite');
        $dryRun = (bool) $this->option('dry-run');

        if ($directory === '') {
            $this->error('入力フォルダを指定してください。');

            return self::FAILURE;
        }

        if ($outputName === '') {
            $this->error('--output にフォルダ名を指定してください。');

            return self::FAILURE;
        }

        $sourceDirectory = storage_path(
            'app/public/' . $directory
        );

        $outputDirectory = $sourceDirectory
            . DIRECTORY_SEPARATOR
            . $outputName;

        if (! File::isDirectory($sourceDirectory)) {
            $this->error(
                "入力フォルダが見つかりません: {$sourceDirectory}"
            );

            return self::FAILURE;
        }

        /*
         * 入力フォルダ直下のWebPだけを対象にする。
         * croppedフォルダ内は対象にならない。
         */
        $targetFileName = trim((string) $this->option('file'));

        $files = collect(File::files($sourceDirectory))
            ->filter(
                fn ($file) => strtolower($file->getExtension()) === 'webp'
            )
            ->when(
                $targetFileName !== '',
                fn ($collection) => $collection->filter(
                    fn ($file) => $file->getFilename() === $targetFileName
                )
            )
            ->sortBy(
                fn ($file) => $file->getFilename(),
                SORT_NATURAL | SORT_FLAG_CASE
            )
            ->values();
        if ($files->isEmpty()) {
    if ($targetFileName !== '') {
        $this->error(
            "指定した画像が見つかりません: {$sourceDirectory}/{$targetFileName}"
        );

        return self::FAILURE;
    }

    $this->warn(
        "WebP画像が見つかりません: {$sourceDirectory}"
    );

    return self::SUCCESS;
}

        if (! $dryRun && ! File::isDirectory($outputDirectory)) {
            File::makeDirectory(
                $outputDirectory,
                0755,
                true
            );
        }

        $this->info("入力: {$sourceDirectory}");
        $this->info("出力: {$outputDirectory}");
        $this->info('対象: ' . $files->count() . '件');

        if ($dryRun) {
            $this->warn(
                'dry-runのため、画像ファイルは保存しません。'
            );
        }

        $success = 0;
        $skipped = 0;
        $failed = 0;

        foreach ($files as $file) {
            $sourcePath = $file->getPathname();

            $destinationPath = $outputDirectory
                . DIRECTORY_SEPARATOR
                . $file->getFilename();

            if (! $overwrite && File::exists($destinationPath)) {
                $this->line(
                    "<comment>SKIP</comment> {$file->getFilename()}（出力済み）"
                );

                $skipped++;

                continue;
            }

            try {
                [
                    $x,
                    $y,
                    $cropSize,
                    $originalWidth,
                    $originalHeight,
                ] = $this->calculateCropArea($sourcePath);

                if ($dryRun) {
                    $this->line(sprintf(
                        '<info>DRY</info>  %s  %dx%d → x:%d y:%d size:%d',
                        $file->getFilename(),
                        $originalWidth,
                        $originalHeight,
                        $x,
                        $y,
                        $cropSize
                    ));

                    $success++;

                    continue;
                }

                $this->cropAndSave(
                    sourcePath: $sourcePath,
                    destinationPath: $destinationPath,
                    x: $x,
                    y: $y,
                    size: $cropSize,
                    quality: $quality,
                );

                $this->line(sprintf(
                    '<info>OK</info>   %s  %dx%d → %dx%d',
                    $file->getFilename(),
                    $originalWidth,
                    $originalHeight,
                    $cropSize,
                    $cropSize
                ));

                $success++;
            } catch (Throwable $e) {
                $this->line(
                    "<error>FAIL</error> {$file->getFilename()}：{$e->getMessage()}"
                );

                $failed++;
            }
        }

        $this->newLine();

        $this->table(
            ['成功', 'スキップ', '失敗'],
            [
                [$success, $skipped, $failed],
            ]
        );

        return $failed > 0
            ? self::FAILURE
            : self::SUCCESS;
    }

    /**
     * フロントの getDefaultAccessoryAreaPixels() と同じ計算。
     *
     * @return array{
     *     0:int,
     *     1:int,
     *     2:int,
     *     3:int,
     *     4:int
     * }
     */
    private function calculateCropArea(string $sourcePath): array
    {
        $imageSize = @getimagesize($sourcePath);

        if ($imageSize === false) {
            throw new RuntimeException(
                '画像サイズを取得できません。'
            );
        }

        [$width, $height] = $imageSize;

        if ($width <= 0 || $height <= 0) {
            throw new RuntimeException(
                '画像サイズが不正です。'
            );
        }

        $centerX = $width * self::CENTER_X_RATIO;
        $centerY = $height * self::CENTER_Y_RATIO;
        $zoom = max(1.0, self::ZOOM);

        $baseSize = min($width, $height)
            * self::SIZE_RATIO;

        $sizeFloat = $baseSize / $zoom;
        $half = $sizeFloat / 2;

        $xFloat = $centerX - $half;
        $yFloat = $centerY - $half;

        $xFloat = max(
            0.0,
            min($xFloat, $width - $sizeFloat)
        );

        $yFloat = max(
            0.0,
            min($yFloat, $height - $sizeFloat)
        );

        $cropSize = max(
            1,
            (int) round($sizeFloat)
        );

        $x = (int) round($xFloat);
        $y = (int) round($yFloat);

        /*
         * 丸め処理によって1pxだけ画像外に出る場合を防ぐ。
         */
        $x = max(
            0,
            min($x, $width - $cropSize)
        );

        $y = max(
            0,
            min($y, $height - $cropSize)
        );

        return [
            $x,
            $y,
            $cropSize,
            $width,
            $height,
        ];
    }

    private function cropAndSave(
        string $sourcePath,
        string $destinationPath,
        int $x,
        int $y,
        int $size,
        int $quality,
    ): void {
        $sourceImage = @imagecreatefromwebp(
            $sourcePath
        );

        if ($sourceImage === false) {
            throw new RuntimeException(
                'WebP画像を読み込めません。'
            );
        }

        $croppedImage = null;

        try {
            $croppedImage = imagecrop(
                $sourceImage,
                [
                    'x' => $x,
                    'y' => $y,
                    'width' => $size,
                    'height' => $size,
                ]
            );

            if ($croppedImage === false) {
                throw new RuntimeException(
                    '画像の切り抜きに失敗しました。'
                );
            }

            /*
             * 透明部分があるWebPにも対応。
             */
            imagealphablending(
                $croppedImage,
                false
            );

            imagesavealpha(
                $croppedImage,
                true
            );

            $saved = imagewebp(
                $croppedImage,
                $destinationPath,
                $quality
            );

            if (! $saved) {
                throw new RuntimeException(
                    'WebP画像の保存に失敗しました。'
                );
            }
        } finally {
            if (
                $croppedImage !== null
                && $croppedImage !== false
            ) {
                imagedestroy($croppedImage);
            }

            imagedestroy($sourceImage);
        }
    }
}