<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('equipments', function (Blueprint $table) {
            $table
                ->string('item_name_kana', 255)
                ->nullable()
                ->after('item_name')
                ->comment('装備名の読み仮名（ひらがな）');

            $table->index(
                'item_name_kana',
                'equipments_item_name_kana_index'
            );
        });
    }

    public function down(): void
    {
        Schema::table('equipments', function (Blueprint $table) {
            $table->dropIndex('equipments_item_name_kana_index');
            $table->dropColumn('item_name_kana');
        });
    }
};
