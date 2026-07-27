<?php

namespace App\Console\Commands;

use App\Models\Monster;
use DOMDocument;
use DOMElement;
use DOMNode;
use DOMXPath;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Normalizer;
use Throwable;

class ImportMonsterTrivia extends Command
{
    protected $signature = 'dq10:import-monster-trivia
        {--offset=0 : 一覧の先頭からスキップする件数}
        {--limit= : 処理する最大件数}
        {--sleep=1000 : 詳細ページ取得後の待機時間（ミリ秒）}
        {--dry-run : DBを更新せず、更新候補だけ確認する}
        {--force : 既存の trivia_1 / trivia_2 も取得値で上書きする}';

    protected $description = '攻略の虎のモンスター図鑑から「まめちしき」を取得し、既存モンスターへ保存する';

    private const INDEX_URL = 'https://dragon-quest.jp/ten/monster/zukan/';
    private const BASE_URL = 'https://dragon-quest.jp';

    /** @var array<int, array<string, mixed>> */
    private array $updated = [];

    /** @var array<int, array<string, mixed>> */
    private array $notFound = [];

    /** @var array<int, array<string, mixed>> */
    private array $noTrivia = [];

    /** @var array<int, array<string, mixed>> */
    private array $failed = [];

    private int $skippedCompleted = 0;

    public function handle(): int
    {
        $offset = max(0, (int) $this->option('offset'));
        $limitOption = $this->option('limit');
        $limit = $limitOption === null || $limitOption === ''
            ? null
            : max(0, (int) $limitOption);
        $sleepMs = max(0, (int) $this->option('sleep'));
        $dryRun = (bool) $this->option('dry-run');
        $force = (bool) $this->option('force');

        $this->info('モンスター図鑑一覧から詳細ページを収集します。');

        try {
            $indexHtml = $this->fetch(self::INDEX_URL);
            $links = $this->parseMonsterLinks($indexHtml, self::INDEX_URL);
        } catch (Throwable $e) {
            report($e);
            $this->error('一覧ページの取得・解析に失敗しました: ' . $e->getMessage());

            return self::FAILURE;
        }

        $allCount = count($links);
        $links = array_slice($links, $offset, $limit);

        $this->line("一覧取得: {$allCount}件 / 今回処理: " . count($links) . '件');
        $this->line('DBに存在しないモンスターは新規作成せず、見つからない一覧へ記録します。');

        if ($dryRun) {
            $this->warn('dry-run: DBは更新しません。');
        }

        if ($force) {
            $this->warn('force: 既存の trivia_1 / trivia_2 も上書きします。');
        }

        [$exactNameMap, $normalizedNameMap] = $this->buildMonsterMaps();

        $bar = $this->output->createProgressBar(count($links));
        $bar->start();

        foreach ($links as $item) {
            try {
                $monster = $this->findMonster(
                    $item['name'],
                    $exactNameMap,
                    $normalizedNameMap
                );

                if ($monster === null) {
                    $this->notFound[] = [
                        'name' => $item['name'],
                        'url' => $item['url'],
                        'reason' => 'DBの monsters.name に一致するデータがありません',
                    ];
                    $bar->advance();
                    continue;
                }

                $hasTrivia1 = $this->hasText($monster->trivia_1);
                $hasTrivia2 = $this->hasText($monster->trivia_2);

                if (! $force && $hasTrivia1 && $hasTrivia2) {
                    $this->skippedCompleted++;
                    $bar->advance();
                    continue;
                }

                $detailHtml = $this->fetch($item['url']);
                $detail = $this->parseDetailPage($detailHtml);

                if ($detail['trivia_1'] === null) {
                    $this->noTrivia[] = [
                        'monster_id' => $monster->getKey(),
                        'name' => $monster->name,
                        'list_name' => $item['name'],
                        'url' => $item['url'],
                        'reason' => 'まめちしきを取得できませんでした',
                    ];
                    $bar->advance();
                    $this->sleep($sleepMs);
                    continue;
                }

                $beforeTrivia1 = $monster->trivia_1;
                $beforeTrivia2 = $monster->trivia_2;

                if ($force || ! $hasTrivia1) {
                    $monster->trivia_1 = $detail['trivia_1'];
                }

                if ($force || ! $hasTrivia2) {
                    $monster->trivia_2 = $detail['trivia_2'];
                }

                $changedFields = [];

                if ($beforeTrivia1 !== $monster->trivia_1) {
                    $changedFields[] = 'trivia_1';
                }

                if ($beforeTrivia2 !== $monster->trivia_2) {
                    $changedFields[] = 'trivia_2';
                }

                if ($changedFields === []) {
                    $this->skippedCompleted++;
                    $bar->advance();
                    $this->sleep($sleepMs);
                    continue;
                }

                if (! $dryRun) {
                    $monster->save();
                }

                $this->updated[] = [
                    'result' => $dryRun ? 'would_update' : 'updated',
                    'monster_id' => $monster->getKey(),
                    'name' => $monster->name,
                    'detail_name' => $detail['name'],
                    'changed_fields' => $changedFields,
                    'trivia_1' => $monster->trivia_1,
                    'trivia_2' => $monster->trivia_2,
                    'url' => $item['url'],
                ];
            } catch (Throwable $e) {
                report($e);
                $this->failed[] = [
                    'name' => $item['name'],
                    'url' => $item['url'],
                    'error' => $e->getMessage(),
                ];
            }

            $bar->advance();
            $this->sleep($sleepMs);
        }

        $bar->finish();
        $this->newLine(2);

        $logPath = $this->writeLog($dryRun, $force, $allCount, count($links));

        $this->info(($dryRun ? '更新候補' : '更新') . ': ' . count($this->updated) . '件');
        $this->info("豆知識入力済みのためスキップ: {$this->skippedCompleted}件");
        $this->info('DBに見つからない: ' . count($this->notFound) . '件');
        $this->info('豆知識を取得できない: ' . count($this->noTrivia) . '件');
        $this->info('取得失敗: ' . count($this->failed) . '件');
        $this->line("実行ログ: {$logPath}");

        $this->showTables();

        return $this->failed === [] ? self::SUCCESS : self::FAILURE;
    }

