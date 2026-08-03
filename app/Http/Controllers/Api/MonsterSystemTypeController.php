<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class MonsterSystemTypeController extends Controller
{
    public function index(): JsonResponse
    {
        $systemTypes = DB::table('monster_system_types')
            ->select([
                'id',
                'display_order',
                'name',
                'name_en',
            ])
            ->orderBy('display_order')
            ->orderBy('id')
            ->get();

        return response()->json($systemTypes);
    }
}
