<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('equipments', function (Blueprint $table) {
            $columns = array_values(array_filter([
                Schema::hasColumn('equipments', 'slot') ? 'slot' : null,
                Schema::hasColumn('equipments', 'slot_grid_type') ? 'slot_grid_type' : null,
                Schema::hasColumn('equipments', 'slot_grid_cols') ? 'slot_grid_cols' : null,
            ]));

            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }

    public function down(): void
    {
        Schema::table('equipments', function (Blueprint $table) {
            if (!Schema::hasColumn('equipments', 'slot')) {
                $table->string('slot')->nullable()->after('description');
            }

            if (!Schema::hasColumn('equipments', 'slot_grid_type')) {
                $table->string('slot_grid_type')->nullable()->after('slot');
            }

            if (!Schema::hasColumn('equipments', 'slot_grid_cols')) {
                $table->unsignedInteger('slot_grid_cols')
                    ->nullable()
                    ->after('slot_grid_type');
            }
        });
    }
};
