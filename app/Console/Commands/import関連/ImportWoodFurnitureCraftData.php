<?php

namespace App\Console\Commands;

use DOMDocument;
use DOMElement;
use DOMNode;
use DOMXPath;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Throwable;

class ImportWoodFurnitureCraftData extends Command
{
    private const IMPORTER_VERSION = '2026-07-26-4';

    protected $signature = 'dq10:import-wood-furniture
        {--dry-run : DBを更新せず、取り込み予定だけ表示する}
        {--force : 既存の materials_json / slot_grid_json も上書きする}
        {--only=all : all / grid / materials のいずれか}
        {--name= : 指定した家具名だけ処理する}';

    protected $description = '木工家具の大成功数値と素材を取得して equipments に登録する';

    private const GRID_URLS = [
        'http://www.dq10data.com/guild_wood_furniture1.html',
        'http://www.dq10data.com/guild_wood_furniture2.html',
        'http://www.dq10data.com/guild_wood_furniture3.html',
        'http://www.dq10data.com/guild_wood_furniture4.html',
    ];

    private const MATERIAL_URL = 'https://dragon-quest.jp/ten/recipe/mokkou2.php';

    /**
     * 攻略ページ側にある表記揺れ・誤字を items.name に寄せる。
     */
    private const MATERIAL_NAME_ALIASES = [
        'びのぬけがら' => 'へびのぬけがら',
        'うにじいろの布きれ' => 'にじいろの布きれ',
        'カチコチクルミ' => 'カチコチくるみ',
    ];

    private array $warnings = [];

