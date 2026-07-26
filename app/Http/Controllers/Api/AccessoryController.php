<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAccessoryRequest;
use App\Http\Requests\UpdateAccessoryRequest;
use App\Models\Accessory;
use App\Models\Monster;
use App\Models\MonsterDrop;
use App\Services\MonsterDropSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class AccessoryController extends Controller
{
    public function __construct(
        private MonsterDropSyncService $monsterDropSyncService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));

        $inheritanceRelatedIds = $q !== ''
            ? $this->findInheritanceRelatedAccessoryIds($q)
            : [];

        $query = Accessory::query();

        if ($q !== '') {
            $searchTerms = $this->buildSearchTerms($q);

            $query->where(function ($sub) use ($searchTerms, $inheritanceRelatedIds) {
                foreach ($searchTerms as $index => $term) {
                    $escaped = addcslashes($term, '\\%_');
                    $method = $index === 0 ? 'where' : 'orWhere';

                    $sub->{$method}(function ($termQuery) use ($escaped) {
                        $termQuery->where('item_id', 'like', "%{$escaped}%")
                            ->orWhere('name', 'like', "%{$escaped}%")
                            ->orWhere('name_kana', 'like', "%{$escaped}%")
                            ->orWhere('name_en', 'like', "%{$escaped}%")
                            ->orWhere('slot', 'like', "%{$escaped}%")
                            ->orWhere('accessory_type', 'like', "%{$escaped}%")
                            ->orWhere('description', 'like', "%{$escaped}%")
                            ->orWhere('inheritance_type', 'like', "%{$escaped}%")
                            ->orWhere('inheritance_note', 'like', "%{$escaped}%")
                            ->orWhereHas('inheritanceFrom', function ($inheritanceQuery) use ($escaped) {
                                $inheritanceQuery
                                    ->where('name', 'like', "%{$escaped}%")
                                    ->orWhere('name_kana', 'like', "%{$escaped}%")
                                    ->orWhere('name_en', 'like', "%{$escaped}%");
                            });
                    });
                }

                if (!empty($inheritanceRelatedIds)) {
                    $sub->orWhereIn('id', $inheritanceRelatedIds);
                }
            });

            $hiraganaQ = mb_convert_kana($q, 'c', 'UTF-8');
            $escapedQ = addcslashes($q, '\\%_');
            $escapedHiraganaQ = addcslashes($hiraganaQ, '\\%_');

            $query
                ->orderByRaw(
                    "
                    CASE
                        WHEN name = ? OR name_kana = ? OR name_en = ? THEN 0
                        WHEN name LIKE ? OR name_kana LIKE ? OR name_en LIKE ? THEN 1
                        ELSE 2
                    END
                    ",
                    [
                        $q,
                        $hiraganaQ,
                        $q,
                        $escapedQ . '%',
                        $escapedHiraganaQ . '%',
                        $escapedQ . '%',
                    ]
                )
                ->orderByRaw('LENGTH(name) ASC')
                ->orderBy('name');
        } else {
            $query->orderBy('name');
        }

        return response()->json([
            'data' => $query->get()
                ->map(fn ($accessory) => $this->buildAccessoryResponse($accessory))
                ->values(),
        ]);
    }

    public function show(Accessory $accessory): JsonResponse
    {
        return response()->json([
            'data' => $this->buildAccessoryResponse($accessory),
        ]);
    }

    public function store(StoreAccessoryRequest $request): JsonResponse
    {
        $validated = array_merge(
            $request->validated(),
            $this->validateNameKana($request)
        );

        logger()->info('accessory store validated', $validated);

        $accessory = DB::transaction(function () use ($validated) {
            $accessory = Accessory::create([
                'item_id' => $validated['item_id'],
                'name' => $validated['name'],
                'name_en' => $validated['name_en'] ?? null,
                'item_kind' => $validated['item_kind'] ?? 'accessory',
                'slot' => $validated['slot'] ?? null,
                'accessory_type' => $validated['accessory_type'] ?? null,

                'inheritance_from_accessory_id' => $validated['inheritance_from_accessory_id'] ?? null,
                'inheritance_type' => $validated['inheritance_type'] ?? null,
                'inheritance_note' => $validated['inheritance_note'] ?? null,

                'equip_level' => $validated['equip_level'] ?? null,

                'weight' => $validated['weight'] ?? null,
                'attack' => $validated['attack'] ?? null,
                'defense' => $validated['defense'] ?? null,
                'max_hp' => $validated['max_hp'] ?? null,
                'max_mp' => $validated['max_mp'] ?? null,
                'charm' => $validated['charm'] ?? null,
                'agility' => $validated['agility'] ?? null,
                'dexterity' => $validated['dexterity'] ?? null,
                'magic_attack' => $validated['magic_attack'] ?? null,
                'healing_power' => $validated['healing_power'] ?? null,

                'description' => $validated['description'] ?? null,
                'effects_json' => $validated['effects_json'] ?? [],
                'synthesis_effects_json' => $validated['synthesis_effects_json'] ?? [],
                'obtain_methods_json' => $validated['obtain_methods_json'] ?? [],
                'image_url' => $validated['image_url'] ?? null,
                'source_url' => $validated['source_url'] ?? null,
                'detail_url' => $validated['detail_url'] ?? null,
            ]);

            $accessory->name_kana = $validated['name_kana'] ?? null;
            $accessory->save();

            $this->monsterDropSyncService->sync(
                'accessory',
                $accessory->id,
                $validated['drop_monsters'] ?? []
            );

            return $accessory;
        });

        return response()->json([
            'message' => 'アクセサリを作成した',
            'data' => $this->buildAccessoryResponse($accessory->fresh()),
        ], 201);
    }

    public function update(UpdateAccessoryRequest $request, Accessory $accessory): JsonResponse
    {
        $validated = array_merge(
            $request->validated(),
            $this->validateNameKana($request)
        );

        logger()->info('accessory update validated', $validated);

        DB::transaction(function () use ($accessory, $validated) {
            $accessory->update([
                'item_id' => $validated['item_id'],
                'name' => $validated['name'],
                'name_en' => $validated['name_en'] ?? null,
                'item_kind' => $validated['item_kind'] ?? 'accessory',
                'slot' => $validated['slot'] ?? null,
                'accessory_type' => $validated['accessory_type'] ?? null,

                'inheritance_from_accessory_id' => $validated['inheritance_from_accessory_id'] ?? null,
                'inheritance_type' => $validated['inheritance_type'] ?? null,
                'inheritance_note' => $validated['inheritance_note'] ?? null,

                'equip_level' => $validated['equip_level'] ?? null,

                'weight' => $validated['weight'] ?? null,
                'attack' => $validated['attack'] ?? null,
                'defense' => $validated['defense'] ?? null,
                'max_hp' => $validated['max_hp'] ?? null,
                'max_mp' => $validated['max_mp'] ?? null,
                'charm' => $validated['charm'] ?? null,
                'agility' => $validated['agility'] ?? null,
                'dexterity' => $validated['dexterity'] ?? null,
                'magic_attack' => $validated['magic_attack'] ?? null,
                'healing_power' => $validated['healing_power'] ?? null,

                'description' => $validated['description'] ?? null,
                'effects_json' => $validated['effects_json'] ?? [],
                'synthesis_effects_json' => $validated['synthesis_effects_json'] ?? [],
                'obtain_methods_json' => $validated['obtain_methods_json'] ?? [],
                'image_url' => $validated['image_url'] ?? null,
                'source_url' => $validated['source_url'] ?? null,
                'detail_url' => $validated['detail_url'] ?? null,
            ]);

            $accessory->name_kana = $validated['name_kana'] ?? null;
            $accessory->save();

            $this->monsterDropSyncService->sync(
                'accessory',
                $accessory->id,
                $validated['drop_monsters'] ?? []
            );
        });

        return response()->json([
            'message' => 'アクセサリを更新した',
            'data' => $this->buildAccessoryResponse($accessory->fresh()),
        ]);
    }

    public function destroy(Accessory $accessory): JsonResponse
    {
        DB::transaction(function () use ($accessory) {
            MonsterDrop::query()
                ->where('drop_target_type', 'accessory')
                ->where('drop_target_id', $accessory->id)
                ->delete();

            $accessory->delete();
        });

        return response()->json([
            'message' => 'アクセサリを削除した',
        ]);
    }

    public function uploadImage(Request $request): JsonResponse
{
    $validated = $request->validate([
        'image' => ['required', 'image', 'max:5120'],
        'accessory_id' => ['nullable', 'integer', 'exists:accessories,id'],
        'item_id' => ['nullable', 'string', 'max:255'],
    ]);

    $file = $validated['image'];
    $accessoryId = $validated['accessory_id'] ?? null;
    $itemId = $validated['item_id'] ?? null;

    $baseName = $this->buildAccessoryImageBaseName($accessoryId, $itemId);

    $directory = 'images/accessories';
    $fileName = "{$baseName}.webp";
    $relativePath = "{$directory}/{$fileName}";

    $webpBinary = $this->convertUploadedImageToWebp($file->getRealPath());

    Storage::disk('public')->put($relativePath, $webpBinary);

    $imageUrl = Storage::url($relativePath);

    if ($accessoryId) {
        Accessory::query()
            ->where('id', $accessoryId)
            ->update([
                'image_url' => $imageUrl,
            ]);
    }

    return response()->json([
        'message' => 'アクセサリ画像をアップロードしました',
        'image_url' => $imageUrl,
        'path' => $relativePath,
    ]);
}

    private function buildAccessoryResponse(Accessory $accessory): array
    {
        $drops = MonsterDrop::query()
            ->where('drop_target_type', 'accessory')
            ->where('drop_target_id', $accessory->id)
            ->orderByRaw('sort_order is null, sort_order asc')
            ->get();

        $monsterIds = $drops->pluck('monster_id')->filter()->values()->all();

        $monstersById = Monster::query()
            ->whereIn('id', $monsterIds)
            ->get()
            ->keyBy('id');

        $inheritanceFrom = null;

        if ($accessory->inheritance_from_accessory_id) {
            $inheritanceFrom = Accessory::query()
                ->select([
                    'id',
                    'item_id',
                    'name',
                    'name_kana',
                    'name_en',
                    'slot',
                    'accessory_type',
                    'inheritance_from_accessory_id',
                    'inheritance_type',
                    'image_url',
                ])
                ->find($accessory->inheritance_from_accessory_id);
        }

        return [
            'id' => $accessory->id,
            'item_id' => $accessory->item_id,
            'name' => $accessory->name,
            'name_kana' => $accessory->name_kana,
            'name_en' => $accessory->name_en,
            'item_kind' => $accessory->item_kind,
            'slot' => $accessory->slot,
            'accessory_type' => $accessory->accessory_type,

            'inheritance_from_accessory_id' => $accessory->inheritance_from_accessory_id,
            'inheritance_type' => $accessory->inheritance_type,
            'inheritance_note' => $accessory->inheritance_note,

            'inheritance_from' => $inheritanceFrom ? [
                'id' => $inheritanceFrom->id,
                'item_id' => $inheritanceFrom->item_id,
                'name' => $inheritanceFrom->name,
                'name_kana' => $inheritanceFrom->name_kana,
                'name_en' => $inheritanceFrom->name_en,
                'slot' => $inheritanceFrom->slot,
                'accessory_type' => $inheritanceFrom->accessory_type,
                'inheritance_from_accessory_id' => $inheritanceFrom->inheritance_from_accessory_id,
                'inheritance_type' => $inheritanceFrom->inheritance_type,
                'image_url' => $inheritanceFrom->image_url,
            ] : null,

            'inheritance_chain' => $this->buildInheritanceChain($accessory),

            'equip_level' => $accessory->equip_level,

            'weight' => $accessory->weight,
            'attack' => $accessory->attack,
            'defense' => $accessory->defense,
            'max_hp' => $accessory->max_hp,
            'max_mp' => $accessory->max_mp,
            'charm' => $accessory->charm,
            'agility' => $accessory->agility,
            'dexterity' => $accessory->dexterity,
            'magic_attack' => $accessory->magic_attack,
            'healing_power' => $accessory->healing_power,

            'description' => $accessory->description,
            'effects_json' => $this->normalizeJsonOutput($accessory->effects_json),
            'synthesis_effects_json' => $this->normalizeJsonOutput($accessory->synthesis_effects_json),
            'obtain_methods_json' => $this->normalizeJsonOutput($accessory->obtain_methods_json),
            'image_url' => $accessory->image_url,
            'source_url' => $accessory->source_url,
            'detail_url' => $accessory->detail_url,

            'drop_monsters' => $drops->map(function ($drop) use ($monstersById) {
                $monster = $monstersById->get($drop->monster_id);

                return [
                    'id' => $drop->id,
                    'monster_id' => $drop->monster_id,
                    'drop_type' => $drop->drop_type,
                    'sort_order' => $drop->sort_order,
                    'monster' => $monster ? [
                        'id' => $monster->id,
                        'monster_no' => $monster->monster_no,
                        'name' => $monster->name,
                        'system_type' => $monster->system_type,
                    ] : null,
                ];
            })->values(),
        ];
    }

    private function buildInheritanceChain(Accessory $accessory): array
    {
        $root = $this->findInheritanceRoot($accessory);

        $chain = [];
        $visitedIds = [];

        $current = $root;

        while ($current) {
            if (in_array((int) $current->id, $visitedIds, true)) {
                break;
            }

            $visitedIds[] = (int) $current->id;

            $chain[] = [
                'id' => $current->id,
                'item_id' => $current->item_id,
                'name' => $current->name,
                'name_kana' => $current->name_kana,
                'name_en' => $current->name_en,
                'slot' => $current->slot,
                'accessory_type' => $current->accessory_type,
                'inheritance_from_accessory_id' => $current->inheritance_from_accessory_id,
                'inheritance_type' => $current->inheritance_type,
                'image_url' => $current->image_url,
            ];

            $current = Accessory::query()
                ->select([
                    'id',
                    'item_id',
                    'name',
                    'name_kana',
                    'name_en',
                    'slot',
                    'accessory_type',
                    'inheritance_from_accessory_id',
                    'inheritance_type',
                    'image_url',
                ])
                ->where('inheritance_from_accessory_id', $current->id)
                ->orderByRaw("
                    CASE inheritance_type
                        WHEN '第一世代' THEN 1
                        WHEN '第二世代' THEN 2
                        WHEN '第三世代' THEN 3
                        WHEN '第四世代' THEN 4
                        WHEN '第五世代' THEN 5
                        WHEN '第六世代' THEN 6
                        WHEN '第七世代' THEN 7
                        WHEN '第八世代' THEN 8
                        WHEN '第九世代' THEN 9
                        WHEN '第十世代' THEN 10
                        ELSE 999
                    END
                ")
                ->orderBy('name')
                ->first();
        }

        return $chain;
    }
    private function findInheritanceRelatedAccessoryIds(string $keyword): array
    {
        $searchTerms = $this->buildSearchTerms($keyword);

        if (empty($searchTerms)) {
            return [];
        }

        $allAccessories = Accessory::query()
            ->select([
                'id',
                'item_id',
                'name',
                'name_kana',
                'name_en',
                'slot',
                'accessory_type',
                'inheritance_from_accessory_id',
                'inheritance_type',
                'inheritance_note',
                'description',
            ])
            ->get();

        $childrenByParentId = [];

        foreach ($allAccessories as $accessory) {
            if (!$accessory->inheritance_from_accessory_id) {
                continue;
            }

            $parentId = (int) $accessory->inheritance_from_accessory_id;

            if (!isset($childrenByParentId[$parentId])) {
                $childrenByParentId[$parentId] = [];
            }

            $childrenByParentId[$parentId][] = $accessory;
        }

        $matchedIds = Accessory::query()
            ->where(function ($query) use ($searchTerms) {
                foreach ($searchTerms as $index => $term) {
                    $escaped = addcslashes($term, '\\%_');
                    $method = $index === 0 ? 'where' : 'orWhere';

                    $query->{$method}(function ($termQuery) use ($escaped) {
                        $termQuery->where('item_id', 'like', "%{$escaped}%")
                            ->orWhere('name', 'like', "%{$escaped}%")
                            ->orWhere('name_kana', 'like', "%{$escaped}%")
                            ->orWhere('name_en', 'like', "%{$escaped}%")
                            ->orWhere('slot', 'like', "%{$escaped}%")
                            ->orWhere('accessory_type', 'like', "%{$escaped}%")
                            ->orWhere('description', 'like', "%{$escaped}%")
                            ->orWhere('inheritance_type', 'like', "%{$escaped}%")
                            ->orWhere('inheritance_note', 'like', "%{$escaped}%");
                    });
                }
            })
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();

        $relatedIds = [];

        foreach ($matchedIds as $matchedId) {
            $matchedAccessory = $allAccessories->firstWhere('id', $matchedId);

            if (!$matchedAccessory) {
                continue;
            }

            $root = $this->findInheritanceRootFromCollection(
                $matchedAccessory,
                $allAccessories
            );

            $this->collectInheritanceDescendantIds(
                $root,
                $childrenByParentId,
                $relatedIds
            );
        }

        return array_values(array_unique($relatedIds));
    }

private function findInheritanceRootFromCollection($accessory, $allAccessories)
{
    $current = $accessory;
    $visitedIds = [];

    while ($current && $current->inheritance_from_accessory_id) {
        if (in_array((int) $current->id, $visitedIds, true)) {
            break;
        }

        $visitedIds[] = (int) $current->id;

        $parent = $allAccessories->firstWhere(
            'id',
            (int) $current->inheritance_from_accessory_id
        );

        if (!$parent) {
            break;
        }

        $current = $parent;
    }

    return $current;
}

    private function collectInheritanceDescendantIds($accessory, array $childrenByParentId, array &$ids): void
    {
        if (!$accessory) {
            return;
        }

        $accessoryId = (int) $accessory->id;

        if (in_array($accessoryId, $ids, true)) {
            return;
        }

        $ids[] = $accessoryId;

        $children = $childrenByParentId[$accessoryId] ?? [];

        foreach ($children as $child) {
            $this->collectInheritanceDescendantIds(
                $child,
                $childrenByParentId,
                $ids
            );
        }
    }

private function findInheritanceRoot(Accessory $accessory): Accessory
{
    $current = $accessory;
    $visitedIds = [];

    while ($current->inheritance_from_accessory_id) {
        if (in_array((int) $current->id, $visitedIds, true)) {
            break;
        }

        $visitedIds[] = (int) $current->id;

        $parent = Accessory::query()
            ->select([
                'id',
                'item_id',
                'name',
                'name_kana',
                'name_en',
                'slot',
                'accessory_type',
                'inheritance_from_accessory_id',
                'inheritance_type',
                'image_url',
            ])
            ->find($current->inheritance_from_accessory_id);

        if (!$parent) {
            break;
        }

        $current = $parent;
    }

    return $current;
}

    private function buildSearchTerms(string $keyword): array
    {
        $keyword = trim($keyword);

        if ($keyword === '') {
            return [];
        }

        return array_values(array_unique([
            $keyword,
            mb_convert_kana($keyword, 'c', 'UTF-8'),
            mb_convert_kana($keyword, 'C', 'UTF-8'),
        ]));
    }

    private function validateNameKana(Request $request): array
    {
        return $request->validate([
            'name_kana' => ['nullable', 'string', 'max:255'],
        ]);
    }

    private function normalizeJsonOutput($value): array
    {
        if (is_array($value)) {
            return array_values($value);
        }

        if (is_string($value) && $value !== '') {
            $decoded = json_decode($value, true);

            return is_array($decoded) ? array_values($decoded) : [];
        }

        return [];
    }
    private function buildAccessoryImageBaseName(?int $accessoryId, ?string $itemId): string
{
    if ($accessoryId) {
        return "{$accessoryId}-";
    }

    $normalizedItemId = trim((string) $itemId);

    if ($normalizedItemId !== '') {
        return Str::slug($normalizedItemId);
    }

    return 'accessory-' . now()->format('YmdHis');
}

private function convertUploadedImageToWebp(string $path): string
{
    $imageInfo = getimagesize($path);

    if (!$imageInfo) {
        abort(422, '画像ファイルを読み込めませんでした');
    }

    $mime = $imageInfo['mime'] ?? '';

    $source = match ($mime) {
        'image/jpeg' => imagecreatefromjpeg($path),
        'image/png' => imagecreatefrompng($path),
        'image/webp' => imagecreatefromwebp($path),
        'image/gif' => imagecreatefromgif($path),
        default => null,
    };

    if (!$source) {
        abort(422, '対応していない画像形式です');
    }

    imagepalettetotruecolor($source);
    imagealphablending($source, true);
    imagesavealpha($source, true);

    ob_start();

    $ok = imagewebp($source, null, 90);

    $binary = ob_get_clean();

    imagedestroy($source);

    if (!$ok || !$binary) {
        abort(500, 'WebP画像の生成に失敗しました');
    }

    return $binary;
}
}