    /**
     * @return array{0: array<string, Monster>, 1: array<string, Monster|null>}
     */
    private function buildMonsterMaps(): array
    {
        $exact = [];
        $normalized = [];

        Monster::query()
            ->select(['id', 'name', 'trivia_1', 'trivia_2'])
            ->orderBy('id')
            ->each(function (Monster $monster) use (&$exact, &$normalized): void {
                $name = trim((string) $monster->name);

                if ($name === '') {
                    return;
                }

                $exact[$name] ??= $monster;

                $normalizedName = $this->normalizeName($name);

                if (! array_key_exists($normalizedName, $normalized)) {
                    $normalized[$normalizedName] = $monster;
                } else {
                    // 正規化後に同名となる複数データがある場合は、誤更新防止のため候補から外します。
                    $normalized[$normalizedName] = null;
                }
            });

        return [$exact, $normalized];
    }

    /**
     * @param array<string, Monster> $exactNameMap
     * @param array<string, Monster|null> $normalizedNameMap
     */
    private function findMonster(
        string $name,
        array $exactNameMap,
        array $normalizedNameMap
    ): ?Monster {
        $name = trim($name);

        if (isset($exactNameMap[$name])) {
            return $exactNameMap[$name];
        }

        $normalized = $this->normalizeName($name);

        return $normalizedNameMap[$normalized] ?? null;
    }

    /**
     * @return array<int, array{name: string, url: string}>
     */
    private function parseMonsterLinks(string $html, string $pageUrl): array
    {
        $dom = $this->createDom($html);
        $xpath = new DOMXPath($dom);
        $links = [];

        // モンスターリンクは図鑑一覧表の td 内にあり、
        // href は sura/01.php のような相対URLになっています。
        foreach ($xpath->query('//td//a[@href]') ?: [] as $anchor) {
            if (! $anchor instanceof DOMElement) {
                continue;
            }

            $name = $this->cleanText($anchor->textContent);
            $href = trim($anchor->getAttribute('href'));

            if ($name === '' || $href === '' || str_starts_with($href, '#')) {
                continue;
            }

            // 一覧にあるモンスター詳細への相対リンクだけを対象にします。
            // 例: sura/01.php、kemono/02.php
            if (! preg_match('~^(?:\./)?[^/?#]+/[^/?#]+\.php(?:[?#].*)?$~i', $href)) {
                continue;
            }

            $url = $this->resolveUrl($pageUrl, $href);
            $path = (string) parse_url($url, PHP_URL_PATH);

            // 正規化後のURLも念のため確認します。
            // 例: /ten/monster/zukan/sura/01.php
            if (! preg_match('~^/ten/monster/zukan/[^/]+/[^/]+\.php$~i', $path)) {
                continue;
            }

            $links[$url] = [
                'name' => $name,
                'url' => $url,
            ];
        }

        return array_values($links);
    }

