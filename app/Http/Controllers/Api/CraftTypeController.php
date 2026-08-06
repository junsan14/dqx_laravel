<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CraftType;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CraftTypeController extends Controller
{
    public function index(Request $request)
    {
        $q = trim((string) $request->query('q', ''));

        $craftTypes = CraftType::query()
            ->when($q !== '', function ($query) use ($q) {
                $query->where(function ($subQuery) use ($q) {
                    $subQuery
                        ->where('name', 'like', "%{$q}%")
                        ->orWhere('key', 'like', "%{$q}%");
                });
            })
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => $craftTypes,
        ]);
    }

    public function show(CraftType $craftType)
    {
        return response()->json([
            'data' => $craftType,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'key' => [
                'required',
                'string',
                'max:255',
                Rule::unique('craft_types', 'key'),
            ],
            'name' => [
                'required',
                'string',
                'max:255',
            ],
            'great_success_rate' => [
                'nullable',
                'numeric',
                'between:0,100',
            ],
        ]);

        $craftType = CraftType::create($validated);

        return response()->json([
            'data' => $craftType,
        ], 201);
    }

    public function update(Request $request, CraftType $craftType)
    {
        $validated = $request->validate([
            'key' => [
                'required',
                'string',
                'max:255',
                Rule::unique('craft_types', 'key')->ignore($craftType->id),
            ],
            'name' => [
                'required',
                'string',
                'max:255',
            ],
            'great_success_rate' => [
                'nullable',
                'numeric',
                'between:0,100',
            ],
        ]);

        $craftType->fill($validated);
        $craftType->save();

        return response()->json([
            'data' => $craftType,
        ]);
    }

    public function destroy(CraftType $craftType)
    {
        $name = $craftType->name;

        $craftType->delete();

        return response()->json([
            'message' => "「{$name}」を削除した",
        ]);
    }
}