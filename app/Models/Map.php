<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Map extends Model
{
    protected $fillable = [
        'continent_id',
        'name',
        'name_en',
        'name_kana',
        'map_type',
        'source_url',
    ];

    public function continent(): BelongsTo
    {
        return $this->belongsTo(Continent::class);
    }
}