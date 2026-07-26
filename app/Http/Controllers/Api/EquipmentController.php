<?php

namespace App\Http\Controllers\Api;

use App\Models\Equipment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class EquipmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $summary = $request->boolean('summary');

        $query = Equipment::query()
            ->whereNotNull('item_name');

        if ($summary) {
            // 検索候補では大きなJSON列や職業情報を返さない。
            $query
                ->select([
                    'id',
                    'item_id',
                    'item_name',
                    'item_name_en',
                    'group_id',
                    'group_name',
                    'group_kind',
                    'equipment_type_id',
                    'craft_level',
                    'equip_level',
                    'slot',
                ])
                ->with([
                    'equipmentType.craftType:id,name',
                ]);
        } else {
            $query->with([
                'equipmentType.craftType:id,name',
                'equipmentType.equipableTypes.gameJob:id,name,key',
                'jobOverrides.gameJob:id,name,key',
            ]);
        }

        // summary=1 の誤呼び出しで全件返すことを防ぐ。
        if ($summary && !$request->filled('q')) {
            return response()->json([
                'data' => [],
            ]);
        }

        if ($request->filled('q')) {
            $q = trim((string) $request->q);
            $escaped = addcslashes($q, '\\%_');
            $searchWords = array_values(array_unique([
                $q,
                mb_convert_kana($q, 'C', 'UTF-8'),
                mb_convert_kana($q, 'c', 'UTF-8'),
            ]));

            $query->where(function ($sub) use ($searchWords) {
                foreach ($searchWords as $index => $searchWord) {
                    $escapedWord = addcslashes($searchWord, '\\%_');
                    $method = $index === 0 ? 'where' : 'orWhere';

                    $sub->{$method}(function ($wordQuery) use ($escapedWord) {
                        $wordQuery->where('item_name', 'like', "%{$escapedWord}%")
                            ->orWhere('item_name_en', 'like', "%{$escapedWord}%")
                            ->orWhere('item_id', 'like', "%{$escapedWord}%")
                            ->orWhere('group_name', 'like', "%{$escapedWord}%")
                            ->orWhere('recipe_book', 'like', "%{$escapedWord}%");
                    });
                }
            })
                ->orderByRaw(
                    "
                    CASE
                        WHEN item_name = ? THEN 0
                        WHEN item_name_en = ? THEN 0
                        WHEN item_name LIKE ? THEN 1
                        WHEN item_name_en LIKE ? THEN 1
                        ELSE 2
                    END
                    ",
                    [$q, $q, $escaped . '%', $escaped . '%']
                )
                ->orderByRaw('LENGTH(COALESCE(item_name_en, item_name)) ASC');
        }

        if ($request->filled('item_id')) {
            $query->where('item_id', $request->item_id);
        }

        if ($request->filled('equipment_type_id')) {
            $query->where('equipment_type_id', $request->equipment_type_id);
        }

        if ($request->filled('craft_level')) {
            $query->where('craft_level', $request->craft_level);
        }

        if ($request->filled('equip_level')) {
            $query->where('equip_level', $request->equip_level);
        }

        if ($request->filled('group_id')) {
            $query->where('group_id', $request->group_id);
        }

        if ($request->filled('group_kind')) {
            $query->where('group_kind', $request->group_kind);
        }

        if ($request->filled('slot')) {
            $query->where('slot', $request->slot);
        }

        if ($request->boolean('has_slot_grid')) {
            $query->whereNotNull('slot_grid_json')
                ->where('slot_grid_json', '!=', '[]');
        }

        if ($request->filled('craft_type')) {
            $craftType = trim((string) $request->craft_type);

            $query->whereHas('equipmentType.craftType', function ($sub) use ($craftType) {
                $sub->where('name', $craftType);
            });
        }

        $query
            ->orderBy('craft_level')
            ->orderBy('equip_level')
            ->orderBy('group_name')
            ->orderBy('item_name');

        if ($request->filled('limit')) {
            $limit = min(max((int) $request->input('limit'), 1), 100);
            $query->limit($limit);
        }

        return response()->json([
            'data' => $query->get(),
        ]);
    }

    public function show($id): JsonResponse
    {
        $equipment = Equipment::with([
            'equipmentType.craftType:id,name',
            'equipmentType.equipableTypes.gameJob:id,name,key',
            'jobOverrides.gameJob:id,name,key',
        ])->find($id);

        if (!$equipment) {
            return response()->json([
                'message' => 'equipment not found',
            ], 404);
        }

        return response()->json([
            'data' => $equipment,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validatePayload($request);

        $jobOverrides = $validated['job_overrides'] ?? [];
        unset($validated['job_overrides']);

        if (empty($validated['item_id'])) {
            $validated['item_id'] = $this->makeItemId(
                $validated['item_name'],
                $validated['equipment_type_id'] ?? null
            );
        }

        // 単体装備の場合は group 関連を null にする
        if (empty($validated['group_kind'])) {
            $validated['group_kind'] = null;
            $validated['group_id'] = null;
            $validated['group_name'] = null;
        }

        $equipment = Equipment::create($validated);

        $this->syncJobOverrides($equipment, $jobOverrides);

        $equipment->load([
            'equipmentType.craftType:id,name',
            'equipmentType.equipableTypes.gameJob:id,name,key',
            'jobOverrides.gameJob:id,name,key',
        ]);

        return response()->json([
            'data' => $equipment,
        ], 201);
    }

    public function update(Request $request, $id): JsonResponse
    {
        $equipment = Equipment::find($id);

        if (!$equipment) {
            return response()->json([
                'message' => 'equipment not found',
            ], 404);
        }

        $validated = $this->validatePayload($request);

        $jobOverrides = $validated['job_overrides'] ?? [];
        unset($validated['job_overrides']);

        if (
            array_key_exists('item_id', $validated)
            && ($validated['item_id'] === null || $validated['item_id'] === '')
        ) {
            $validated['item_id'] = $this->makeItemId(
                $validated['item_name'] ?? $equipment->item_name,
                $validated['equipment_type_id'] ?? $equipment->equipment_type_id
            );
        }

        // 単体装備の場合は group 関連を null にする
        if (
            array_key_exists('group_kind', $validated)
            && empty($validated['group_kind'])
        ) {
            $validated['group_kind'] = null;
            $validated['group_id'] = null;
            $validated['group_name'] = null;
        }

        $equipment->update($validated);

        $this->syncJobOverrides($equipment, $jobOverrides);

        return response()->json([
            'data' => $equipment->load([
                'equipmentType.craftType:id,name',
                'equipmentType.equipableTypes.gameJob:id,name,key',
                'jobOverrides.gameJob:id,name,key',
            ]),
        ]);
    }

    public function destroy($id): JsonResponse
    {
        $equipment = Equipment::with([
            'equipmentType.craftType:id,name',
            'equipmentType.equipableTypes.gameJob:id,name,key',
            'jobOverrides.gameJob:id,name,key',
        ])->find($id);

        if (!$equipment) {
            return response()->json([
                'message' => 'equipment not found',
            ], 404);
        }

        $deleted = $equipment->toArray();
        $equipment->delete();

        return response()->json([
            'message' => 'deleted',
            'data' => $deleted,
        ]);
    }

    private function validatePayload(Request $request): array
    {
        $validated = $request->validate([
            'item_id' => ['nullable', 'string', 'max:255'],
            'item_name' => ['required', 'string', 'max:255'],
            'item_name_en' => ['nullable', 'string', 'max:255'],

            'attack' => ['nullable', 'integer', 'min:0'],
            'defense' => ['nullable', 'integer', 'min:0'],
            'max_hp' => ['nullable', 'integer', 'min:0'],
            'max_mp' => ['nullable', 'integer', 'min:0'],
            'charm' => ['nullable', 'integer', 'min:0'],
            'agility' => ['nullable', 'integer', 'min:0'],
            'dexterity' => ['nullable', 'integer', 'min:0'],
            'magic_attack' => ['nullable', 'integer', 'min:0'],
            'healing_power' => ['nullable', 'integer', 'min:0'],
            'default_price' => ['nullable', 'integer', 'min:0'],
            'weight' => ['nullable', 'integer', 'min:0'],

            'equipment_type_id' => ['nullable', 'integer', 'exists:equipment_types,id'],
            'job_override_mode' => ['nullable', Rule::in(['inherit', 'add', 'replace'])],

            'job_overrides' => ['nullable', 'array'],
            'job_overrides.*.game_job_id' => ['required', 'integer', 'exists:game_jobs,id'],
            'job_overrides.*.mode' => ['nullable', Rule::in(['allow', 'deny'])],

            'craft_level' => ['nullable', 'integer', 'min:0'],
            'equip_level' => ['nullable', 'integer', 'min:0'],
            'recipe_book' => ['nullable', 'string', 'max:255'],
            'recipe_place' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'fabric_type' => ['nullable', 'string', 'max:255'],

            'slot' => ['nullable', 'string', 'max:255'],
            'slot_grid_type' => ['nullable', 'string', 'max:255'],
            'slot_grid_cols' => ['nullable', 'integer', 'min:0'],

            'group_kind' => ['nullable', 'string', 'max:255'],
            'group_id' => ['nullable', 'string', 'max:255'],
            'group_name' => ['nullable', 'string', 'max:255'],

            'materials_json' => ['nullable', 'array'],
            'slot_grid_json' => ['nullable', 'array'],
            'source_url' => ['nullable', 'string', 'max:255'],
            'detail_url' => ['nullable', 'string', 'max:255'],
            'effects_json' => ['nullable', 'array'],
        ]);

        if (
            !array_key_exists('job_override_mode', $validated)
            || !$validated['job_override_mode']
        ) {
            $validated['job_override_mode'] = 'inherit';
        }

        if (!array_key_exists('job_overrides', $validated)) {
            $validated['job_overrides'] = [];
        }

        return $validated;
    }

    private function syncJobOverrides(Equipment $equipment, array $jobOverrides): void
    {
        if (($equipment->job_override_mode ?? 'inherit') === 'inherit') {
            $equipment->jobOverrides()->delete();
            return;
        }

        $equipment->jobOverrides()->delete();

        foreach ($jobOverrides as $row) {
            $gameJobId = $row['game_job_id'] ?? null;

            if (!$gameJobId) {
                continue;
            }

            $equipment->jobOverrides()->create([
                'game_job_id' => $gameJobId,
                'mode' => $row['mode'] ?? 'allow',
            ]);
        }
    }

    private function makeItemId(string $itemName, $equipmentTypeId = null): string
    {
        $base = trim($itemName);

        if ($equipmentTypeId) {
            return $equipmentTypeId . '_' . $base;
        }

        return $base;
    }
}