    public function handle(): int
    {
        $only = strtolower(trim((string) $this->option('only')));

        if (!in_array($only, ['all', 'grid', 'materials'], true)) {
            $this->error('--only は all / grid / materials のいずれかを指定してください。');
            return self::FAILURE;
        }

        if (!Schema::hasTable('equipments')) {
            $this->error('equipments テーブルがありません。');
            return self::FAILURE;
        }

        if (($only === 'all' || $only === 'materials') && !Schema::hasTable('items')) {
            $this->error('素材ID参照用の items テーブルがありません。');
            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');
        $force = (bool) $this->option('force');
        $targetName = trim((string) ($this->option('name') ?? ''));
        $targetKey = $targetName !== '' ? $this->canonicalName($targetName) : null;

        $this->info('木工家具データの取得を開始します。');

        $equipments = DB::table('equipments')
            ->select([
                'id',
                'item_id',
                'item_name',
                'materials_json',
                'slot_grid_json',
                'slot_grid_type',
                'slot_grid_cols',
                'craft_level',
                'slot',
                'source_url',
                'detail_url',
            ])
            ->orderBy('id')
            ->get();

        [$equipmentIndex, $duplicateEquipmentNames] = $this->buildEquipmentIndex($equipments->all());

        if ($duplicateEquipmentNames !== []) {
            foreach ($duplicateEquipmentNames as $name => $ids) {
                $this->warnings[] = "equipments.item_name が重複: {$name} (ID: " . implode(', ', $ids) . ')';
            }
        }

        $records = [];
        $knownFurnitureIndex = [];

        try {
            // 数値ページの家具名判定にも使うため、grid のみの場合でも素材ページから家具名一覧を取得する。
            $this->line($only === 'grid'
                ? '家具名照合用の素材ページを取得中...'
                : '素材ページを取得中...');

            $materialHtml = $this->fetchHtml(self::MATERIAL_URL);
            $materialRows = $this->parseMaterialPage($materialHtml);
            $knownFurnitureIndex = $this->buildKnownFurnitureIndex($materialRows);

            if ($only === 'all' || $only === 'materials') {
                $itemIndex = $this->buildItemIndex();

                foreach ($materialRows as $key => $row) {
                    if ($targetKey !== null && $key !== $targetKey) {
                        continue;
                    }

                    $materials = [];

                    foreach ($row['materials'] as $material) {
                        $resolved = $this->resolveMaterialItem(
                            $material['name'],
                            $itemIndex
                        );

                        if ($resolved === null) {
                            $materials[] = [
                                'name' => $material['name'],
                                'count' => $material['count'],
                                'item_id' => null,
                            ];

                            $this->warnings[] = "素材ID未解決: {$row['item_name']} / {$material['name']}";
                            continue;
                        }

                        $materials[] = [
                            'count' => $material['count'],
                            'item_id' => $resolved['id'],
                        ];
                    }

                    $records[$key] = array_merge($records[$key] ?? [], [
                        'item_name' => $row['item_name'],
                        'craft_level' => $row['craft_level'],
                        'materials_json' => $materials,
                        'source_url' => self::MATERIAL_URL,
                    ]);
                }
            }

            $this->info('素材データ: ' . count($materialRows) . '件解析');

            if ($only === 'all' || $only === 'grid') {
                $parsedGridCount = 0;

                foreach (self::GRID_URLS as $url) {
                    $this->line("大成功数値ページを取得中: {$url}");
                    $html = $this->fetchHtml($url);
                    $gridRows = $this->parseGridPage($html, $knownFurnitureIndex, $url);

                    foreach ($gridRows as $key => $row) {
                        if ($targetKey !== null && $key !== $targetKey) {
                            continue;
                        }

                        $records[$key] = array_merge($records[$key] ?? [], [
                            'item_name' => $row['item_name'],
                            'slot_grid_json' => $row['grid'],
                            'slot_grid_type' => $row['grid_type'],
                            'slot_grid_cols' => $row['cols'],
                            'craft_level' => $materialRows[$key]['craft_level'] ?? null,
                            'source_url' => self::MATERIAL_URL,
                            'detail_url' => $url,
                        ]);
                    }

                    $parsedGridCount += count($gridRows);
                }

                $this->info("大成功数値データ: {$parsedGridCount}件解析");
            }
        } catch (Throwable $e) {
            $this->error($e->getMessage());
            return self::FAILURE;
        }

        if ($targetKey !== null && !isset($records[$targetKey])) {
            $this->error("指定家具「{$targetName}」を取得ページから見つけられませんでした。");
            return self::FAILURE;
        }

        $summaryRows = [];
        $jsonLogRows = [];
        $created = 0;
        $updated = 0;
        $skipped = 0;
        $duplicates = 0;
        $usedItemIds = [];

        foreach ($equipments as $equipmentRow) {
            $usedItemIds[(string) $equipmentRow->item_id] = true;
        }

        foreach ($records as $key => $record) {
            $equipmentMatches = $equipmentIndex[$key] ?? [];

            if (count($equipmentMatches) > 1) {
                $duplicates++;
                $summaryRows[] = [
                    $record['item_name'] ?? $key,
                    '-',
                    isset($record['slot_grid_json']) ? $this->gridLabel($record['slot_grid_json']) : '-',
                    isset($record['materials_json']) ? count($record['materials_json']) : '-',
                    'DB名重複・スキップ',
                ];
                continue;
            }

            if (count($equipmentMatches) === 0) {
                $insert = $this->buildNewEquipmentPayload($record, $usedItemIds);
                $newId = null;

                if (!$dryRun) {
                    $newId = DB::table('equipments')->insertGetId($insert);
                }

                $jsonLogRows[] = [
                    'item_name' => $record['item_name'] ?? $key,
                    'equipment_id' => $dryRun ? '(new)' : (string) $newId,
                    'result' => $dryRun ? '新規登録予定' : '新規登録済み',
                    'materials_json' => $insert['materials_json'] ?? null,
                    'slot_grid_json' => $insert['slot_grid_json'] ?? null,
                ];

                $created++;
                $summaryRows[] = [
                    $record['item_name'] ?? $key,
                    $dryRun ? '(new)' : (string) $newId,
                    isset($record['slot_grid_json']) ? $this->gridLabel($record['slot_grid_json']) : '-',
                    isset($record['materials_json']) ? count($record['materials_json']) : '-',
                    $dryRun ? '新規登録予定' : '新規登録済み',
                ];
                continue;
            }

            $equipment = $equipmentMatches[0];
            $patch = [];

            if (array_key_exists('slot_grid_json', $record)) {
                $hasExistingGrid = $this->hasJsonValue($equipment->slot_grid_json);

                if ($force || !$hasExistingGrid) {
                    $patch['slot_grid_json'] = json_encode(
                        $record['slot_grid_json'],
                        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
                    );
                    $patch['slot_grid_type'] = $record['slot_grid_type'];
                    $patch['slot_grid_cols'] = $record['slot_grid_cols'];
                }
            }

            if (array_key_exists('materials_json', $record)) {
                $hasExistingMaterials = $this->hasJsonValue($equipment->materials_json);

                if ($force || !$hasExistingMaterials) {
                    $patch['materials_json'] = json_encode(
                        $record['materials_json'],
                        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
                    );
                }
            }

            if (array_key_exists('craft_level', $record)
                && $record['craft_level'] !== null
                && ($force || $equipment->craft_level === null)) {
                $patch['craft_level'] = (int) $record['craft_level'];
            }

            if ($force || trim((string) ($equipment->slot ?? '')) === '') {
                $patch['slot'] = '家具';
            }

            if (array_key_exists('source_url', $record)
                && ($force || trim((string) ($equipment->source_url ?? '')) === '')) {
                $patch['source_url'] = $record['source_url'];
            }

            if (array_key_exists('detail_url', $record)
                && ($force || trim((string) ($equipment->detail_url ?? '')) === '')) {
                $patch['detail_url'] = $record['detail_url'];
            }

            if ($patch === []) {
                $skipped++;
                $summaryRows[] = [
                    $equipment->item_name,
                    (string) $equipment->id,
                    isset($record['slot_grid_json']) ? $this->gridLabel($record['slot_grid_json']) : '-',
                    isset($record['materials_json']) ? count($record['materials_json']) : '-',
                    '既存値あり・スキップ',
                ];
                continue;
            }

            $patch['updated_at'] = now();

            if (!$dryRun) {
                DB::table('equipments')
                    ->where('id', $equipment->id)
                    ->update($patch);
            }

            $jsonLogRows[] = [
                'item_name' => $equipment->item_name,
                'equipment_id' => (string) $equipment->id,
                'result' => $dryRun ? '更新予定' : '更新済み',
                'materials_json' => $patch['materials_json'] ?? null,
                'slot_grid_json' => $patch['slot_grid_json'] ?? null,
            ];

            $updated++;
            $summaryRows[] = [
                $equipment->item_name,
                (string) $equipment->id,
                isset($record['slot_grid_json']) ? $this->gridLabel($record['slot_grid_json']) : '-',
                isset($record['materials_json']) ? count($record['materials_json']) : '-',
                $dryRun ? '更新予定' : '更新済み',
            ];
        }

        $this->newLine();
        $this->table(
            ['家具名', 'equipment ID', 'グリッド', '素材数', '結果'],
            $summaryRows
        );

        $this->newLine();
        $this->info(($dryRun ? '[DRY RUN] ' : '') . "新規 {$created}件 / 更新 {$updated}件 / スキップ {$skipped}件 / DB名重複 {$duplicates}件");

        $this->printJsonLog($jsonLogRows);

        if ($this->warnings !== []) {
            $this->newLine();
            $this->warn('確認が必要な項目:');

            foreach (array_values(array_unique($this->warnings)) as $warning) {
                $this->line("- {$warning}");
            }
        }

        return self::SUCCESS;
    }

    private function fetchHtml(string $url): string
    {
        $candidates = [$url];
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));

