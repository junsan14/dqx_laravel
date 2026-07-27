<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ContentReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminContentReportController extends Controller
{
    private const REPORTABLE_TYPES = [
        'equipment',
        'monster',
        'accessory',
        'map_layer',
        'monster_map_spawn',
    ];

    private const STATUSES = [
        'pending',
        'reviewing',
        'resolved',
        'rejected',
        'spam',
    ];

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:200'],
            'reportable_type' => [
                'nullable',
                'string',
                Rule::in(self::REPORTABLE_TYPES),
            ],
            'status' => [
                'nullable',
                'string',
                Rule::in(self::STATUSES),
            ],
            'is_public' => ['nullable', 'boolean'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = ContentReport::query()->latest('created_at');

        if (! empty($validated['q'])) {
            $keyword = trim($validated['q']);

            $query->where(function ($builder) use ($keyword) {
                $builder
                    ->where('message', 'like', "%{$keyword}%")
                    ->orWhere('resolved_note', 'like', "%{$keyword}%")
                    ->orWhere('context_json', 'like', "%{$keyword}%");
            });
        }

        if (! empty($validated['reportable_type'])) {
            $query->where('reportable_type', $validated['reportable_type']);
        }

        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        if (array_key_exists('is_public', $validated)) {
            $query->where('is_public', (bool) $validated['is_public']);
        }

        $reports = $query->paginate((int) ($validated['per_page'] ?? 20));

        return response()->json([
            'data' => collect($reports->items())
                ->map(fn (ContentReport $report) => $this->serialize($report))
                ->values(),
            'meta' => [
                'current_page' => $reports->currentPage(),
                'last_page' => $reports->lastPage(),
                'per_page' => $reports->perPage(),
                'total' => $reports->total(),
            ],
        ]);
    }

    public function update(Request $request, ContentReport $contentReport): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', Rule::in(self::STATUSES)],
            'is_public' => ['required', 'boolean'],
            'resolved_note' => ['nullable', 'string', 'max:2000'],
        ]);

        $contentReport->forceFill([
            'status' => $validated['status'],
            'is_public' => (bool) $validated['is_public'],
            'resolved_note' => $this->nullableTrim($validated['resolved_note'] ?? null),
            'reviewed_by' => $request->user()?->id,
            'reviewed_at' => now(),
        ])->save();

        return response()->json([
            'message' => 'レポートを更新しました。',
            'data' => $this->serialize($contentReport->fresh()),
        ]);
    }

    public function destroy(ContentReport $contentReport): JsonResponse
    {
        $contentReport->delete();

        return response()->json([
            'message' => 'レポートを削除しました。',
        ]);
    }

    private function serialize(ContentReport $report): array
    {
        $context = is_array($report->context_json)
            ? $report->context_json
            : [];

        return [
            'id' => $report->id,
            'reportable_type' => $report->reportable_type,
            'reportable_id' => $report->reportable_id,
            'target_label' => $context['target_label'] ?? null,
            'category' => $report->category,
            'field_key' => $report->field_key,
            'message' => $report->message,
            'context_json' => $context,
            'locale' => $report->locale,
            'status' => $report->status,
            'is_public' => (bool) $report->is_public,
            'resolved_note' => $report->resolved_note,
            'reviewed_by' => $report->reviewed_by,
            'reviewed_at' => $report->reviewed_at?->toISOString(),
            'created_at' => $report->created_at?->toISOString(),
            'updated_at' => $report->updated_at?->toISOString(),
        ];
    }

    private function nullableTrim(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);
        return $trimmed !== '' ? $trimmed : null;
    }
}
