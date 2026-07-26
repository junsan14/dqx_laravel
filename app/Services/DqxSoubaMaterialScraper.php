<?php

namespace App\Services;

use DOMDocument;
use DOMElement;
use DOMNode;
use DOMXPath;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class DqxSoubaMaterialScraper
{
    /**
     * 全ページの素材価格を取得します。
     *
     * @return array<string, int> [正規化済み素材名 => 価格]
     */
    public function fetchAll(): array
    {
        $firstHtml = $this->fetchPage(1);
        $totalPages = $this->detectTotalPages($firstHtml);
        $prices = $this->parsePrices($firstHtml);

        for ($page = 2; $page <= $totalPages; $page++) {
            usleep((int) config('dqx_souba.request_interval_ms', 1000) * 1000);

            $pagePrices = $this->parsePrices($this->fetchPage($page));

            if ($pagePrices === []) {
                throw new RuntimeException(
                    "ページ {$page} の価格が空だったため、更新を中止しました。"
                );
            }

            foreach ($pagePrices as $name => $price) {
                $prices[$name] = $price;
            }
        }

        $minimumExpected = (int) config(
            'dqx_souba.minimum_expected_items',
            50
        );

        if (count($prices) < $minimumExpected) {
            throw new RuntimeException(
                sprintf(
                    '取得件数が少なすぎます。取得=%d件 / 最低=%d件',
                    count($prices),
                    $minimumExpected
                )
            );
        }

        return $prices;
    }

    private function fetchPage(int $page): string
    {
        $baseUrl = rtrim(
            (string) config(
                'dqx_souba.material_url',
                'https://dqx-souba.game-blog.app/watching_material'
            ),
            '/'
        );

        try {
            $response = Http::accept('text/html,application/xhtml+xml')
                ->withHeaders([
                    'User-Agent' => (string) config(
                        'dqx_souba.user_agent',
                        'DQX-Tool-Material-Price-Updater/1.0 (+https://www.dqx-tool.com/)'
                    ),
                    'Accept-Language' => 'ja,en;q=0.8',
                    'Cache-Control' => 'no-cache',
                ])
                ->connectTimeout((int) config('dqx_souba.connect_timeout', 10))
                ->timeout((int) config('dqx_souba.timeout', 30))
                ->retry(
                    (int) config('dqx_souba.retry_times', 1),
                    (int) config('dqx_souba.retry_sleep_ms', 1500),
                    throw: false
                )
                ->get($baseUrl, ['page' => $page]);
        } catch (ConnectionException $e) {
            throw new RuntimeException(
                "ページ {$page} への接続に失敗しました。",
                previous: $e
            );
        }

        if ($response->status() === 403) {
            throw new RuntimeException(
                '取得先から403 Forbiddenが返されました。'
                . 'アクセス制限を回避せず、処理を中止しました。'
            );
        }

        if ($response->status() === 429) {
            throw new RuntimeException(
                '取得先から429 Too Many Requestsが返されました。'
            );
        }

        if (! $response->successful()) {
            throw new RuntimeException(
                "ページ {$page} の取得に失敗しました。HTTP {$response->status()}"
            );
        }

        if (trim($response->body()) === '') {
            throw new RuntimeException("ページ {$page} のHTMLが空です。");
        }

        return $response->body();
    }

    /**
     * @return array<string, int>
     */
    public function parsePrices(string $html): array
    {
        [, $xpath] = $this->createDom($html);

        $tables = $xpath->query(
            '//table['
            . './/th[normalize-space(string(.)) = "アイテム"]'
            . ' and .//th[normalize-space(string(.)) = "価格"]'
            . ']'
        );

        if ($tables === false || $tables->length === 0) {
            throw new RuntimeException(
                '相場テーブルが見つかりません。HTML構造が変わった可能性があります。'
            );
        }

        $table = $tables->item(0);
        $headers = $xpath->query('.//thead//th', $table);

        if ($headers === false || $headers->length === 0) {
            throw new RuntimeException('相場テーブルの見出しを取得できません。');
        }

        $itemIndex = null;
        $priceIndex = null;

        foreach ($headers as $index => $header) {
            $label = $this->normalizeText($header->textContent ?? '');

            if ($label === 'アイテム') {
                $itemIndex = $index;
            }

            if ($label === '価格') {
                $priceIndex = $index;
            }
        }

        if ($itemIndex === null || $priceIndex === null) {
            throw new RuntimeException(
                '「アイテム」または「価格」列を判定できません。'
            );
        }

        $rows = $xpath->query('.//tbody/tr', $table);
        $result = [];

        if ($rows === false) {
            return [];
        }

        foreach ($rows as $row) {
            if (! $row instanceof DOMElement) {
                continue;
            }

            $cells = $xpath->query('./td', $row);

            if (
                $cells === false ||
                $cells->length <= max($itemIndex, $priceIndex)
            ) {
                continue;
            }

            $name = $this->extractItemName(
                $xpath,
                $cells->item($itemIndex)
            );

            $price = $this->extractInteger(
                $cells->item($priceIndex)?->textContent ?? ''
            );

            if ($name === '' || $price <= 0) {
                continue;
            }
            //1.5倍で更新
            $result[$this->normalizeName($name)] = (int) ceil($price * 1.5);
        }

        return $result;
    }

    public function detectTotalPages(string $html): int
    {
        if (preg_match(
            '/Showing\s+\d+\s+to\s+\d+\s+of\s+([\d,]+)\s+results/i',
            $html,
            $matches
        )) {
            $totalItems = (int) str_replace(',', '', $matches[1]);
            $perPage = (int) config('dqx_souba.items_per_page', 10);

            return max(1, (int) ceil($totalItems / max(1, $perPage)));
        }

        preg_match_all('/paginator-page-page(\d+)/', $html, $keyMatches);
        preg_match_all(
            '/gotoPage\((\d+),\s*[\'"]page[\'"]\)/',
            $html,
            $gotoMatches
        );

        $pages = array_map(
            'intval',
            array_merge(
                $keyMatches[1] ?? [],
                $gotoMatches[1] ?? []
            )
        );

        return $pages === [] ? 1 : max($pages);
    }

    public function normalizeName(string $name): string
    {
        $name = html_entity_decode(
            $name,
            ENT_QUOTES | ENT_HTML5,
            'UTF-8'
        );

        $name = preg_replace(
            '/[\x{200B}-\x{200D}\x{FEFF}]/u',
            '',
            $name
        ) ?? $name;

        $name = preg_replace('/[\s　]+/u', ' ', $name) ?? $name;
        $name = trim($name);

        if (class_exists(\Normalizer::class)) {
            $normalized = \Normalizer::normalize(
                $name,
                \Normalizer::FORM_KC
            );

            if (is_string($normalized)) {
                $name = $normalized;
            }
        }

        return $name;
    }

    private function extractItemName(
        DOMXPath $xpath,
        ?DOMNode $cell
    ): string {
        if ($cell === null) {
            return '';
        }

        $anchors = $xpath->query(
            './/a['
            . 'contains(@href, "/watching/detail/")'
            . ' and normalize-space(string(.)) != ""'
            . ']',
            $cell
        );

        if ($anchors !== false && $anchors->length > 0) {
            return trim(
                $anchors->item($anchors->length - 1)?->textContent ?? ''
            );
        }

        return '';
    }

    private function extractInteger(string $value): int
    {
        $digits = preg_replace('/[^\d]/u', '', $value);

        return $digits === null || $digits === ''
            ? 0
            : (int) $digits;
    }

    private function normalizeText(string $value): string
    {
        return trim(
            preg_replace('/[\s　]+/u', '', $value) ?? $value
        );
    }

    /**
     * @return array{0: DOMDocument, 1: DOMXPath}
     */
    private function createDom(string $html): array
    {
        if (! class_exists(DOMDocument::class)) {
            throw new RuntimeException(
                'PHPのDOM拡張（ext-dom）が必要です。php-xmlを有効にしてください。'
            );
        }

        $dom = new DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);

        $loaded = $dom->loadHTML(
            '<?xml encoding="UTF-8">' . $html,
            LIBXML_NOERROR |
            LIBXML_NOWARNING |
            LIBXML_NONET
        );

        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if (! $loaded) {
            throw new RuntimeException('HTMLの解析に失敗しました。');
        }

        return [$dom, new DOMXPath($dom)];
    }
}
