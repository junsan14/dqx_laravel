<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('craft_product_types')) {
            return;
        }

        if (!Schema::hasColumn('craft_product_types', 'grid_json')) {
            Schema::table('craft_product_types', function (Blueprint $table) {
                $table->json('grid_json')->nullable()->after('craft_type_id');
            });
        }

        foreach ($this->gridPresets() as $key => $grid) {
            DB::table('craft_product_types')
                ->where('key', $key)
                ->update([
                    'grid_json' => json_encode(
                        $grid,
                        JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
                    ),
                    'updated_at' => now(),
                ]);
        }

        if (Schema::hasColumn('craft_product_types', 'grid_columns')) {
            Schema::table('craft_product_types', function (Blueprint $table) {
                $table->dropColumn('grid_columns');
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('craft_product_types')) {
            return;
        }

        if (!Schema::hasColumn('craft_product_types', 'grid_columns')) {
            Schema::table('craft_product_types', function (Blueprint $table) {
                $table->unsignedTinyInteger('grid_columns')
                    ->nullable()
                    ->after('craft_type_id');
            });
        }

        foreach ($this->gridPresets() as $key => $grid) {
            DB::table('craft_product_types')
                ->where('key', $key)
                ->update([
                    'grid_columns' => $grid['cols'],
                    'updated_at' => now(),
                ]);
        }

        if (Schema::hasColumn('craft_product_types', 'grid_json')) {
            Schema::table('craft_product_types', function (Blueprint $table) {
                $table->dropColumn('grid_json');
            });
        }
    }

    private function gridPresets(): array
    {
        return [
            'sword_1h' => $this->grid(3, 1),
            'sword_2h' => $this->grid(4, 2),
            'dagger' => $this->grid(2, 1),
            'spear' => $this->grid(4, 1),
            'axe' => $this->grid(4, 2, [[2, 1], [3, 1]]),
            'hammer' => $this->grid(3, 2),
            'claw' => $this->grid(2, 2),
            'whip' => $this->grid(4, 2, [[3, 1]]),
            'boomerang' => $this->grid(3, 2, [[1, 0]]),
            'stick' => $this->grid(2, 1),
            'staff_2h' => $this->grid(3, 1),
            'kon' => $this->grid(3, 2),
            'fan' => $this->grid(2, 2),
            'bow' => $this->grid(3, 2, [[1, 1]]),
            'scythe' => $this->grid(4, 2, [[1, 1], [2, 1], [3, 1]]),
            'shield_small' => $this->grid(2, 2),
            'shield_large' => $this->grid(2, 2),
            'armor_head' => $this->grid(2, 2),
            'armor_upper' => $this->grid(3, 2),
            'armor_lower' => $this->grid(4, 2),
            'armor_arms' => $this->grid(3, 1),
            'armor_feet' => $this->grid(3, 2, [[0, 0], [1, 0]]),
            'tailoring_head' => $this->grid(2, 3, [[0, 0], [0, 2]]),
            'tailoring_upper' => $this->grid(3, 3),
            'tailoring_lower' => $this->grid(3, 2),
            'tailoring_arms' => $this->grid(2, 3),
            'tailoring_feet' => $this->grid(2, 2),
            'tool_hammer' => $this->grid(3, 2, [[2, 1]]),
            'tool_woodworking_knife' => $this->grid(3, 1),
            'tool_alchemy_pot' => $this->grid(3, 2),
            'tool_alchemy_lamp' => $this->grid(2, 2),
            'tool_sewing_needle' => $this->grid(2, 1),
            'tool_frying_pan' => $this->grid(4, 2, [[3, 1]]),
        ];
    }

    private function grid(int $rows, int $cols, array $disabledCells = []): array
    {
        return [
            'rows' => $rows,
            'cols' => $cols,
            'disabledCells' => $disabledCells,
        ];
    }
};
