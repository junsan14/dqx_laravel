<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CraftType extends Model
{
    protected $fillable = [
        'key',
        'name',
        'great_success_rate',
    ];

    protected $casts = [
        'great_success_rate' => 'float',
    ];

    public function equipmentTypes()
    {
        return $this->hasMany(EquipmentType::class);
    }
}