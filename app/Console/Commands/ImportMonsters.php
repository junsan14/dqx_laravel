<?php

namespace App\Console\Commands;

use App\Models\Monster;
use DOMDocument;
use DOMElement;
use DOMNode;
use DOMXPath;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Throwable;

class ImportMonsters extends Command
{
    protected $signature = 'dq10:import-monsters
        {--group=all : all / a / ka / sa / ta / na / ha / ma / ya / ra / wa}
        {--offset=0 : 先頭からスキップする件数}
        {--limit= : 処理する最大件数}
        {--sleep=1000 : 各詳細ページ取得後の待機時間（ミリ秒）}
        {--dry-run : DBへ保存せず取得結果だけ確認する}';

    protected $description = 'ドラクエ10極限攻略の50音順一覧からモンスター名・系統・転生情報を取得して保存する';

    private const BASE_URL = 'https://xn--10-yg4a1a3kyh.jp';

    /** @var array<string, string> */
    private const LIST_PAGES = [
        'a'  => self::BASE_URL . '/a_mon/dq10_monster_lg_a.html',
        'ka' => self::BASE_URL . '/a_mon/dq10_monster_lg_ka.html',
        'sa' => self::BASE_URL . '/a_mon/dq10_monster_lg_sa.html',
        'ta' => self::BASE_URL . '/a_mon/dq10_monster_lg_ta.html',
        'na' => self::BASE_URL . '/a_mon/dq10_monster_lg_na.html',
        'ha' => self::BASE_URL . '/a_mon/dq10_monster_lg_ha.html',
        'ma' => self::BASE_URL . '/a_mon/dq10_monster_lg_ma.html',
        'ya' => self::BASE_URL . '/a_mon/dq10_monster_lg_ya.html',
        'ra' => self::BASE_URL . '/a_mon/dq10_monster_lg_ra.html',
        'wa' => self::BASE_URL . '/a_mon/dq10_monster_lg_wa.html',
    ];

    /** @var array<int, array{name: string, url: string}> */
    private array $failed = [];

    /**
     * @var array<int, array{
     *     id: int|string|null,
     *     display_order: int,
     *     name: string,
     *     system_type: ?string,
     *     is_reincarnated: bool,
     *     reincarnation_parent_name: ?string,
     *     reincarnation_parent_id: int|string|null,
     *     source_url: string,
     *     result: string
     * }>
     */
    private array $created = [];

    private int $skippedExisting = 0;

    /** @var array<string, string> 転生モンスター名 => 転生元候補名 */
    private array $reincarnationParentCandidates = [];

