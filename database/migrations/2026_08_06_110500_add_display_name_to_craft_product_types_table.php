<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('craft_product_types', 'display_name')) {
            Schema::table('craft_product_types', function (Blueprint $table) {
                $table->string('display_name')
                    ->nullable()
                    ->after('name')
                    ->comment('ゲスト画面などで使用する表示名');
            });
        }

        // 既存データは原則 name をそのまま表示名として使用する。
        DB::table('craft_product_types')
            ->where(function ($query) {
                $query
                    ->whereNull('display_name')
                    ->orWhere('display_name', '');
            })
            ->update([
                'display_name' => DB::raw('name'),
            ]);

        // 防具・裁縫装備だけ、ゲスト画面では共通の部位名を表示する。
        $displayNamesByName = [
            '鎧頭' => '頭',
            '裁縫頭' => '頭',
            '鎧上' => '体上',
            '裁縫上' => '体上',
            '鎧下' => '体下',
            '裁縫下' => '体下',
            '鎧腕' => '腕',
            '裁縫腕' => '腕',
            '鎧足' => '足',
            '裁縫足' => '足',
        ];

        foreach ($displayNamesByName as $name => $displayName) {
            DB::table('craft_product_types')
                ->where('name', $name)
                ->update([
                    'display_name' => $displayName,
                    'updated_at' => now(),
                ]);
        }

        // key が異なる環境でも設定できるよう、主要なkeyも補助的に更新する。
        $displayNamesByKey = [
            'armor_head' => '頭',
            'armor_upper' => '体上',
            'armor_lower' => '体下',
            'armor_arms' => '腕',
            'armor_feet' => '足',
            'tailoring_head' => '頭',
            'tailoring_upper' => '体上',
            'tailoring_lower' => '体下',
            'tailoring_arms' => '腕',
            'tailoring_feet' => '足',
            'sewing_head' => '頭',
            'sewing_upper' => '体上',
            'sewing_lower' => '体下',
            'sewing_arms' => '腕',
            'sewing_feet' => '足',
        ];

        foreach ($displayNamesByKey as $key => $displayName) {
            DB::table('craft_product_types')
                ->where('key', $key)
                ->update([
                    'display_name' => $displayName,
                    'updated_at' => now(),
                ]);
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('craft_product_types', 'display_name')) {
            Schema::table('craft_product_types', function (Blueprint $table) {
                $table->dropColumn('display_name');
            });
        }
    }
};