        // dq10data.com は環境によって HTTPS の TLS ハンドシェイクに失敗するため HTTP を優先する。
        if (str_contains($host, 'dq10data.com')) {
            $httpUrl = preg_replace('#^https://#i', 'http://', $url);
            $httpsUrl = preg_replace('#^http://#i', 'https://', $url);
            $candidates = array_values(array_unique(array_filter([$httpUrl, $httpsUrl])));
        }

        $errors = [];

        foreach ($candidates as $candidateUrl) {
            for ($attempt = 1; $attempt <= 2; $attempt++) {
                try {
                    $curlOptions = [];

                    if (defined('CURLOPT_HTTP_VERSION') && defined('CURL_HTTP_VERSION_1_1')) {
                        $curlOptions[CURLOPT_HTTP_VERSION] = CURL_HTTP_VERSION_1_1;
                    }

                    if (str_starts_with($candidateUrl, 'https://')) {
                        if (defined('CURLOPT_SSLVERSION') && defined('CURL_SSLVERSION_TLSv1_2')) {
                            $curlOptions[CURLOPT_SSLVERSION] = CURL_SSLVERSION_TLSv1_2;
                        }

                        if (defined('CURLOPT_SSL_CIPHER_LIST')) {
                            $curlOptions[CURLOPT_SSL_CIPHER_LIST] = 'DEFAULT@SECLEVEL=1';
                        }
                    }

                    $request = Http::withHeaders([
                            'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36',
                            'Accept' => 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language' => 'ja,en;q=0.8',
                            'Connection' => 'close',
                        ])
                        ->withOptions([
                            'allow_redirects' => [
                                'max' => 5,
                                'strict' => false,
                                'referer' => true,
                                'track_redirects' => true,
                            ],
                            'curl' => $curlOptions,
                        ])
                        ->timeout(45)
                        ->connectTimeout(20);

                    if (str_starts_with($candidateUrl, 'https://')) {
                        $request = $request->withoutVerifying();
                    }

                    $response = $request->get($candidateUrl);

                    if ($response->successful()) {
                        return $this->convertHtmlToUtf8(
                            $response->body(),
                            $response->header('Content-Type')
                        );
                    }

                    $errors[] = "{$candidateUrl} / HTTP {$response->status()}";
                } catch (Throwable $e) {
                    $errors[] = "{$candidateUrl} / {$e->getMessage()}";
                }

                if ($attempt < 2) {
                    usleep(800000);
                }
            }
        }