    public function handle(): int
    {
        $group = (string) $this->option('group');
        $offset = max(0, (int) $this->option('offset'));
        $limitOption = $this->option('limit');
        $limit = $limitOption === null || $limitOption === ''
            ? null
            : max(0, (int) $limitOption);
        $sleepMs = max(0, (int) $this->option('sleep'));
        $dryRun = (bool) $this->option('dry-run');

        if ($group !== 'all' && ! array_key_exists($group, self::LIST_PAGES)) {
            $this->error('--group は all / ' . implode(' / ', array_keys(self::LIST_PAGES)) . ' のいずれかです。');

            return self::FAILURE;
        }

        $pages = $group === 'all'
            ? self::LIST_PAGES
            : [$group => self::LIST_PAGES[$group]];

        $this->info('一覧ページからモンスターリンクを収集します。');

        try {
            $monsters = $this->collectMonsterLinks($pages);
        } catch (Throwable $e) {
            report($e);
            $this->error('一覧ページの取得に失敗しました: ' . $e->getMessage());

            return self::FAILURE;
        }

        $totalFound = count($monsters);
        $monsters = array_slice($monsters, $offset, $limit);

        $this->line("取得候補: {$totalFound}件 / 今回処理: " . count($monsters) . '件');
        $this->line('既存判定: source_url または name が一致した場合は更新せずスキップします。');

        if ($dryRun) {
            $this->warn('dry-run: DBへの保存は行わず、新規登録候補をログへ出力します。');
        }

        $nextDisplayOrder = ((int) Monster::query()->max('display_order')) + 1;
        $bar = $this->output->createProgressBar(count($monsters));
        $bar->start();

        foreach ($monsters as $item) {
            try {
                $existing = Monster::query()
                    ->where('source_url', $item['url'])
                    ->orWhere('name', $item['name'])
                    ->first();

                if ($existing !== null) {
                    $this->skippedExisting++;
                    $bar->advance();
                    continue;
                }

                $detailHtml = $this->fetch($item['url']);
                $detail = $this->parseDetailPage($detailHtml);

                $data = [
                    'display_order' => $nextDisplayOrder,
                    'name' => $item['name'],
                    'system_type' => $detail['system_type'],
                    'is_reincarnated' => $detail['is_reincarnated'],
                    'source_url' => $item['url'],
                ];

                if ($detail['parent_name'] !== null) {
                    $this->reincarnationParentCandidates[$item['name']] = $detail['parent_name'];
                }

                $monsterId = null;

                if (! $dryRun) {
                    $monster = new Monster();
                    $monster->forceFill($data);
                    $monster->save();
                    $monsterId = $monster->getKey();
                }

                $this->created[] = [
                    'id' => $monsterId,
                    'display_order' => $nextDisplayOrder,
                    'name' => $item['name'],
                    'system_type' => $detail['system_type'],
                    'is_reincarnated' => $detail['is_reincarnated'],
                    'reincarnation_parent_name' => $detail['parent_name'],
                    'reincarnation_parent_id' => null,
                    'source_url' => $item['url'],
                    'result' => $dryRun ? 'would_create' : 'created',
                ];

                $nextDisplayOrder++;
            } catch (Throwable $e) {
                report($e);
                $this->failed[] = [
                    'name' => $item['name'],
                    'url' => $item['url'],
                ];
            }

            $bar->advance();

            if ($sleepMs > 0) {
                usleep($sleepMs * 1000);
            }
        }

        $bar->finish();
        $this->newLine(2);

        if (! $dryRun) {
            $linked = $this->linkReincarnationParents();
            $this->info("新規モンスターの転生元を紐づけた件数: {$linked}件");
        }

        $createdLogPath = $this->writeCreatedLog($dryRun);

        $this->info(($dryRun ? '新規登録候補' : '新規登録') . ': ' . count($this->created) . '件');
        $this->info("既存のためスキップ: {$this->skippedExisting}件");
        $this->line("新規データログ: {$createdLogPath}");

        if ($this->created !== []) {
            $this->newLine();
            $this->table(
                ['結果', 'ID', '表示順', 'モンスター名', '系統', '転生'],
                array_map(
                    static fn (array $row): array => [
                        $row['result'],
                        $row['id'] ?? '-',
                        $row['display_order'],
                        $row['name'],
                        $row['system_type'] ?? '-',
                        $row['is_reincarnated'] ? 'YES' : 'NO',
                    ],
                    $this->created
                )
            );
        } else {
            $this->comment($dryRun
                ? 'DBにない新規登録候補はありませんでした。'
                : 'DBへ新規登録したモンスターはありませんでした。');
        }

        if ($this->failed !== []) {
            $path = $this->writeFailureLog();
            $this->warn('失敗: ' . count($this->failed) . "件（{$path}）");
        }

        return $this->failed === [] ? self::SUCCESS : self::FAILURE;
    }

    /**
     * @param array<string, string> $pages
     * @return array<int, array{name: string, url: string}>
     */
    private function collectMonsterLinks(array $pages): array
    {
        $items = [];
        $seenUrls = [];

        foreach ($pages as $label => $url) {
            $this->line("[{$label}] {$url}");

            $html = $this->fetch($url);
            $xpath = $this->createXPath($html);
            $nodes = $xpath->query('//a[contains(@href, "dq10_monster_k_") and contains(@href, ".html")]');

            if ($nodes === false) {
                continue;
            }

            foreach ($nodes as $node) {
                if (! $node instanceof DOMElement) {
                    continue;
                }

                $name = $this->cleanText($node->textContent);
                $href = trim($node->getAttribute('href'));

                if ($name === '' || $href === '') {
                    continue;
                }

                $detailUrl = $this->resolveUrl($url, $href);

                if (isset($seenUrls[$detailUrl])) {
                    continue;
                }

                $seenUrls[$detailUrl] = true;
                $items[] = [
                    'name' => $name,
                    'url' => $detailUrl,
                ];
            }
        }

        return $items;
    }

    /**
     * @return array{system_type: ?string, is_reincarnated: bool, parent_name: ?string}
     */
    private function parseDetailPage(string $html): array
    {
        $xpath = $this->createXPath($html);

        return [
            'system_type' => $this->extractSystemType($xpath),
            'is_reincarnated' => $this->isReincarnated($xpath),
            'parent_name' => $this->extractReincarnationParentName($xpath),
        ];
    }

