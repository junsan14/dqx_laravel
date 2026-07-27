<?php

namespace App\Http\Controllers\Api;


use App\Http\Controllers\Controller;
use App\Models\Monster;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Storage;
use Intervention\Image\ImageManager;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\Encoders\WebpEncoder;

class MonsterController extends Controller
{
    public function index(Request $request)
    {
        $keyword = trim((string) $request->get('keyword', ''));
        $searchType = (string) $request->get('search_type', 'monster');

        if ($searchType === 'monster') {
            $monsters = Monster::query()
                ->leftJoin('monsters as parents', 'parents.id', '=', 'monsters.reincarnation_parent_id')
                ->selectRaw('
                    monsters.id,
                    monsters.display_order as monster_no,
                    monsters.display_order,
                    monsters.name,
                    monsters.name_kana,
                    monsters.name_en,
                    monsters.system_type,
                    monsters.system_type_en,
                    monsters.source_url,
                    monsters.trivia_1,
                    monsters.trivia_2,
                    monsters.image_path,
                    monsters.is_reincarnated,
                    monsters.reincarnation_parent_id,
                    parents.name as reincarnation_parent_name,
                    parents.name_kana as reincarnation_parent_name_kana,
                    parents.name_en as reincarnation_parent_name_en
                ')
                ->when($keyword !== '', function ($query) use ($keyword) {
                    $searchTerms = $this->buildSearchTerms($keyword);
                    $numericKeyword = ctype_digit($keyword) ? (int) $keyword : null;

                    $query->where(function ($q) use ($searchTerms, $numericKeyword) {
                        foreach ($searchTerms as $index => $term) {
                            $escaped = addcslashes($term, '\\%_');
                            $method = $index === 0 ? 'where' : 'orWhere';

                            $q->{$method}(function ($termQuery) use ($escaped) {
                                $termQuery
                                    ->where('monsters.name', 'like', '%' . $escaped . '%')
                                    ->orWhere('monsters.name_kana', 'like', '%' . $escaped . '%')
                                    ->orWhere('monsters.name_en', 'like', '%' . $escaped . '%');
                            });
                        }

                        if ($numericKeyword !== null) {
                            $q->orWhere('monsters.id', $numericKeyword)
                              ->orWhere('monsters.display_order', $numericKeyword);
                        }
                    });

                    $hiraganaKeyword = mb_convert_kana($keyword, 'c', 'UTF-8');
                    $escapedKeyword = addcslashes($keyword, '\\%_');
                    $escapedHiraganaKeyword = addcslashes($hiraganaKeyword, '\\%_');

                    $query->orderByRaw(
                        "
                        CASE
                            WHEN monsters.id = ? THEN 0
                            WHEN monsters.display_order = ? THEN 0
                            WHEN monsters.name = ?
                                OR monsters.name_kana = ?
                                OR monsters.name_en = ? THEN 1
                            WHEN monsters.name LIKE ?
                                OR monsters.name_kana LIKE ?
                                OR monsters.name_en LIKE ? THEN 2
                            ELSE 3
                        END
                        ",
                        [
                            $numericKeyword ?? 0,
                            $numericKeyword ?? 0,
                            $keyword,
                            $hiraganaKeyword,
                            $keyword,
                            $escapedKeyword . '%',
                            $escapedHiraganaKeyword . '%',
                            $escapedKeyword . '%',
                        ]
                    )
                    ->orderByRaw('LENGTH(COALESCE(monsters.name_en, monsters.name)) ASC')
                    ->orderBy('monsters.display_order')
                    ->orderBy('monsters.name');
                }, function ($query) {
                    $query->orderBy('monsters.display_order')
                        ->orderBy('monsters.name');
                })
                ->limit(300)
                ->get();

            return response()->json(
                $this->attachDropSummaries($monsters, 'monster', $keyword)->values()
            );
        }

        if ($searchType === 'item') {
            $monsters = Monster::query()
                ->leftJoin('monsters as parents', 'parents.id', '=', 'monsters.reincarnation_parent_id')
                ->selectRaw('
                    monsters.id,
                    monsters.display_order as monster_no,
                    monsters.display_order,
                    monsters.name,
                    monsters.name_kana,
                    monsters.name_en,
                    monsters.system_type,
                    monsters.system_type_en,
                    monsters.source_url,
                    monsters.trivia_1,
                    monsters.trivia_2,
                    monsters.image_path,
                    monsters.is_reincarnated,
                    monsters.reincarnation_parent_id,
                    parents.name as reincarnation_parent_name,
                    parents.name_kana as reincarnation_parent_name_kana,
                    parents.name_en as reincarnation_parent_name_en,
                    items.name as matched_name,
                    items.name_kana as matched_name_kana,
                    items.name_en as matched_name_en
                ')
                ->join('monster_drops', function ($join) {
                    $join->on('monster_drops.monster_id', '=', 'monsters.id')
                        ->where('monster_drops.drop_target_type', '=', 'item');
                })
                ->join('items', 'items.id', '=', 'monster_drops.drop_target_id')
                ->when($keyword !== '', function ($query) use ($keyword) {
                    $searchTerms = $this->buildSearchTerms($keyword);
                    $hiraganaKeyword = mb_convert_kana($keyword, 'c', 'UTF-8');
                    $escapedKeyword = addcslashes($keyword, '\\%_');
                    $escapedHiraganaKeyword = addcslashes($hiraganaKeyword, '\\%_');

                    $query->where(function ($q) use ($searchTerms) {
                        foreach ($searchTerms as $index => $term) {
                            $escaped = addcslashes($term, '\\%_');
                            $method = $index === 0 ? 'where' : 'orWhere';

                            $q->{$method}(function ($termQuery) use ($escaped) {
                                $termQuery
                                    ->where('items.name', 'like', '%' . $escaped . '%')
                                    ->orWhere('items.name_kana', 'like', '%' . $escaped . '%')
                                    ->orWhere('items.name_en', 'like', '%' . $escaped . '%');
                            });
                        }
                    })
                    ->orderByRaw(
                        "
                        CASE
                            WHEN items.name = ?
                                OR items.name_kana = ?
                                OR items.name_en = ? THEN 0
                            WHEN items.name LIKE ?
                                OR items.name_kana LIKE ?
                                OR items.name_en LIKE ? THEN 1
                            ELSE 2
                        END
                        ",
                        [
                            $keyword,
                            $hiraganaKeyword,
                            $keyword,
                            $escapedKeyword . '%',
                            $escapedHiraganaKeyword . '%',
                            $escapedKeyword . '%',
                        ]
                    )
                    ->orderByRaw('LENGTH(COALESCE(items.name_en, items.name)) ASC')
                    ->orderBy('items.name')
                    ->orderBy('monsters.display_order');
                }, function ($query) {
                    $query->orderBy('monsters.display_order');
                })
                ->limit(200)
                ->get()
                ->unique('id')
                ->values();

            return response()->json(
                $this->attachDropSummaries($monsters, 'item', $keyword)->values()
            );
        }

        if ($searchType === 'orb') {
            $monsters = Monster::query()
                ->leftJoin('monsters as parents', 'parents.id', '=', 'monsters.reincarnation_parent_id')
                ->selectRaw('
                    monsters.id,
                    monsters.display_order as monster_no,
                    monsters.display_order,
                    monsters.name,
                    monsters.name_kana,
                    monsters.name_en,
                    monsters.system_type,
                    monsters.system_type_en,
                    monsters.source_url,
                    monsters.trivia_1,
                    monsters.trivia_2,
                    monsters.image_path,
                    monsters.is_reincarnated,
                    monsters.reincarnation_parent_id,
                    parents.name as reincarnation_parent_name,
                    parents.name_kana as reincarnation_parent_name_kana,
                    parents.name_en as reincarnation_parent_name_en,
                    orbs.name as matched_name,
                    orbs.name_kana as matched_name_kana,
                    orbs.name_en as matched_name_en,
                    orbs.color as matched_color
                ')
                ->join('monster_drops', function ($join) {
                    $join->on('monster_drops.monster_id', '=', 'monsters.id')
                        ->where('monster_drops.drop_target_type', '=', 'orb');
                })
                ->join('orbs', 'orbs.id', '=', 'monster_drops.drop_target_id')
                ->when($keyword !== '', function ($query) use ($keyword) {
                    $searchTerms = $this->buildSearchTerms($keyword);
                    $hiraganaKeyword = mb_convert_kana($keyword, 'c', 'UTF-8');
                    $escapedKeyword = addcslashes($keyword, '\\%_');
                    $escapedHiraganaKeyword = addcslashes($hiraganaKeyword, '\\%_');

                    $query->where(function ($q) use ($searchTerms) {
                        foreach ($searchTerms as $index => $term) {
                            $escaped = addcslashes($term, '\\%_');
                            $method = $index === 0 ? 'where' : 'orWhere';

                            $q->{$method}(function ($termQuery) use ($escaped) {
                                $termQuery
                                    ->where('orbs.name', 'like', '%' . $escaped . '%')
                                    ->orWhere('orbs.name_kana', 'like', '%' . $escaped . '%')
                                    ->orWhere('orbs.name_en', 'like', '%' . $escaped . '%');
                            });
                        }
                    })
                    ->orderByRaw(
                        "
                        CASE
                            WHEN orbs.name = ?
                                OR orbs.name_kana = ?
                                OR orbs.name_en = ? THEN 0
                            WHEN orbs.name LIKE ?
                                OR orbs.name_kana LIKE ?
                                OR orbs.name_en LIKE ? THEN 1
                            ELSE 2
                        END
                        ",
                        [
                            $keyword,
                            $hiraganaKeyword,
                            $keyword,
                            $escapedKeyword . '%',
                            $escapedHiraganaKeyword . '%',
                            $escapedKeyword . '%',
                        ]
                    )
                    ->orderByRaw('LENGTH(COALESCE(orbs.name_en, orbs.name)) ASC')
                    ->orderBy('orbs.name')
                    ->orderBy('monsters.display_order');
                }, function ($query) {
                    $query->orderBy('monsters.display_order');
                })
                ->limit(200)
                ->get()
                ->unique('id')
                ->values();

            return response()->json(
                $this->attachDropSummaries($monsters, 'orb', $keyword)->values()
            );
        }

if ($searchType === 'equipment') {
    $monsters = Monster::query()
        ->leftJoin('monsters as parents', 'parents.id', '=', 'monsters.reincarnation_parent_id')
        ->selectRaw('
            monsters.id,
            monsters.display_order as monster_no,
            monsters.display_order,
            monsters.name,
            monsters.name_kana,
            monsters.name_en,
            monsters.system_type,
            monsters.system_type_en,
            monsters.source_url,
            monsters.trivia_1,
            monsters.trivia_2,
            monsters.image_path,
            monsters.is_reincarnated,
            monsters.reincarnation_parent_id,
            parents.name as reincarnation_parent_name,
            parents.name_kana as reincarnation_parent_name_kana,
            parents.name_en as reincarnation_parent_name_en,
            MIN(equipments.item_name) as matched_name,
            MIN(equipments.item_name_kana) as matched_name_kana,
            MIN(equipments.item_name_en) as matched_name_en
        ')
        ->join('monster_drops', function ($join) {
            $join->on('monster_drops.monster_id', '=', 'monsters.id')
                ->where('monster_drops.drop_target_type', '=', 'equipment');
        })
        ->join('equipments', 'equipments.id', '=', 'monster_drops.drop_target_id')
        ->when($keyword !== '', function ($query) use ($keyword) {
            $searchTerms = $this->buildSearchTerms($keyword);
            $hiraganaKeyword = mb_convert_kana($keyword, 'c', 'UTF-8');
            $escapedKeyword = addcslashes($keyword, '\\%_');
            $escapedHiraganaKeyword = addcslashes($hiraganaKeyword, '\\%_');

            $query->where(function ($q) use ($searchTerms) {
                foreach ($searchTerms as $index => $term) {
                    $escaped = addcslashes($term, '\\%_');
                    $method = $index === 0 ? 'where' : 'orWhere';

                    $q->{$method}(function ($termQuery) use ($escaped) {
                        $termQuery
                            ->where('equipments.item_name', 'like', '%' . $escaped . '%')
                            ->orWhere('equipments.item_name_kana', 'like', '%' . $escaped . '%')
                            ->orWhere('equipments.item_name_en', 'like', '%' . $escaped . '%');
                    });
                }
            })
            ->orderByRaw(
                "
                MIN(
                    CASE
                        WHEN equipments.item_name = ?
                            OR equipments.item_name_kana = ?
                            OR equipments.item_name_en = ? THEN 0
                        WHEN equipments.item_name LIKE ?
                            OR equipments.item_name_kana LIKE ?
                            OR equipments.item_name_en LIKE ? THEN 1
                        ELSE 2
                    END
                ) ASC
                ",
                [
                    $keyword,
                    $hiraganaKeyword,
                    $keyword,
                    $escapedKeyword . '%',
                    $escapedHiraganaKeyword . '%',
                    $escapedKeyword . '%',
                ]
            )
            ->orderByRaw('MIN(LENGTH(COALESCE(equipments.item_name_en, equipments.item_name))) ASC')
            ->orderBy('monsters.display_order');
        }, function ($query) {
            $query->orderBy('monsters.display_order');
        })
        ->groupBy(
            'monsters.id',
            'monsters.display_order',
            'monsters.name',
            'monsters.name_kana',
            'monsters.name_en',
            'monsters.system_type',
            'monsters.system_type_en',
            'monsters.source_url',
            'monsters.trivia_1',
            'monsters.trivia_2',
            'monsters.image_path',
            'monsters.is_reincarnated',
            'monsters.reincarnation_parent_id',
            'parents.name',
            'parents.name_kana',
            'parents.name_en'
        )
        ->limit(500)
        ->get()
        ->values();

    return response()->json(
        $this->attachDropSummaries($monsters, 'equipment', $keyword)->values()
    );
}

        if ($searchType === 'accessory') {
            $monsters = Monster::query()
                ->leftJoin('monsters as parents', 'parents.id', '=', 'monsters.reincarnation_parent_id')
                ->selectRaw('
                    monsters.id,
                    monsters.display_order as monster_no,
                    monsters.display_order,
                    monsters.name,
                    monsters.name_kana,
                    monsters.name_en,
                    monsters.system_type,
                    monsters.system_type_en,
                    monsters.source_url,
                    monsters.trivia_1,
                    monsters.trivia_2,
                    monsters.image_path,
                    monsters.is_reincarnated,
                    monsters.reincarnation_parent_id,
                    parents.name as reincarnation_parent_name,
                    parents.name_kana as reincarnation_parent_name_kana,
                    parents.name_en as reincarnation_parent_name_en,
                    accessories.name as matched_name,
                    accessories.name_kana as matched_name_kana,
                    accessories.name_en as matched_name_en
                ')
                ->join('monster_drops', function ($join) {
                    $join->on('monster_drops.monster_id', '=', 'monsters.id')
                        ->where('monster_drops.drop_target_type', '=', 'accessory');
                })
                ->join('accessories', 'accessories.id', '=', 'monster_drops.drop_target_id')
                ->when($keyword !== '', function ($query) use ($keyword) {
                    $searchTerms = $this->buildSearchTerms($keyword);
                    $hiraganaKeyword = mb_convert_kana($keyword, 'c', 'UTF-8');
                    $escapedKeyword = addcslashes($keyword, '\\%_');
                    $escapedHiraganaKeyword = addcslashes($hiraganaKeyword, '\\%_');

                    $query->where(function ($q) use ($searchTerms) {
                        foreach ($searchTerms as $index => $term) {
                            $escaped = addcslashes($term, '\\%_');
                            $method = $index === 0 ? 'where' : 'orWhere';

                            $q->{$method}(function ($termQuery) use ($escaped) {
                                $termQuery
                                    ->where('accessories.name', 'like', '%' . $escaped . '%')
                                    ->orWhere('accessories.name_kana', 'like', '%' . $escaped . '%')
                                    ->orWhere('accessories.name_en', 'like', '%' . $escaped . '%');
                            });
                        }
                    })
                    ->orderByRaw(
                        "
                        CASE
                            WHEN accessories.name = ?
                                OR accessories.name_kana = ?
                                OR accessories.name_en = ? THEN 0
                            WHEN accessories.name LIKE ?
                                OR accessories.name_kana LIKE ?
                                OR accessories.name_en LIKE ? THEN 1
                            ELSE 2
                        END
                        ",
                        [
                            $keyword,
                            $hiraganaKeyword,
                            $keyword,
                            $escapedKeyword . '%',
                            $escapedHiraganaKeyword . '%',
                            $escapedKeyword . '%',
                        ]
                    )
                    ->orderByRaw('LENGTH(COALESCE(accessories.name_en, accessories.name)) ASC')
                    ->orderBy('accessories.name')
                    ->orderBy('monsters.display_order');
                }, function ($query) {
                    $query->orderBy('monsters.display_order');
                })
                ->limit(200)
                ->get()
                ->unique('id')
                ->values();

            return response()->json(
                $this->attachDropSummaries($monsters, 'accessory', $keyword)->values()
            );
        }

        return response()->json([]);
    }

    public function show($id)
    {
        $monster = Monster::query()
            ->leftJoin('monsters as parents', 'parents.id', '=', 'monsters.reincarnation_parent_id')
            ->selectRaw('
                monsters.id,
                monsters.display_order as monster_no,
                monsters.display_order,
                monsters.name,
                monsters.name_kana,
                monsters.name_en,
                monsters.system_type,
                monsters.system_type_en,
                monsters.source_url,
                monsters.trivia_1,
                monsters.trivia_2,
                monsters.image_path,
                monsters.is_reincarnated,
                monsters.reincarnation_parent_id,
                parents.name as reincarnation_parent_name,
                parents.name_kana as reincarnation_parent_name_kana,
                parents.name_en as reincarnation_parent_name_en,
                monsters.created_at,
                monsters.updated_at
            ')
            ->where('monsters.id', $id)
            ->firstOrFail();

        $drops = DB::table('monster_drops')
            ->leftJoin('items', function ($join) {
                $join->on('items.id', '=', 'monster_drops.drop_target_id')
                    ->where('monster_drops.drop_target_type', '=', 'item');
            })
            ->leftJoin('orbs', function ($join) {
                $join->on('orbs.id', '=', 'monster_drops.drop_target_id')
                    ->where('monster_drops.drop_target_type', '=', 'orb');
            })
            ->leftJoin('equipments', function ($join) {
                $join->on('equipments.id', '=', 'monster_drops.drop_target_id')
                    ->where('monster_drops.drop_target_type', '=', 'equipment');
            })
            ->leftJoin('equipment_types', 'equipment_types.id', '=', 'equipments.equipment_type_id')
            ->leftJoin('accessories', function ($join) {
                $join->on('accessories.id', '=', 'monster_drops.drop_target_id')
                    ->where('monster_drops.drop_target_type', '=', 'accessory');
            })
            ->where('monster_drops.monster_id', $monster->id)
            ->orderByRaw("
                CASE
                    WHEN monster_drops.drop_target_type = 'item' AND monster_drops.drop_type = 'normal' THEN 1
                    WHEN monster_drops.drop_target_type = 'item' AND monster_drops.drop_type = 'rare' THEN 2
                    WHEN monster_drops.drop_type = 'white_box' THEN 3
                    WHEN monster_drops.drop_target_type = 'orb' THEN 4
                    WHEN monster_drops.drop_target_type = 'equipment' THEN 5
                    WHEN monster_drops.drop_target_type = 'accessory' THEN 6
                    ELSE 99
                END
            ")
            ->orderBy('monster_drops.sort_order')
            ->orderBy('monster_drops.id')
            ->get([
                'monster_drops.id',
                'monster_drops.monster_id',
                'monster_drops.drop_target_type',
                'monster_drops.drop_target_id',
                'monster_drops.drop_type',
                'monster_drops.sort_order',

                'items.name as item_name',
                'items.name_kana as item_name_kana',
                'items.name_en as item_name_en',
                'items.category as item_category',

                'orbs.name as orb_name',
                'orbs.name_kana as orb_name_kana',
                'orbs.name_en as orb_name_en',
                'orbs.color as orb_color',
                'orbs.effect as orb_effect',

                'equipments.item_name as equipment_name',
                'equipments.item_name_kana as equipment_name_kana',
                'equipments.item_name_en as equipment_name_en',
                'equipments.slot as equipment_slot',
                'equipment_types.name as equipment_type_name',

                'accessories.name as accessory_name',
                'accessories.name_kana as accessory_name_kana',
                'accessories.name_en as accessory_name_en',
                'accessories.slot as accessory_slot',
                'accessories.accessory_type as accessory_type',
            ])
            ->map(function ($drop) {
                $name = null;
                $nameKana = null;
                $nameEn = null;
                $category = null;
                $extra = [];

                if ($drop->drop_target_type === 'item') {
                    $name = $drop->item_name;
                    $nameKana = $drop->item_name_kana;
                    $nameEn = $drop->item_name_en;
                    $category = $drop->item_category;
                }

                if ($drop->drop_target_type === 'orb') {
                    $name = $drop->orb_name;
                    $nameKana = $drop->orb_name_kana;
                    $nameEn = $drop->orb_name_en;
                    $category = 'orb';
                    $extra = [
                        'color' => $drop->orb_color,
                        'effect' => $drop->orb_effect,
                    ];
                }

                if ($drop->drop_target_type === 'equipment') {
                    $name = $drop->equipment_name;
                    $nameKana = $drop->equipment_name_kana;
                    $nameEn = $drop->equipment_name_en;
                    $category = 'equipment';
                    $extra = [
                        'slot' => $drop->equipment_slot,
                        'equipment_type_name' => $drop->equipment_type_name,
                    ];
                }

                if ($drop->drop_target_type === 'accessory') {
                    $name = $drop->accessory_name;
                    $nameKana = $drop->accessory_name_kana;
                    $nameEn = $drop->accessory_name_en;
                    $category = 'accessory';
                    $extra = [
                        'slot' => $drop->accessory_slot,
                        'accessory_type' => $drop->accessory_type,
                    ];
                }

                return [
                    'id' => $drop->id,
                    'monster_id' => $drop->monster_id,
                    'drop_target_type' => $drop->drop_target_type,
                    'drop_target_id' => $drop->drop_target_id,
                    'drop_type' => $drop->drop_type,
                    'drop_type_label' => $this->dropTypeLabel($drop->drop_type, $drop->drop_target_type),
                    'sort_order' => $drop->sort_order,
                    'name' => $name,
                    'name_kana' => $nameKana,
                    'name_en' => $nameEn,
                    'target_name' => $name,
                    'target_name_kana' => $nameKana,
                    'target_name_en' => $nameEn,
                    'category' => $category,
                    ...$extra,
                ];
            })
            ->filter(fn ($drop) => !empty($drop['name']) || !empty($drop['name_en']))
            ->values();

        $maps = DB::table('monster_map_spawns')
            ->join('maps', 'maps.id', '=', 'monster_map_spawns.map_id')
            ->leftJoin('continents', 'continents.id', '=', 'maps.continent_id')
            ->leftJoin('map_layers', 'map_layers.id', '=', 'monster_map_spawns.map_layer_id')
            ->where('monster_map_spawns.monster_id', $monster->id)
            ->orderBy('continents.display_order')
            ->orderBy('maps.name')
            ->orderBy('map_layers.display_order')
            ->orderBy('map_layers.floor_no')
            ->orderBy('monster_map_spawns.id')
            ->get([
                'monster_map_spawns.id',
                'monster_map_spawns.map_id',
                'monster_map_spawns.map_layer_id',
                'monster_map_spawns.area',
                'monster_map_spawns.spawn_time',
                'monster_map_spawns.spawn_count',
                'monster_map_spawns.symbol_count',
                'monster_map_spawns.note',
                'monster_map_spawns.is_hunting_ground',

                'maps.name as map_name',
                'maps.name_en as map_name_en',
                'maps.continent_id as continent_id',

                'continents.display_order as continent_display_order',
                'continents.name as continent_name',
                'continents.name_en as continent_name_en',

                'map_layers.layer_name as map_layer_name',
                'map_layers.floor_no as map_layer_floor_no',
                'map_layers.image_path as map_layer_image_path',
            ])
            ->groupBy('map_id')
            ->map(function ($rows, $mapId) {
                $first = $rows->first();

                $mapImagePath = collect($rows)
                    ->pluck('map_layer_image_path')
                    ->filter(fn ($path) => !empty($path))
                    ->first();

                return [
                    'id' => (int) $mapId,
                    'name' => $first->map_name,
                    'name_en' => $first->map_name_en,
                    'map_name' => $first->map_name,
                    'map_name_en' => $first->map_name_en,

                    'continent_id' => $first->continent_id ? (int) $first->continent_id : null,
                    'continent_display_order' => $first->continent_display_order ? (int) $first->continent_display_order : null,
                    'continent' => $first->continent_name,
                    'continent_name' => $first->continent_name,
                    'continent_name_en' => $first->continent_name_en,

                    'image_path' => $mapImagePath,
                    'spawns' => $rows->map(function ($row) use ($mapImagePath) {
                        $layerName = trim((string) ($row->map_layer_name ?? ''));
                        $layerNameEn = trim((string) ($row->map_layer_name_en ?? ''));

                        if ($layerName === '' && $row->map_layer_floor_no !== null) {
                            $floorNo = (int) $row->map_layer_floor_no;

                            if ($floorNo === 0) {
                                $layerName = '地上';
                                $layerNameEn = $layerNameEn !== '' ? $layerNameEn : 'Ground';
                            } elseif ($floorNo < 0) {
                                $layerName = '地下' . abs($floorNo) . '階';
                                $layerNameEn = $layerNameEn !== '' ? $layerNameEn : 'B' . abs($floorNo);
                            } else {
                                $layerName = $floorNo . '階';
                                $layerNameEn = $layerNameEn !== '' ? $layerNameEn : 'Floor ' . $floorNo;
                            }
                        }

                        return [
                            'id' => $row->id,
                            'map_id' => $row->map_id,
                            'map_layer_id' => $row->map_layer_id,
                            'area' => $this->parseArea($row->area),
                            'spawn_time' => $row->spawn_time,
                            'spawn_count' => $row->spawn_count,
                            'symbol_count' => $row->symbol_count,
                            'note' => $this->parseNote($row->note),
                            'is_hunting_ground' => (bool) $row->is_hunting_ground,
                            'map_layer_name' => $layerName,
                            'map_layer_name_en' => $layerNameEn,
                            'map_layer_floor_no' => $row->map_layer_floor_no,
                            'map_image_path' => $row->map_layer_image_path ?: $mapImagePath,
                        ];
                    })->values(),
                ];
            })
            ->values();

        return response()->json([
            'id' => $monster->id,
            'monster_no' => $monster->monster_no,
            'display_order' => $monster->display_order,
            'name' => $monster->name,
            'name_kana' => $monster->name_kana,
            'name_en' => $monster->name_en,
            'system_type' => $monster->system_type,
            'system_type_en' => $monster->system_type_en,
            'source_url' => $monster->source_url,
            'trivia_1' => $monster->trivia_1,
            'trivia_2' => $monster->trivia_2,
            'image_path' => $monster->image_path,
            'is_reincarnated' => (bool) $monster->is_reincarnated,
            'reincarnation_parent_id' => $monster->reincarnation_parent_id ? (int) $monster->reincarnation_parent_id : null,
            'reincarnation_parent_name' => $monster->reincarnation_parent_name,
            'reincarnation_parent_name_kana' => $monster->reincarnation_parent_name_kana,
            'reincarnation_parent_name_en' => $monster->reincarnation_parent_name_en,
            'created_at' => $monster->created_at,
            'updated_at' => $monster->updated_at,

            'drops' => $drops,

            'normal_drops' => $drops->where('drop_target_type', 'item')->where('drop_type', 'normal')->values(),
            'rare_drops' => $drops->where('drop_target_type', 'item')->where('drop_type', 'rare')->values(),
            'white_box_drops' => $drops->where('drop_type', 'white_box')->values(),
            'orb_drops' => $drops->where('drop_target_type', 'orb')->values(),
            'equipment_drops' => $drops->where('drop_target_type', 'equipment')->values(),
            'accessory_drops' => $drops->where('drop_target_type', 'accessory')->values(),

            'maps' => $maps,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $this->validateMonsterPayload($request);

        $monster = DB::transaction(function () use ($validated, $request) {
            $newOrder = max(1, (int) $validated['display_order']);

            Monster::where('display_order', '>=', $newOrder)
                ->increment('display_order');

            $parentId = !empty($validated['reincarnation_parent_id'])
                ? (int) $validated['reincarnation_parent_id']
                : null;

            $monster = Monster::create([
                'display_order' => $newOrder,
                'name' => $validated['name'],
                'name_kana' => $validated['name_kana'] ?? null,
                'name_en' => $validated['name_en'] ?? null,
                'system_type' => $validated['system_type'] ?? null,
                'system_type_en' => $validated['system_type_en'] ?? null,
                'source_url' => $validated['source_url'] ?? null,
                'trivia_1' => $validated['trivia_1'] ?? null,
                'trivia_2' => $validated['trivia_2'] ?? null,
                'is_reincarnated' => !empty($parentId),
                'reincarnation_parent_id' => $parentId,
                'image_path' => null,
            ]);

            if ($request->hasFile('image_file')) {
                $imagePath = $this->storeMonsterImage($monster->id, $request);
                $monster->update([
                    'image_path' => $imagePath,
                ]);
            }

            $this->syncMonsterDrops($monster->id, $validated['drops'] ?? []);

            return $monster;
        });

        return $this->show($monster->id);
    }

    public function update(Request $request, $id)
    {
        $monster = Monster::findOrFail($id);
        $validated = $this->validateMonsterPayload($request, (int) $id);

        DB::transaction(function () use ($monster, $validated, $request) {
            $oldOrder = (int) $monster->display_order;
            $newOrder = max(1, (int) $validated['display_order']);

            if ($newOrder < $oldOrder) {
                Monster::where('id', '!=', $monster->id)
                    ->whereBetween('display_order', [$newOrder, $oldOrder - 1])
                    ->increment('display_order');
            } elseif ($newOrder > $oldOrder) {
                Monster::where('id', '!=', $monster->id)
                    ->whereBetween('display_order', [$oldOrder + 1, $newOrder])
                    ->decrement('display_order');
            }

            $parentId = !empty($validated['reincarnation_parent_id'])
                ? (int) $validated['reincarnation_parent_id']
                : null;

            $payload = [
                'display_order' => $newOrder,
                'name' => $validated['name'],
                'name_kana' => $validated['name_kana'] ?? null,
                'name_en' => $validated['name_en'] ?? null,
                'system_type' => $validated['system_type'] ?? null,
                'system_type_en' => $validated['system_type_en'] ?? null,
                'source_url' => $validated['source_url'] ?? null,
                'trivia_1' => $validated['trivia_1'] ?? null,
                'trivia_2' => $validated['trivia_2'] ?? null,
                'is_reincarnated' => !empty($parentId),
                'reincarnation_parent_id' => $parentId,
            ];

            if ($request->boolean('remove_image')) {
                $this->deleteMonsterImage($monster->id);
                $payload['image_path'] = null;
            }

            $monster->update($payload);

            if ($request->hasFile('image_file')) {
                $imagePath = $this->storeMonsterImage($monster->id, $request);
                $monster->update([
                    'image_path' => $imagePath,
                ]);
            }

            $this->syncMonsterDrops($monster->id, $validated['drops'] ?? []);
        });

        return $this->show($monster->id);
    }

    public function destroy($id)
    {
        $monster = Monster::findOrFail($id);

        DB::transaction(function () use ($monster) {
            $deletedOrder = (int) $monster->display_order;
            $monsterId = $monster->id;

            DB::table('monster_drops')
                ->where('monster_id', $monsterId)
                ->delete();

            DB::table('monster_map_spawns')
                ->where('monster_id', $monsterId)
                ->delete();

            DB::table('monsters')
                ->where('reincarnation_parent_id', $monsterId)
                ->update([
                    'is_reincarnated' => false,
                    'reincarnation_parent_id' => null,
                ]);

            $this->deleteMonsterImage($monsterId);

            $monster->delete();

            Monster::where('display_order', '>', $deletedOrder)
                ->decrement('display_order');
        });

        return response()->json([
            'message' => '削除した',
        ]);
    }

    public function aroundDisplayOrder(Request $request)
    {
        $displayOrder = (int) $request->query('display_order', 0);
        $range = (int) $request->query('range', 5);
        $excludeId = (int) $request->query('exclude_id', 0);

        if ($displayOrder < 1) {
            return response()->json([
                'data' => [],
            ]);
        }

        $range = max(1, min($range, 20));

        $query = Monster::query()
            ->select([
                'id',
                'display_order',
                'name',
                'name_kana',
                'name_en',
                'system_type',
                'system_type_en',
                'source_url',
                'trivia_1',
                'trivia_2',
                'image_path',
            ])
            ->whereBetween('display_order', [
                max(1, $displayOrder - $range),
                $displayOrder + $range,
            ])
            ->orderBy('display_order')
            ->orderBy('id');

        if ($excludeId > 0) {
            $query->where('id', '!=', $excludeId);
        }

        return response()->json([
            'data' => $query->get(),
        ]);
    }

    public function zukan(Request $request)
    {
        $perPage = max(1, min((int) $request->query('per_page', 16), 100));
        $sort = $request->query('sort', 'no');

        $query = Monster::query()
            ->leftJoin('monsters as parents', 'parents.id', '=', 'monsters.reincarnation_parent_id')
            ->selectRaw('
                monsters.id,
                monsters.display_order as monster_no,
                monsters.display_order,
                monsters.name,
                monsters.name_kana,
                monsters.name_en,
                monsters.system_type,
                monsters.system_type_en,
                monsters.source_url,
                monsters.trivia_1,
                monsters.trivia_2,
                monsters.image_path,
                monsters.is_reincarnated,
                monsters.reincarnation_parent_id,
                parents.name as reincarnation_parent_name,
                parents.name_kana as reincarnation_parent_name_kana,
                parents.name_en as reincarnation_parent_name_en
            ');

        if ($sort === 'kana') {
            $query
                ->orderByRaw('COALESCE(monsters.name_kana, monsters.name)')
                ->orderBy('monsters.id');
        } else {
            $query
                ->orderBy('monsters.display_order')
                ->orderBy('monsters.id');
        }

        $monsters = $query->paginate($perPage);

        $items = collect($monsters->items())->map(function ($monster) {
            return [
                'id' => $monster->id,
                'monster_no' => $monster->monster_no,
                'display_order' => $monster->display_order ?? $monster->monster_no,
                'name' => $monster->name,
                'name_kana' => $monster->name_kana,
                'name_en' => $monster->name_en,
                'system_type' => $monster->system_type,
                'system_type_en' => $monster->system_type_en,
                'source_url' => $monster->source_url ?? null,
                'trivia_1' => $monster->trivia_1 ?? null,
                'trivia_2' => $monster->trivia_2 ?? null,
                'image_path' => $monster->image_path ?? null,
                'is_reincarnated' => (bool) ($monster->is_reincarnated ?? false),
                'reincarnation_parent_id' => !empty($monster->reincarnation_parent_id)
                    ? (int) $monster->reincarnation_parent_id
                    : null,
                'reincarnation_parent_name' => $monster->reincarnation_parent_name ?? null,
                'reincarnation_parent_name_kana' => $monster->reincarnation_parent_name_kana ?? null,
                'reincarnation_parent_name_en' => $monster->reincarnation_parent_name_en ?? null,
            ];
        })->values();

        return response()->json([
            'data' => $items,
            'current_page' => $monsters->currentPage(),
            'last_page' => $monsters->lastPage(),
            'per_page' => $monsters->perPage(),
            'total' => $monsters->total(),
        ]);
    }

    private function validateMonsterPayload(Request $request, ?int $monsterId = null): array
    {
        return $request->validate([
            'display_order' => ['required', 'integer', 'min:0'],
            'name' => ['required', 'string', 'max:255'],
            'name_kana' => ['nullable', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'system_type' => ['nullable', 'string', 'max:255'],
            'system_type_en' => ['nullable', 'string', 'max:255'],
            'source_url' => ['nullable', 'string'],
            'trivia_1' => ['nullable', 'string'],
            'trivia_2' => ['nullable', 'string'],
            'reincarnation_parent_id' => [
                'nullable',
                'integer',
                'min:1',
                Rule::exists('monsters', 'id'),
                Rule::notIn(array_filter([$monsterId])),
            ],

            'drops' => ['nullable', 'array'],
            'drops.*.id' => ['nullable', 'integer'],
            'drops.*.drop_target_type' => ['required', Rule::in(['item', 'orb', 'equipment', 'accessory'])],
            'drops.*.drop_target_id' => ['nullable', 'integer', 'min:1'],
            'drops.*.drop_type' => ['required', 'string', 'max:50'],
            'drops.*.sort_order' => ['required', 'integer', 'min:1'],

            'image_file' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp', 'max:10240'],
            'remove_image' => ['nullable', 'boolean'],

            'crop_top' => ['nullable', 'integer', 'min:0'],
            'crop_left' => ['nullable', 'integer', 'min:0'],
            'crop_right' => ['nullable', 'integer', 'min:0'],
            'crop_bottom' => ['nullable', 'integer', 'min:0'],
        ]);
    }

    private function syncMonsterDrops(int $monsterId, array $drops): void
    {
        $keepIds = [];

        foreach ($drops as $index => $drop) {
            $targetId = (int) ($drop['drop_target_id'] ?? 0);

            if ($targetId <= 0) {
                continue;
            }

            $rowId = (int) ($drop['id'] ?? 0);

            $payload = [
                'monster_id' => $monsterId,
                'drop_target_type' => (string) ($drop['drop_target_type'] ?? 'item'),
                'drop_target_id' => $targetId,
                'drop_type' => (string) ($drop['drop_type'] ?? 'normal'),
                'sort_order' => (int) ($drop['sort_order'] ?? ($index + 1)),
            ];

            if ($rowId > 0) {
                $exists = DB::table('monster_drops')
                    ->where('id', $rowId)
                    ->where('monster_id', $monsterId)
                    ->exists();

                if ($exists) {
                    DB::table('monster_drops')
                        ->where('id', $rowId)
                        ->where('monster_id', $monsterId)
                        ->update($payload);

                    $keepIds[] = $rowId;
                    continue;
                }
            }

            $newId = DB::table('monster_drops')->insertGetId($payload);
            $keepIds[] = $newId;
        }

        DB::table('monster_drops')
            ->where('monster_id', $monsterId)
            ->when(!empty($keepIds), function ($query) use ($keepIds) {
                $query->whereNotIn('id', $keepIds);
            }, function ($query) {
                $query->whereRaw('1 = 1');
            })
            ->delete();
    }

    private function attachDropSummaries(Collection $monsters, string $searchType, string $keyword): Collection
    {
        if ($monsters->isEmpty()) {
            return collect();
        }

        $monsterIds = $monsters->pluck('id')->filter()->values();

        $dropRows = DB::table('monster_drops')
            ->leftJoin('items', function ($join) {
                $join->on('items.id', '=', 'monster_drops.drop_target_id')
                    ->where('monster_drops.drop_target_type', '=', 'item');
            })
            ->leftJoin('orbs', function ($join) {
                $join->on('orbs.id', '=', 'monster_drops.drop_target_id')
                    ->where('monster_drops.drop_target_type', '=', 'orb');
            })
            ->leftJoin('equipments', function ($join) {
                $join->on('equipments.id', '=', 'monster_drops.drop_target_id')
                    ->where('monster_drops.drop_target_type', '=', 'equipment');
            })
            ->leftJoin('accessories', function ($join) {
                $join->on('accessories.id', '=', 'monster_drops.drop_target_id')
                    ->where('monster_drops.drop_target_type', '=', 'accessory');
            })
            ->whereIn('monster_drops.monster_id', $monsterIds)
            ->orderBy('monster_drops.sort_order')
            ->orderBy('monster_drops.id')
            ->get([
                'monster_drops.monster_id',
                'monster_drops.drop_target_type',
                'monster_drops.drop_type',
                'items.name as item_name',
                'items.name_kana as item_name_kana',
                'items.name_en as item_name_en',
                'orbs.name as orb_name',
                'orbs.name_kana as orb_name_kana',
                'orbs.name_en as orb_name_en',
                'orbs.color as orb_color',
                'equipments.item_name as equipment_name',
                'equipments.item_name_kana as equipment_name_kana',
                'equipments.item_name_en as equipment_name_en',
                'accessories.name as accessory_name',
                'accessories.name_kana as accessory_name_kana',
                'accessories.name_en as accessory_name_en',
            ])
            ->groupBy('monster_id');

        return $monsters->map(function ($monster) use ($dropRows) {
            $rows = collect($dropRows->get($monster->id, []));

            $normalDrops = $rows
                ->where('drop_target_type', 'item')
                ->where('drop_type', 'normal')
                ->map(fn ($row) => [
                    'name' => $row->item_name,
                    'name_kana' => $row->item_name_kana,
                    'name_en' => $row->item_name_en,
                ])
                ->unique(fn ($row) => ($row['name'] ?? '') . '|' . ($row['name_en'] ?? ''))
                ->values();

            $rareDrops = $rows
                ->where('drop_target_type', 'item')
                ->where('drop_type', 'rare')
                ->map(fn ($row) => [
                    'name' => $row->item_name,
                    'name_kana' => $row->item_name_kana,
                    'name_en' => $row->item_name_en,
                ])
                ->unique(fn ($row) => ($row['name'] ?? '') . '|' . ($row['name_en'] ?? ''))
                ->values();

            $orbDrops = $rows
                ->where('drop_target_type', 'orb')
                ->map(fn ($row) => [
                    'name' => $row->orb_name,
                    'name_kana' => $row->orb_name_kana,
                    'name_en' => $row->orb_name_en,
                    'color' => $row->orb_color,
                ])
                ->unique(fn ($row) => ($row['name'] ?? '') . '|' . ($row['name_en'] ?? ''))
                ->values();

            $equipmentDrops = $rows
                ->where('drop_target_type', 'equipment')
                ->map(fn ($row) => [
                    'name' => $row->equipment_name,
                    'name_kana' => $row->equipment_name_kana,
                    'name_en' => $row->equipment_name_en,
                ])
                ->unique(fn ($row) => ($row['name'] ?? '') . '|' . ($row['name_en'] ?? ''))
                ->values();

            $accessoryDrops = $rows
                ->where('drop_target_type', 'accessory')
                ->map(fn ($row) => [
                    'name' => $row->accessory_name,
                    'name_kana' => $row->accessory_name_kana,
                    'name_en' => $row->accessory_name_en,
                ])
                ->unique(fn ($row) => ($row['name'] ?? '') . '|' . ($row['name_en'] ?? ''))
                ->values();

            return [
                'id' => $monster->id,
                'monster_no' => $monster->monster_no,
                'display_order' => $monster->display_order,
                'name' => $monster->name,
                'name_kana' => $monster->name_kana,
                'name_en' => $monster->name_en,
                'system_type' => $monster->system_type,
                'system_type_en' => $monster->system_type_en,
                'source_url' => $monster->source_url,
                'trivia_1' => $monster->trivia_1 ?? null,
                'trivia_2' => $monster->trivia_2 ?? null,
                'image_path' => $monster->image_path,
                'is_reincarnated' => (bool) ($monster->is_reincarnated ?? false),
                'reincarnation_parent_id' => !empty($monster->reincarnation_parent_id)
                    ? (int) $monster->reincarnation_parent_id
                    : null,
                'reincarnation_parent_name' => $monster->reincarnation_parent_name ?? null,
                'reincarnation_parent_name_kana' => $monster->reincarnation_parent_name_kana ?? null,
                'reincarnation_parent_name_en' => $monster->reincarnation_parent_name_en ?? null,
                'matched_name' => $monster->matched_name ?? null,
                'matched_name_kana' => $monster->matched_name_kana ?? null,
                'matched_name_en' => $monster->matched_name_en ?? null,
                'matched_color' => $monster->matched_color ?? null,
                'normal_drops' => $normalDrops,
                'rare_drops' => $rareDrops,
                'orb_drops' => $orbDrops,
                'equipment_drops' => $equipmentDrops,
                'accessory_drops' => $accessoryDrops,
            ];
        })->values();
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

    private function dropTypeLabel(?string $dropType, ?string $targetType = null): string
    {
        return match ($dropType) {
            'normal' => '通常',
            'rare' => 'レア',
            'white_box' => '白箱',
            'steal' => 'ぬすむ',
            'orb' => '宝珠',
            'equipment' => '装備',
            default => $targetType === 'orb'
                ? '宝珠'
                : ($targetType === 'equipment'
                    ? '装備'
                    : ($targetType === 'accessory' ? 'アクセサリー' : 'その他')),
        };
    }

    private function parseArea($area): array
    {
        if (is_array($area)) {
            return array_values(array_filter($area, fn ($value) => $value !== null && $value !== ''));
        }

        if ($area === null || $area === '') {
            return [];
        }

        if (is_string($area)) {
            $decoded = json_decode($area, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                return array_values(array_filter($decoded, fn ($value) => $value !== null && $value !== ''));
            }

            return array_values(array_filter(
                preg_split('/[\s,、]+/u', $area) ?: [],
                fn ($value) => $value !== null && $value !== ''
            ));
        }

        return [];
    }

    private function parseNote($note)
    {
        if (is_array($note)) {
            return $note;
        }

        if ($note === null || $note === '') {
            return [];
        }

        if (is_string($note)) {
            $decoded = json_decode($note, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                return $decoded;
            }
        }

        return $note;
    }

private function storeMonsterImage(int $monsterId, Request $request): ?string
{
    if (!$request->hasFile('image_file')) {
        return null;
    }

    $file = $request->file('image_file');

    $manager = new ImageManager(new Driver());
    $image = $manager->read($file->getRealPath());

    $path = "images/monsters/{$monsterId}.webp";

    Storage::disk('public')->put(
        $path,
        $image->encode(new WebpEncoder(quality: 85))
    );

    return "/storage/{$path}";
}

    private function deleteMonsterImage(int $monsterId): void
    {
        $path = "monsters/{$monsterId}.webp";

        if (Storage::disk('public')->exists($path)) {
            Storage::disk('public')->delete($path);
        }
    }
}
