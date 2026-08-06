<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Continent extends Model
{
    protected $fillable = [
        'display_order',
        'name',
        'name_en',
        'name_kana',
        'map_image_folder',
    ];

    public function maps(): HasMany
    {
        return $this->hasMany(Map::class);
    }
}