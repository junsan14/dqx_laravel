<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('content_reports', 'suggested_value')) {
            return;
        }

        Schema::table('content_reports', function (Blueprint $table) {
            $table->dropColumn('suggested_value');
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('content_reports', 'suggested_value')) {
            return;
        }

        Schema::table('content_reports', function (Blueprint $table) {
            $table->text('suggested_value')->nullable()->after('message');
        });
    }
};
