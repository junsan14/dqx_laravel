<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'name_kana' => ['nullable', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'buy_price' => ['nullable', 'integer', 'min:0'],
            'sell_price' => ['nullable', 'integer', 'min:0'],
            'category' => ['nullable', 'string', 'max:255'],

            'drop_monsters' => ['nullable', 'array'],
            'drop_monsters.*.monster_id' => ['required', 'integer', 'exists:monsters,id'],
            'drop_monsters.*.drop_type' => ['nullable', 'string', 'max:50'],
            'drop_monsters.*.sort_order' => ['nullable', 'integer'],
        ];
    }
}