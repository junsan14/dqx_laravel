<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('craft_types', function (Blueprint $table) {
            $table
                ->decimal('great_success_rate', 5, 2)
                ->nullable()
                ->after('name')
                ->comment('大成功率（%）');
        });

        $initialRates = [
            '裁縫' => 90.00,
            '木工' => 90.00,
            '武器鍛冶' => 60.00,
            '防具鍛冶' => 60.00,
        ];

        foreach ($initialRates as $name => $rate) {
            DB::table('craft_types')
                ->where('name', $name)
                ->update(['great_success_rate' => $rate]);
        }
    }

    public function down(): void
    {
        Schema::table('craft_types', function (Blueprint $table) {
            $table->dropColumn('great_success_rate');
        });
    }
};
