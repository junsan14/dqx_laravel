<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Equipment extends Model
{
    protected $table = 'equipments';

    protected $fillable = [
        'attack',
        'defense',
        'max_hp',
        'max_mp',
        'charm',
        'agility',
        'dexterity',
        'magic_attack',
        'healing_power',

        'item_id',
        'item_name',
        'item_name_kana',
        'item_name_en',

        'equipment_type_id',
        'craft_product_type_id',
        'craft_material_trait',
        'job_override_mode',

        'craft_level',
        'equip_level',
        'recipe_book',
        'recipe_place',
        'description',

        'group_kind',
        'group_id',
        'group_name',

        'materials_json',
        'slot_grid_json',

        'source_url',
        'detail_url',
        'effects_json',

        'default_price',
        'weight',
    ];

    protected $casts = [
        'attack' => 'integer',
        'defense' => 'integer',
        'max_hp' => 'integer',
        'max_mp' => 'integer',
        'charm' => 'integer',
        'agility' => 'integer',
        'dexterity' => 'integer',
        'magic_attack' => 'integer',
        'healing_power' => 'integer',

        'equipment_type_id' => 'integer',
        'craft_product_type_id' => 'integer',
        'craft_level' => 'integer',
        'equip_level' => 'integer',
        'default_price' => 'integer',
        'weight' => 'integer',

        'materials_json' => 'array',
        'slot_grid_json' => 'array',
        'effects_json' => 'array',
    ];

    protected $attributes = [
        'job_override_mode' => 'inherit',
    ];

    public function equipmentType(): BelongsTo
    {
        return $this->belongsTo(EquipmentType::class, 'equipment_type_id');
    }

    public function craftProductType(): BelongsTo
    {
        return $this->belongsTo(CraftProductType::class, 'craft_product_type_id');
    }

    public function jobOverrides(): HasMany
    {
        return $this->hasMany(EquipmentJobOverride::class, 'equipment_id');
    }
}
