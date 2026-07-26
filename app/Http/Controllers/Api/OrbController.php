<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreOrbRequest;
use App\Http\Requests\UpdateOrbRequest;
use App\Models\Monster;
use App\Models\MonsterDrop;
use App\Models\Orb;
use App\Services\MonsterDropSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrbController extends Controller
{
    public function __construct(
        private MonsterDropSyncService $monsterDropSyncService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        $color = trim((string) $request->query('color', ''));

        $query = Orb::query();

        if ($color !== '') {
            $query->where('color', $color);
        }

        if ($q !== '') {
            $hiraganaQ = mb_convert_kana($q, 'c', 'UTF-8');
            $katakanaQ = mb_convert_kana($q, 'C', 'UTF-8');
            $searchTerms = array_values(array_unique([
                $q,
                $hiraganaQ,
                $katakanaQ,
            ]));

            $query->where(function ($sub) use ($searchTerms) {
                foreach ($searchTerms as $index => $term) {
                    $escaped = addcslashes($term, '\\%_');
                    $method = $index === 0 ? 'where' : 'orWhere';

                    $sub->{$method}(function ($termQuery) use ($escaped) {
                        $termQuery->where('name', 'like', "%{$escaped}%")
                            ->orWhere('name_kana', 'like', "%{$escaped}%")
                            ->orWhere('name_en', 'like', "%{$escaped}%")
                            ->orWhere('color', 'like', "%{$escaped}%")
                            ->orWhere('effect', 'like', "%{$escaped}%");
                    });
                }
            });

            $escapedQ = addcslashes($q, '\\%_');
            $escapedHiraganaQ = addcslashes($hiraganaQ, '\\%_');

            $query->orderByRaw(
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
            'data' => $query->get(),
        ]);
    }

    public function show(Orb $orb): JsonResponse
    {
        return response()->json([
            'data' => $this->buildOrbResponse($orb),
        ]);
    }

    public function store(StoreOrbRequest $request): JsonResponse
    {
        $validated = array_merge(
            $request->validated(),
            $this->validateNameFields($request)
        );

        logger()->info('orb store validated', $validated);

        $orb = DB::transaction(function () use ($validated) {
            $orb = new Orb();
            $orb->name = $validated['name'];
            $orb->name_kana = $validated['name_kana'] ?? null;
            $orb->name_en = $validated['name_en'] ?? null;
            $orb->color = $validated['color'] ?? null;
            $orb->effect = $validated['effect'] ?? null;
            $orb->save();

            $this->monsterDropSyncService->sync(
                'orb',
                $orb->id,
                $validated['drop_monsters'] ?? []
            );

            return $orb;
        });

        return response()->json([
            'message' => 'オーブを作成した',
            'data' => $this->buildOrbResponse($orb->fresh()),
        ], 201);
    }

    public function update(UpdateOrbRequest $request, Orb $orb): JsonResponse
    {
        $validated = array_merge(
            $request->validated(),
            $this->validateNameFields($request)
        );

        logger()->info('orb update validated', $validated);

        DB::transaction(function () use ($orb, $validated) {
            $orb->name = $validated['name'];
            $orb->name_kana = $validated['name_kana'] ?? null;
            $orb->name_en = $validated['name_en'] ?? null;
            $orb->color = $validated['color'] ?? null;
            $orb->effect = $validated['effect'] ?? null;
            $orb->save();

            $this->monsterDropSyncService->sync(
                'orb',
                $orb->id,
                $validated['drop_monsters'] ?? []
            );
        });

        return response()->json([
            'message' => 'オーブを更新した',
            'data' => $this->buildOrbResponse($orb->fresh()),
        ]);
    }

    public function destroy(Orb $orb): JsonResponse
    {
        DB::transaction(function () use ($orb) {
            MonsterDrop::query()
                ->where('drop_target_type', 'orb')
                ->where('drop_target_id', $orb->id)
                ->delete();

            $orb->delete();
        });

        return response()->json([
            'message' => 'オーブを削除した',
        ]);
    }

    private function buildOrbResponse(Orb $orb): array
    {
        $drops = MonsterDrop::query()
            ->where('drop_target_type', 'orb')
            ->where('drop_target_id', $orb->id)
            ->orderByRaw('sort_order is null, sort_order asc')
            ->get();

        $monsterIds = $drops->pluck('monster_id')->filter()->values()->all();

        $monstersById = Monster::query()
            ->whereIn('id', $monsterIds)
            ->get()
            ->keyBy('id');

        return [
            'id' => $orb->id,
            'name' => $orb->name,
            'name_kana' => $orb->name_kana,
            'name_en' => $orb->name_en,
            'color' => $orb->color,
            'effect' => $orb->effect,
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

    private function validateNameFields(Request $request): array
    {
        return $request->validate([
            'name_kana' => ['nullable', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
        ]);
    }
}
