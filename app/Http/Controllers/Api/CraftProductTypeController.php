<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CraftProductType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CraftProductTypeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = CraftProductType::query()
            ->with('craftType:id,key,name,great_success_rate');

        if ($request->filled('q')) {
            $q = trim((string) $request->q);

            $query->where(function ($sub) use ($q) {
                $sub->where('name', 'like', "%{$q}%")
                    ->orWhere('display_name', 'like', "%{$q}%")
                    ->orWhere('key', 'like', "%{$q}%")
                    ->orWhere('kind', 'like', "%{$q}%")
                    ->orWhereHas('craftType', function ($craftTypeQuery) use ($q) {
                        $craftTypeQuery->where('name', 'like', "%{$q}%")
                            ->orWhere('key', 'like', "%{$q}%");
                    });
            });
        }

        if ($request->filled('kind')) {
            $query->where('kind', $request->kind);
        }

        if ($request->filled('craft_type_id')) {
            $query->where('craft_type_id', $request->craft_type_id);
        }

        return response()->json([
            'data' => $query
                ->orderBy('craft_type_id')
                ->orderBy('kind')
                ->orderBy('name')
                ->orderBy('id')
                ->get(),
        ]);
    }

    public function show($id): JsonResponse
    {
        $craftProductType = CraftProductType::with(
            'craftType:id,key,name,great_success_rate'
        )->find($id);

        if (!$craftProductType) {
            return response()->json([
                'message' => 'craft product type not found',
            ], 404);
        }

        return response()->json([
            'data' => $craftProductType,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validatePayload($request);
        $craftProductType = CraftProductType::create($validated);

        return response()->json([
            'data' => $craftProductType->load(
                'craftType:id,key,name,great_success_rate'
            ),
        ], 201);
    }

    public function update(Request $request, $id): JsonResponse
    {
        $craftProductType = CraftProductType::find($id);

        if (!$craftProductType) {
            return response()->json([
                'message' => 'craft product type not found',
            ], 404);
        }

        $validated = $this->validatePayload($request, $craftProductType->id);
        $craftProductType->update($validated);

        return response()->json([
            'data' => $craftProductType->load(
                'craftType:id,key,name,great_success_rate'
            ),
        ]);
    }

    public function destroy($id): JsonResponse
    {
        $craftProductType = CraftProductType::find($id);

        if (!$craftProductType) {
            return response()->json([
                'message' => 'craft product type not found',
            ], 404);
        }

        if ($craftProductType->equipments()->exists()) {
            return response()->json([
                'message' => 'この職人作成タイプを使用している装備があるため削除できません',
            ], 422);
        }

        $deleted = $craftProductType->toArray();
        $craftProductType->delete();

        return response()->json([
            'message' => 'deleted',
            'data' => $deleted,
        ]);
    }

    private function validatePayload(Request $request, $ignoreId = null): array
    {
        $validated = $request->validate([
            'key' => [
                'required',
                'string',
                'max:255',
                Rule::unique('craft_product_types', 'key')->ignore($ignoreId),
            ],
            'name' => ['required', 'string', 'max:255'],
            'display_name' => ['nullable', 'string', 'max:255'],
            'kind' => ['nullable', 'string', 'max:255'],
            'craft_type_id' => ['required', 'integer', 'exists:craft_types,id'],
            'grid_json' => ['nullable', 'array'],
            'grid_json.rows' => ['required_with:grid_json', 'integer', 'min:1', 'max:20'],
            'grid_json.cols' => ['required_with:grid_json', 'integer', 'min:1', 'max:20'],
            'grid_json.disabledCells' => ['nullable', 'array'],
            'grid_json.disabledCells.*' => ['array', 'size:2'],
            'grid_json.disabledCells.*.0' => ['integer', 'min:0'],
            'grid_json.disabledCells.*.1' => ['integer', 'min:0'],
        ]);

        $validated['display_name'] = $this->nullableTrim(
            $validated['display_name'] ?? null
        );
        $validated['kind'] = $this->nullableTrim($validated['kind'] ?? null);
        $validated['grid_json'] = $this->normalizeGridJson(
            $validated['grid_json'] ?? null
        );

        return $validated;
    }

    private function normalizeGridJson(?array $grid): ?array
    {
        if ($grid === null) {
            return null;
        }

        $rows = (int) $grid['rows'];
        $cols = (int) $grid['cols'];
        $disabledCells = [];
        $seen = [];

        foreach ($grid['disabledCells'] ?? [] as $cell) {
            $row = (int) $cell[0];
            $col = (int) $cell[1];

            if ($row >= $rows || $col >= $cols) {
                throw ValidationException::withMessages([
                    'grid_json.disabledCells' => [
                        "無効セル [{$row}, {$col}] がグリッド範囲外です。",
                    ],
                ]);
            }

            $key = "{$row}:{$col}";

            if (isset($seen[$key])) {
                continue;
            }

            $seen[$key] = true;
            $disabledCells[] = [$row, $col];
        }

        usort($disabledCells, function (array $left, array $right): int {
            return $left[0] <=> $right[0] ?: $left[1] <=> $right[1];
        });

        return [
            'rows' => $rows,
            'cols' => $cols,
            'disabledCells' => $disabledCells,
        ];
    }

    private function nullableTrim($value): ?string
    {
        if ($value === null) {
            return null;
        }

        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }
}
