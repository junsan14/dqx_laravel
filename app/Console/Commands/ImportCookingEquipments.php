<?php

namespace App\Console\Commands;

use DOMDocument;
use DOMElement;
use DOMNode;
use DOMXPath;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

class ImportCookingEquipments extends Command
{
    private const VERSION = '2026-08-06-partial-write-v5';

    private const JSON_FLAGS = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

    private const KANA_OVERRIDES = [
        'メガもり丼' => 'めがもりどん',
        'ほくほく肉じゃが' => 'ほくほくにくじゃが',
    ];

    protected $signature = 'equipment:import-cooking
                            {--dry-run : DBへ保存せず、登録予定だけ表示する（既定動作）}
                            {--write : DBへ実際に保存する}
                            {--craft-product-type-id=38 : 料理に使用する craft_product_types.id}
                            {--only= : 指定した料理名だけ処理する}
                            {--limit=0 : 先頭から処理する件数。0は全件}
                            {--recipe-url=https://xn--10-yg4a1a3kyh.jp/dq10_artisan_recipe71.html : 料理・素材一覧URL}
                            {--grid-url=http://www.dq10data.com/guild_cooking.html : 調理数値一覧URL}
                            {--insecure : TLS証明書を検証しない}';

    protected $description = '料理一覧と調理数値を取得し、itemsを照合してequipmentsへ登録する';

    public function handle(): int
    {
        $this->line('ImportCookingEquipments version: '.self::VERSION);

        if ($this->option('dry-run') && $this->option('write')) {
            $this->error('--dry-run と --write は同時に指定できません。');

            return self::INVALID;
        }

        $dryRun = ! $this->option('write');
        $craftProductTypeId = (int) $this->option('craft-product-type-id');
        $recipeUrl = (string) $this->option('recipe-url');
        $gridUrl = (string) $this->option('grid-url');

        if ($craftProductTypeId <= 0) {
            $this->error('--craft-product-type-id は1以上で指定してください。');

            return self::INVALID;
        }

        if (! DB::table('craft_product_types')->where('id', $craftProductTypeId)->exists()) {
            $this->error("craft_product_types.id={$craftProductTypeId} が存在しません。");

            return self::FAILURE;
        }

        $this->info($dryRun ? 'DRY-RUN: DBは変更しません。' : 'WRITE MODE: DBへ保存します。');
        $this->line("craft_product_type_id: {$craftProductTypeId}");
        $this->line("料理・素材: {$recipeUrl}");
        $this->line("大成功範囲: {$gridUrl}");

        try {
            $recipeHtml = $this->fetchHtml($recipeUrl);
            $recipes = $this->parseRecipes($recipeHtml);

            if ($recipes === []) {
                throw new RuntimeException('料理一覧を1件も解析できませんでした。HTML構造を確認してください。');
            }

            // --only / --limit 使用時でも数値表との掲載順照合には全料理を使う。
            $allRecipes = $recipes;

            $only = trim((string) $this->option('only'));
            if ($only !== '') {
                $recipes = array_values(array_filter(
                    $recipes,
                    fn (array $recipe): bool => $this->normalizeKey($recipe['name']) === $this->normalizeKey($only)
                ));

                if ($recipes === []) {
                    throw new RuntimeException("料理「{$only}」が料理一覧ページに見つかりませんでした。");
                }
            }

            $limit = max(0, (int) $this->option('limit'));
            if ($limit > 0) {
                $recipes = array_slice($recipes, 0, $limit);
            }

            $gridHtml = $this->fetchHtml($gridUrl);
            $grids = $this->parseCookingGrids(
                $gridHtml,
                array_column($allRecipes, 'name')
            );

            $this->line('大成功範囲取得: '.count($grids).' / '.count($allRecipes).'件');

            $plans = $this->buildPlans(
                $recipes,
                $grids,
                $craftProductTypeId,
                $recipeUrl,
                $gridUrl
            );
        } catch (Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        foreach ($plans as $plan) {
            $this->printPlan($plan, $dryRun);
        }

        $warningCount = array_sum(array_map(
            fn (array $plan): int => count($plan['warnings']) + count($plan['errors']),
            $plans
        ));
        $insertCount = count(array_filter(
            $plans,
            fn (array $plan): bool => $plan['action'] === 'INSERT'
        ));
        $updateCount = count(array_filter(
            $plans,
            fn (array $plan): bool => $plan['action'] === 'UPDATE'
        ));

        $this->newLine();
        $this->info('集計');
        $this->line('  料理数: '.count($plans));
        $this->line("  INSERT予定: {$insertCount}");
        $this->line("  UPDATE予定: {$updateCount}");
        $this->line("  警告: {$warningCount}");

        if ($warningCount > 0) {
            $this->warn('不足データがありますが、取得できた内容で処理を続行します。');
        }

        if ($dryRun) {
            $this->newLine();
            $this->comment('確認後、保存する場合: php artisan equipment:import-cooking --write');

            return self::SUCCESS;
        }

        try {
            DB::transaction(function () use ($plans): void {
                foreach ($plans as $plan) {
                    $payload = $plan['payload'];
                    $now = now();

                    if ($plan['action'] === 'UPDATE') {
                        DB::table('equipments')
                            ->where('id', $plan['equipment_id'])
                            ->update($payload + ['updated_at' => $now]);
                    } else {
                        DB::table('equipments')->insert(
                            $payload + [
                                'created_at' => $now,
                                'updated_at' => $now,
                            ]
                        );
                    }
                }
            });
        } catch (Throwable $e) {
            $this->error('保存に失敗しました。トランザクションをロールバックしました。');
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info('料理データを保存しました。');

        return self::SUCCESS;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function buildPlans(
        array $recipes,
        array $grids,
        int $craftProductTypeId,
        string $recipeUrl,
        string $gridUrl
    ): array {
        $items = DB::table('items')
            ->select(['id', 'name'])
            ->orderBy('id')
            ->get();

        $itemMap = [];
        $duplicateItemNames = [];

        foreach ($items as $item) {
            $key = $this->normalizeKey((string) $item->name);

            if (isset($itemMap[$key])) {
                $duplicateItemNames[$key] = true;
                continue;
            }

            $itemMap[$key] = [
                'id' => (int) $item->id,
                'name' => (string) $item->name,
            ];
        }

        $existingEquipments = DB::table('equipments')
            ->where('craft_product_type_id', $craftProductTypeId)
            ->select(['id', 'item_id', 'item_name'])
            ->get();

        $existingByName = [];
        $usedItemIds = [];

        foreach ($existingEquipments as $equipment) {
            $existingByName[$this->normalizeKey((string) $equipment->item_name)] = $equipment;
            $usedItemIds[(string) $equipment->item_id] = (string) $equipment->item_name;
        }

        foreach (DB::table('equipments')->select(['item_id', 'item_name'])->get() as $equipment) {
            $usedItemIds[(string) $equipment->item_id] = (string) $equipment->item_name;
        }

        $plans = [];

        foreach ($recipes as $recipe) {
            $errors = [];
            $warnings = [];
            $resolvedMaterials = [];
            $materialLogs = [];

            foreach ($recipe['materials'] as $material) {
                $materialKey = $this->normalizeKey($material['name']);

                if (isset($duplicateItemNames[$materialKey])) {
                    $warnings[] = "items.name が重複しているため、この素材はmaterials_jsonへ入れません: {$material['name']}";
                    $materialLogs[] = [
                        'name' => $material['name'],
                        'count' => $material['count'],
                        'item_id' => null,
                        'resolved_name' => null,
                    ];
                    continue;
                }

                $item = $itemMap[$materialKey] ?? null;

                if ($item === null) {
                    $warnings[] = "itemsに素材がないため、この素材はmaterials_jsonへ入れません: {$material['name']}";
                    $materialLogs[] = [
                        'name' => $material['name'],
                        'count' => $material['count'],
                        'item_id' => null,
                        'resolved_name' => null,
                    ];
                    continue;
                }

                $resolvedMaterials[] = [
                    'count' => (int) $material['count'],
                    'item_id' => (int) $item['id'],
                ];
                $materialLogs[] = [
                    'name' => $material['name'],
                    'count' => $material['count'],
                    'item_id' => $item['id'],
                    'resolved_name' => $item['name'],
                ];
            }

            $nameKey = $this->normalizeKey($recipe['name']);
            $existing = $existingByName[$nameKey] ?? null;
            $itemId = $existing !== null
                ? (string) $existing->item_id
                : $this->makeCookingItemId((int) $recipe['position'], $recipe['name'], $usedItemIds);

            $usedItemIds[$itemId] = $recipe['name'];

            $kana = $this->makeKana($recipe['name']);
            if ($kana === null) {
                $warnings[] = 'item_name_kanaを自動生成できないためnullにします。';
            }

            $grid = $grids[$nameKey] ?? null;
            if ($grid === null) {
                $warnings[] = '大成功用のslot_grid_jsonを取得できないためnullで登録します。';
            }

            $payload = [
                'item_id' => $itemId,
                'item_name' => $recipe['name'],
                'item_name_kana' => $kana,
                'item_name_en' => null,
                'group_id' => null,
                'group_name' => null,
                'group_kind' => null,
                'equipment_type_id' => null,
                'craft_product_type_id' => $craftProductTypeId,
                'craft_material_trait' => null,
                'effects_json' => $recipe['effect'] !== null
                    ? json_encode([$recipe['effect']], self::JSON_FLAGS)
                    : null,
                'max_hp' => null,
                'max_mp' => null,
                'attack' => null,
                'defense' => null,
                'charm' => null,
                'agility' => null,
                'dexterity' => null,
                'magic_attack' => null,
                'healing_power' => null,
                'job_override_mode' => 'inherit',
                'craft_level' => $recipe['craft_level'],
                'equip_level' => null,
                'recipe_book' => null,
                'recipe_place' => $recipe['recipe_place'],
                'description' => null,
                'materials_json' => json_encode($resolvedMaterials, self::JSON_FLAGS),
                'slot_grid_json' => $grid !== null
                    ? json_encode($grid, self::JSON_FLAGS)
                    : null,
                'source_url' => $recipeUrl,
                'detail_url' => $gridUrl,
                'default_price' => null,
                'weight' => null,
            ];

            $plans[] = [
                'name' => $recipe['name'],
                'item_id' => $itemId,
                'kana' => $kana,
                'effect' => $recipe['effect'],
                'craft_level' => $recipe['craft_level'],
                'recipe_place' => $recipe['recipe_place'],
                'materials' => $materialLogs,
                'grid' => $grid,
                'payload' => $payload,
                'action' => $existing !== null ? 'UPDATE' : 'INSERT',
                'equipment_id' => $existing !== null ? (int) $existing->id : null,
                'errors' => $errors,
                'warnings' => $warnings,
            ];
        }

        return $plans;
    }

    private function printPlan(array $plan, bool $dryRun): void
    {
        $this->newLine();
        $prefix = $dryRun ? '[DRY-RUN]' : '[WRITE]';
        $this->info("{$prefix} {$plan['action']} {$plan['name']}");
        $this->line("  item_id: {$plan['item_id']}");
        $this->line('  item_name: '.$plan['name']);
        $this->line('  item_name_kana: '.($plan['kana'] ?? 'NULL'));
        $this->line('  craft_level: '.($plan['craft_level'] ?? 'NULL'));
        $this->line('  effects_json: '.json_encode(
            $plan['effect'] !== null ? [$plan['effect']] : null,
            self::JSON_FLAGS
        ));
        $this->line('  recipe_place: '.($plan['recipe_place'] ?? 'NULL'));

        $this->line('  materials_json:');
        foreach ($plan['materials'] as $material) {
            $resolved = $material['item_id'] === null
                ? 'NOT FOUND'
                : "items.id={$material['item_id']} / {$material['resolved_name']}";

            $this->line(
                "    - {$material['name']} ×{$material['count']} -> {$resolved}"
            );
        }

        $this->line('  slot_grid_json:');
        if ($plan['grid'] === null) {
            $this->line('    NOT FOUND');
        } else {
            foreach ($plan['grid'] as $row) {
                $this->line('    '.json_encode($row, self::JSON_FLAGS));
            }
        }

        foreach ($plan['warnings'] as $warning) {
            $this->warn("  WARNING: {$warning}");
        }

        foreach ($plan['errors'] as $error) {
            $this->warn("  WARNING: {$error}");
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function parseRecipes(string $html): array
    {
        [$dom, $xpath] = $this->makeDom($html);
        $recipes = [];
        $position = 0;

        foreach ($xpath->query('//tr') ?: [] as $row) {
            $cells = $xpath->query('./th|./td', $row);
            if ($cells === false || $cells->length < 4) {
                continue;
            }

            $nameAndEffect = $this->parseNameAndEffect($this->nodeText($cells->item(0)));
            if ($nameAndEffect === null) {
                continue;
            }

            $levelText = $this->cleanText($this->nodeText($cells->item(1)));
            if (! preg_match('/\d+/', $levelText, $levelMatch)) {
                continue;
            }

            $materials = $this->parseMaterials($cells->item(2), $xpath);
            if ($materials === []) {
                continue;
            }

            $recipePlaceParts = [];
            for ($i = 3; $i < $cells->length; $i++) {
                foreach ($this->textLines($this->nodeText($cells->item($i))) as $line) {
                    if (! in_array($line, $recipePlaceParts, true)) {
                        $recipePlaceParts[] = $line;
                    }
                }
            }

            $position++;
            $recipes[] = [
                'position' => $position,
                'name' => $nameAndEffect['name'],
                'effect' => $nameAndEffect['effect'],
                'craft_level' => (int) $levelMatch[0],
                'materials' => $materials,
                'recipe_place' => $recipePlaceParts !== []
                    ? implode(' / ', $recipePlaceParts)
                    : null,
            ];
        }

        return $recipes;
    }

    /**
     * @return array{name:string,effect:?string}|null
     */
    private function parseNameAndEffect(string $text): ?array
    {
        $text = $this->cleanText($text);

        if ($text === '' || str_contains($text, '料理と効果')) {
            return null;
        }

        $singleLine = preg_replace('/\s+/u', ' ', $text) ?? $text;
        $name = $singleLine;
        $effect = null;

        if (preg_match('/^(.*?)\s*[【〖](.*?)[】〗]/u', $singleLine, $matches)) {
            $name = trim($matches[1]);
            $effect = trim(preg_replace('/\s+/u', ' ', $matches[2]) ?? $matches[2]);
        } else {
            $lines = $this->textLines($text);
            $name = $lines[0] ?? '';
        }

        if ($name === '' || mb_strlen($name) > 80) {
            return null;
        }

        return [
            'name' => $name,
            'effect' => $effect !== '' ? $effect : null,
        ];
    }

    /**
     * @return array<int, array{name:string,count:int}>
     */
    private function parseMaterials(?DOMNode $cell, DOMXPath $xpath): array
    {
        if ($cell === null) {
            return [];
        }

        $materials = [];
        $links = $xpath->query('.//a', $cell);

        if ($links !== false) {
            foreach ($links as $link) {
                $name = $this->cleanText($this->nodeText($link));
                if ($name === '') {
                    continue;
                }

                $afterText = '';
                $sibling = $link->nextSibling;

                while ($sibling !== null) {
                    if ($sibling instanceof DOMElement) {
                        $tag = strtolower($sibling->tagName);
                        if ($tag === 'br' || $tag === 'a') {
                            break;
                        }
                    }

                    $afterText .= ' '.$this->nodeText($sibling);
                    $sibling = $sibling->nextSibling;
                }

                if (preg_match('/[×xX]\s*(\d+)/u', $afterText, $countMatch)) {
                    $this->appendMaterial($materials, $name, (int) $countMatch[1]);
                }
            }
        }

        if ($materials !== []) {
            return array_values($materials);
        }

        foreach ($this->textLines($this->nodeText($cell)) as $line) {
            if (! preg_match('/^(.+?)\s*[×xX]\s*(\d+)$/u', $line, $matches)) {
                continue;
            }

            $this->appendMaterial(
                $materials,
                $this->cleanText($matches[1]),
                (int) $matches[2]
            );
        }

        return array_values($materials);
    }

    private function appendMaterial(array &$materials, string $name, int $count): void
    {
        $key = $this->normalizeKey($name);

        if (isset($materials[$key])) {
            $materials[$key]['count'] += $count;
            return;
        }

        $materials[$key] = [
            'name' => $name,
            'count' => $count,
        ];
    }

    /**
     * @param array<int, string> $dishNames
     * @return array<string, array<int, array<int, string|null>>>
     */
    private function parseCookingGrids(string $html, array $dishNames): array
    {
        [, $xpath] = $this->makeDom($html);

        $knownNames = [];
        $recipeIndexByKey = [];

        foreach ($dishNames as $index => $dishName) {
            $key = $this->normalizeKey($dishName);
            $knownNames[$key] = $dishName;
            $recipeIndexByKey[$key] = $index;
        }

        $rawGrids = [];
        $headerCells = $xpath->query(
            '//th[@colspan="3"] | //td[@colspan="3"]'
        );

        if ($headerCells !== false) {
            foreach ($headerCells as $headerCell) {
                $headerName = $this->cleanText(
                    $this->gridNodeText($headerCell)
                );

                if ($headerName === '') {
                    continue;
                }

                $headerRow = $headerCell->parentNode;
                if (! $headerRow instanceof DOMElement
                    || strtolower($headerRow->tagName) !== 'tr') {
                    continue;
                }

                $slots = [];
                $row = $headerRow->nextSibling;

                while ($row !== null && count($slots) < 9) {
                    if ($row instanceof DOMElement
                        && strtolower($row->tagName) === 'tr') {
                        $cells = $xpath->query('./td', $row);

                        if ($cells !== false) {
                            foreach ($cells as $cell) {
                                $slots[] = $this->extractGridCellValue($cell);

                                if (count($slots) >= 9) {
                                    break;
                                }
                            }
                        }
                    }

                    $row = $row->nextSibling;
                }

                if (count($slots) < 9) {
                    continue;
                }

                $slots = array_slice($slots, 0, 9);

                if (count(array_filter(
                    $slots,
                    static fn ($value): bool => $value !== null
                )) === 0) {
                    continue;
                }

                $rawGrids[] = [
                    'header' => $headerName,
                    'grid' => array_chunk($slots, 3),
                ];
            }
        }

        $grids = [];
        $usedRawIndexes = [];
        $offsetVotes = [];

        foreach ($rawGrids as $rawIndex => $rawGrid) {
            $dishKey = $this->matchKnownDishKey(
                $rawGrid['header'],
                $knownNames
            );

            if ($dishKey === null || isset($grids[$dishKey])) {
                continue;
            }

            $grids[$dishKey] = $rawGrid['grid'];
            $usedRawIndexes[$rawIndex] = true;

            if (isset($recipeIndexByKey[$dishKey])) {
                $offset = $rawIndex - $recipeIndexByKey[$dishKey];
                $offsetVotes[$offset] = ($offsetVotes[$offset] ?? 0) + 1;
            }
        }

        $offset = 0;
        if ($offsetVotes !== []) {
            arsort($offsetVotes);
            $offset = (int) array_key_first($offsetVotes);
        }

        // 名前が一致しない場合は、両ページの掲載順を使って補完する。
        foreach ($dishNames as $recipeIndex => $dishName) {
            $dishKey = $this->normalizeKey($dishName);

            if (isset($grids[$dishKey])) {
                continue;
            }

            $rawIndex = $recipeIndex + $offset;

            if (! isset($rawGrids[$rawIndex])
                || isset($usedRawIndexes[$rawIndex])) {
                continue;
            }

            $grids[$dishKey] = $rawGrids[$rawIndex]['grid'];
            $usedRawIndexes[$rawIndex] = true;
        }

        $this->line(
            '数値表解析: 見出し付きグリッド'.count($rawGrids).'件、'.
            '料理名割当'.count($grids).'件'
        );

        return $grids;
    }

    /**
     * @param array<string, string> $knownNames
     */
    private function matchKnownDishKey(string $text, array $knownNames): ?string
    {
        $key = $this->normalizeKey($text);

        if ($key === '') {
            return null;
        }

        if (isset($knownNames[$key])) {
            return $key;
        }

        foreach ($knownNames as $knownKey => $_dishName) {
            if (str_contains($key, $knownKey)
                || str_contains($knownKey, $key)) {
                return $knownKey;
            }
        }

        return null;
    }

    private function extractGridCellValue(?DOMNode $cell): ?string
    {
        if ($cell === null) {
            return null;
        }

        $text = $this->gridNodeText($cell);
        $text = mb_convert_kana($text, 'n', 'UTF-8');
        $text = $this->cleanText($text);

        // 波ダッシュ部分が文字化けしても、前後の2数値から範囲を作る。
        if (preg_match('/(\d+)\D{1,12}(\d+)/u', $text, $matches)) {
            return ((int) $matches[1]).'-'.((int) $matches[2]);
        }

        // 「-」と空セルはいずれも空きマス。
        return null;
    }

    private function gridNodeText(?DOMNode $node): string
    {
        if ($node === null) {
            return '';
        }

        $parts = [$this->nodeText($node)];

        if ($node instanceof DOMElement) {
            foreach (['alt', 'title', 'value'] as $attribute) {
                if ($node->hasAttribute($attribute)) {
                    $parts[] = $node->getAttribute($attribute);
                }
            }

            foreach ($node->getElementsByTagName('*') as $child) {
                foreach (['alt', 'title', 'value'] as $attribute) {
                    if ($child->hasAttribute($attribute)) {
                        $parts[] = $child->getAttribute($attribute);
                    }
                }
            }
        }

        return $this->cleanText(implode("\n", array_filter(
            $parts,
            static fn (string $part): bool => $part !== ''
        )));
    }

    private function makeCookingItemId(int $position, string $name, array $usedItemIds): string
    {
        $candidate = 'cooking_'.str_pad((string) $position, 3, '0', STR_PAD_LEFT);

        if (! isset($usedItemIds[$candidate])) {
            return $candidate;
        }

        if ($this->normalizeKey($usedItemIds[$candidate]) === $this->normalizeKey($name)) {
            return $candidate;
        }

        return 'cooking_'.substr(sha1($name), 0, 12);
    }

    private function makeKana(string $name): ?string
    {
        if (isset(self::KANA_OVERRIDES[$name])) {
            return self::KANA_OVERRIDES[$name];
        }

        $kana = mb_convert_kana($name, 'c', 'UTF-8');

        return preg_match('/\p{Han}/u', $kana) ? null : $kana;
    }

    private function fetchHtml(string $url): string
    {
        $urls = [$url];

        if (str_starts_with($url, 'http://')) {
            $urls[] = 'https://'.substr($url, 7);
        } elseif (str_starts_with($url, 'https://')) {
            $urls[] = 'http://'.substr($url, 8);
        }

        $errors = [];

        foreach (array_values(array_unique($urls)) as $candidate) {
            try {
                $request = Http::withHeaders([
                    'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/151 Safari/537.36',
                    'Accept' => 'text/html,application/xhtml+xml',
                    'Accept-Language' => 'ja,en-US;q=0.8,en;q=0.6',
                ])
                    ->retry(3, 700)
                    ->timeout(30);

                if ($this->option('insecure')) {
                    $request = $request->withoutVerifying();
                }

                $response = $request->get($candidate)->throw();
                $body = $response->body();

                if ($body === '') {
                    throw new RuntimeException('レスポンス本文が空です。');
                }

                return $this->toUtf8($body);
            } catch (Throwable $e) {
                $errors[] = "{$candidate}: {$e->getMessage()}";
            }
        }

        throw new RuntimeException(
            "ページ取得に失敗しました。\n".implode("\n", $errors)
        );
    }

    private function toUtf8(string $body): string
    {
        $declaredEncoding = null;

        if (preg_match(
            '/charset\s*=\s*["\']?\s*([a-zA-Z0-9_\-]+)/i',
            substr($body, 0, 4096),
            $matches
        )) {
            $declaredEncoding = strtoupper($matches[1]);
        }

        $encodingMap = [
            'SHIFT_JIS' => 'SJIS-win',
            'SHIFT-JIS' => 'SJIS-win',
            'SJIS' => 'SJIS-win',
            'WINDOWS-31J' => 'SJIS-win',
            'CP932' => 'SJIS-win',
            'EUC-JP' => 'EUC-JP',
            'ISO-2022-JP' => 'ISO-2022-JP',
            'UTF-8' => 'UTF-8',
        ];

        $encoding = $declaredEncoding !== null
            ? ($encodingMap[$declaredEncoding] ?? null)
            : null;

        if ($encoding === null) {
            $encoding = mb_detect_encoding(
                $body,
                ['UTF-8', 'SJIS-win', 'EUC-JP', 'ISO-2022-JP'],
                true
            );
        }

        if ($encoding !== false
            && $encoding !== null
            && $encoding !== 'UTF-8') {
            $body = mb_convert_encoding($body, 'UTF-8', $encoding);
        }

        $body = preg_replace(
            '/charset\s*=\s*["\']?\s*(?:shift[_-]?jis|sjis|windows-31j|cp932|euc-jp|iso-2022-jp)/i',
            'charset=UTF-8',
            $body
        ) ?? $body;

        return $body;
    }

    /**
     * @return array{0:DOMDocument,1:DOMXPath}
     */
    private function makeDom(string $html): array
    {
        $dom = new DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);

        $loaded = $dom->loadHTML(
            '<?xml encoding="UTF-8">'.$html,
            LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_NONET
        );

        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if (! $loaded) {
            throw new RuntimeException('HTMLをDOMとして解析できませんでした。');
        }

        return [$dom, new DOMXPath($dom)];
    }

    private function nodeText(?DOMNode $node): string
    {
        if ($node === null) {
            return '';
        }

        if ($node->nodeType === XML_TEXT_NODE || $node->nodeType === XML_CDATA_SECTION_NODE) {
            return $node->nodeValue ?? '';
        }

        if ($node instanceof DOMElement && strtolower($node->tagName) === 'br') {
            return "\n";
        }

        $text = '';
        foreach ($node->childNodes as $child) {
            $text .= $this->nodeText($child);
        }

        if ($node instanceof DOMElement
            && in_array(strtolower($node->tagName), ['p', 'div', 'li'], true)) {
            $text .= "\n";
        }

        return $text;
    }

    /**
     * @return array<int, string>
     */
    private function textLines(string $text): array
    {
        $text = str_replace(["\r\n", "\r", "\u{00A0}"], ["\n", "\n", ' '], $text);
        $lines = preg_split('/\n+/u', $text) ?: [];
        $result = [];

        foreach ($lines as $line) {
            $line = $this->cleanText($line);
            if ($line !== '') {
                $result[] = $line;
            }
        }

        return $result;
    }

    private function cleanText(string $value): string
    {
        $value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $value = str_replace(["\u{00A0}", '　'], ' ', $value);
        $value = preg_replace('/[ \t]+/u', ' ', $value) ?? $value;
        $value = preg_replace('/ *\n */u', "\n", $value) ?? $value;

        return trim($value);
    }

    private function normalizeKey(string $value): string
    {
        $value = mb_convert_kana($value, 'asKV', 'UTF-8');
        $value = str_replace(["\u{00A0}", '　'], '', $value);
        $value = preg_replace('/\s+/u', '', $value) ?? $value;

        return mb_strtolower(trim($value), 'UTF-8');
    }
}
