<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Accessory;
use App\Models\ContentReport;
use App\Models\Equipment;
use App\Models\MapLayer;
use App\Models\Monster;
use App\Models\MonsterMapSpawn;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ContentReportController extends Controller
{
    private const SUBMITTER_COOKIE = 'content_report_submitter';

    /** @var array<string, class-string<Model>> */
    private const REPORTABLE_MODELS = [
        'equipment' => Equipment::class,
        'monster' => Monster::class,
        'accessory' => Accessory::class,
        'map_layer' => MapLayer::class,
        'monster_map_spawn' => MonsterMapSpawn::class,
    ];

    public function summary(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'reportable_type' => [
                'required',
                'string',
                Rule::in(array_keys(self::REPORTABLE_MODELS)),
            ],
            'reportable_id' => ['required', 'integer', 'min:1'],
        ]);

        $this->ensureReportTargetExists(
            $validated['reportable_type'],
            (int) $validated['reportable_id']
        );

        $count = ContentReport::query()
            ->where('reportable_type', $validated['reportable_type'])
            ->where('reportable_id', (int) $validated['reportable_id'])
            ->where('is_public', true)
            ->whereIn('status', ['pending', 'reviewing', 'resolved'])
            ->count();

        return response()->json([
            'data' => [
                'count' => $count,
            ],
        ])->header('Cache-Control', 'no-store, no-cache, must-revalidate');
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'reportable_type' => [
                'required',
                'string',
                Rule::in(array_keys(self::REPORTABLE_MODELS)),
            ],
            'reportable_id' => ['required', 'integer', 'min:1'],
            'locale' => ['nullable', 'string', 'max:10'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $this->ensureReportTargetExists(
            $validated['reportable_type'],
            (int) $validated['reportable_id']
        );

        $reports = ContentReport::query()
            ->where('reportable_type', $validated['reportable_type'])
            ->where('reportable_id', (int) $validated['reportable_id'])
            ->where('is_public', true)
            ->whereIn('status', ['pending', 'reviewing', 'resolved'])
            ->latest('created_at')
            ->limit((int) ($validated['limit'] ?? 20))
            ->get([
                'id',
                'message',
                'status',
                'resolved_note',
                'locale',
                'created_at',
                'updated_at',
            ]);

        return response()->json([
            'data' => $reports->map(fn (ContentReport $report) => [
                'id' => $report->id,
                'message' => $report->message,
                'status' => $report->status,
                'resolved_note' => $report->resolved_note,
                'locale' => $report->locale,
                'created_at' => $report->created_at?->toISOString(),
                'updated_at' => $report->updated_at?->toISOString(),
            ])->values(),
        ])->header('Cache-Control', 'no-store, no-cache, must-revalidate');
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'reportable_type' => [
                'required',
                'string',
                Rule::in(array_keys(self::REPORTABLE_MODELS)),
            ],
            'reportable_id' => ['required', 'integer', 'min:1'],
            'message' => ['required', 'string', 'min:5', 'max:1000'],
            'locale' => ['nullable', 'string', 'max:10'],
            'context_json' => ['nullable', 'array'],
            'context_json.page_url' => ['nullable', 'string', 'url', 'max:2048'],
            'context_json.target_label' => ['nullable', 'string', 'max:255'],
        ]);

        $this->ensureReportTargetExists(
            $validated['reportable_type'],
            (int) $validated['reportable_id']
        );

        $context = $validated['context_json'] ?? null;
        $this->ensureContextSizeIsValid($context);

        [$submitterToken, $shouldSetCookie] = $this->resolveSubmitterToken($request);

        $report = ContentReport::query()->create([
            'reportable_type' => $validated['reportable_type'],
            'reportable_id' => (int) $validated['reportable_id'],
            'category' => 'incorrect_info',
            'field_key' => null,
            'message' => trim($validated['message']),
            'context_json' => $context,
            'locale' => $this->normalizeLocale($validated['locale'] ?? 'ja'),
            'status' => 'pending',
            'is_public' => false,
            'submitter_token_hash' => $this->makePrivateHash($submitterToken),
            'ip_hash' => $request->ip()
                ? $this->makePrivateHash($request->ip())
                : null,
        ]);

        $response = response()->json([
            'message' => 'ご報告ありがとうございます。内容を確認します。',
            'data' => [
                'id' => $report->id,
                'status' => $report->status,
                'created_at' => $report->created_at?->toISOString(),
            ],
        ], 201);

        if ($shouldSetCookie) {
            $response->cookie(
                self::SUBMITTER_COOKIE,
                $submitterToken,
                60 * 24 * 365,
                '/',
                null,
                app()->environment('production'),
                true,
                false,
                'Lax'
            );
        }

        return $response;
    }

    private function ensureReportTargetExists(string $type, int $id): void
    {
        $modelClass = self::REPORTABLE_MODELS[$type] ?? null;

        if (! $modelClass || ! $modelClass::query()->whereKey($id)->exists()) {
            throw ValidationException::withMessages([
                'reportable_id' => ['報告対象のデータが見つかりません。'],
            ]);
        }
    }

    private function ensureContextSizeIsValid(?array $context): void
    {
        if ($context === null) {
            return;
        }

        $encoded = json_encode(
            $context,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );

        if ($encoded === false || strlen($encoded) > 10000) {
            throw ValidationException::withMessages([
                'context_json' => ['補助情報のデータ量が大きすぎます。'],
            ]);
        }
    }

    /** @return array{0: string, 1: bool} */
    private function resolveSubmitterToken(Request $request): array
    {
        $token = $request->cookie(self::SUBMITTER_COOKIE);

        if (is_string($token) && preg_match('/^[A-Za-z0-9]{64}$/', $token)) {
            return [$token, false];
        }

        return [Str::random(64), true];
    }

    private function makePrivateHash(string $value): string
    {
        return hash_hmac('sha256', $value, (string) config('app.key'));
    }


    private function normalizeLocale(string $locale): string
    {
        $normalized = strtolower(trim($locale));
        return in_array($normalized, ['ja', 'en'], true) ? $normalized : 'ja';
    }
}
