<?php

namespace App\Console\Commands;

use App\Models\Accessory;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class UpdateAccessoryImageUrlsToWebp extends Command
{
    protected $signature = 'accessories:update-image-urls-webp 
        {--dry-run : 実際には更新せず確認だけする}';

    protected $description = 'accessories.image_url を storage/images/accessories 配下の webp パスに更新する';

    public function handle(): int
    {
        $accessories = Accessory::query()
            ->whereNotNull('image_url')
            ->where('image_url', '!=', '')
            ->orderBy('id')
            ->get();

        if ($accessories->isEmpty()) {
            $this->info('更新対象のアクセサリがありません。');
            return self::SUCCESS;
        }

        $dryRun = (bool) $this->option('dry-run');

        $updated = 0;
        $skipped = 0;
        $missing = 0;

        foreach ($accessories as $accessory) {
            $currentUrl = trim((string) $accessory->image_url);

            $filename = $this->extractFilenameWithoutExtension($currentUrl);

            if ($filename === '') {
                $skipped++;
                $this->warn("SKIP: {$accessory->id} {$accessory->name} / filename not found");
                continue;
            }

            $relativePath = "images/accessories/{$filename}.webp";
            $publicUrl = Storage::url($relativePath);

            if (!Storage::disk('public')->exists($relativePath)) {
                $missing++;
                $this->warn("MISSING: {$accessory->id} {$accessory->name} / {$relativePath}");
                continue;
            }

            $this->line("{$accessory->id}: {$accessory->name}");
            $this->line("  {$currentUrl}");
            $this->line("  => {$publicUrl}");

            if (!$dryRun) {
                $accessory->update([
                    'image_url' => $publicUrl,
                ]);
            }

            $updated++;
        }

        $this->newLine();
        $this->info($dryRun ? '確認完了' : '更新完了');
        $this->line("更新対象: {$updated}");
        $this->line("スキップ: {$skipped}");
        $this->line("ファイルなし: {$missing}");

        return self::SUCCESS;
    }

    private function extractFilenameWithoutExtension(string $url): string
    {
        $path = parse_url($url, PHP_URL_PATH);

        if (!$path) {
            $path = $url;
        }

        $basename = basename($path);

        if ($basename === '' || $basename === '.' || $basename === '/') {
            return '';
        }

        return pathinfo($basename, PATHINFO_FILENAME);
    }
}