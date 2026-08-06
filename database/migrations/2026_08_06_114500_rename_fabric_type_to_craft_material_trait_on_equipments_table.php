<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (
            Schema::hasColumn('equipments', 'fabric_type') &&
            !Schema::hasColumn('equipments', 'craft_material_trait')
        ) {
            Schema::table('equipments', function (Blueprint $table) {
                $table->renameColumn('fabric_type', 'craft_material_trait');
            });
        }
    }

    public function down(): void
    {
        if (
            Schema::hasColumn('equipments', 'craft_material_trait') &&
            !Schema::hasColumn('equipments', 'fabric_type')
        ) {
            Schema::table('equipments', function (Blueprint $table) {
                $table->renameColumn('craft_material_trait', 'fabric_type');
            });
        }
    }
};
