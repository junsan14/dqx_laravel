<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class SyncBossMonsterIds extends Command
{
    private const DEFAULT_WIKI_URL = 'https://wikiwiki.jp/dq10dic2nd/%E3%83%A2%E3%83%B3%E3%82%B9%E3%82%BF%E3%83%BC/%E5%9B%B3%E9%91%91%E9%A0%86%E4%B8%80%E8%A6%A7%EF%BC%88%E3%83%9C%E3%82%B9%EF%BC%89';

    protected $signature = 'dq10:sync-boss-monster-ids
        {--dry-run : DBと画像を変更せず、更新計画だけ表示する}
        {--force : 本番環境でも確認なしで実行する}
        {--html= : Wikiから取得せず、ローカルHTMLファイルを使用する}
        {--wiki-url= : 取得元URLを変更する}
        {--image-dir= : 画像の実体ディレクトリ。既定は public/storage/images/monsters}
        {--skip-images : 画像ファイル名を変更しない。DBのimage_pathは変更される}';

    protected $description = 'ボスモンスターをWikiの図鑑順に照合し、既存データを更新し、未登録データを新規追加する';

    /** @var array<int, array{source:string,temp:string,final:string}> */
    private array $stagedImages = [];

    public function handle(): int
    {
        try {
            $entries = $this->loadWikiEntries();
            $this->validateWikiEntries($entries);

            $plan = $this->buildPlan($entries);
            $this->printPlan($plan);

            if ($this->option('dry-run')) {
                $this->info('dry-runのため変更していません。');
                $this->printCreateLog($plan['creates'], true);

                return self::SUCCESS;
            }

            if ($plan['assignments'] === [] && $plan['creates'] === []) {
                $this->warn('更新・新規追加対象がありません。');

                return self::SUCCESS;
            }

            if (
                app()->environment('production')
                && ! $this->option('force')
                && ! $this->confirm('本番DBの主キーID・画像ファイル名を変更し、未登録ボスを新規追加します。実行しますか？')
            ) {
                $this->warn('中止しました。');

                return self::SUCCESS;
            }

            $this->executePlan($plan);

            try {
                $this->resetAutoIncrement();
            } catch (Throwable $e) {
                $this->warn('ID更新は完了しましたが、AUTO_INCREMENTの再設定に失敗しました: ' . $e->getMessage());
            }

            $this->newLine();
            $this->info('ボスモンスターのID・display_order・画像パスを更新しました。');
            $this->printCreateLog($plan['creates'], false);

            return self::SUCCESS;
        } catch (Throwable $e) {
            $this->newLine();
            $this->error($e->getMessage());

            if ($this->output->isVerbose()) {
                $this->line($e->getTraceAsString());
            }

            return self::FAILURE;
        }
    }

    /**
     * @return array<int, array{target_id:int,name:string}>
     */
    private function loadWikiEntries(): array
    {
        $htmlPath = trim((string) $this->option('html'));

        if ($htmlPath !== '') {
            if (! File::exists($htmlPath)) {
                throw new RuntimeException("HTMLファイルが見つかりません: {$htmlPath}");
            }

            $html = File::get($htmlPath);
        } else {
            $url = trim((string) $this->option('wiki-url')) ?: self::DEFAULT_WIKI_URL;
            $this->line("Wiki取得中: {$url}");

            $response = Http::retry(3, 800)
                ->timeout(30)
                ->withHeaders([
                    'User-Agent' => 'Mozilla/5.0 (compatible; DQXMonsterOrderSync/1.0)',
                    'Accept-Language' => 'ja,en;q=0.8',
                ])
                ->get($url);

            if (! $response->successful()) {
                throw new RuntimeException("Wikiの取得に失敗しました。HTTP {$response->status()}");
            }

            $html = $response->body();
        }

        return $this->parseBossEntries($html);
    }

    /**
     * @return array<int, array{target_id:int,name:string}>
     */
    private function parseBossEntries(string $html): array
    {
        if (! preg_match(
            '/<h2\b[^>]*>.*?ボスモンスター一覧.*?<\/h2>(.*?)(?=<h2\b)/isu',
            $html,
            $sectionMatch
        )) {
            throw new RuntimeException('Wikiの「ボスモンスター一覧」区間を取得できませんでした。');
        }

        $section = $sectionMatch[1];

        if (! preg_match_all(
            '/<h3\b[^>]*>(.*?)<\/h3>|<li\b[^>]*>(.*?)<\/li>/isu',
            $section,
            $matches,
            PREG_SET_ORDER
        )) {
            throw new RuntimeException('Wikiの見出し・一覧を解析できませんでした。');
        }

        $nextId = null;
        $rangeEnd = null;
        $entries = [];

        foreach ($matches as $match) {
            $headingHtml = $match[1] ?? '';
            $itemHtml = $match[2] ?? '';

            if ($headingHtml !== '') {
                $text = $this->htmlToText($headingHtml);

                if (! preg_match('/(\d+)\s*[～〜~－-]\s*(\d+)/u', $text, $rangeMatch)) {
                    $nextId = null;
                    $rangeEnd = null;
                    continue;
                }

                if ($nextId !== null && $rangeEnd !== null && $nextId !== $rangeEnd + 1) {
                    throw new RuntimeException(
                        'Wikiの区間件数が見出しと一致しません。直前の次番号: ' . $nextId
                    );
                }

                $nextId = (int) $rangeMatch[1];
                $rangeEnd = (int) $rangeMatch[2];
                continue;
            }

            if ($itemHtml === '' || $nextId === null || $rangeEnd === null) {
                continue;
            }

            if ($nextId > $rangeEnd) {
                throw new RuntimeException("Wikiの {$rangeEnd} までの区間に項目が多すぎます。");
            }

            $name = $this->extractMonsterName($this->htmlToText($itemHtml));

            if ($name === '') {
                continue;
            }

            $entries[] = [
                'target_id' => $nextId,
                'name' => $name,
            ];

            $nextId++;
        }

        if ($nextId !== null && $rangeEnd !== null && $nextId !== $rangeEnd + 1) {
            throw new RuntimeException(
                "Wiki最終区間の件数が一致しません。{$rangeEnd} まで必要ですが、次番号は {$nextId} です。"
            );
        }

        return $entries;
    }

    private function htmlToText(string $html): string
    {
        return $this->cleanText(strip_tags($html));
    }

    private function extractMonsterName(string $text): string
    {
        $name = preg_split('/\s*→\s*/u', $text, 2)[0] ?? '';
        $name = preg_replace('/^[\s　・*]+|[\s　]+$/u', '', $name) ?? '';
        $name = preg_replace('/^[〖【\[]+|[〗】\]]+$/u', '', $name) ?? '';

        return trim($name);
    }

    private function cleanText(?string $value): string
    {
        $value = html_entity_decode((string) $value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $value = preg_replace('/[\r\n\t]+/u', ' ', $value) ?? $value;
        $value = preg_replace('/[\s　]+/u', ' ', $value) ?? $value;

        return trim($value);
    }

    /**
     * @param array<int, array{target_id:int,name:string}> $entries
     */
    private function validateWikiEntries(array $entries): void
    {
        if ($entries === []) {
            throw new RuntimeException('Wikiからボス一覧を取得できませんでした。');
        }

        $first = $entries[0];
        $last = $entries[array_key_last($entries)];

        if ($first['target_id'] !== 941 || $first['name'] !== '若葉の精霊') {
            throw new RuntimeException(
                "先頭が想定と違います: {$first['target_id']} {$first['name']}"
            );
        }

        if ($last['target_id'] < 941) {
            throw new RuntimeException('Wikiの最終番号が不正です。');
        }

        $expectedCount = $last['target_id'] - 941 + 1;

        if (count($entries) !== $expectedCount) {
            throw new RuntimeException(
                'Wikiの番号が連続していません。件数: ' . count($entries) . " / 想定: {$expectedCount}"
            );
        }

        $this->info(
            "Wiki一覧: {$first['target_id']} {$first['name']} ～ {$last['target_id']} {$last['name']}（" . count($entries) . '件）'
        );
    }

    /**
     * @param array<int, array{target_id:int,name:string}> $entries
     * @return array{
     *   assignments:array<int, array{old_id:int,target_id:int,name:string,old_display_order:int,image_path:?string}>,
     *   creates:array<int, array{target_id:int,name:string}>,
     *   blockers:array<int, array{old_id:int,target_id:int,name:string,old_display_order:int,image_path:?string}>,
     *   moves:array<int,int>,
     *   target_display_orders:array<int,int>,
     *   rows_by_id:array<int,object>
     * }
     */
    private function buildPlan(array $entries): array
    {
        $rows = DB::table('monsters')
            ->select(['id', 'display_order', 'name', 'image_path'])
            ->orderBy('display_order')
            ->orderBy('id')
            ->get();

        $queues = [];
        $rowsById = [];

        foreach ($rows as $row) {
            $id = (int) $row->id;
            $key = $this->normalizeName($row->name);
            $queues[$key][] = $row;
            $rowsById[$id] = $row;
        }

        $assignments = [];
        $creates = [];
        $assignedOldIds = [];

        foreach ($entries as $entry) {
            $key = $this->normalizeName($entry['name']);
            if (empty($queues[$key])) {
                $creates[] = $entry;
                continue;
            }

            $row = array_shift($queues[$key]);

            $oldId = (int) $row->id;
            $assignments[] = [
                'old_id' => $oldId,
                'target_id' => $entry['target_id'],
                'name' => (string) $row->name,
                'old_display_order' => (int) $row->display_order,
                'image_path' => $row->image_path,
            ];
            $assignedOldIds[$oldId] = true;
        }

        $targetIds = array_values(array_unique(array_merge(
            array_column($assignments, 'target_id'),
            array_column($creates, 'target_id')
        )));
        $maxExistingId = $rows->max(fn ($row) => (int) $row->id) ?? 0;
        $maxTargetId = $targetIds === [] ? 0 : max($targetIds);
        $nextFreeId = max($maxExistingId, $maxTargetId) + 1;

        $blockers = [];

        foreach ($targetIds as $targetId) {
            $occupant = $rowsById[$targetId] ?? null;

            if (! $occupant || isset($assignedOldIds[(int) $occupant->id])) {
                continue;
            }

            $blockers[] = [
                'old_id' => (int) $occupant->id,
                'target_id' => $nextFreeId++,
                'name' => (string) $occupant->name,
                'old_display_order' => (int) $occupant->display_order,
                'image_path' => $occupant->image_path,
            ];
            $assignedOldIds[(int) $occupant->id] = true;
        }

        $moves = [];
        $targetDisplayOrders = [];

        foreach ($assignments as $assignment) {
            $targetDisplayOrders[$assignment['target_id']] = $assignment['target_id'];

            if ($assignment['old_id'] !== $assignment['target_id']) {
                $moves[$assignment['old_id']] = $assignment['target_id'];
            }
        }

        foreach ($blockers as $blocker) {
            $moves[$blocker['old_id']] = $blocker['target_id'];
        }

        if (count(array_unique(array_values($moves))) !== count($moves)) {
            throw new RuntimeException('移動先IDが重複しています。処理を中止しました。');
        }

        return compact(
            'assignments',
            'creates',
            'blockers',
            'moves',
            'targetDisplayOrders',
            'rowsById'
        );
    }

    private function normalizeName(?string $name): string
    {
        $name = $this->cleanText($name);

        if (class_exists(\Normalizer::class)) {
            $name = \Normalizer::normalize($name, \Normalizer::FORM_KC) ?: $name;
        }

        $name = mb_convert_kana($name, 'asKV', 'UTF-8');
        $name = preg_replace('/[\s　]+/u', '', $name) ?? $name;

        return mb_strtolower($name, 'UTF-8');
    }

    /** @param array<string,mixed> $plan */
    private function printPlan(array $plan): void
    {
        $assignments = $plan['assignments'];
        $changedIds = array_filter(
            $assignments,
            fn (array $row) => $row['old_id'] !== $row['target_id']
        );
        $changedOrders = array_filter(
            $assignments,
            fn (array $row) => $row['old_display_order'] !== $row['target_id']
        );

        $this->newLine();
        $this->table(
            ['項目', '件数'],
            [
                ['WikiとDBで一致', count($assignments)],
                ['DBへ新規追加', count($plan['creates'])],
                ['IDを変更するボス', count($changedIds)],
                ['display_order変更', count($changedOrders)],
                ['対象IDを使用中の別モンスター', count($plan['blockers'])],
            ]
        );

        if ($plan['creates'] !== []) {
            $this->warn('DBに存在しないボスは、次の内容で新規追加します。');
            $this->table(
                ['ID', 'display_order', '名前', 'image_path'],
                array_map(
                    fn (array $row) => [
                        $row['target_id'],
                        $row['target_id'],
                        $row['name'],
                        $this->dbImagePath($row['target_id']),
                    ],
                    array_slice($plan['creates'], 0, 50)
                )
            );

            if (count($plan['creates']) > 50) {
                $this->line('※ 新規追加予定は50件まで表示しています。');
            }
        }

        if ($plan['blockers'] !== []) {
            $this->warn('対象IDを使用している別モンスターは、最大IDより後ろへ移動します。');
            $this->table(
                ['旧ID', '移動先ID', '名前', 'display_order'],
                array_map(
                    fn (array $row) => [
                        $row['old_id'],
                        $row['target_id'],
                        $row['name'],
                        $row['old_display_order'],
                    ],
                    array_slice($plan['blockers'], 0, 50)
                )
            );
        }

        $sample = array_slice($assignments, 0, 15);
        $this->info('更新例');
        $this->table(
            ['名前', '旧ID', '新ID', '旧display_order', '新display_order'],
            array_map(
                fn (array $row) => [
                    $row['name'],
                    $row['old_id'],
                    $row['target_id'],
                    $row['old_display_order'],
                    $row['target_id'],
                ],
                $sample
            )
        );
    }

    /**
     * @param array<int, array{target_id:int,name:string}> $creates
     */
    private function printCreateLog(array $creates, bool $dryRun): void
    {
        $this->newLine();

        if ($creates === []) {
            $this->info('新規追加が必要なボスはありません。');

            return;
        }

        $message = $dryRun
            ? 'DB未登録のため新規追加予定のボス'
            : 'DB未登録だったため新規追加したボス';

        $this->warn($message . ': ' . count($creates) . '件');
        $this->table(
            ['ID', 'display_order', '名前', 'image_path'],
            array_map(
                fn (array $row) => [
                    $row['target_id'],
                    $row['target_id'],
                    $row['name'],
                    $this->dbImagePath($row['target_id']),
                ],
                $creates
            )
        );
    }

    /** @param array<string,mixed> $plan */
    private function executePlan(array $plan): void
    {
        $references = $this->loadForeignKeyReferences();
        $moves = $plan['moves'];
        $rowsById = $plan['rowsById'];
        $targetDisplayOrders = $plan['targetDisplayOrders'];

        $maxFinalId = max(
            array_merge(
                [0],
                array_map('intval', array_keys($rowsById)),
                array_map('intval', array_values($moves))
            )
        );
        $nextTempId = $maxFinalId + 100000;
        $tempMoves = [];

        foreach ($moves as $oldId => $finalId) {
            while (isset($rowsById[$nextTempId]) || in_array($nextTempId, $moves, true)) {
                $nextTempId++;
            }

            $tempMoves[(int) $oldId] = $nextTempId++;
        }

        try {
            $this->stageImageFiles($moves, $rowsById, $plan['assignments']);
        } catch (Throwable $e) {
            $this->restoreImageFiles();
            throw $e;
        }

        DB::beginTransaction();

        try {
            DB::statement('SET FOREIGN_KEY_CHECKS=0');

            foreach ($tempMoves as $oldId => $tempId) {
                $this->moveMonsterId($oldId, $tempId, $references, null);
            }

            foreach ($tempMoves as $oldId => $tempId) {
                $finalId = (int) $moves[$oldId];
                $displayOrder = $targetDisplayOrders[$finalId] ?? null;
                $this->moveMonsterId($tempId, $finalId, $references, $displayOrder);
            }

            foreach ($plan['assignments'] as $assignment) {
                if ($assignment['old_id'] !== $assignment['target_id']) {
                    continue;
                }

                $updates = [
                    'display_order' => $assignment['target_id'],
                ];

                $updates['image_path'] = $this->dbImagePath($assignment['target_id']);

                if (Schema::hasColumn('monsters', 'updated_at')) {
                    $updates['updated_at'] = now();
                }

                DB::table('monsters')
                    ->where('id', $assignment['target_id'])
                    ->update($updates);
            }

            foreach ($plan['creates'] as $entry) {
                $this->insertMissingMonster($entry);
            }

            $this->finalizeImageFiles();
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
            DB::commit();
        } catch (Throwable $e) {
            try {
                DB::statement('SET FOREIGN_KEY_CHECKS=1');
            } catch (Throwable) {
                // 元の例外を優先する。
            }

            DB::rollBack();
            $this->restoreImageFiles();

            throw $e;
        }
    }

    /**
     * @param array{target_id:int,name:string} $entry
     */
    private function insertMissingMonster(array $entry): void
    {
        $id = (int) $entry['target_id'];

        if (DB::table('monsters')->where('id', $id)->exists()) {
            throw new RuntimeException(
                "新規追加先IDが使用中です: ID {$id} / {$entry['name']}"
            );
        }

        $now = now();

        $row = [
            'id' => $id,
            'display_order' => $id,
            'name' => $entry['name'],
            'image_path' => $this->dbImagePath($id),
            'is_reincarnated' => false,
        ];

        $nullableColumns = [
            'name_kana',
            'name_en',
            'system_type',
            'system_type_en',
            'reincarnation_parent_id',
            'source_url',
            'trivia_1',
            'trivia_2',
        ];

        foreach ($nullableColumns as $column) {
            if (Schema::hasColumn('monsters', $column)) {
                $row[$column] = null;
            }
        }

        if (Schema::hasColumn('monsters', 'created_at')) {
            $row['created_at'] = $now;
        }

        if (Schema::hasColumn('monsters', 'updated_at')) {
            $row['updated_at'] = $now;
        }

        DB::table('monsters')->insert($row);
    }

    /**
     * @return array<int, array{table:string,column:string}>
     */
    private function loadForeignKeyReferences(): array
    {
        $database = DB::getDatabaseName();

        return DB::table('information_schema.KEY_COLUMN_USAGE')
            ->where('TABLE_SCHEMA', $database)
            ->where('REFERENCED_TABLE_SCHEMA', $database)
            ->where('REFERENCED_TABLE_NAME', 'monsters')
            ->where('REFERENCED_COLUMN_NAME', 'id')
            ->get(['TABLE_NAME', 'COLUMN_NAME'])
            ->map(fn ($row) => [
                'table' => (string) $row->TABLE_NAME,
                'column' => (string) $row->COLUMN_NAME,
            ])
            ->values()
            ->all();
    }

    /**
     * @param array<int, array{table:string,column:string}> $references
     */
    private function moveMonsterId(
        int $fromId,
        int $toId,
        array $references,
        ?int $displayOrder
    ): void {
        if ($fromId === $toId) {
            return;
        }

        $row = DB::table('monsters')
            ->where('id', $fromId)
            ->first(['id', 'image_path']);

        if (! $row) {
            throw new RuntimeException("移動元モンスターが見つかりません: ID {$fromId}");
        }

        if (DB::table('monsters')->where('id', $toId)->exists()) {
            throw new RuntimeException("移動先IDが使用中です: ID {$toId}");
        }

        foreach ($references as $reference) {
            DB::table($reference['table'])
                ->where($reference['column'], $fromId)
                ->update([$reference['column'] => $toId]);
        }

        $this->updatePolymorphicReferences($fromId, $toId);

        $updates = ['id' => $toId];

        if ($displayOrder !== null) {
            $updates['display_order'] = $displayOrder;
        }

        $updates['image_path'] = $this->dbImagePath($toId);

        if (Schema::hasColumn('monsters', 'updated_at')) {
            $updates['updated_at'] = now();
        }

        DB::table('monsters')
            ->where('id', $fromId)
            ->update($updates);
    }

    private function updatePolymorphicReferences(int $fromId, int $toId): void
    {
        if (
            ! Schema::hasTable('content_reports')
            || ! Schema::hasColumn('content_reports', 'reportable_type')
            || ! Schema::hasColumn('content_reports', 'reportable_id')
        ) {
            return;
        }

        DB::table('content_reports')
            ->where('reportable_id', $fromId)
            ->whereIn('reportable_type', [
                'monster',
                'App\\Models\\Monster',
            ])
            ->update(['reportable_id' => $toId]);
    }

    /**
     * @param array<int,int> $moves
     * @param array<int,object> $rowsById
     * @param array<int, array{old_id:int,target_id:int,name:string,old_display_order:int,image_path:?string}> $assignments
     */
    private function stageImageFiles(
        array $moves,
        array $rowsById,
        array $assignments
    ): void {
        if ($this->option('skip-images')) {
            $this->warn('--skip-images: 画像ファイル名は変更しません。');
            return;
        }

        $directory = $this->imageDirectory();

        if (! File::isDirectory($directory)) {
            throw new RuntimeException("画像ディレクトリが見つかりません: {$directory}");
        }

        /*
         * 通常のID変更に加えて、前回実行時にDBのIDだけ変更され、
         * image_pathが旧IDのファイル名を指したままのケースも修復する。
         */
        $imageMoves = [];

        foreach ($moves as $oldId => $finalId) {
            $oldId = (int) $oldId;
            $finalId = (int) $finalId;

            if ($oldId !== $finalId) {
                $imageMoves[$oldId] = $finalId;
            }
        }

        foreach ($assignments as $assignment) {
            $targetId = (int) $assignment['target_id'];
            $pathId = $this->extractImageId($assignment['image_path'] ?? null);

            if ($pathId !== null && $pathId !== $targetId) {
                if (
                    isset($imageMoves[$pathId])
                    && (int) $imageMoves[$pathId] !== $targetId
                ) {
                    throw new RuntimeException(
                        "画像ファイルの移動先が競合しています: {$pathId}.webp"
                    );
                }

                $imageMoves[$pathId] = $targetId;
            }
        }

        $sourceIds = array_map('intval', array_keys($imageMoves));

        foreach ($imageMoves as $sourceId => $finalId) {
            $sourceId = (int) $sourceId;
            $finalId = (int) $finalId;

            if ($sourceId === $finalId) {
                continue;
            }

            $source = $directory . DIRECTORY_SEPARATOR . $sourceId . '.webp';
            $final = $directory . DIRECTORY_SEPARATOR . $finalId . '.webp';

            if (! File::exists($source)) {
                $this->warn("画像が見つからないためDBパスだけ変更: {$source}");
                continue;
            }

            if (File::exists($final) && ! in_array($finalId, $sourceIds, true)) {
                throw new RuntimeException(
                    "移動先に未管理の画像があります: {$final}。削除または移動してから再実行してください。"
                );
            }

            $temp = $directory
                . DIRECTORY_SEPARATOR
                . '.boss-sync-'
                . Str::uuid()
                . "-{$sourceId}.tmp";

            if (! File::move($source, $temp)) {
                throw new RuntimeException("画像を一時退避できません: {$source}");
            }

            $this->stagedImages[] = compact('source', 'temp', 'final');
        }
    }

    private function extractImageId(mixed $path): ?int
    {
        if (! is_string($path) || trim($path) === '') {
            return null;
        }

        $urlPath = parse_url(trim($path), PHP_URL_PATH);
        $basename = basename(is_string($urlPath) ? $urlPath : trim($path));

        if (! preg_match('/^(\\d+)\\.webp$/i', $basename, $matches)) {
            return null;
        }

        $id = (int) $matches[1];

        return $id > 0 ? $id : null;
    }

    private function finalizeImageFiles(): void
    {
        foreach ($this->stagedImages as $image) {
            if (File::exists($image['final'])) {
                throw new RuntimeException("画像の移動先が使用中です: {$image['final']}");
            }

            if (! File::move($image['temp'], $image['final'])) {
                throw new RuntimeException("画像を最終IDへ移動できません: {$image['final']}");
            }
        }
    }

    private function restoreImageFiles(): void
    {
        foreach (array_reverse($this->stagedImages) as $image) {
            try {
                if (File::exists($image['final']) && ! File::exists($image['source'])) {
                    File::move($image['final'], $image['source']);
                    continue;
                }

                if (File::exists($image['temp']) && ! File::exists($image['source'])) {
                    File::move($image['temp'], $image['source']);
                }
            } catch (Throwable) {
                // DBロールバックを妨げない。
            }
        }
    }

    private function imageDirectory(): string
    {
        $option = trim((string) $this->option('image-dir'));

        return $option !== ''
            ? rtrim($option, DIRECTORY_SEPARATOR)
            : public_path('storage/images/monsters');
    }

    private function dbImagePath(int $id): string
    {
        return "/storage/images/monsters/{$id}.webp";
    }

    private function resetAutoIncrement(): void
    {
        $next = ((int) DB::table('monsters')->max('id')) + 1;
        DB::statement("ALTER TABLE monsters AUTO_INCREMENT = {$next}");
        $this->line("AUTO_INCREMENTを {$next} に設定しました。");
    }
}
