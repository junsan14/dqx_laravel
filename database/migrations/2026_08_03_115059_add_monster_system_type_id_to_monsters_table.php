<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('monsters', function (Blueprint $table) {
            $table
                ->foreignId('monster_system_type_id')
                ->nullable()
                ->after('name_en')
                ->constrained('monster_system_types')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('monsters', function (Blueprint $table) {
            $table->dropConstrainedForeignId(
                'monster_system_type_id'
            );
        });
    }
};