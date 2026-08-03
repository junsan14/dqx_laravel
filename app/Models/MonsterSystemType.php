<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MonsterSystemType extends Model
{
    protected $fillable = [
        'display_order',
        'name',
        'name_en',
    ];

    public function monsters(): HasMany
    {
        return $this->hasMany(
            Monster::class,
            'monster_system_type_id'
        );
    }
}