    /**
     * @return array{name: ?string, trivia_1: ?string, trivia_2: ?string}
     */
    private function parseDetailPage(string $html): array
    {
        $dom = $this->createDom($html);
        $xpath = new DOMXPath($dom);

        $name = $this->extractDetailName($xpath);
        $paragraphs = $this->extractTriviaParagraphs($xpath);

        return [
            'name' => $name,
            'trivia_1' => $paragraphs[0] ?? null,
            'trivia_2' => $paragraphs[1] ?? null,
        ];
    }

    private function extractDetailName(DOMXPath $xpath): ?string
    {
        foreach (['//h1[1]', '//h2[1]', '//h3[1]'] as $query) {
            $node = $xpath->query($query)?->item(0);

            if ($node === null) {
                continue;
            }

            $text = $this->cleanText($node->textContent);
            $text = preg_replace('/\s*[|｜].*$/u', '', $text) ?? $text;

            if ($text !== '' && ! str_contains($text, 'モンスター図鑑')) {
                return $text;
            }
        }

        return null;
    }

    /**
     * @return array<int, string>
     */
    private function extractTriviaParagraphs(DOMXPath $xpath): array
    {
        // 詳細ページでは、まめちしきは table#ggtable に次の順番で格納されています。
        // 1行目: 見出し「まめちしき」
        // 2行目: trivia_1
        // 3行目: trivia_2
        $marker = $xpath->query(
            '//table[@id="ggtable"]//td['
            . 'contains(concat(" ", normalize-space(@class), " "), " cate_bar ") '
            . 'and normalize-space(translate(string(.), "　", " ")) = "まめちしき"'
            . ']'
        )?->item(0);

        if ($marker instanceof DOMElement) {
            $cells = $xpath->query(
                'ancestor::tr[1]/following-sibling::tr/td[1]',
                $marker
            );

            if ($cells !== false) {
                $paragraphs = [];

                foreach ($cells as $cell) {
                    if (! $cell instanceof DOMElement) {
                        continue;
                    }

                    // <br> は改行や空白へ変換せず削除し、1本の文章として保存します。
                    $text = $this->cleanText($this->nodeTextWithoutBreaks($cell));

                    if ($text === '') {
                        continue;
                    }

                    $paragraphs[] = $text;

                    if (count($paragraphs) >= 2) {
                        return $paragraphs;
                    }
                }
            }
        }

        // サイト側のHTML構造が変更された場合に備え、従来の抽出処理も残します。
        $markers = $xpath->query(
            '//*[normalize-space(translate(string(.), "　", " ")) = "まめちしき"]'
        );

        if ($markers !== false) {
            foreach ($markers as $fallbackMarker) {
                if (! $fallbackMarker instanceof DOMElement || ! $this->isDeepestTriviaMarker($fallbackMarker)) {
                    continue;
                }

                $paragraphs = $this->collectAfterMarker($xpath, $fallbackMarker);

                if ($paragraphs !== []) {
                    return array_slice($paragraphs, 0, 2);
                }
            }
        }

        return $this->extractTriviaFromWholeDocument($xpath);
    }

    private function isDeepestTriviaMarker(DOMElement $element): bool
    {
        foreach ($element->childNodes as $child) {
            if ($child instanceof DOMElement && $this->cleanText($child->textContent) === 'まめちしき') {
                return false;
            }
        }

        return true;
    }

