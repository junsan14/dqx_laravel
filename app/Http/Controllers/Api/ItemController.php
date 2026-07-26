<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreItemRequest;
use App\Http\Requests\UpdateItemRequest;
use App\Models\Item;
use App\Models\Monster;
use App\Models\MonsterDrop;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Services\MonsterDropSyncService;

class ItemController extends Controller
{
    public function __construct(
        private MonsterDropSyncService $monsterDropSyncService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = Item::query();

        if ($request->filled('ids')) {
            $ids = collect(explode(',', (string) $request->ids))
                ->map(fn ($id) => (int) trim($id))
                ->filter(fn ($id) => $id > 0)
                ->values();

            if ($ids->isNotEmpty()) {
                $query->whereIn('id', $ids);
            } else {
                $query->whereRaw('1 = 0');
            }
        }

        if ($request->filled('q')) {
            $q = trim((string) $request->q);

            $query->where(function ($sub) use ($q) {
                $sub->where('name', 'like', "%{$q}%")
                    ->orWhere('name_kana', 'like', "%{$q}%")
                    ->orWhere('name_en', 'like', "%{$q}%");
            });
        }

        if ($request->filled('category')) {
            $query->where('category', $request->category);
        }

        $rows = $query->orderBy('name')->get();

        return response()->json([
            'data' => $rows,
        ]);
    }

    public function show(Item $item): JsonResponse
    {
        return response()->json([
            'data' => $this->buildItemResponse($item),
        ]);
    }

    public function store(StoreItemRequest $request): JsonResponse
    {
        $validated = $request->validated();

        logger()->info('item store validated', $validated);

        $item = DB::transaction(function () use ($validated) {
            $item = Item::create([
                'name' => $validated['name'],
                'name_kana' => $validated['name_kana'] ?? null,

                'name_en' => $validated['name_en'] ?? null,
                'buy_price' => $validated['buy_price'] ?? null,
                'sell_price' => $validated['sell_price'] ?? null,
                'category' => $validated['category'] ?? null,
            ]);

            $this->monsterDropSyncService->sync(
                'item',
                $item->id,
                $validated['drop_monsters'] ?? []
            );

            return $item;
        });

        return response()->json([
            'message' => 'アイテムを作成した',
            'data' => $this->buildItemResponse($item->fresh()),
        ], 201);
    }

    public function update(UpdateItemRequest $request, Item $item): JsonResponse
    {
        $validated = $request->validated();

        logger()->info('item update validated', $validated);

        DB::transaction(function () use ($item, $validated) {
            $item->update([
                'name' => $validated['name'],
                'name_kana' => $validated['name_kana'] ?? null,

                'name_en' => $validated['name_en'] ?? null,
                'buy_price' => $validated['buy_price'] ?? null,
                'sell_price' => $validated['sell_price'] ?? null,
                'category' => $validated['category'] ?? null,
            ]);

            $this->monsterDropSyncService->sync(
                'item',
                $item->id,
                $validated['drop_monsters'] ?? []
            );
        });

        return response()->json([
            'message' => 'アイテムを更新した',
            'data' => $this->buildItemResponse($item->fresh()),
        ]);
    }

    public function destroy(Item $item): JsonResponse
    {
        DB::transaction(function () use ($item) {
            MonsterDrop::query()
                ->where('drop_target_type', 'item')
                ->where('drop_target_id', $item->id)
                ->delete();

            $item->delete();
        });

        return response()->json([
            'message' => 'アイテムを削除した',
        ]);
    }

    private function buildItemResponse(Item $item): array
    {
        $drops = MonsterDrop::query()
            ->where('drop_target_type', 'item')
            ->where('drop_target_id', $item->id)
            ->orderByRaw('sort_order is null, sort_order asc')
            ->get();

        $monsterIds = $drops->pluck('monster_id')->filter()->values()->all();

        $monstersById = Monster::query()
            ->whereIn('id', $monsterIds)
            ->get()
            ->keyBy('id');

        return [
            'id' => $item->id,
            'name' => $item->name,
            'name_kana' => $item->name_kana,
            'name_en' => $item->name_en,
            'buy_price' => $item->buy_price,
            'sell_price' => $item->sell_price,
            'category' => $item->category,
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
                        'name_en' => $monster->name_en,
                        'system_type' => $monster->system_type,
                        'system_type_en' => $monster->system_type_en,
                    ] : null,
                ];
            })->values(),
        ];
    }
}