    private function extractSystemType(DOMXPath $xpath): ?string
    {
        $headerCells = $xpath->query('//*[self::th or self::td][normalize-space(string(.))="系統"]');

        if ($headerCells !== false) {
            foreach ($headerCells as $headerCell) {
                $row = $headerCell->parentNode;

                if (! $row instanceof DOMElement || strtolower($row->tagName) !== 'tr') {
                    continue;
                }

                $valueRow = $this->nextElementSibling($row);

                if (! $valueRow instanceof DOMElement || strtolower($valueRow->tagName) !== 'tr') {
                    continue;
                }

                foreach ($valueRow->childNodes as $cell) {
                    if (! $cell instanceof DOMElement) {
                        continue;
                    }

                    if (! in_array(strtolower($cell->tagName), ['th', 'td'], true)) {
                        continue;
                    }

                    $value = $this->cleanText($cell->textContent);

                    if ($value !== '') {
                        return $value;
                    }
                }
            }
        }

        // HTML構造が少し変わった場合の予備抽出。
        $pageText = $this->cleanText($xpath->document->textContent ?? '');

        if (preg_match('/系統\s+経験値\s+ゴールド\s+特訓\s+格下Lv\s+([^\s]+系)/u', $pageText, $matches) === 1) {
            return $matches[1];
        }

        return null;
    }

    private function isReincarnated(DOMXPath $xpath): bool
    {
        $sectionText = $this->extractSectionText($xpath, 'ボス出現機会');

        return str_contains($sectionText, '転生モンスター');
    }

    private function extractReincarnationParentName(DOMXPath $xpath): ?string
    {
        $items = $this->extractSectionListItems($xpath, '出現地域');

        foreach ($items as $item) {
            if (preg_match('/[（(]転生[）)]\s*([^\s、。…）)]+)/u', $item, $matches) === 1) {
                return $this->normalizeParentName($matches[1]);
            }

            if (preg_match('/([^\s、。…（）()]+)の転生/u', $item, $matches) === 1) {
                return $this->normalizeParentName($matches[1]);
            }
        }

        return null;
    }

    private function normalizeParentName(string $name): ?string
    {
        $name = trim($name, " \t\n\r\0\x0B・,，。:：");
        $name = trim($name);

        return $name === '' ? null : $name;
    }

    private function extractSectionText(DOMXPath $xpath, string $headingNeedle): string
    {
        $heading = $this->findHeading($xpath, $headingNeedle);

        if (! $heading instanceof DOMElement) {
            return '';
        }

        $chunks = [];

        for ($node = $heading->nextSibling; $node !== null; $node = $node->nextSibling) {
            if ($this->isHeadingNode($node)) {
                break;
            }

            $text = $this->cleanText($node->textContent ?? '');

            if ($text !== '') {
                $chunks[] = $text;
            }
        }

        return implode(' ', $chunks);
    }

    /** @return array<int, string> */
    private function extractSectionListItems(DOMXPath $xpath, string $headingNeedle): array
    {
        $heading = $this->findHeading($xpath, $headingNeedle);

        if (! $heading instanceof DOMElement) {
            return [];
        }

        $items = [];

        for ($node = $heading->nextSibling; $node !== null; $node = $node->nextSibling) {
            if ($this->isHeadingNode($node)) {
                break;
            }

            if (! $node instanceof DOMElement) {
                continue;
            }

            if (strtolower($node->tagName) === 'li') {
                $text = $this->cleanText($node->textContent);
                if ($text !== '') {
                    $items[] = $text;
                }
            }

            $descendants = $node->getElementsByTagName('li');

            foreach ($descendants as $li) {
                $text = $this->cleanText($li->textContent);

                if ($text !== '') {
                    $items[] = $text;
                }
            }
        }

        return array_values(array_unique($items));
    }

    private function findHeading(DOMXPath $xpath, string $needle): ?DOMElement
    {
        $query = sprintf(
            '//*[self::h2 or self::h3 or self::h4][contains(normalize-space(string(.)), "%s")]',
            $needle
        );
        $nodes = $xpath->query($query);

        if ($nodes === false) {
            return null;
        }

        foreach ($nodes as $node) {
            if ($node instanceof DOMElement) {
                return $node;
            }
        }

        return null;
    }

    private function isHeadingNode(DOMNode $node): bool
    {
        return $node instanceof DOMElement
            && in_array(strtolower($node->tagName), ['h2', 'h3', 'h4'], true);
    }

    private function nextElementSibling(DOMNode $node): ?DOMElement
    {
        for ($sibling = $node->nextSibling; $sibling !== null; $sibling = $sibling->nextSibling) {
            if ($sibling instanceof DOMElement) {
                return $sibling;
            }
        }

        return null;
    }

