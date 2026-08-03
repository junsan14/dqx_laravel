<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class Monster extends Model
{
    protected $fillable = [
        'display_order',
        'name',
        'name_kana',
        'name_en',
        'system_type',
        'system_type_en',
        'monster_system_type_id',
        'source_url',
        'is_reincarnated',
        'reincarnation_parent_id',
        'image_path',
        'trivia_1',
        'trivia_2',
    ];

    public function spawns(): HasMany
    {
        return $this->hasMany(MonsterMapSpawn::class);
    }

    public function whiteBoxes(): HasMany
    {
        return $this->hasMany(MonsterWhiteBox::class);
    }

    public function drops(): HasMany
    {
        return $this->hasMany(MonsterDrop::class);
    }
    public function reincarnationParent()
    {
        return $this->belongsTo(self::class, 'reincarnation_parent_id');
    }

    public function reincarnations()
    {
        return $this->hasMany(self::class, 'reincarnation_parent_id');
    }
    public function systemType(): BelongsTo
    {
        return $this->belongsTo(
            MonsterSystemType::class,
            'monster_system_type_id'
        );
    }
}