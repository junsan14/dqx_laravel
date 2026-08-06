<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CraftProductType extends Model
{
    protected $fillable = [
        'key',
        'name',
        'display_name',
        'kind',
        'craft_type_id',
        'grid_json',
    ];

    protected $casts = [
        'craft_type_id' => 'integer',
        'grid_json' => 'array',
    ];

    public function craftType(): BelongsTo
    {
        return $this->belongsTo(CraftType::class, 'craft_type_id');
    }

    public function equipments(): HasMany
    {
        return $this->hasMany(Equipment::class, 'craft_product_type_id');
    }
}
