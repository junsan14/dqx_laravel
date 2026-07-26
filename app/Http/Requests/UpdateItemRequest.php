<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'kana' => ['nullable', 'string', 'max:255'],
            'name_kana' => ['nullable', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'slot' => ['nullable', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:255'],
            'rarity' => ['nullable', 'integer'],
            'effect_text' => ['nullable', 'string'],
            'description' => ['nullable', 'string'],
            'buy_price' => ['nullable', 'integer'],
            'sell_price' => ['nullable', 'integer'],
            'source_url' => ['nullable', 'string', 'max:1000'],
            'notes' => ['nullable', 'string'],

            'drop_monsters' => ['nullable', 'array'],

            'drop_monsters.*.id' => ['nullable', 'integer'],
            'drop_monsters.*.monster_id' => ['required', 'integer', 'exists:monsters,id'],
            'drop_monsters.*.drop_type' => ['nullable', 'string', 'max:50'],
            'drop_monsters.*.sort_order' => ['nullable', 'integer'],
        ];
    }
}