    /**
     * @return array<int, string>
     */
    private function collectAfterMarker(DOMXPath $xpath, DOMElement $marker): array
    {
        $paragraphs = [];
        $nodes = $xpath->query(
            'following::*[self::p or self::td or self::dd or self::li or self::div]',
            $marker
        );

        if ($nodes === false) {
            return [];
        }

        foreach ($nodes as $node) {
            if (! $node instanceof DOMElement) {
                continue;
            }

            if ($this->containsMeaningfulBlockChild($node)) {
                continue;
            }

            $textWithBreaks = $this->nodeTextWithBreaks($node);
            $plainText = $this->cleanText($textWithBreaks);

            if ($plainText === '' || $plainText === 'まめちしき') {
                continue;
            }

            if ($this->isTriviaEndText($plainText)) {
                break;
            }

            foreach ($this->splitTriviaBlocks($textWithBreaks) as $block) {
                if ($this->isTriviaEndText($block)) {
                    break 2;
                }

                if (! $this->looksLikeTrivia($block)) {
                    continue;
                }

                if (! in_array($block, $paragraphs, true)) {
                    $paragraphs[] = $block;
                }

                if (count($paragraphs) >= 2) {
                    return $paragraphs;
                }
            }
        }

        return $paragraphs;
    }

    private function containsMeaningfulBlockChild(DOMElement $element): bool
    {
        foreach ($element->childNodes as $child) {
            if (! $child instanceof DOMElement) {
                continue;
            }

            if (in_array(strtolower($child->tagName), ['p', 'td', 'dd', 'li', 'div'], true)
                && $this->cleanText($child->textContent) !== '') {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array<int, string>
     */
    private function extractTriviaFromWholeDocument(DOMXPath $xpath): array
    {
        $body = $xpath->query('//body')?->item(0);

        if ($body === null) {
            return [];
        }

        $text = $this->nodeTextWithBreaks($body);

        if (! preg_match('/まめちしき\s*(.+?)(?:スポンサー\s*リンク|情報提供、?コメント|最新ニュース)/us', $text, $matches)) {
            return [];
        }

        return array_slice($this->splitTriviaBlocks($matches[1]), 0, 2);
    }

    /**
     * @return array<int, string>
     */
    private function splitTriviaBlocks(string $text): array
    {
        $text = str_replace(["\r\n", "\r", "\u{00A0}"], ["\n", "\n", ' '], $text);
        $text = preg_replace('/[ \t　]+/u', ' ', $text) ?? $text;
        $text = preg_replace('/ *\n */u', "\n", $text) ?? $text;
        $text = preg_replace('/\n{3,}/u', "\n\n", $text) ?? $text;
        $text = trim($text);

        if ($text === '') {
            return [];
        }

        $blocks = preg_split('/\n{2,}/u', $text) ?: [];

        if (count($blocks) < 2) {
            $lines = array_values(array_filter(
                array_map(fn (string $line): string => $this->cleanText($line), explode("\n", $text)),
                static fn (string $line): bool => $line !== ''
            ));

            if (count($lines) >= 2) {
                $blocks = $lines;
            }
        }

        $result = [];

        foreach ($blocks as $block) {
            $block = $this->cleanText($block);

            if ($block === '' || $block === 'まめちしき') {
                continue;
            }

            $result[] = $block;
        }

        return $result;
    }

    private function looksLikeTrivia(string $text): bool
    {
        if (mb_strlen($text) < 8) {
            return false;
        }

        $ignored = [
            '基本情報',
            '弱点・耐性',
            '特技',
            '宝珠ドロップ',
            '白宝箱',
            '生息地',
            'モンスター図鑑一覧ページへ',
        ];

        foreach ($ignored as $value) {
            if ($text === $value) {
                return false;
            }
        }

        return true;
    }

    private function isTriviaEndText(string $text): bool
    {
        return str_contains($text, 'スポンサーリンク')
            || str_contains($text, 'スポンサー リンク')
            || str_contains($text, '情報提供、コメント')
            || str_contains($text, '情報提供、 コメント')
            || str_contains($text, '最新ニュース・アップデート情報');
    }

    private function nodeTextWithoutBreaks(DOMNode $node): string
    {
        if ($node->nodeType === XML_TEXT_NODE) {
            return $node->nodeValue ?? '';
        }

        // 後で前後の改行・インデントごと除去するため、一時的な印を返します。
        if ($node instanceof DOMElement && strtolower($node->tagName) === 'br') {
            return "\u{E000}";
        }

        $text = '';

        foreach ($node->childNodes as $child) {
            $text .= $this->nodeTextWithoutBreaks($child);
        }

        return preg_replace('/\s*\x{E000}\s*/u', '', $text) ?? $text;
    }

    private function nodeTextWithBreaks(DOMNode $node): string
    {
        if ($node->nodeType === XML_TEXT_NODE) {
            return $node->nodeValue ?? '';
        }

        if ($node instanceof DOMElement && strtolower($node->tagName) === 'br') {
            return "\n";
        }

        $text = '';
        $blockTags = ['p', 'div', 'td', 'tr', 'li', 'dd', 'dt', 'section', 'article', 'h1', 'h2', 'h3', 'h4'];
        $isBlock = $node instanceof DOMElement
            && in_array(strtolower($node->tagName), $blockTags, true);

        if ($isBlock) {
            $text .= "\n";
        }

        foreach ($node->childNodes as $child) {
            $text .= $this->nodeTextWithBreaks($child);
        }

        if ($isBlock) {
            $text .= "\n";
        }

        return $text;
    }

    private function fetch(string $url): string
    {
        $response = Http::withHeaders([
            'User-Agent' => 'DQX-Tool Monster Trivia Importer/1.0 (+https://www.dqx-tool.com/)',
            'Accept-Language' => 'ja,en;q=0.8',
        ])
            ->timeout(30)
            ->retry(3, 1000)
            ->get($url);

        $response->throw();

        return $response->body();
    }

    private function createDom(string $html): DOMDocument
    {
        $html = $this->convertToUtf8($html);
        $dom = new DOMDocument('1.0', 'UTF-8');

        $previous = libxml_use_internal_errors(true);

        try {
            $loaded = $dom->loadHTML(
                '<?xml encoding="UTF-8">' . $html,
                LIBXML_NOWARNING | LIBXML_NOERROR | LIBXML_NONET | LIBXML_COMPACT
            );
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }

        if (! $loaded) {
            throw new \RuntimeException('HTMLをDOMとして解析できませんでした。');
        }

        return $dom;
    }

    private function convertToUtf8(string $html): string
    {
        if (preg_match('/<meta[^>]+charset=["\']?\s*([a-zA-Z0-9_\-]+)/i', $html, $matches)) {
            $charset = strtoupper($matches[1]);

            if (! in_array($charset, ['UTF-8', 'UTF8'], true)) {
                $converted = @mb_convert_encoding($html, 'UTF-8', $charset);

                if (is_string($converted) && $converted !== '') {
                    return $converted;
                }
            }
        }

        $encoding = mb_detect_encoding($html, ['UTF-8', 'SJIS-win', 'EUC-JP', 'ISO-2022-JP'], true);

        if ($encoding !== false && strtoupper($encoding) !== 'UTF-8') {
            return mb_convert_encoding($html, 'UTF-8', $encoding);
        }

        return $html;
    }

    private function resolveUrl(string $pageUrl, string $href): string
    {
        if (preg_match('~^https?://~i', $href)) {
            return $href;
        }

        if (str_starts_with($href, '//')) {
            return 'https:' . $href;
        }

        if (str_starts_with($href, '/')) {
            return self::BASE_URL . $href;
        }

        $pagePath = (string) parse_url($pageUrl, PHP_URL_PATH);
        $pagePath = str_replace('\\', '/', $pagePath);

        // URLが /zukan/ のようにスラッシュで終わる場合は、そのURL自体がディレクトリです。
        // dirname('/ten/monster/zukan/') を使うと /ten/monster になり、
        // sura/01.php が誤ったURLへ解決されるため分岐します。
        $directory = str_ends_with($pagePath, '/')
            ? rtrim($pagePath, '/')
            : rtrim(dirname($pagePath), '/');

        $combined = $directory . '/' . $href;
        $segments = [];

        foreach (explode('/', $combined) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }

            if ($segment === '..') {
                array_pop($segments);
                continue;
            }

            $segments[] = $segment;
        }

        return self::BASE_URL . '/' . implode('/', $segments);
    }

    private function normalizeName(string $name): string
    {
        $name = trim($name);

        if (class_exists(Normalizer::class)) {
            $normalized = Normalizer::normalize($name, Normalizer::FORM_KC);

            if (is_string($normalized)) {
                $name = $normalized;
            }
        }

        $name = str_replace(['・', '･'], '・', $name);
        $name = preg_replace('/[\s　]+/u', '', $name) ?? $name;

        return mb_strtolower($name);
    }

    private function cleanText(?string $text): string
    {
        $text = html_entity_decode((string) $text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = str_replace(["\r\n", "\r", "\u{00A0}"], ["\n", "\n", ' '], $text);
        $text = preg_replace('/[ \t　]+/u', ' ', $text) ?? $text;
        $text = preg_replace('/\s*\n\s*/u', ' ', $text) ?? $text;
        $text = preg_replace('/\s+/u', ' ', $text) ?? $text;

        return trim($text);
    }

    private function hasText(mixed $value): bool
    {
        return is_string($value) && trim($value) !== '';
    }

    private function sleep(int $milliseconds): void
    {
        if ($milliseconds > 0) {
            usleep($milliseconds * 1000);
        }
    }

    private function writeLog(bool $dryRun, bool $force, int $allCount, int $processedCount): string
    {
        $directory = storage_path('app/imports');

        if (! is_dir($directory) && ! mkdir($directory, 0775, true) && ! is_dir($directory)) {
            throw new \RuntimeException("ログディレクトリを作成できません: {$directory}");
        }

        $prefix = $dryRun ? 'monster_trivia_dry_run' : 'monster_trivia_import';
        $filename = $prefix . '_' . now()->format('Ymd_His') . '.json';
        $path = $directory . DIRECTORY_SEPARATOR . $filename;

        $payload = [
            'executed_at' => now()->toIso8601String(),
            'source_url' => self::INDEX_URL,
            'dry_run' => $dryRun,
            'force' => $force,
            'all_link_count' => $allCount,
            'processed_count' => $processedCount,
            'summary' => [
                'updated' => count($this->updated),
                'skipped_completed' => $this->skippedCompleted,
                'not_found' => count($this->notFound),
                'no_trivia' => count($this->noTrivia),
                'failed' => count($this->failed),
            ],
            'updated_monsters' => $this->updated,
            'not_found_monsters' => $this->notFound,
            'no_trivia_monsters' => $this->noTrivia,
            'failed_pages' => $this->failed,
        ];

        $json = json_encode(
            $payload,
            JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
        );

        if (file_put_contents($path, $json . PHP_EOL) === false) {
            throw new \RuntimeException("ログを書き込めません: {$path}");
        }

        return $path;
    }

    private function showTables(): void
    {
        if ($this->updated !== []) {
            $this->newLine();
            $this->table(
                ['結果', 'ID', 'モンスター名', '更新カラム', 'まめちしき1', 'まめちしき2'],
                array_map(
                    static fn (array $row): array => [
                        $row['result'],
                        $row['monster_id'],
                        $row['name'],
                        implode(', ', $row['changed_fields']),
                        mb_strimwidth((string) $row['trivia_1'], 0, 45, '…', 'UTF-8'),
                        mb_strimwidth((string) ($row['trivia_2'] ?? ''), 0, 45, '…', 'UTF-8'),
                    ],
                    $this->updated
                )
            );
        }

        if ($this->notFound !== []) {
            $this->newLine();
            $this->warn('DBに見つからなかったモンスター（先頭30件）');
            $this->table(
                ['モンスター名', 'URL'],
                array_map(
                    static fn (array $row): array => [$row['name'], $row['url']],
                    array_slice($this->notFound, 0, 30)
                )
            );
        }

        if ($this->failed !== []) {
            $this->newLine();
            $this->warn('取得に失敗したページ（先頭30件）');
            $this->table(
                ['モンスター名', 'エラー', 'URL'],
                array_map(
                    static fn (array $row): array => [
                        $row['name'],
                        mb_strimwidth((string) $row['error'], 0, 60, '…', 'UTF-8'),
                        $row['url'],
                    ],
                    array_slice($this->failed, 0, 30)
                )
            );
        }
    }
}