    private function linkReincarnationParents(): int
    {
        $linked = 0;

        foreach ($this->reincarnationParentCandidates as $monsterName => $parentName) {
            $monster = Monster::query()->where('name', $monsterName)->first();
            $parent = Monster::query()->where('name', $parentName)->first();

            if (! $monster || ! $parent || $monster->is($parent)) {
                continue;
            }

            $monster->forceFill([
                'is_reincarnated' => true,
                'reincarnation_parent_id' => $parent->getKey(),
            ])->save();

            foreach ($this->created as &$createdMonster) {
                if ($createdMonster['name'] !== $monsterName) {
                    continue;
                }

                $createdMonster['is_reincarnated'] = true;
                $createdMonster['reincarnation_parent_id'] = $parent->getKey();
                break;
            }
            unset($createdMonster);

            $linked++;
        }

        return $linked;
    }

    private function fetch(string $url): string
    {
        $response = Http::withHeaders([
            'User-Agent' => config('app.name', 'Laravel') . '/1.0 monster-importer',
            'Accept' => 'text/html,application/xhtml+xml',
            'Accept-Language' => 'ja,en;q=0.8',
        ])
            ->timeout(30)
            ->retry(3, 1200)
            ->get($url)
            ->throw();

        return $this->toUtf8($response->body());
    }

    private function toUtf8(string $html): string
    {
        $encoding = mb_detect_encoding(
            $html,
            ['UTF-8', 'SJIS-win', 'EUC-JP', 'JIS'],
            true
        );

        if ($encoding !== false && $encoding !== 'UTF-8') {
            return mb_convert_encoding($html, 'UTF-8', $encoding);
        }

        return $html;
    }

    private function createXPath(string $html): DOMXPath
    {
        $previous = libxml_use_internal_errors(true);

        $dom = new DOMDocument('1.0', 'UTF-8');
        $dom->loadHTML(
            '<?xml encoding="UTF-8">' . $html,
            LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_NONET
        );

        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        return new DOMXPath($dom);
    }

    private function cleanText(string $value): string
    {
        $value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $value = str_replace(["\u{00A0}", "\u{3000}"], ' ', $value);
        $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

        return trim($value);
    }

    private function resolveUrl(string $baseUrl, string $href): string
    {
        $href = html_entity_decode(trim($href), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $href = preg_replace('/#.*$/', '', $href) ?? $href;

        if (preg_match('#^https?://#i', $href) === 1) {
            return $href;
        }

        $parts = parse_url($baseUrl);
        $scheme = $parts['scheme'] ?? 'https';
        $host = $parts['host'] ?? parse_url(self::BASE_URL, PHP_URL_HOST);
        $port = isset($parts['port']) ? ':' . $parts['port'] : '';
        $origin = "{$scheme}://{$host}{$port}";

        if (str_starts_with($href, '/')) {
            return $origin . $href;
        }

        $basePath = $parts['path'] ?? '/';
        $directory = rtrim(str_replace('\\', '/', dirname($basePath)), '/');
        $directory = $directory === '.' ? '' : $directory;

        return $origin . ($directory !== '' ? $directory : '') . '/' . ltrim($href, '/');
    }

    private function writeCreatedLog(bool $dryRun): string
    {
        $logType = $dryRun ? 'dry_run' : 'created';
        $relativePath = 'imports/monster_import_' . $logType . '_' . now()->format('Ymd_His') . '.json';
        $fullPath = storage_path('app/' . $relativePath);

        if (! is_dir(dirname($fullPath))) {
            mkdir(dirname($fullPath), 0775, true);
        }

        $payload = [
            'executed_at' => now()->toIso8601String(),
            'dry_run' => $dryRun,
            'created_count' => count($this->created),
            'skipped_existing_count' => $this->skippedExisting,
            'failed_count' => count($this->failed),
            'monsters' => $this->created,
        ];

        file_put_contents(
            $fullPath,
            json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );

        return 'storage/app/' . $relativePath;
    }

    private function writeFailureLog(): string
    {
        $relativePath = 'imports/monster_import_failures_' . now()->format('Ymd_His') . '.json';
        $fullPath = storage_path('app/' . $relativePath);

        if (! is_dir(dirname($fullPath))) {
            mkdir(dirname($fullPath), 0775, true);
        }

        file_put_contents(
            $fullPath,
            json_encode($this->failed, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
        );

        return 'storage/app/' . $relativePath;
    }
}
