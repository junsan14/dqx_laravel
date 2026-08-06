<?php

namespace App\Http\Controllers\Api;

use App\Models\Continent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ContinentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));

        $query = Continent::query()->select([
            'id',
            'display_order',
            'name',
            'name_kana',
            'name_en',
            'map_image_folder',
            'created_at',
            'updated_at',
        ]);

        if ($q !== '') {
            $query->where(function ($subQuery) use ($q) {
                $subQuery->where('name', 'like', "%{$q}%")
                    ->orWhere('name_kana', 'like', "%{$q}%")
                    ->orWhere('name_en', 'like', "%{$q}%")
                    ->orWhere('map_image_folder', 'like', "%{$q}%");
            });
        }

        $continents = $query
            ->orderBy('display_order')
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => $continents,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'display_order' => ['required', 'integer', 'min:1'],
            'name' => ['required', 'string', 'max:255', 'unique:continents,name'],
            'name_kana' => ['nullable', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'map_image_folder' => ['nullable', 'string', 'max:255'],
        ]);

        $continent = DB::transaction(function () use ($validated) {
            $maxOrder = (int) (Continent::max('display_order') ?? 0);
            $targetOrder = min((int) $validated['display_order'], $maxOrder + 1);

            $this->shiftOrdersForInsert($targetOrder);

            return Continent::create([
                'display_order' => $targetOrder,
                'name' => trim($validated['name']),
                'name_kana' => filled($validated['name_kana'] ?? null)
                    ? trim($validated['name_kana'])
                    : null,
                'name_en' => filled($validated['name_en'] ?? null)
                    ? trim($validated['name_en'])
                    : null,
                'map_image_folder' => filled($validated['map_image_folder'] ?? null)
                    ? trim($validated['map_image_folder'])
                    : null,
            ]);
        });

        return response()->json([
            'message' => '大陸を作成した',
            'data' => $continent,
        ], 201);
    }

    public function show(Continent $continent): JsonResponse
    {
        return response()->json([
            'data' => $continent,
        ]);
    }

    public function update(Request $request, Continent $continent): JsonResponse
    {
        $validated = $request->validate([
            'display_order' => ['required', 'integer', 'min:1'],
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('continents', 'name')->ignore($continent->id),
            ],
            'name_kana' => ['nullable', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'map_image_folder' => ['nullable', 'string', 'max:255'],
        ]);

        $updated = DB::transaction(function () use ($validated, $continent) {
            $oldOrder = (int) $continent->display_order;
            $maxOrder = (int) Continent::count();
            $newOrder = min((int) $validated['display_order'], $maxOrder);

            if ($newOrder !== $oldOrder) {
                $this->moveContinentOrder($continent->id, $oldOrder, $newOrder);
            }

            $continent->update([
                'display_order' => $newOrder,
                'name' => trim($validated['name']),
                'name_kana' => filled($validated['name_kana'] ?? null)
                    ? trim($validated['name_kana'])
                    : null,
                'name_en' => filled($validated['name_en'] ?? null)
                    ? trim($validated['name_en'])
                    : null,
                'map_image_folder' => filled($validated['map_image_folder'] ?? null)
                    ? trim($validated['map_image_folder'])
                    : null,
            ]);

            return $continent->fresh();
        });

        return response()->json([
            'message' => '大陸を更新した',
            'data' => $updated,
        ]);
    }

    public function destroy(Continent $continent): JsonResponse
    {
        DB::transaction(function () use ($continent) {
            $deletedOrder = (int) $continent->display_order;

            $continent->delete();

            $this->closeGapAfterDelete($deletedOrder);
        });

        return response()->json([
            'message' => '大陸を削除した',
        ]);
    }

    private function shiftOrdersForInsert(int $targetOrder): void
    {
        $targets = Continent::where('display_order', '>=', $targetOrder)
            ->orderBy('display_order')
            ->get(['id', 'display_order']);

        if ($targets->isEmpty()) {
            return;
        }

        $buffer = 100000;

        foreach ($targets as $row) {
            DB::table('continents')
                ->where('id', $row->id)
                ->update([
                    'display_order' => $row->display_order + $buffer,
                    'updated_at' => now(),
                ]);
        }

        foreach ($targets as $row) {
            DB::table('continents')
                ->where('id', $row->id)
                ->update([
                    'display_order' => $row->display_order + 1,
                    'updated_at' => now(),
                ]);
        }
    }

    private function moveContinentOrder(int $continentId, int $oldOrder, int $newOrder): void
    {
        $buffer = 100000;

        DB::table('continents')
            ->where('id', $continentId)
            ->update([
                'display_order' => $oldOrder + $buffer,
                'updated_at' => now(),
            ]);

        if ($newOrder < $oldOrder) {
            $targets = Continent::where('id', '!=', $continentId)
                ->whereBetween('display_order', [$newOrder, $oldOrder - 1])
                ->orderBy('display_order')
                ->get(['id', 'display_order']);

            foreach ($targets as $row) {
                DB::table('continents')
                    ->where('id', $row->id)
                    ->update([
                        'display_order' => $row->display_order + $buffer,
                        'updated_at' => now(),
                    ]);
            }

            foreach ($targets as $row) {
                DB::table('continents')
                    ->where('id', $row->id)
                    ->update([
                        'display_order' => $row->display_order + 1,
                        'updated_at' => now(),
                    ]);
            }
        } elseif ($newOrder > $oldOrder) {
            $targets = Continent::where('id', '!=', $continentId)
                ->whereBetween('display_order', [$oldOrder + 1, $newOrder])
                ->orderBy('display_order')
                ->get(['id', 'display_order']);

            foreach ($targets as $row) {
                DB::table('continents')
                    ->where('id', $row->id)
                    ->update([
                        'display_order' => $row->display_order + $buffer,
                        'updated_at' => now(),
                    ]);
            }

            foreach ($targets as $row) {
                DB::table('continents')
                    ->where('id', $row->id)
                    ->update([
                        'display_order' => $row->display_order - 1,
                        'updated_at' => now(),
                    ]);
            }
        }

        DB::table('continents')
            ->where('id', $continentId)
            ->update([
                'display_order' => $newOrder,
                'updated_at' => now(),
            ]);
    }

    private function closeGapAfterDelete(int $deletedOrder): void
    {
        $targets = Continent::where('display_order', '>', $deletedOrder)
            ->orderBy('display_order')
            ->get(['id', 'display_order']);

        if ($targets->isEmpty()) {
            return;
        }

        $buffer = 100000;

        foreach ($targets as $row) {
            DB::table('continents')
                ->where('id', $row->id)
                ->update([
                    'display_order' => $row->display_order + $buffer,
                    'updated_at' => now(),
                ]);
        }

        foreach ($targets as $row) {
            DB::table('continents')
                ->where('id', $row->id)
                ->update([
                    'display_order' => $row->display_order - 1,
                    'updated_at' => now(),
                ]);
        }
    }
}