        throw new RuntimeException(
            "ページ取得失敗: {$url}\n" . implode("\n", array_values(array_unique($errors)))
        );
    }

    private function convertHtmlToUtf8(string $html, ?string $contentType): string
    {
        $encoding = null;
        $head = substr($html, 0, 3000);
        $source = ($contentType ?? '') . "\n" . $head;

        if (preg_match('/charset\s*=\s*["\']?([a-zA-Z0-9._-]+)/i', $source, $match)) {
            $encoding = strtoupper($match[1]);
        }

        $encodingMap = [
            'SHIFT_JIS' => 'SJIS-win',
            'SHIFT-JIS' => 'SJIS-win',
            'SJIS' => 'SJIS-win',
            'WINDOWS-31J' => 'SJIS-win',
            'CP932' => 'SJIS-win',
            'EUC-JP' => 'EUC-JP',
            'UTF-8' => 'UTF-8',
        ];

        $encoding = $encodingMap[$encoding] ?? $encoding;
        $encoding ??= mb_detect_encoding(
            $html,
            ['UTF-8', 'SJIS-win', 'EUC-JP', 'ISO-2022-JP'],
            true
        ) ?: 'UTF-8';

        if (strtoupper($encoding) !== 'UTF-8') {
            $html = mb_convert_encoding($html, 'UTF-8', $encoding);
        }

        return $html;
    }

    private function createDom(string $html): array
    {
        libxml_use_internal_errors(true);

        $dom = new DOMDocument('1.0', 'UTF-8');
        $dom->loadHTML(
            '<?xml encoding="UTF-8">' . $html,
            LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_NONET
        );

        libxml_clear_errors();

        return [$dom, new DOMXPath($dom)];
    }

    private function parseMaterialPage(string $html): array
    {
        [, $xpath] = $this->createDom($html);
        $result = [];

        foreach ($xpath->query('//tr') as $row) {
            if (!$row instanceof DOMElement) {
                continue;
            }

            $cells = $this->directChildCells($row);

            if (count($cells) < 3) {
                continue;
            }

            $levelIndex = null;
            $craftLevel = null;

            foreach ($cells as $index => $cell) {
                $text = $this->cleanText($cell->textContent);

                if (preg_match('/Lv\s*([0-9０-９]+)/iu', $text, $match)) {
                    $levelIndex = $index;
                    $craftLevel = (int) $this->toAsciiNumber($match[1]);
                    break;
                }
            }

            if ($levelIndex === null || !isset($cells[$levelIndex + 2])) {
                continue;
            }

            $itemName = $this->cleanText($cells[$levelIndex + 1]->textContent);
            $materials = $this->parseMaterialsCell($cells[$levelIndex + 2]);

            if ($itemName === '' || $materials === []) {
                continue;
            }

            $key = $this->canonicalName($itemName);

            $result[$key] = [
                'item_name' => $itemName,
                'craft_level' => $craftLevel,
                'materials' => $materials,
            ];
        }

        return $result;
    }

    private function parseMaterialsCell(DOMElement $cell): array
    {
        $text = $this->nodeTextWithBreaks($cell);
        $text = str_replace(['ｘ', 'Ｘ'], '×', $text);
        $materials = [];

        preg_match_all(
            '/(?:^|\n)\s*[○●◎・]?\s*([^\n×xX]+?)\s*[×xX]\s*([0-9０-９]+)/u',
            $text,
            $matches,
            PREG_SET_ORDER
        );

        foreach ($matches as $match) {
            $name = $this->cleanText($match[1]);
            $count = (int) $this->toAsciiNumber($match[2]);

            if ($name === '' || $count <= 0) {
                continue;
            }

            $materials[] = [
                'name' => self::MATERIAL_NAME_ALIASES[$name] ?? $name,
                'count' => $count,
            ];
        }

        return $materials;
    }

    private function parseGridPage(string $html, array $knownFurnitureIndex, string $url): array
    {
        [, $xpath] = $this->createDom($html);
        $lookup = $this->buildGridFurnitureLookup($knownFurnitureIndex);

        // dq10data の家具ページは、家具名と数値が別の tr に分かれているものがある。
        // まずは表の行順に家具名を検出し、次の家具名までの数値行を集める。
        $result = $this->parseGridRowsSequentially($xpath, $knownFurnitureIndex, $lookup, $url);

        // 古いHTMLの崩れ方によって tr が正しく組み上がらない場合に備え、
        // タグを改行へ変換したテキストからも解析する。
        $fallback = $this->parseGridTextFallback($html, $knownFurnitureIndex, $lookup, $url);

        foreach ($fallback as $key => $row) {
            if (!isset($result[$key])) {
                $result[$key] = $row;
            }
        }

        return $result;
    }

    private function parseGridRowsSequentially(
        DOMXPath $xpath,
        array $knownFurnitureIndex,
        array $lookup,
        string $url
    ): array {
        $result = [];
        $current = null;
        $matrix = [];

        $flush = function () use (&$result, &$current, &$matrix, $url): void {
            if ($current === null) {
                $matrix = [];
                return;
            }

            $this->storeGridCandidate($result, $current, $matrix, $url);
            $current = null;
            $matrix = [];
        };

        foreach ($xpath->query('//tr') as $row) {
            if (!$row instanceof DOMElement) {
                continue;
            }

            $cells = $this->directChildCells($row);

            if ($cells === []) {
                continue;
            }

            $match = null;
            $nameCellIndex = null;

            foreach ($cells as $cellIndex => $cell) {
                $match = $this->resolveGridFurnitureMatch(
                    $this->nodeTextWithBreaks($cell),
                    $knownFurnitureIndex,
                    $lookup
                );

                if ($match !== null) {
                    $nameCellIndex = $cellIndex;
                    break;
                }
            }

            if ($match !== null) {
                $flush();
                $current = $match;

                // rowspan や入れ子tableを含む従来形式は、構造を保ったまま先に解析する。
                $structuredMatrix = $this->extractGridMatrix(
                    $row,
                    $cells[$nameCellIndex],
                    $nameCellIndex
                );

                if ($structuredMatrix !== null && $structuredMatrix !== []) {
                    $matrix = $structuredMatrix;
                    $flush();
                    continue;
                }

                $sameRowRows = $this->numericRowsFromCells($cells, $nameCellIndex, $match['item_name']);
                foreach ($sameRowRows as $numericRow) {
                    $matrix[] = $numericRow;
                }

                continue;
            }

            if ($current === null) {
                continue;
            }

            $numericRows = $this->numericRowsFromCells($cells, null, null);

            foreach ($numericRows as $numericRow) {
                $matrix[] = $numericRow;
            }
        }

        $flush();

        return $result;
    }

    private function parseGridTextFallback(
        string $html,
        array $knownFurnitureIndex,
        array $lookup,
        string $url
    ): array {
        $html = preg_replace('/<br\s*\/?\s*>/i', "\n", $html);
        $html = preg_replace('/<\/(td|th|tr|table|p|div|li|h[1-6])>/i', "\n", (string) $html);
        $text = strip_tags((string) $html);
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = str_replace(["\r\n", "\r"], "\n", $text);

        $lines = preg_split('/\R+/u', $text) ?: [];
        $result = [];
        $current = null;
        $matrix = [];

        $flush = function () use (&$result, &$current, &$matrix, $url): void {
            if ($current === null) {
                $matrix = [];
                return;
            }

            $this->storeGridCandidate($result, $current, $matrix, $url);
            $current = null;
            $matrix = [];
        };

        foreach ($lines as $line) {
            $line = $this->cleanText($line);

            if ($line === '') {
                continue;
            }

            $match = $this->resolveGridFurnitureMatch($line, $knownFurnitureIndex, $lookup);

            if ($match !== null) {
                $flush();
                $current = $match;

                // 同じ行に「家具名 45 45 45」のように数値が続く場合にも対応。
                $withoutName = str_replace($match['matched_text'], ' ', $line);
                $tokens = $this->gridTokensFromText($withoutName);

                if ($tokens !== null && $tokens !== []) {
                    $matrix[] = $tokens;
                }

                continue;
            }

            if ($current === null) {
                continue;
            }

            $tokens = $this->gridTokensFromText($line);

            if ($tokens !== null && $tokens !== []) {
                $matrix[] = $tokens;
            }
        }

        $flush();

        return $result;
    }

    private function numericRowsFromCells(
        array $cells,
        ?int $nameCellIndex,
        ?string $itemName
    ): array {
        $perCellRows = [];

        foreach ($cells as $cellIndex => $cell) {
            if (!$cell instanceof DOMElement) {
                continue;
            }

            $lines = preg_split('/\R+/u', $this->nodeTextWithBreaks($cell)) ?: [];
            $numericRows = [];

            foreach ($lines as $line) {
                $line = $this->cleanText($line);

                if ($line === '') {
                    continue;
                }

                if ($nameCellIndex === $cellIndex && $itemName !== null) {
                    $lineKey = $this->relaxedFurnitureKey($line);
                    $nameKey = $this->relaxedFurnitureKey($itemName);

                    if ($lineKey === $nameKey) {
                        continue;
                    }

                    // 同じセル内に家具名と数値が連続しているケース。
                    $line = preg_replace(
                        '/' . preg_quote($itemName, '/') . '/u',
                        ' ',
                        $line,
                        1
                    ) ?? $line;
                }

                $tokens = $this->gridTokensFromText($line);

                if ($tokens !== null && $tokens !== []) {
                    $numericRows[] = $tokens;
                }
            }

            if ($numericRows !== []) {
                $perCellRows[] = $numericRows;
            }
        }

        if ($perCellRows === []) {
            return [];
        }

        $maxLineCount = max(array_map('count', $perCellRows));

        // 各tdが1マスずつの場合は、同じtrの値を横一列として結合する。
        if ($maxLineCount === 1) {
            $row = [];

            foreach ($perCellRows as $cellRows) {
                array_push($row, ...$cellRows[0]);
            }

            return $row !== [] ? [$row] : [];
        }

        // 1つのtd内でbr区切りになっている場合は、そのまま複数行として扱う。
        if (count($perCellRows) === 1) {
            return $perCellRows[0];
        }

        // 複数tdがそれぞれ複数行を持つ場合は、行番号ごとに横結合する。
        $rows = [];

        for ($lineIndex = 0; $lineIndex < $maxLineCount; $lineIndex++) {
            $row = [];

            foreach ($perCellRows as $cellRows) {
                if (isset($cellRows[$lineIndex])) {
                    array_push($row, ...$cellRows[$lineIndex]);
                }
            }

            if ($row !== []) {
                $rows[] = $row;
            }
        }

        return $rows;
    }

    private function buildGridFurnitureLookup(array $knownFurnitureIndex): array
    {
        $relaxed = [];
        $ambiguous = [];
        $ordered = [];

        foreach ($knownFurnitureIndex as $key => $itemName) {
            $relaxedKey = $this->relaxedFurnitureKey($itemName);

            if ($relaxedKey !== '') {
                if (isset($relaxed[$relaxedKey]) && $relaxed[$relaxedKey] !== $key) {
                    $ambiguous[$relaxedKey] = true;
                } else {
                    $relaxed[$relaxedKey] = $key;
                }
            }

            $ordered[] = [
                'key' => $key,
                'canonical' => $key,
                'relaxed' => $relaxedKey,
                'item_name' => $itemName,
            ];
        }

        foreach (array_keys($ambiguous) as $ambiguousKey) {
            unset($relaxed[$ambiguousKey]);
        }

        usort(
            $ordered,
            fn (array $a, array $b) => mb_strlen($b['canonical']) <=> mb_strlen($a['canonical'])
        );

        return [
            'relaxed' => $relaxed,
            'ordered' => $ordered,
        ];
    }

    private function resolveGridFurnitureMatch(
        string $text,
        array $knownFurnitureIndex,
        array $lookup
    ): ?array {
        $lines = preg_split('/\R+/u', $text) ?: [$text];

        foreach ($lines as $line) {
            $line = $this->cleanText($line);

            if ($line === '') {
                continue;
            }

            $canonical = $this->canonicalName($line);

            if (isset($knownFurnitureIndex[$canonical])) {
                return [
                    'key' => $canonical,
                    'item_name' => $knownFurnitureIndex[$canonical],
                    'matched_text' => $line,
                ];
            }

            $relaxed = $this->relaxedFurnitureKey($line);
            $resolvedKey = $lookup['relaxed'][$relaxed] ?? null;

            if ($resolvedKey !== null && isset($knownFurnitureIndex[$resolvedKey])) {
                return [
                    'key' => $resolvedKey,
                    'item_name' => $knownFurnitureIndex[$resolvedKey],
                    'matched_text' => $line,
                ];
            }

            // 家具名と数値が同じ行・セルに入っている場合。
            foreach ($lookup['ordered'] as $candidate) {
                if (mb_strlen($candidate['canonical']) < 4) {
                    continue;
                }

                if (str_contains($canonical, $candidate['canonical'])
                    || ($candidate['relaxed'] !== '' && str_contains($relaxed, $candidate['relaxed']))) {
                    return [
                        'key' => $candidate['key'],
                        'item_name' => $candidate['item_name'],
                        'matched_text' => $line,
                    ];
                }
            }
        }

        return null;
    }

    private function relaxedFurnitureKey(string $value): string
    {
        $value = $this->canonicalName($value);
        $value = str_replace('弾', '段', $value);
        $value = str_replace(['の', '調'], '', $value);
        $value = preg_replace('/^ごうかな/u', 'ごうか', $value) ?? $value;

        return $value;
    }

    private function storeGridCandidate(
        array &$result,
        array $match,
        array $matrix,
        string $url
    ): void {
        $matrix = $this->normalizeMatrix($matrix);

        if ($matrix === []) {
            return;
        }

        $rows = count($matrix);
        $cols = max(array_map('count', $matrix));
        $cellCount = $this->matrixCellCount($matrix);

        // 家具のグリッドとして明らかに大きすぎる表は、評価基準表などの誤取得。
        if ($rows < 1 || $cols < 1 || $rows > 6 || $cols > 6 || $cellCount > 24) {
            return;
        }

        $key = $match['key'];
        $candidate = [
            'item_name' => $match['item_name'],
            'grid' => $matrix,
            'grid_type' => "{$rows}×{$cols}",
            'cols' => $cols,
        ];

        if (!isset($result[$key])
            || $cellCount > $this->matrixCellCount($result[$key]['grid'])) {
            $result[$key] = $candidate;
        }
    }

    private function extractGridMatrix(
        DOMElement $row,
        DOMElement $nameCell,
        int $nameCellIndex
    ): ?array {
        $nestedCandidates = [];

        foreach ($row->getElementsByTagName('table') as $table) {
            if (!$table instanceof DOMElement) {
                continue;
            }

            $matrix = $this->matrixFromTable($table);

            if ($matrix !== null) {
                $nestedCandidates[] = $matrix;
            }
        }

        if ($nestedCandidates !== []) {
            usort(
                $nestedCandidates,
                fn (array $a, array $b) => $this->matrixCellCount($b) <=> $this->matrixCellCount($a)
            );

            return $nestedCandidates[0];
        }

        $rowspan = max(1, (int) ($nameCell->getAttribute('rowspan') ?: 1));

        if ($rowspan > 1) {
            $matrix = [];
            $currentRow = $row;

            for ($i = 0; $i < $rowspan && $currentRow instanceof DOMElement; $i++) {
                $currentCells = $this->directChildCells($currentRow);
                $line = [];

                foreach ($currentCells as $index => $cell) {
                    if ($i === 0 && $index === $nameCellIndex) {
                        continue;
                    }

                    $tokens = $this->gridTokensFromText($this->cleanText($cell->textContent));

                    if ($tokens !== null) {
                        array_push($line, ...$tokens);
                    }
                }

                if ($line !== []) {
                    $matrix[] = $line;
                }

                $currentRow = $this->nextElementSibling($currentRow, 'tr');
            }

            if ($matrix !== []) {
                return $matrix;
            }
        }

        $cells = $this->directChildCells($row);
        $matrix = [];
        $singleRow = [];

        foreach ($cells as $index => $cell) {
            if ($index === $nameCellIndex) {
                continue;
            }

            $text = $this->nodeTextWithBreaks($cell);
            $lines = preg_split('/\R+/u', $text) ?: [];
            $cellRows = [];

            foreach ($lines as $line) {
                $tokens = $this->gridTokensFromText($line);

                if ($tokens !== null && $tokens !== []) {
                    $cellRows[] = $tokens;
                }
            }

            if (count($cellRows) > 1) {
                foreach ($cellRows as $cellRow) {
                    $matrix[] = $cellRow;
                }
                continue;
            }

            if (count($cellRows) === 1) {
                array_push($singleRow, ...$cellRows[0]);
            }
        }

        if ($matrix !== []) {
            if ($singleRow !== []) {
                array_unshift($matrix, $singleRow);
            }
            return $matrix;
        }

        return $singleRow !== [] ? [$singleRow] : null;
    }

    private function matrixFromTable(DOMElement $table): ?array
    {
        $matrix = [];

        foreach ($table->getElementsByTagName('tr') as $tr) {
            if (!$tr instanceof DOMElement || $this->nearestAncestorTable($tr) !== $table) {
                continue;
            }

            $line = [];
            $validRow = true;

            foreach ($this->directChildCells($tr) as $cell) {
                $tokens = $this->gridTokensFromText($this->cleanText($cell->textContent));

                if ($tokens === null) {
                    $validRow = false;
                    break;
                }

                array_push($line, ...$tokens);
            }

            if ($validRow && $line !== []) {
                $matrix[] = $line;
            }
        }

        if ($matrix === [] || $this->matrixCellCount($matrix) > 30) {
            return null;
        }

        return $matrix;
    }

    /**
     * 数値・区切り・欠損記号だけなら配列を返す。
     * 日本語など別の文字が含まれる場合は null。
     */
    private function gridTokensFromText(string $text): ?array
    {
        $text = trim($text);

        if ($text === '') {
            return null;
        }

        $text = mb_convert_kana($text, 'as', 'UTF-8');
        $text = str_replace(['－', '―', '−', '–', '—'], '-', $text);

        $leftover = preg_replace('/[0-9,，、.・;；|｜\/／\-\s]+/u', '', $text);

        if ($leftover !== '') {
            return null;
        }

        preg_match_all('/\d[\d,，]*|-/u', $text, $matches);

        if (($matches[0] ?? []) === []) {
            return null;
        }

        $tokens = [];

        foreach ($matches[0] as $token) {
            if ($token === '-') {
                $tokens[] = null;
                continue;
            }

            $number = str_replace([',', '，'], '', $token);
            $tokens[] = (string) ((int) $number);
        }

        return $tokens;
    }

    private function normalizeMatrix(array $matrix): array
    {
        $matrix = array_values(array_filter(
            array_map(fn (array $row) => array_values($row), $matrix),
            fn (array $row) => $row !== []
        ));

        if ($matrix === []) {
            return [];
        }

        $cols = max(array_map('count', $matrix));

        return array_map(
            fn (array $row) => array_pad($row, $cols, null),
            $matrix
        );
    }

    private function buildKnownFurnitureIndex(array $materialRows): array
    {
        $index = [];

        foreach ($materialRows as $key => $row) {
            $name = trim((string) ($row['item_name'] ?? ''));

            if ($key === '' || $name === '') {
                continue;
            }

            if (isset($index[$key]) && $index[$key] !== $name) {
                $this->warnings[] = "家具名の正規化重複: {$index[$key]} / {$name}";
                continue;
            }

            $index[$key] = $name;
        }

        return $index;
    }

    private function buildNewEquipmentPayload(array $record, array &$usedItemIds): array
    {
        $itemName = trim((string) ($record['item_name'] ?? ''));

        if ($itemName === '') {
            throw new RuntimeException('新規登録する家具名が空です。');
        }

        $payload = [
            'item_id' => $this->generateFurnitureItemId($itemName, $usedItemIds),
            'item_name' => $itemName,
            'craft_level' => isset($record['craft_level']) ? (int) $record['craft_level'] : null,
            'slot' => '家具',
            'slot_grid_type' => $record['slot_grid_type'] ?? null,
            'slot_grid_cols' => isset($record['slot_grid_cols']) ? (int) $record['slot_grid_cols'] : null,
            'source_url' => $record['source_url'] ?? self::MATERIAL_URL,
            'detail_url' => $record['detail_url'] ?? null,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        if (array_key_exists('materials_json', $record)) {
            $payload['materials_json'] = json_encode(
                $record['materials_json'],
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            );
        }

        if (array_key_exists('slot_grid_json', $record)) {
            $payload['slot_grid_json'] = json_encode(
                $record['slot_grid_json'],
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            );
        }

        return $payload;
    }

    private function generateFurnitureItemId(string $itemName, array &$usedItemIds): string
    {
        $canonical = $this->canonicalName($itemName);
        $hash = hash('sha256', $canonical !== '' ? $canonical : $itemName);
        $length = 16;

        do {
            $itemId = 'wood_furniture_' . substr($hash, 0, $length);
            $length += 2;
        } while (isset($usedItemIds[$itemId]) && $length <= 64);

        if (isset($usedItemIds[$itemId])) {
            $suffix = 2;
            $base = $itemId;

            do {
                $itemId = $base . '_' . $suffix;
                $suffix++;
            } while (isset($usedItemIds[$itemId]));
        }

        $usedItemIds[$itemId] = true;

        return $itemId;
    }

    private function buildEquipmentIndex(array $equipments): array
    {
        $index = [];
        $duplicates = [];

        foreach ($equipments as $equipment) {
            $key = $this->canonicalName((string) $equipment->item_name);

            if ($key === '') {
                continue;
            }

            $index[$key][] = $equipment;
        }

        foreach ($index as $key => $rows) {
            if (count($rows) > 1) {
                $duplicates[$rows[0]->item_name] = array_map(
                    fn ($row) => $row->id,
                    $rows
                );
            }
        }

        return [$index, $duplicates];
    }

    private function buildItemIndex(): array
    {
        $index = [];

        foreach (DB::table('items')->select(['id', 'name'])->get() as $item) {
            $key = $this->canonicalName((string) $item->name);

            if ($key === '') {
                continue;
            }

            $index[$key][] = [
                'id' => (int) $item->id,
                'name' => (string) $item->name,
            ];
        }

        return $index;
    }

    private function resolveMaterialItem(string $name, array $itemIndex): ?array
    {
        $name = self::MATERIAL_NAME_ALIASES[$name] ?? $name;
        $key = $this->canonicalName($name);
        $matches = $itemIndex[$key] ?? [];

        return count($matches) === 1 ? $matches[0] : null;
    }

    private function canonicalName(string $value): string
    {
        $value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $value = trim($value);

        if ($value === '') {
            return '';
        }

        if (class_exists(\Normalizer::class)) {
            $normalized = \Normalizer::normalize($value, \Normalizer::FORM_KC);
            if (is_string($normalized)) {
                $value = $normalized;
            }
        }

        $value = mb_convert_kana($value, 'KVas', 'UTF-8');
        $value = mb_convert_kana($value, 'c', 'UTF-8');
        $value = mb_strtolower($value, 'UTF-8');

        // 「カウンター/カウンタ」「パーティー/パーティ」などを同一視する。
        $value = str_replace(['〜', '～'], 'ー', $value);
        // バックスラッシュは正規表現の文字クラスに含めず、先に除去する。
        // これにより環境差による "missing terminating ]" を確実に避ける。
        $value = str_replace('\\', '', $value);
        $value = preg_replace(
            '/[\s　・･\-_‐‑‒–—―ー「」『』【】\[\]（）()、，,.。:：\/]+/u',
            '',
            $value
        );

        return $value ?? '';
    }

    private function directChildCells(DOMElement $row): array
    {
        $cells = [];

        foreach ($row->childNodes as $child) {
            if (!$child instanceof DOMElement) {
                continue;
            }

            if (in_array(strtolower($child->tagName), ['td', 'th'], true)) {
                $cells[] = $child;
            }
        }

        return $cells;
    }

    private function nearestAncestorTable(DOMNode $node): ?DOMElement
    {
        $parent = $node->parentNode;

        while ($parent instanceof DOMNode) {
            if ($parent instanceof DOMElement && strtolower($parent->tagName) === 'table') {
                return $parent;
            }

            $parent = $parent->parentNode;
        }

        return null;
    }

    private function nextElementSibling(DOMElement $node, string $tagName): ?DOMElement
    {
        $sibling = $node->nextSibling;

        while ($sibling instanceof DOMNode) {
            if ($sibling instanceof DOMElement && strtolower($sibling->tagName) === strtolower($tagName)) {
                return $sibling;
            }

            $sibling = $sibling->nextSibling;
        }

        return null;
    }

    private function nodeTextWithBreaks(DOMElement $node): string
    {
        $html = $node->ownerDocument?->saveHTML($node) ?: $node->textContent;
        $html = preg_replace('/<br\s*\/?\s*>/i', "\n", $html);
        $html = preg_replace('/<\/(p|div|li|tr|td|th)>/i', "\n", $html);
        $text = strip_tags((string) $html);
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = str_replace(["\r\n", "\r"], "\n", $text);
        $text = preg_replace('/[ \t　]+/u', ' ', $text);
        $text = preg_replace('/\n[ \t　]+/u', "\n", $text);
        $text = preg_replace('/[ \t　]+\n/u', "\n", $text);
        $text = preg_replace('/\n{2,}/u', "\n", $text);

        return trim((string) $text);
    }

    private function cleanText(?string $value): string
    {
        $value = html_entity_decode((string) $value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $value = str_replace(["\r\n", "\r", "\n", "\t"], ' ', $value);
        $value = preg_replace('/[\s　]+/u', ' ', $value);

        return trim((string) $value);
    }

    private function toAsciiNumber(string $value): string
    {
        return mb_convert_kana($value, 'n', 'UTF-8');
    }

    private function hasJsonValue(mixed $value): bool
    {
        if ($value === null || $value === '') {
            return false;
        }

        if (is_array($value)) {
            return $value !== [];
        }

        if (is_string($value)) {
            $decoded = json_decode($value, true);
            return is_array($decoded) ? $decoded !== [] : trim($value) !== '';
        }

        return true;
    }

    private function printJsonLog(array $rows): void
    {
        if ($rows === []) {
            return;
        }

        $this->newLine();
        $this->info('登録JSON詳細（DBへ保存する文字列）:');

        $total = count($rows);

        foreach ($rows as $index => $row) {
            $number = $index + 1;
            $itemName = (string) ($row['item_name'] ?? '-');
            $equipmentId = (string) ($row['equipment_id'] ?? '-');
            $result = (string) ($row['result'] ?? '-');
            $materialsJson = $row['materials_json'] ?? null;
            $slotGridJson = $row['slot_grid_json'] ?? null;

            $this->newLine();
            $this->line("[{$number}/{$total}] {$itemName} / equipment ID: {$equipmentId} / {$result}");
            $this->line('materials_json: ' . ($materialsJson !== null ? $materialsJson : '(変更なし・データなし)'));
            $this->line('slot_grid_json: ' . ($slotGridJson !== null ? $slotGridJson : '(変更なし・データなし)'));
        }
    }

    private function matrixCellCount(array $matrix): int
    {
        return array_sum(array_map('count', $matrix));
    }

    private function gridLabel(array $matrix): string
    {
        if ($matrix === []) {
            return '-';
        }

        return count($matrix) . '×' . max(array_map('count', $matrix));
    }
}
