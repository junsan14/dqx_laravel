<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('monster_system_types', function (Blueprint $table) {
            $table->id();

            $table->unsignedInteger('display_order')->default(0);

            $table->string('name')->unique();
            $table->string('name_en')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('monster_system_types');
    }
};