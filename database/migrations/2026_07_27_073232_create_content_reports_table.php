<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('content_reports', function (Blueprint $table) {
    $table->id();

    // morphMapを使って equipment / monster などの短い名前を保存
    $table->string('reportable_type', 50);
    $table->unsignedBigInteger('reportable_id');

    $table->string('category', 30)->default('incorrect_info');
    $table->string('field_key', 100)->nullable();

    $table->text('message');
    $table->text('suggested_value')->nullable();
    $table->json('context_json')->nullable();

    $table->string('locale', 10)->default('ja');

    $table->string('status', 30)->default('pending');
    $table->boolean('is_public')->default(false);

    $table->string('submitter_token_hash', 64)->nullable();
    $table->string('ip_hash', 64)->nullable();

    $table->foreignId('reviewed_by')
        ->nullable()
        ->constrained('users')
        ->nullOnDelete();

    $table->timestamp('reviewed_at')->nullable();
    $table->text('resolved_note')->nullable();

    $table->timestamps();

    $table->index(
        ['reportable_type', 'reportable_id'],
        'content_reports_target_index'
    );

    $table->index(['status', 'created_at']);
});
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('content_reports');
    }
};
